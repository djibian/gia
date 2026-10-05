import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";

const PROTOCOL_VERSION = "2026-07-28";
const STATIC_BEARER = "test-static-bearer-0123456789abcdef0123456789abcdef0123456789abcdef";
const TABLE_ID = "Compat_Items";
const PAGE_NAME = "Compatibility";

interface McpResponse {
  status: number;
  body: unknown;
}

interface GristOrg {
  id: number | string;
}

interface GristWorkspace {
  id: number;
}

interface CompatibilityTarget {
  documentId: string;
  workspaceId: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("listen_failed");
  return address.port;
}

async function freePort(): Promise<number> {
  const server = createServer();
  const port = await listen(server);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function waitForUrl(url: string, attempts = 120): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(750) });
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`service_not_ready:${url}`);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`http_${response.status}:${text.slice(0, 500)}`);
  }
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function cookieHeader(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [];
  const fallback = response.headers.get("set-cookie");
  const source = values.length > 0 ? values : fallback ? [fallback] : [];
  const cookies = source
    .map((value) => value.split(";", 1)[0]?.trim())
    .filter((value): value is string => Boolean(value));
  if (cookies.length === 0) throw new Error("test_login_cookie_missing");
  return cookies.join("; ");
}

async function createEphemeralApiKey(baseUrl: string): Promise<string> {
  const loginUrl = new URL("/test/login", baseUrl);
  loginUrl.searchParams.set("username", "test-compatibility@getgrist.com");
  loginUrl.searchParams.set("name", "Compatibility");

  const login = await fetch(loginUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000)
  });
  assert(login.status >= 200 && login.status < 400, `test_login_failed:${login.status}`);
  const cookie = cookieHeader(login);

  const response = await fetch(new URL("/api/profile/apikey", baseUrl), {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json"
    },
    body: JSON.stringify({ force: true }),
    signal: AbortSignal.timeout(10_000)
  });
  const value = await readJson(response);
  assert(typeof value === "string" && value.length > 0, "api_key_missing");
  return value;
}

async function gristApi(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers,
    signal: AbortSignal.timeout(20_000)
  });
  return readJson(response);
}

async function createIsolatedDeniedTarget(
  baseUrl: string,
  apiKey: string
): Promise<CompatibilityTarget> {
  const orgs = await gristApi(baseUrl, apiKey, "/api/orgs");
  assert(Array.isArray(orgs) && orgs.length > 0, "no_test_org_for_denied_target");
  const org = orgs[0] as GristOrg;
  assert(org.id !== undefined, "denied_target_org_missing_id");

  const createdWorkspace = await gristApi(
    baseUrl,
    apiKey,
    `/api/orgs/${encodeURIComponent(String(org.id))}/workspaces`,
    {
      method: "POST",
      body: JSON.stringify({ name: "Denied Compatibility" })
    }
  );
  assert(typeof createdWorkspace === "number", "denied_workspace_create_invalid");

  const createdDoc = await gristApi(
    baseUrl,
    apiKey,
    `/api/workspaces/${createdWorkspace}/docs`,
    {
      method: "POST",
      body: JSON.stringify({ name: "Denied Source" })
    }
  );
  const id =
    typeof createdDoc === "string" || typeof createdDoc === "number"
      ? createdDoc
      : createdDoc && typeof createdDoc === "object"
        ? (createdDoc as { id?: unknown; urlId?: unknown }).id ??
          (createdDoc as { urlId?: unknown }).urlId
        : undefined;
  assert(
    (typeof id === "string" || typeof id === "number") && String(id).length > 0,
    "denied_document_create_invalid"
  );
  return { documentId: String(id), workspaceId: createdWorkspace };
}

async function createCompatibilityDocument(
  baseUrl: string,
  apiKey: string
): Promise<CompatibilityTarget> {
  const orgs = await gristApi(baseUrl, apiKey, "/api/orgs");
  assert(Array.isArray(orgs) && orgs.length > 0, "no_test_org");
  const org = orgs[0] as GristOrg;
  assert(org.id !== undefined, "test_org_missing_id");

  let workspaces = await gristApi(
    baseUrl,
    apiKey,
    `/api/orgs/${encodeURIComponent(String(org.id))}/workspaces`
  );
  assert(Array.isArray(workspaces), "workspace_list_invalid");

  if (workspaces.length === 0) {
    const created = await gristApi(
      baseUrl,
      apiKey,
      `/api/orgs/${encodeURIComponent(String(org.id))}/workspaces`,
      {
        method: "POST",
        body: JSON.stringify({ name: "Compatibility" })
      }
    );
    assert(typeof created === "number", "workspace_create_invalid");
    workspaces = [{ id: created }];
  }

  const workspace = (workspaces as GristWorkspace[])[0]!;
  assert(Number.isInteger(workspace.id), "workspace_missing_id");

  const createdDoc = await gristApi(
    baseUrl,
    apiKey,
    `/api/workspaces/${workspace.id}/docs`,
    {
      method: "POST",
      body: JSON.stringify({ name: "Compatibility Probe" })
    }
  );

  if (typeof createdDoc === "string" && createdDoc.length > 0) {
    return { documentId: createdDoc, workspaceId: workspace.id };
  }
  if (createdDoc && typeof createdDoc === "object") {
    const id = (createdDoc as { id?: unknown; urlId?: unknown }).id ??
      (createdDoc as { urlId?: unknown }).urlId;
    if ((typeof id === "string" || typeof id === "number") && String(id).length > 0) {
      return { documentId: String(id), workspaceId: workspace.id };
    }
  }
  throw new Error("document_create_invalid");
}

function bridgeEnvironment(options: {
  gristBaseUrl: string;
  apiKey: string;
  documentId: string;
  workspaceId: number;
  port: number;
}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GRIST_BASE_URL: options.gristBaseUrl,
    GRIST_API_KEY: options.apiKey,
    GRIST_ALLOWED_DOCUMENT_IDS: options.documentId,
    GRIST_ALLOWED_WORKSPACE_IDS: String(options.workspaceId),
    GRIST_MAX_READ_RECORDS: "100",
    GRIST_MAX_WRITE_RECORDS: "50",
    GRIST_WRITE_BATCH_RECORDS: "25",
    GRIST_MAX_SCHEMA_ITEMS: "50",
    MCP_AUTH_MODE: "static",
    MCP_BEARER_TOKEN: STATIC_BEARER,
    MCP_ALLOWED_HOSTS: "127.0.0.1,localhost",
    HOST: "127.0.0.1",
    PORT: String(options.port)
  };
}

function startBridge(env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "inherit", "inherit"]
  });
}

async function stopBridge(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => child.once("exit", () => resolve(true))),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2_000))
  ]);
  if (!exited && child.exitCode === null) child.kill("SIGKILL");
}

function requestMeta(): Record<string, unknown> {
  return {
    "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
    "io.modelcontextprotocol/clientInfo": {
      name: "gia-test-compatibility",
      version: "1.0.0"
    },
    "io.modelcontextprotocol/clientCapabilities": {}
  };
}

async function postMcp(options: {
  baseUrl: string;
  method: string;
  params?: Record<string, unknown>;
  name?: string;
}): Promise<McpResponse> {
  const headers: Record<string, string> = {
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${STATIC_BEARER}`,
    "content-type": "application/json",
    "MCP-Protocol-Version": PROTOCOL_VERSION,
    "Mcp-Method": options.method
  };
  if (options.name) headers["Mcp-Name"] = options.name;

  const response = await fetch(`${options.baseUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: options.method,
      params: {
        ...(options.params ?? {}),
        _meta: requestMeta()
      }
    }),
    signal: AbortSignal.timeout(30_000)
  });

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function jsonRpcResult(response: McpResponse): Record<string, unknown> {
  assert(response.status === 200, `mcp_http_${response.status}:${JSON.stringify(response.body)}`);
  assert(response.body !== null && typeof response.body === "object", "mcp_body_invalid");
  const body = response.body as { result?: unknown; error?: unknown };
  assert(body.error === undefined, `mcp_jsonrpc_error:${JSON.stringify(body.error)}`);
  assert(body.result !== null && typeof body.result === "object", "mcp_result_missing");
  return body.result as Record<string, unknown>;
}

function assertToolSuccess(response: McpResponse, label: string): Record<string, unknown> {
  const result = jsonRpcResult(response);
  assert(result.isError !== true, `${label}_tool_error:${JSON.stringify(result)}`);
  return result;
}

function resultText(result: Record<string, unknown>): string {
  const content = result.content;
  if (!Array.isArray(content)) return JSON.stringify(result);
  return content
    .map((entry) => {
      if (entry && typeof entry === "object" && typeof (entry as { text?: unknown }).text === "string") {
        return (entry as { text: string }).text;
      }
      return JSON.stringify(entry);
    })
    .join("\n");
}

function resultJson(result: Record<string, unknown>, label: string): Record<string, unknown> {
  const text = resultText(result);
  try {
    const parsed: unknown = JSON.parse(text);
    assert(parsed !== null && typeof parsed === "object" && !Array.isArray(parsed), `${label}_result_not_object`);
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.endsWith("_result_not_object")) throw error;
    throw new Error(`${label}_result_not_json:${text.slice(0, 500)}`);
  }
}

function positiveResultId(value: unknown, label: string): number {
  assert(typeof value === "number" && Number.isInteger(value) && value > 0, `${label}_missing`);
  return value;
}

function createdDocumentId(result: Record<string, unknown>, label: string): string {
  const value = result.documentId ?? result.createdDocumentId;
  assert(
    (typeof value === "string" || typeof value === "number") && String(value).length > 0,
    `${label}_document_id_missing`
  );
  return String(value);
}

async function callTool(
  bridgeBaseUrl: string,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return assertToolSuccess(
    await postMcp({
      baseUrl: bridgeBaseUrl,
      method: "tools/call",
      name,
      params: { name, arguments: args }
    }),
    name
  );
}

async function callToolExpectError(
  bridgeBaseUrl: string,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const result = jsonRpcResult(
    await postMcp({
      baseUrl: bridgeBaseUrl,
      method: "tools/call",
      name,
      params: { name, arguments: args }
    })
  );
  assert(result.isError === true, `${name}_expected_tool_error`);
  return result;
}


async function run(): Promise<void> {
  const gristBaseUrl = required("GRIST_COMPAT_BASE_URL").replace(/\/$/, "");
  const version = required("GRIST_COMPAT_VERSION");

  await waitForUrl(`${gristBaseUrl}/`);
  const apiKey = await createEphemeralApiKey(gristBaseUrl);
  const target = await createCompatibilityDocument(gristBaseUrl, apiKey);
  const deniedTarget = await createIsolatedDeniedTarget(gristBaseUrl, apiKey);
  const { documentId, workspaceId } = target;

  const port = await freePort();
  const bridgeBaseUrl = `http://127.0.0.1:${port}`;
  const bridge = startBridge(
    bridgeEnvironment({ gristBaseUrl, apiKey, documentId, workspaceId, port })
  );

  try {
    await waitForUrl(`${bridgeBaseUrl}/healthz`);

    const tools = jsonRpcResult(
      await postMcp({ baseUrl: bridgeBaseUrl, method: "tools/list" })
    );
    assert(Array.isArray(tools.tools), "tools_list_invalid");
    const names = (tools.tools as Array<{ name?: unknown }>)
      .map((tool) => tool.name)
      .filter((name): name is string => typeof name === "string")
      .sort();
    assert(names.length === 10, `unexpected_tool_count:${names.length}`);
    for (const expected of [
      "grist_discover",
      "grist_inspect",
      "grist_query",
      "grist_add_records",
      "grist_change_records",
      "grist_add_structure",
      "grist_change_structure",
      "grist_add_ui",
      "grist_change_ui",
      "grist_help"
    ]) {
      assert(names.includes(expected), `missing_tool:${expected}`);
    }

    const discovered = resultText(
      await callTool(bridgeBaseUrl, "grist_discover", { action: "documents" })
    );
    assert(discovered.includes(documentId), "created_document_not_discovered");

    await callTool(bridgeBaseUrl, "grist_add_structure", {
      action: "create_tables",
      documentId,
      tables: [
        {
          id: TABLE_ID,
          columns: [
            { id: "Name", fields: { type: "Text" } },
            { id: "Qty", fields: { type: "Int" } }
          ]
        }
      ]
    });

    await callTool(bridgeBaseUrl, "grist_add_records", {
      documentId,
      tableId: TABLE_ID,
      records: [
        { fields: { Name: "Alpha", Qty: 1 } },
        { fields: { Name: "Beta", Qty: 2 } }
      ]
    });

    const createdPage = resultJson(
      await callTool(bridgeBaseUrl, "grist_add_ui", {
        action: "create_page",
        documentId,
        tableId: TABLE_ID,
        name: PAGE_NAME
      }),
      "create_page"
    );
    const createdPageInfo =
      createdPage.page && typeof createdPage.page === "object" && !Array.isArray(createdPage.page)
        ? (createdPage.page as Record<string, unknown>)
        : undefined;
    const pageId = positiveResultId(createdPageInfo?.id, "created_page_id");

    const groupedSummary = resultJson(
      await callTool(bridgeBaseUrl, "grist_add_ui", {
        action: "add_widget",
        documentId,
        pageId,
        tableId: TABLE_ID,
        type: "record",
        groupByColumnIds: ["Name"]
      }),
      "grouped_summary"
    );
    const groupedSummaryInfo =
      groupedSummary.summary &&
      typeof groupedSummary.summary === "object" &&
      !Array.isArray(groupedSummary.summary)
        ? (groupedSummary.summary as Record<string, unknown>)
        : undefined;
    assert(groupedSummaryInfo?.sourceTableId === TABLE_ID, "grouped_summary_source_mismatch");
    assert(
      Array.isArray(groupedSummaryInfo?.groupByColumnIds) &&
        groupedSummaryInfo.groupByColumnIds.length === 1 &&
        groupedSummaryInfo.groupByColumnIds[0] === "Name",
      "grouped_summary_columns_mismatch"
    );

    const grandTotalSummary = resultJson(
      await callTool(bridgeBaseUrl, "grist_add_ui", {
        action: "add_widget",
        documentId,
        pageId,
        tableId: TABLE_ID,
        type: "record",
        groupByColumnIds: []
      }),
      "grand_total_summary"
    );
    const grandTotalInfo =
      grandTotalSummary.summary &&
      typeof grandTotalSummary.summary === "object" &&
      !Array.isArray(grandTotalSummary.summary)
        ? (grandTotalSummary.summary as Record<string, unknown>)
        : undefined;
    assert(
      Array.isArray(grandTotalInfo?.groupByColumnIds) &&
        grandTotalInfo.groupByColumnIds.length === 0,
      "grand_total_summary_columns_mismatch"
    );

    const firstCard = resultJson(
      await callTool(bridgeBaseUrl, "grist_add_ui", {
        action: "add_widget",
        documentId,
        pageId,
        tableId: TABLE_ID,
        type: "single"
      }),
      "first_card"
    );
    const firstCardWidget =
      firstCard.widget && typeof firstCard.widget === "object" && !Array.isArray(firstCard.widget)
        ? (firstCard.widget as Record<string, unknown>)
        : undefined;
    const firstCardId = positiveResultId(firstCardWidget?.id, "first_card_id");

    await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "update_widget",
      documentId,
      pageId,
      widgetId: firstCardId,
      update: {
        cardLayout: {
          root: {
            kind: "group",
            children: [
              { kind: "field", columnId: "Name" },
              { kind: "field", columnId: "Qty" }
            ]
          }
        }
      }
    });
    await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "update_widget",
      documentId,
      pageId,
      widgetId: firstCardId,
      update: { visibleFields: [{ columnId: "Name" }] }
    });
    await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "update_widget",
      documentId,
      pageId,
      widgetId: firstCardId,
      update: { cardLayout: { root: { kind: "field", columnId: "Name" } } }
    });

    const secondCard = resultJson(
      await callTool(bridgeBaseUrl, "grist_add_ui", {
        action: "add_widget",
        documentId,
        pageId,
        tableId: TABLE_ID,
        type: "single"
      }),
      "second_card"
    );
    const secondCardWidget =
      secondCard.widget && typeof secondCard.widget === "object" && !Array.isArray(secondCard.widget)
        ? (secondCard.widget as Record<string, unknown>)
        : undefined;
    const secondCardId = positiveResultId(secondCardWidget?.id, "second_card_id");
    await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "update_widget",
      documentId,
      pageId,
      widgetId: secondCardId,
      update: {
        cardLayout: {
          root: {
            kind: "group",
            children: [
              { kind: "field", columnId: "Name" },
              { kind: "field", columnId: "Qty" }
            ]
          }
        }
      }
    });
    await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "update_widget",
      documentId,
      pageId,
      widgetId: secondCardId,
      update: { visibleFields: [{ columnId: "Name" }] }
    });
    await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "update_widget",
      documentId,
      pageId,
      widgetId: secondCardId,
      update: {
        visibleFields: [{ columnId: "Name" }, { columnId: "Qty" }]
      }
    });
    await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "update_widget",
      documentId,
      pageId,
      widgetId: secondCardId,
      update: {
        cardLayout: {
          root: {
            kind: "group",
            children: [
              { kind: "field", columnId: "Name" },
              { kind: "field", columnId: "Qty" }
            ]
          }
        }
      }
    });

    const accessRules = resultJson(
      await callTool(bridgeBaseUrl, "grist_inspect", {
        action: "access_rules",
        documentId
      }),
      "access_rules"
    );
    assert(
      accessRules.effectiveEnforcementVerified === false,
      "access_rule_effective_enforcement_flag_missing"
    );
    const protectedAclGroupCount = accessRules.protectedPersistedGroupCount;

    const aclCreated = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group",
        documentId,
        mode: "create",
        target: { tableId: TABLE_ID },
        rules: [
          {
            condition: { kind: "everyone" },
            permissions: {
              read: "allow",
              update: "allow",
              create: "allow",
              delete: "allow"
            }
          }
        ]
      }),
      "access_rule_create"
    );
    assert(aclCreated.persistedDefinitionVerified === true, "access_rule_create_not_verified");
    assert(aclCreated.effectiveEnforcementVerified === false, "access_rule_create_overclaimed_enforcement");

    const accessRulesAfterCreate = resultJson(
      await callTool(bridgeBaseUrl, "grist_inspect", {
        action: "access_rules",
        documentId
      }),
      "access_rules_after_create"
    );
    assert(
      accessRulesAfterCreate.protectedPersistedGroupCount === protectedAclGroupCount,
      "access_rule_create_changed_protected_group_count"
    );
    assert(
      Array.isArray(accessRulesAfterCreate.groups) &&
        accessRulesAfterCreate.groups.some((group) => {
          if (!group || typeof group !== "object" || Array.isArray(group)) return false;
          const target = (group as { target?: unknown }).target;
          return (
            target !== null &&
            typeof target === "object" &&
            !Array.isArray(target) &&
            (target as { tableId?: unknown }).tableId === TABLE_ID
          );
        }),
      "access_rule_created_group_missing"
    );

    const aclDeleted = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group",
        documentId,
        mode: "delete",
        target: { tableId: TABLE_ID }
      }),
      "access_rule_delete"
    );
    assert(aclDeleted.persistedDefinitionVerified === true, "access_rule_delete_not_verified");

    const accessRulesAfterDelete = resultJson(
      await callTool(bridgeBaseUrl, "grist_inspect", {
        action: "access_rules",
        documentId
      }),
      "access_rules_after_delete"
    );
    assert(
      accessRulesAfterDelete.protectedPersistedGroupCount === protectedAclGroupCount,
      "access_rule_delete_changed_protected_group_count"
    );
    assert(
      Array.isArray(accessRulesAfterDelete.groups) &&
        !accessRulesAfterDelete.groups.some((group) => {
          if (!group || typeof group !== "object" || Array.isArray(group)) return false;
          const target = (group as { target?: unknown }).target;
          return (
            target !== null &&
            typeof target === "object" &&
            !Array.isArray(target) &&
            (target as { tableId?: unknown }).tableId === TABLE_ID
          );
        }),
      "access_rule_deleted_group_still_present"
    );

    await callToolExpectError(bridgeBaseUrl, "grist_add_structure", {
      action: "create_document",
      workspaceId: deniedTarget.workspaceId,
      name: "Must Not Be Created"
    });
    await callToolExpectError(bridgeBaseUrl, "grist_add_structure", {
      action: "copy_document_as_template",
      sourceDocumentId: deniedTarget.documentId,
      workspaceId,
      name: "Must Not Copy Denied Source"
    });

    const emptyCreated = resultJson(
      await callTool(bridgeBaseUrl, "grist_add_structure", {
        action: "create_document",
        workspaceId,
        name: "Compatibility Empty"
      }),
      "create_document"
    );
    const emptyDocumentId = createdDocumentId(emptyCreated, "create_document");
    assert(emptyDocumentId !== documentId, "empty_document_id_reused");

    const copied = resultJson(
      await callTool(bridgeBaseUrl, "grist_add_structure", {
        action: "copy_document_as_template",
        sourceDocumentId: documentId,
        workspaceId,
        name: "Compatibility Template"
      }),
      "copy_document_as_template"
    );
    const copiedDocumentId = createdDocumentId(copied, "copy_document_as_template");
    assert(copiedDocumentId !== documentId, "template_copy_id_reused");

    const copiedRows = resultText(
      await callTool(bridgeBaseUrl, "grist_query", {
        documentId: copiedDocumentId,
        tableId: TABLE_ID,
        limit: 10
      })
    );
    assert(!copiedRows.includes("Alpha") && !copiedRows.includes("Beta"), "template_copy_retained_user_rows");

    const queried = resultText(
      await callTool(bridgeBaseUrl, "grist_query", {
        documentId,
        tableId: TABLE_ID,
        limit: 10
      })
    );
    assert(queried.includes("Alpha") && queried.includes("Beta"), "record_roundtrip_failed");

    const inspected = resultText(
      await callTool(bridgeBaseUrl, "grist_inspect", {
        action: "document",
        documentId
      })
    );
    assert(inspected.includes(TABLE_ID), "table_missing_from_inspection");
    assert(inspected.includes(PAGE_NAME), "page_missing_from_inspection");

    console.log(`Grist Community ${version}: PASS`);
    console.log(
      `document=${documentId} workspace=${workspaceId} table=${TABLE_ID} page=${PAGE_NAME} empty=${emptyDocumentId} template=${copiedDocumentId}`
    );
  } finally {
    await stopBridge(bridge);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
