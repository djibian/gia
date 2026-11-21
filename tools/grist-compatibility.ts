import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { leanToolHelp } from "../src/mcp/leanRegistry.js";
import { createTestApiKey, gristStatus } from "./grist-harness.js";
import { makeReadinessRequest, matchReadinessSchemas, READINESS_PROTOCOL_VERSION } from "./mcp-readiness-schema.js";

const STATIC_BEARER = "test-static-bearer-0123456789abcdef0123456789abcdef0123456789abcdef";
const TABLE_ID = "Compat_Items";
const ACL_TABLE_ID = "Compat_Acl";
const PAGE_NAME = "Compatibility";
const COMPAT_TOOL_LIMITS = { maxReadRecords: 100, maxWriteRecords: 50, maxSchemaItems: 50 };

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
    GRIST_MAX_READ_RECORDS: String(COMPAT_TOOL_LIMITS.maxReadRecords),
    GRIST_MAX_WRITE_RECORDS: String(COMPAT_TOOL_LIMITS.maxWriteRecords),
    GRIST_WRITE_BATCH_RECORDS: "25",
    GRIST_MAX_SCHEMA_ITEMS: String(COMPAT_TOOL_LIMITS.maxSchemaItems),
    // Disposable comprehensive native matrix exceeds the default production
    // request/minute ceiling. Dedicated rate limiter tests verify enforcement.
    MCP_PRINCIPAL_RATE_LIMIT_PER_MINUTE: "1000",
    MCP_AUTH_MODE: "static",
    // Synthetic compatibility fixture explicitly opts into the sensitive source scope.
    MCP_CAPABILITIES: "doc:read,doc:write,doc.schema:write,doc:download",
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
    "io.modelcontextprotocol/protocolVersion": READINESS_PROTOCOL_VERSION,
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
    "MCP-Protocol-Version": READINESS_PROTOCOL_VERSION,
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
  const bridge = startBridge({
    ...bridgeEnvironment({ gristBaseUrl, apiKey, documentId, workspaceId, port }),
    GIA_TRUSTED_CUSTOM_WIDGETS_JSON: JSON.stringify([{
      key: "compat", name: "Compatibility widget", widgetId: "@test/compat",
      revision: "v1.0.0", url: "https://widgets.example.org/compat/v1.0.0/index.html"
    }])
  });

  try {
    await waitForUrl(`${bridgeBaseUrl}/healthz`);

    const tools = jsonRpcResult(
      await postMcp({ baseUrl: bridgeBaseUrl, method: "tools/list" })
    );
    assert(Array.isArray(tools.tools), "tools_list_invalid");
    assert(await matchReadinessSchemas(tools.tools, COMPAT_TOOL_LIMITS), "current_wire_schemas_mismatch");
    const discover = jsonRpcResult(await postMcp({ baseUrl: bridgeBaseUrl, method: "server/discover" }));
    assert(JSON.stringify(discover.supportedVersions) === JSON.stringify([READINESS_PROTOCOL_VERSION]),
      "current_transport_version_mismatch");
    const legacy = await fetch(makeReadinessRequest({
      resourceUri: `${bridgeBaseUrl}/mcp`, method: "server/discover", protocol: "2025-11-25", bearer: STATIC_BEARER
    }));
    assert(legacy.status === 400 && (await legacy.json()).error?.code === -32022,
      "legacy_transport_not_refused");

    // Measure what the actual MCP HTTP server advertises, not a mocked
    // registerTool call. A compact ACL schema still declares every finite
    // condition but shares its depth definitions using local JSON Schema refs.
    const changeTool = (tools.tools as Array<{ name: string; inputSchema?: unknown }>)
      .find((entry) => entry.name === "grist_change_structure");
    assert(changeTool?.inputSchema !== undefined, "change_structure_schema_missing");
    const wireSchema = changeTool.inputSchema as Record<string, unknown>;
    const schemaBytes = Buffer.byteLength(JSON.stringify(wireSchema), "utf8");
    assert(schemaBytes < 60_000, `acl_schema_too_large:${schemaBytes}`);
    const defs = wireSchema.$defs;
    assert(defs !== null && typeof defs === "object" && !Array.isArray(defs),
      "acl_schema_local_definitions_missing");
    const refs: string[] = [];
    const walkRefs = (node: unknown): void => {
      if (Array.isArray(node)) { for (const item of node) walkRefs(item); return; }
      if (node === null || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        if (key === "$ref") {
          assert(typeof value === "string" && value.startsWith("#/$defs/"),
            "acl_schema_invalid_reference");
          refs.push(value as string);
        } else walkRefs(value);
      }
    };
    walkRefs(wireSchema);
    assert(refs.length >= 2, "acl_schema_reuse_not_advertised");
    for (const reference of refs) {
      const name = reference.slice("#/$defs/".length).replace(/~1/g, "/").replace(/~0/g, "~");
      assert(Object.hasOwn(defs, name), "acl_schema_unresolved_reference");
    }

    // Discoverability is a real authenticated MCP round trip, not only
    // an in-process registry snapshot. Selected help must explain usable
    // ACL inspection shapes without exposing any real policy values.
    const selectedHelp = resultJson(
      await callTool(bridgeBaseUrl, "grist_help", {
        tools: ["grist_inspect", "grist_change_structure"]
      }), "selected_help"
    );
    assert(isDeepStrictEqual(selectedHelp, leanToolHelp(["grist_inspect", "grist_change_structure"], COMPAT_TOOL_LIMITS)),
      "selected_help_current_wire_mismatch");
    const guides = selectedHelp.tools as Array<{
      name: string;
      guide?: { request?: string[]; examples?: Array<{ arguments: Record<string, unknown> }> };
    }>;
    assert(guides.length === 2, "selected_help_tool_count");
    assert(guides[0]?.name === "grist_inspect" &&
      guides[0]?.guide?.request?.some((shape) => shape.includes("schemaImpact")),
      "selected_help_acl_inspection_missing");
    assert(guides[0]?.guide?.examples?.some((example) => example.arguments.simulation),
      "selected_help_symbolic_simulation_missing");
    assert(guides[1]?.name === "grist_change_structure" &&
      guides[1]?.guide?.request?.some((shape) => shape.includes("match_link_key")),
      "selected_help_acl_mutation_missing");

    const discovered = resultText(
      await callTool(bridgeBaseUrl, "grist_discover", { action: "documents" })
    );
    assert(discovered.includes(documentId), "created_document_not_discovered");

    const templateMetadata = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "update_document",
        documentId,
        update: { name: "Compatibility Probe Renamed", type: "template" }
      }),
      "document_metadata_template"
    );
    const templateDocument =
      templateMetadata.document &&
      typeof templateMetadata.document === "object" &&
      !Array.isArray(templateMetadata.document)
        ? (templateMetadata.document as Record<string, unknown>)
        : undefined;
    assert(templateDocument?.name === "Compatibility Probe Renamed", "document_rename_not_persisted");
    assert(templateDocument?.type === "template", "document_template_type_not_persisted");

    const tutorialMetadata = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "update_document",
        documentId,
        update: { name: "Compatibility Probe Renamed", type: "tutorial" }
      }),
      "document_metadata_tutorial"
    );
    const tutorialDocument =
      tutorialMetadata.document &&
      typeof tutorialMetadata.document === "object" &&
      !Array.isArray(tutorialMetadata.document)
        ? (tutorialMetadata.document as Record<string, unknown>)
        : undefined;
    assert(tutorialDocument?.name === "Compatibility Probe Renamed", "document_rename_not_persisted");
    assert(tutorialDocument?.type === "tutorial", "document_tutorial_type_not_persisted");

    const tutorialInspection = resultJson(
      await callTool(bridgeBaseUrl, "grist_inspect", {
        action: "document",
        documentId
      }),
      "document_metadata_inspection"
    );
    const inspectedDocument =
      tutorialInspection.document &&
      typeof tutorialInspection.document === "object" &&
      !Array.isArray(tutorialInspection.document)
        ? (tutorialInspection.document as Record<string, unknown>)
        : undefined;
    assert(inspectedDocument?.type === "tutorial", "document_tutorial_type_not_inspected");

    await callTool(bridgeBaseUrl, "grist_change_structure", {
      action: "update_document",
      documentId,
      update: { type: "normal" }
    });
    const normalInspection = resultJson(
      await callTool(bridgeBaseUrl, "grist_inspect", {
        action: "document",
        documentId
      }),
      "document_metadata_normal_inspection"
    );
    const normalDocument =
      normalInspection.document &&
      typeof normalInspection.document === "object" &&
      !Array.isArray(normalInspection.document)
        ? (normalInspection.document as Record<string, unknown>)
        : undefined;
    assert(normalDocument?.type === "normal", "document_normal_type_not_inspected");
    const nativeNormalDocument = await gristApi(
      gristBaseUrl,
      apiKey,
      `/api/docs/${encodeURIComponent(documentId)}`
    );
    assert(
      nativeNormalDocument !== null &&
      typeof nativeNormalDocument === "object" &&
      !Array.isArray(nativeNormalDocument),
      "document_native_metadata_missing"
    );
    assert(
      (nativeNormalDocument as Record<string, unknown>).type === null ||
      (nativeNormalDocument as Record<string, unknown>).type === undefined,
      "document_native_normal_type_not_null"
    );

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

    // Missing/empty columns are invalid and must not create native tables.
    for (const tables of [
      [{ id: "Compat_MissingColumns" }],
      [{ id: "Compat_EmptyColumns", columns: [] }]
    ]) {
      let refused = false;
      try {
        await callTool(bridgeBaseUrl, "grist_add_structure", {
          action: "create_tables", documentId, tables
        });
      } catch {
        refused = true;
      }
      assert(refused, "invalid_table_columns_not_refused");
    }
    const nativeTablesAfterRefusal = await gristApi(
      gristBaseUrl, apiKey, `/api/docs/${encodeURIComponent(documentId)}/tables`
    );
    assert(
      nativeTablesAfterRefusal !== null &&
        typeof nativeTablesAfterRefusal === "object" &&
        !Array.isArray(nativeTablesAfterRefusal) &&
        Array.isArray((nativeTablesAfterRefusal as Record<string, unknown>).tables) &&
        !((nativeTablesAfterRefusal as Record<string, unknown>).tables as Array<{ id?: unknown }>).some(
          (table) => table.id === "Compat_MissingColumns" || table.id === "Compat_EmptyColumns"
        ),
      "invalid_table_creation_mutated_native_state"
    );

    // Creation fields are independently read back from native Grist: no advertised
    // creation metadata may silently disappear. Use a disposable dedicated table.
    const creationTableId = "Compat_CreationFields";
    const creationFields = {
      type: "Text", label: "Readable label",
      isFormula: false, formula: "", widgetOptions: "{}"
    };
    await callTool(bridgeBaseUrl, "grist_add_structure", {
      action: "create_tables", documentId,
      tables: [{ id: creationTableId, columns: [
        { id: "Declared", fields: creationFields }
      ] }]
    });
    await callTool(bridgeBaseUrl, "grist_add_structure", {
      action: "create_columns", documentId, tableId: creationTableId,
      columns: [{ id: "Added", fields: creationFields }]
    });
    const creationColumnUrl =
      `/api/docs/${encodeURIComponent(documentId)}/tables/${creationTableId}/columns?hidden=true`;
    const creationColumns = await gristApi(gristBaseUrl, apiKey, creationColumnUrl) as {
      columns: Array<{ id: string; fields: Record<string, unknown> }>;
    };
    for (const name of ["Declared", "Added"]) {
      const actual = creationColumns.columns.find((entry) => entry.id === name);
      assert(actual !== undefined, "created_column_not_persisted");
      for (const [field, expected] of Object.entries(creationFields)) {
        assert(actual.fields[field] === expected, "creation_field_not_persisted:" + field);
      }
    }

    // Both previously accepted-but-ignored fields must fail before *any*
    // table/column in a mixed request is created.
    for (const [suffix, ignored] of [
      ["Description", { description: "ignored by native Grist creation" }],
      ["Display", { visibleColumnId: "Declared" }]
    ] as const) {
      let tableRejected = false;
      try {
        await callTool(bridgeBaseUrl, "grist_add_structure", {
          action: "create_tables", documentId, tables: [
            { id: "Compat_Good_" + suffix, columns: [{ id: "Name", fields: { type: "Text" } }] },
            { id: "Compat_Bad_" + suffix, columns: [
              { id: "Bad", fields: { type: "Text", ...ignored } }
            ] }
          ]
        });
      } catch {
        tableRejected = true;
      }
      assert(tableRejected, "ignored_creation_field_was_accepted:" + suffix);
      let columnRejected = false;
      try {
        await callTool(bridgeBaseUrl, "grist_add_structure", {
          action: "create_columns", documentId, tableId: creationTableId,
          columns: [
            { id: "Compat_Good_" + suffix, fields: { type: "Text" } },
            { id: "Compat_Bad_" + suffix, fields: { type: "Text", ...ignored } }
          ]
        });
      } catch {
        columnRejected = true;
      }
      assert(columnRejected, "ignored_column_creation_field_was_accepted:" + suffix);
    }
    const afterRefusedTables = await gristApi(gristBaseUrl, apiKey,
      `/api/docs/${encodeURIComponent(documentId)}/tables`) as {
        tables: Array<{ id: string }>;
      };
    const afterRefusedColumns = await gristApi(gristBaseUrl, apiKey,
      creationColumnUrl) as { columns: Array<{ id: string }> };
    for (const suffix of ["Description", "Display"]) {
      for (const prefix of ["Compat_Good_", "Compat_Bad_"]) {
        const unexpectedId = prefix + suffix;
        assert(!afterRefusedTables.tables.some((entry) => entry.id === unexpectedId),
          "ignored_creation_field_partially_created_table");
        assert(!afterRefusedColumns.columns.some((entry) => entry.id === unexpectedId),
          "ignored_creation_field_partially_created_column");
      }
    }

    await callTool(bridgeBaseUrl, "grist_add_records", {
      documentId,
      tableId: TABLE_ID,
      records: [
        { fields: { Name: "Alpha", Qty: 1 } },
        { fields: { Name: "Beta", Qty: 2 } }
      ]
    });

    await callTool(bridgeBaseUrl, "grist_add_structure", {
      action: "create_tables",
      documentId,
      tables: [
        {
          id: ACL_TABLE_ID,
          columns: [
            { id: "ShareToken", fields: { type: "Text" } },
            { id: "Enabled", fields: { type: "Bool" } },
            { id: "StatusCode", fields: { type: "Int" } },
            { id: "RequiredText", fields: { type: "Text" } }
          ]
        },
        {
          id: "Compat_Customers",
          columns: [{ id: "Name", fields: { type: "Text" } }]
        },
        {
          id: "Compat_Orders",
          columns: [
            { id: "Customer", fields: { type: "Ref:Compat_Customers" } },
            { id: "Customers", fields: { type: "RefList:Compat_Customers" } }
          ]
        },
        {
          id: "Compat_Events",
          columns: [
            { id: "Title", fields: { type: "Text" } },
            { id: "Start", fields: { type: "DateTime:UTC" } },
            { id: "End", fields: { type: "DateTime:UTC" } },
            { id: "AllDay", fields: { type: "Bool" } },
            { id: "Kind", fields: { type: "Choice" } }
          ]
        }
      ]
    });
    const relationDisplay = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "update_columns",
        documentId,
        tableId: "Compat_Orders",
        columns: [
          { id: "Customer", fields: { visibleColumnId: "Name" } },
          { id: "Customers", fields: { visibleColumnId: "Name" } }
        ]
      }),
      "relation_display"
    );
    const relationUpdated = Array.isArray(relationDisplay.updatedColumns)
      ? relationDisplay.updatedColumns as Record<string, unknown>[]
      : [];
    assert(
      relationUpdated.length === 2 &&
      relationUpdated.every((column) => column.visibleColumnId === "Name"),
      "relation_visible_column_not_reported"
    );
    const relationInspection = resultText(
      await callTool(bridgeBaseUrl, "grist_inspect", {
        action: "document",
        documentId
      })
    );
    assert(
      relationInspection.includes('"visibleColumnId": "Name"'),
      "relation_visible_column_not_inspected"
    );

    const nativeCustomerColumns = await gristApi(
      gristBaseUrl,
      apiKey,
      `/api/docs/${encodeURIComponent(documentId)}/tables/Compat_Customers/columns?hidden=true`
    ) as { columns: Array<{ id: string; fields: Record<string, unknown> }> };
    const nativeOrderColumns = await gristApi(
      gristBaseUrl,
      apiKey,
      `/api/docs/${encodeURIComponent(documentId)}/tables/Compat_Orders/columns?hidden=true`
    ) as { columns: Array<{ id: string; fields: Record<string, unknown> }> };
    assert(Array.isArray(nativeCustomerColumns.columns), "native_customer_columns_missing");
    assert(Array.isArray(nativeOrderColumns.columns), "native_order_columns_missing");
    const nativeNameRef = positiveResultId(
      nativeCustomerColumns.columns.find((column) => column.id === "Name")?.fields.colRef,
      "native_relation_name_ref"
    );
    for (const [sourceColumnId, expectedFormula] of [
      ["Customer", "$Customer.Name"],
      ["Customers", "$Customers.Name"]
    ] as const) {
      const sourceColumn = nativeOrderColumns.columns.find(
        (column) => column.id === sourceColumnId
      );
      assert(sourceColumn !== undefined, `native_relation_source_missing:${sourceColumnId}`);
      assert(
        sourceColumn.fields.visibleCol === nativeNameRef,
        `native_relation_visible_col_mismatch:${sourceColumnId}`
      );
      const displayRef = positiveResultId(
        sourceColumn.fields.displayCol,
        `native_relation_display_ref:${sourceColumnId}`
      );
      const displayColumn = nativeOrderColumns.columns.find(
        (column) => column.fields.colRef === displayRef
      );
      assert(
        displayColumn?.fields.formula === expectedFormula,
        `native_relation_display_formula_mismatch:${sourceColumnId}`
      );
    }

    await callTool(bridgeBaseUrl, "grist_add_structure", {
      action: "create_tables", documentId,
      tables: [{ id: "Compat_Identity", columns: [{ id: "Before", fields: { type: "Text" } }] }]
    });
    const renamedTable = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure", {
      action: "update_tables", documentId,
      tables: [{ id: "Compat_Identity", fields: { tableId: "Compat Identity Probe" } }]
    }), "canonical_table_id");
    assert(JSON.stringify(renamedTable.updatedTables) === JSON.stringify([
      { targetTableId: "Compat_Identity", tableId: "Compat_Identity_Probe" }
    ]), "canonical_table_id_not_reported");
    const renamedColumn = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure", {
      action: "update_columns", documentId, tableId: "Compat_Identity_Probe",
      columns: [{ id: "Before", fields: { label: "Native label" } }]
    }), "label_column_id");
    assert(JSON.stringify(renamedColumn.updatedColumns) === JSON.stringify([
      { targetColumnId: "Before", columnId: "Native_label" }
    ]), "label_rename_id_not_reported");
    await callTool(bridgeBaseUrl, "grist_add_records", {
      documentId, tableId: "Compat_Identity_Probe", records: [{ fields: { Native_label: "resolved" } }]
    });
    await callTool(bridgeBaseUrl, "grist_change_structure", {
      action: "delete_table", documentId, tableId: "Compat_Identity_Probe"
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

    const calendarResult = resultJson(
      await callTool(bridgeBaseUrl, "grist_add_ui", {
        action: "add_widget",
        documentId,
        pageId,
        tableId: "Compat_Events",
        type: "calendar"
      }),
      "calendar_widget"
    );
    const calendarWidget =
      calendarResult.widget &&
      typeof calendarResult.widget === "object" &&
      !Array.isArray(calendarResult.widget)
        ? (calendarResult.widget as Record<string, unknown>)
        : undefined;
    const calendarWidgetId = positiveResultId(calendarWidget?.id, "calendar_widget_id");
    assert(calendarWidget?.type === "calendar", "calendar_public_type_not_normalized");

    const rawSections = await gristApi(
      gristBaseUrl,
      apiKey,
      `/api/docs/${encodeURIComponent(documentId)}/tables/_grist_Views_section/records?hidden=true`
    );
    const rawCalendarSection =
      rawSections &&
      typeof rawSections === "object" &&
      !Array.isArray(rawSections) &&
      Array.isArray((rawSections as { records?: unknown }).records)
        ? ((rawSections as { records: Array<{ id?: unknown; fields?: Record<string, unknown> }> }).records
            .find((record) => record.id === calendarWidgetId))
        : undefined;
    const expectedStoredCalendarType =
      version === "1.7.16" || version === "1.7.17" || version === "1.7.18"
        ? "custom.calendar"
        : "calendar";
    assert(
      rawCalendarSection?.fields?.parentKey === expectedStoredCalendarType,
      `calendar_native_representation_mismatch:${version}:${String(rawCalendarSection?.fields?.parentKey)}`
    );

    const configuredCalendar = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_ui", {
        action: "update_widget",
        documentId,
        pageId,
        widgetId: calendarWidgetId,
        update: {
          calendarConfig: {
            titleColumnId: "Title",
            startDateColumnId: "Start",
            endDateColumnId: "End",
            allDayColumnId: "AllDay",
            typeColumnId: "Kind"
          }
        }
      }),
      "calendar_config"
    );
    const configuredCalendarWidget =
      configuredCalendar.widget &&
      typeof configuredCalendar.widget === "object" &&
      !Array.isArray(configuredCalendar.widget)
        ? (configuredCalendar.widget as Record<string, unknown>)
        : undefined;
    const persistedCalendarConfig =
      configuredCalendarWidget?.calendarConfig &&
      typeof configuredCalendarWidget.calendarConfig === "object" &&
      !Array.isArray(configuredCalendarWidget.calendarConfig)
        ? (configuredCalendarWidget.calendarConfig as Record<string, unknown>)
        : undefined;
    assert(
      persistedCalendarConfig?.titleColumnId === "Title" &&
      persistedCalendarConfig.startDateColumnId === "Start" &&
      persistedCalendarConfig.endDateColumnId === "End" &&
      persistedCalendarConfig.allDayColumnId === "AllDay" &&
      persistedCalendarConfig.typeColumnId === "Kind",
      "calendar_config_not_persisted"
    );

    const rawCalendarSectionsAfter = await gristApi(
      gristBaseUrl,
      apiKey,
      `/api/docs/${encodeURIComponent(documentId)}/tables/_grist_Views_section/records?hidden=true`
    ) as { records: Array<{ id: number; fields: Record<string, unknown> }> };
    const rawCalendarAfter = rawCalendarSectionsAfter.records.find(
      (record) => record.id === calendarWidgetId
    );
    assert(typeof rawCalendarAfter?.fields.options === "string", "calendar_native_options_missing");
    const nativeCalendarOptions = JSON.parse(
      rawCalendarAfter.fields.options as string
    ) as Record<string, unknown>;
    assert(
      typeof nativeCalendarOptions.customView === "string",
      "calendar_native_custom_view_missing"
    );
    const nativeCalendarCustomView = JSON.parse(
      nativeCalendarOptions.customView as string
    ) as Record<string, unknown>;
    const nativeCalendarMapping = nativeCalendarCustomView.columnsMapping;
    assert(
      nativeCalendarMapping !== null &&
      typeof nativeCalendarMapping === "object" &&
      !Array.isArray(nativeCalendarMapping),
      "calendar_native_mapping_missing"
    );
    const nativeEventColumns = await gristApi(
      gristBaseUrl,
      apiKey,
      `/api/docs/${encodeURIComponent(documentId)}/tables/Compat_Events/columns?hidden=true`
    ) as { columns: Array<{ id: string; fields: Record<string, unknown> }> };
    assert(Array.isArray(nativeEventColumns.columns), "calendar_native_columns_missing");
    const eventColumnRef = (columnId: string): number =>
      positiveResultId(
        nativeEventColumns.columns.find((column) => column.id === columnId)?.fields.colRef,
        `calendar_native_ref:${columnId}`
      );
    const nativeMapping = nativeCalendarMapping as Record<string, unknown>;
    assert(nativeMapping.title === eventColumnRef("Title"), "calendar_native_title_ref_mismatch");
    assert(nativeMapping.startDate === eventColumnRef("Start"), "calendar_native_start_ref_mismatch");
    assert(nativeMapping.endDate === eventColumnRef("End"), "calendar_native_end_ref_mismatch");
    assert(nativeMapping.isAllDay === eventColumnRef("AllDay"), "calendar_native_all_day_ref_mismatch");
    assert(nativeMapping.type === eventColumnRef("Kind"), "calendar_native_type_ref_mismatch");

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

    const custom = resultJson(await callTool(bridgeBaseUrl, "grist_add_ui", {
      action: "add_widget", documentId, pageId, tableId: TABLE_ID, type: "custom"
    }), "custom_widget");
    const customWidgetId = positiveResultId((custom.widget as Record<string, unknown>)?.id, "custom_widget_id");
    const trusted = resultJson(await callTool(bridgeBaseUrl, "grist_add_ui", {
      action: "add_widget", documentId, pageId, tableId: TABLE_ID, type: "custom"
    }), "new_trusted_widget");
    const trustedId = positiveResultId((trusted.widget as Record<string, unknown>)?.id, "trusted_id");
    await callToolExpectError(bridgeBaseUrl, "grist_change_ui", {
      action: "install_trusted_widget", documentId, pageId, widgetId: trustedId,
      trustedKey: "unapproved", confirmExternalWidget: true
    });
    const installed = resultJson(await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "install_trusted_widget", documentId, pageId, widgetId: trustedId,
      trustedKey: "compat", confirmExternalWidget: true
    }), "trusted_install") as {changed:boolean;persistedWidgetVerified:boolean;remoteCodeExecutionQualified:boolean};
    assert(installed.changed && installed.persistedWidgetVerified &&
      installed.remoteCodeExecutionQualified === false, "trusted_widget_install_unverified");
    const trustedNative = await gristApi(gristBaseUrl, apiKey,
      "/api/docs/" + encodeURIComponent(documentId) + "/tables/_grist_Views_section/records?hidden=true") as MetaRecords;
    const trustedRow = trustedNative.records.find(row => row.id === trustedId);
    const trustedView = JSON.parse(JSON.parse(trustedRow?.fields.options as string).customView);
    assert(trustedView.widgetId === "@test/compat" && trustedView.access === "none" &&
      trustedView.widgetDef.url === "https://widgets.example.org/compat/v1.0.0/index.html",
      "trusted_widget_native_identity_or_zero_access_missing");
    const repeatedInstall = resultJson(await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "install_trusted_widget", documentId, pageId, widgetId: trustedId,
      trustedKey: "compat", confirmExternalWidget: true
    }), "trusted_install_idempotent") as {changed:boolean};
    assert(!repeatedInstall.changed, "trusted_widget_install_repeated");

    const configuredCustom = resultJson(await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "update_widget", documentId, pageId, widgetId: customWidgetId,
      update: { customWidgetSettings: { access: "none", columnsMapping: { title: "Name" } } }
    }), "custom_settings");
    const customSettings = (configuredCustom.widget as Record<string, unknown>)?.customWidgetSettings as Record<string, unknown>;
    assert(customSettings?.access === "none", "native_empty_custom_settings_not_configured");
    assert((customSettings?.columnsMapping as Record<string, unknown>)?.title === "Name", "custom_mapping_not_stable");
    const sections = await gristApi(gristBaseUrl, apiKey, `/api/docs/${encodeURIComponent(documentId)}/tables/_grist_Views_section/records`) as { records: Array<{ id: number; fields: Record<string, unknown> }> };
    const customSection = sections.records.find((section) => section.id === customWidgetId);
    const nativeOptions = JSON.parse(customSection?.fields.options as string) as Record<string, unknown>;
    assert(typeof nativeOptions.customView === "string", "custom_settings_not_native_encoded");
    const nativeCustomView = JSON.parse(nativeOptions.customView as string) as Record<string, unknown>;
    nativeCustomView.url = "https://widget.example.invalid/private-canary";
    nativeCustomView.pluginId = "private-plugin-canary";
    nativeOptions.customView = JSON.stringify(nativeCustomView);
    nativeOptions.keepCanary = true;
    await gristApi(gristBaseUrl, apiKey, `/api/docs/${encodeURIComponent(documentId)}/apply`, {
      method: "POST", body: JSON.stringify([["UpdateRecord", "_grist_Views_section", customWidgetId, { options: JSON.stringify(nativeOptions) }]])
    });
    await callToolExpectError(bridgeBaseUrl, "grist_change_ui", {
      action: "update_widget", documentId, pageId, widgetId: customWidgetId,
      update: { customWidgetSettings: { access: "read table" } }
    });
    const customUpdated = resultJson(await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "update_widget", documentId, pageId, widgetId: customWidgetId,
      update: { customWidgetSettings: { access: "read table", confirmDataAccess: true } }
    }), "native_custom_update");
    assert(!JSON.stringify(customUpdated).includes("private-canary") && !JSON.stringify(customUpdated).includes("private-plugin-canary"), "custom_private_settings_leaked");
    const afterSections = await gristApi(gristBaseUrl, apiKey, `/api/docs/${encodeURIComponent(documentId)}/tables/_grist_Views_section/records`) as typeof sections;
    const afterOptions = JSON.parse(afterSections.records.find((section) => section.id === customWidgetId)?.fields.options as string) as Record<string, unknown>;
    const afterCustom = JSON.parse(afterOptions.customView as string) as Record<string, unknown>;
    assert(afterOptions.keepCanary === true && afterCustom.url === nativeCustomView.url && afterCustom.pluginId === nativeCustomView.pluginId, "native_custom_untargeted_settings_changed");

    // Exercise only inert existing-widget option writes in this disposable document.
    afterCustom.widgetId = "@synthetic/fixture-widget";
    afterCustom.widgetOptions = { untouchedFixture: "keep" };
    afterOptions.customView = JSON.stringify(afterCustom);
    await gristApi(gristBaseUrl, apiKey, "/api/docs/" + encodeURIComponent(documentId) + "/apply", {
      method: "POST", body: JSON.stringify([["UpdateRecord", "_grist_Views_section", customWidgetId,
        { options: JSON.stringify(afterOptions) }]])
    });
    await callToolExpectError(bridgeBaseUrl, "grist_change_ui", {
      action: "update_widget", documentId, pageId, widgetId: customWidgetId,
      update: { customWidgetSettings: { optionsPatch: { endpoint: "https://unsafe.example.invalid" } } }
    });
    await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "update_widget", documentId, pageId, widgetId: customWidgetId,
      update: { customWidgetSettings: { optionsPatch: { departments: ["29", "35"], active: true } } }
    });
    const optionSections = await gristApi(gristBaseUrl, apiKey,
      "/api/docs/" + encodeURIComponent(documentId) + "/tables/_grist_Views_section/records") as typeof sections;
    const optionSection = optionSections.records.find(section => section.id === customWidgetId);
    const optionsOuter = JSON.parse(optionSection?.fields.options as string) as Record<string, unknown>;
    const optionsInner = JSON.parse(optionsOuter.customView as string) as Record<string, unknown>;
    assert(JSON.stringify(optionsInner.widgetOptions) === JSON.stringify({
      untouchedFixture: "keep", departments: ["29", "35"], active: true
    }), "native_custom_widget_owned_options_not_persisted_or_preserved");
    assert(optionsInner.widgetId === "@synthetic/fixture-widget" &&
      optionsInner.url === nativeCustomView.url && optionsInner.pluginId === nativeCustomView.pluginId &&
      optionsOuter.keepCanary === true, "native_custom_widget_identity_or_unrelated_options_changed");

    const navigation = resultJson(await callTool(bridgeBaseUrl, "grist_inspect", { action: "pages", documentId }), "navigation");
    assert(Array.isArray(navigation.navigationPageIds), "navigation_ids_missing");
    const requestedOrder = [...navigation.navigationPageIds].reverse();
    const reordered = resultJson(await callTool(bridgeBaseUrl, "grist_change_ui", { action: "reorder_pages", documentId, pageIds: requestedOrder }), "native_page_reorder");
    assert(JSON.stringify(reordered.pageIds) === JSON.stringify(requestedOrder), "native_page_order_not_verified");

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
        target: { tableId: ACL_TABLE_ID },
        rules: [
          {
            condition: {
              kind: "all",
              conditions: [
                {
                  kind: "match_link_key",
                  operator: "equals",
                  columnId: "ShareToken",
                  linkKeyName: "CompatToken"
                },
                {
                  kind: "not",
                  condition: { kind: "user_access", operator: "equals", role: "viewer" }
                }
              ]
            },
            permissions: {
              read: "allow",
              update: "allow",
              create: "allow",
              delete: "allow"
            }
          },
          {
            condition: { kind: "everyone" },
            permissions: {
              read: "deny",
              update: "deny",
              create: "deny",
              delete: "deny"
            }
          }
        ]
      }),
      "access_rule_create"
    );
    assert(aclCreated.persistedDefinitionVerified === true, "access_rule_create_not_verified");
    assert(aclCreated.effectiveEnforcementVerified === false, "access_rule_create_overclaimed_enforcement");

    const coverageInspection = resultJson(await callTool(bridgeBaseUrl, "grist_inspect", {
      action: "access_rules", documentId,
      policyCoverage: { target: { kind: "column", tableId: ACL_TABLE_ID, columnId: "ShareToken" }, operation: "read" }
    }), "policy_coverage");
    const coverage = coverageInspection.policyCoverage as Record<string, unknown> | undefined;
    assert(coverage?.nativeQualification === "NOT_TESTED", "coverage_overclaims_native_evidence");
    assert(JSON.stringify(coverage?.ordinaryGroups) === JSON.stringify([{
      target: { tableId: ACL_TABLE_ID, columnIds: [] }, status: "SUPPORTED"
    }]), "coverage_native_rule_group_not_recognized");
    assert(!JSON.stringify(coverage).includes("CompatToken"), "coverage_exposed_unrequested_key_name");

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
          const rules = (group as { rules?: unknown }).rules;
          return (
            target !== null &&
            typeof target === "object" &&
            !Array.isArray(target) &&
            (target as { tableId?: unknown }).tableId === ACL_TABLE_ID &&
            Array.isArray(rules) &&
            rules.some((rule) => {
              if (!rule || typeof rule !== "object" || Array.isArray(rule)) return false;
              const condition = (rule as { condition?: unknown }).condition;
              if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
                return false;
              }
              const composite = condition as { kind?: unknown; conditions?: unknown };
              if (composite.kind !== "all" || !Array.isArray(composite.conditions)) return false;
              return composite.conditions.some((item) => {
                if (!item || typeof item !== "object" || Array.isArray(item)) return false;
                const leaf = item as { kind?: unknown; columnId?: unknown; linkKeyName?: unknown };
                return leaf.kind === "match_link_key" &&
                  leaf.columnId === "ShareToken" &&
                  leaf.linkKeyName === "CompatToken";
              }) && composite.conditions.some((item) => {
                if (!item || typeof item !== "object" || Array.isArray(item)) return false;
                const nested = item as { kind?: unknown; condition?: unknown };
                return nested.kind === "not" &&
                  nested.condition !== null &&
                  typeof nested.condition === "object" &&
                  (nested.condition as { kind?: unknown }).kind === "user_access";
              });
            })
          );
        }),
      "access_rule_created_link_key_group_missing"
    );

    // Proposed values are native ACL context on create/update only.
    // This qualifies persisted Grist metadata, not effective LinkKey authorization.
    const newRecCreated = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group",
        documentId,
        mode: "create",
        target: { tableId: ACL_TABLE_ID, columnIds: ["ShareToken"] },
        rules: [
          {
            condition: {
              kind: "match_user", record: "newRec", operator: "equals",
              columnId: "ShareToken", userProperty: "Email"
            },
            permissions: { read: "unspecified", update: "allow" }
          },
          {
            condition: {
              kind: "match_link_key", record: "newRec", operator: "not_equals",
              columnId: "ShareToken", linkKeyName: "CompatToken"
            },
            permissions: { read: "unspecified", update: "deny" }
          }
        ]
      }),
      "newrec_access_rule_create"
    );
    assert(newRecCreated.persistedDefinitionVerified === true, "newrec_access_rule_not_verified");
    assert(newRecCreated.effectiveEnforcementVerified === false, "newrec_access_rule_overclaimed_enforcement");

    const newRecInspected = resultJson(
      await callTool(bridgeBaseUrl, "grist_inspect", {
        action: "access_rules", documentId
      }),
      "newrec_access_rules_inspection"
    );
    const newRecGroup = (newRecInspected.groups as Array<Record<string, unknown>>).find((group) => {
      const target = group.target as Record<string, unknown> | undefined;
      return target?.tableId === ACL_TABLE_ID &&
        Array.isArray(target.columnIds) &&
        target.columnIds.length === 1 &&
        target.columnIds[0] === "ShareToken";
    });
    assert(newRecGroup?.editable === true, "newrec_access_rule_not_editable");
    const newRecRules = newRecGroup.rules as Array<Record<string, unknown>>;
    assert(newRecRules.length === 2 &&
      newRecRules.every((rule) => (rule.condition as Record<string, unknown>)?.record === "newRec") &&
      (newRecRules[0]!.condition as Record<string, unknown>).kind === "match_user" &&
      (newRecRules[1]!.condition as Record<string, unknown>).kind === "match_link_key",
      "newrec_access_rule_not_normalized");

    const newRecDeleted = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group",
        documentId,
        mode: "delete",
        target: { tableId: ACL_TABLE_ID, columnIds: ["ShareToken"] }
      }),
      "newrec_access_rule_delete"
    );
    assert(newRecDeleted.persistedDefinitionVerified === true, "newrec_access_rule_delete_not_verified");

    // Old/new values can be compared without any literal or secret-bearing formula.
    // A rec/newRec pair is update-only and is checked as persisted metadata, not
    // as a guarantee about effective per-user enforcement.
    const changedCreated = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "create",
        target: { tableId: ACL_TABLE_ID, columnIds: ["ShareToken"] },
        rules: [{
          condition: {
            kind: "column_change", columnId: "ShareToken", operator: "not_equals"
          },
          permissions: { read: "unspecified", update: "deny" }
        }]
      }),
      "column_change_access_rule_create"
    );
    assert(changedCreated.persistedDefinitionVerified === true,
      "column_change_access_rule_not_verified");
    assert(changedCreated.effectiveEnforcementVerified === false,
      "column_change_access_rule_overclaimed_enforcement");
    const changedInspected = resultJson(
      await callTool(bridgeBaseUrl, "grist_inspect", {
        action: "access_rules", documentId
      }),
      "column_change_access_rule_inspect"
    );
    const changedGroup = (changedInspected.groups as Array<Record<string, unknown>>).find((group) => {
      const target = group.target as Record<string, unknown> | undefined;
      return target?.tableId === ACL_TABLE_ID &&
        Array.isArray(target.columnIds) &&
        target.columnIds.length === 1 &&
        target.columnIds[0] === "ShareToken";
    });
    assert(changedGroup?.editable === true, "column_change_not_editable");
    const changedRule = (changedGroup.rules as Array<Record<string, unknown>>)[0];
    assert(changedRule?.condition !== null &&
      typeof changedRule?.condition === "object" &&
      (changedRule.condition as Record<string, unknown>).kind === "column_change" &&
      (changedRule.condition as Record<string, unknown>).columnId === "ShareToken" &&
      (changedRule.condition as Record<string, unknown>).operator === "not_equals",
      "column_change_not_normalized");
    const changedDeleted = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "delete",
        target: { tableId: ACL_TABLE_ID, columnIds: ["ShareToken"] }
      }),
      "column_change_access_rule_delete"
    );
    assert(changedDeleted.persistedDefinitionVerified === true,
      "column_change_access_rule_delete_not_verified");

    // Bool literals are native constants, never arbitrary strings or LinkKey values.
    const boolCreated = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "create",
        target: { tableId: ACL_TABLE_ID, columnIds: ["Enabled"] },
        rules: [
          { condition: {
              kind: "match_boolean", columnId: "Enabled",
              operator: "equals", value: false
            }, permissions: { read: "deny", update: "unspecified" }
          },
          { condition: {
              kind: "match_boolean", columnId: "Enabled",
              operator: "equals", value: true, record: "newRec"
            }, permissions: { read: "unspecified", update: "allow" }
          }
        ]
      }),
      "boolean_access_rule_create"
    );
    assert(boolCreated.persistedDefinitionVerified === true, "boolean_access_rule_not_verified");
    assert(boolCreated.effectiveEnforcementVerified === false, "boolean_access_rule_overclaimed_enforcement");
    const boolInspected = resultJson(
      await callTool(bridgeBaseUrl, "grist_inspect", {
        action: "access_rules", documentId
      }), "boolean_access_rule_inspect"
    );
    const boolGroup = (boolInspected.groups as Array<Record<string, unknown>>).find((group) => {
      const target = group.target as Record<string, unknown> | undefined;
      return target?.tableId === ACL_TABLE_ID &&
        Array.isArray(target.columnIds) &&
        target.columnIds.length === 1 && target.columnIds[0] === "Enabled";
    });
    assert(boolGroup?.editable === true, "boolean_access_rule_not_editable");
    const boolRules = boolGroup.rules as Array<Record<string, unknown>>;
    assert(boolRules.length === 2 &&
      (boolRules[0]!.condition as Record<string, unknown>).kind === "match_boolean" &&
      (boolRules[0]!.condition as Record<string, unknown>).value === false &&
      (boolRules[1]!.condition as Record<string, unknown>).value === true &&
      (boolRules[1]!.condition as Record<string, unknown>).record === "newRec",
      "boolean_access_rule_not_normalized");
    const boolDeleted = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "delete",
        target: { tableId: ACL_TABLE_ID, columnIds: ["Enabled"] }
      }), "boolean_access_rule_delete"
    );
    assert(boolDeleted.persistedDefinitionVerified === true, "boolean_access_rule_delete_not_verified");

    // Native Grist accepts closed built-in role-set membership; this is a
    // persisted-policy compatibility check, not a confidentiality assertion.
    const membershipCreated = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "create",
        target: { tableId: ACL_TABLE_ID, columnIds: ["Enabled"] },
        rules: [
          { condition: {
              kind: "user_access_membership", operator: "in",
              roles: ["viewer", "editor"]
            }, permissions: { read: "deny", update: "unspecified" } },
          { condition: {
              kind: "user_access_membership", operator: "not_in",
              roles: ["viewer", "owner"]
            }, permissions: { read: "unspecified", update: "deny" } }
        ]
      }), "role_membership_access_rule_create"
    );
    assert(membershipCreated.persistedDefinitionVerified === true,
      "role_membership_access_rule_not_verified");
    assert(membershipCreated.effectiveEnforcementVerified === false,
      "role_membership_access_rule_overclaimed_enforcement");
    const membershipInspected = resultJson(
      await callTool(bridgeBaseUrl, "grist_inspect", {
        action: "access_rules", documentId
      }), "role_membership_access_rule_inspect"
    );
    const membershipGroup = (membershipInspected.groups as Array<Record<string, unknown>>).find((group) => {
      const target = group.target as Record<string, unknown> | undefined;
      return target?.tableId === ACL_TABLE_ID && Array.isArray(target.columnIds) &&
        target.columnIds.length === 1 && target.columnIds[0] === "Enabled";
    });
    assert(membershipGroup?.editable === true, "role_membership_not_editable");
    const membershipRules = membershipGroup.rules as Array<Record<string, unknown>>;
    assert(membershipRules.length === 2 &&
      (membershipRules[0]!.condition as Record<string, unknown>).kind === "user_access_membership" &&
      (membershipRules[1]!.condition as Record<string, unknown>).operator === "not_in",
      "role_membership_access_rule_not_normalized");
    const membershipDeleted = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "delete",
        target: { tableId: ACL_TABLE_ID, columnIds: ["Enabled"] }
      }), "role_membership_access_rule_delete"
    );
    assert(membershipDeleted.persistedDefinitionVerified === true,
      "role_membership_access_rule_delete_not_verified");


    // Boolean login status is a native non-secret user property. These two
    // predicates are deliberately false for the signed-in document Owner:
    // self-denying read rules would censor native metadata and rightly cause
    // Gia to report an UNCERTAIN write rather than claim verification.
    const loginCreated = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "create",
        target: { tableId: ACL_TABLE_ID, columnIds: ["Enabled"] },
        rules: [
          { condition: { kind: "user_login_status", operator: "equals", value: false },
            permissions: { read: "deny", update: "unspecified" } },
          { condition: { kind: "user_login_status", operator: "not_equals", value: true },
            permissions: { read: "unspecified", update: "deny" } }
        ]
      }), "login_status_access_rule_create"
    );
    assert(loginCreated.persistedDefinitionVerified === true,
      "login_status_access_rule_not_verified");
    assert(loginCreated.effectiveEnforcementVerified === false,
      "login_status_access_rule_overclaimed_enforcement");
    const loginInspected = resultJson(
      await callTool(bridgeBaseUrl, "grist_inspect", {
        action: "access_rules", documentId
      }), "login_status_access_rule_inspect"
    );
    const loginGroup = (loginInspected.groups as Array<Record<string, unknown>>).find((group) => {
      const target = group.target as Record<string, unknown> | undefined;
      return target?.tableId === ACL_TABLE_ID && Array.isArray(target.columnIds) &&
        target.columnIds.length === 1 && target.columnIds[0] === "Enabled";
    });
    assert(loginGroup?.editable === true, "login_status_access_rule_not_editable");
    const loginRules = loginGroup.rules as Array<Record<string, unknown>>;
    assert(loginRules.length === 2 &&
      loginRules.every((rule) => (rule.condition as Record<string, unknown>).kind === "user_login_status") &&
      (loginRules[0]!.condition as Record<string, unknown>).value === false &&
      (loginRules[1]!.condition as Record<string, unknown>).value === true,
      "login_status_access_rule_not_normalized");
    const loginDeleted = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "delete",
        target: { tableId: ACL_TABLE_ID, columnIds: ["Enabled"] }
      }), "login_status_access_rule_delete"
    );
    assert(loginDeleted.persistedDefinitionVerified === true,
      "login_status_access_rule_delete_not_verified");

    // Finite Int 0/1 literal conditions remain native policy metadata only.
    const flagCreated = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "create",
        target: { tableId: ACL_TABLE_ID, columnIds: ["StatusCode"] },
        rules: [
          { condition: { kind: "match_integer_flag", columnId: "StatusCode",
              operator: "equals", value: 0 },
            permissions: { read: "unspecified", update: "deny" } },
          { condition: { kind: "match_integer_flag", columnId: "StatusCode",
              operator: "not_equals", value: 1, record: "newRec" },
            permissions: { read: "unspecified", update: "deny" } }
        ]
      }), "integer_flag_access_rule_create"
    );
    assert(flagCreated.persistedDefinitionVerified === true,
      "integer_flag_access_rule_not_verified");
    assert(flagCreated.effectiveEnforcementVerified === false,
      "integer_flag_access_rule_overclaimed_enforcement");
    const flagInspected = resultJson(
      await callTool(bridgeBaseUrl, "grist_inspect", {
        action: "access_rules", documentId
      }), "integer_flag_access_rule_inspect"
    );
    const flagGroup = (flagInspected.groups as Array<Record<string, unknown>>).find((group) => {
      const target = group.target as Record<string, unknown> | undefined;
      return target?.tableId === ACL_TABLE_ID && Array.isArray(target.columnIds) &&
        target.columnIds.length === 1 && target.columnIds[0] === "StatusCode";
    });
    assert(flagGroup?.editable === true, "integer_flag_access_rule_not_editable");
    const flagRules = flagGroup.rules as Array<Record<string, unknown>>;
    assert(flagRules.length === 2 &&
      flagRules.every((rule) => (rule.condition as Record<string, unknown>).kind === "match_integer_flag") &&
      (flagRules[0]!.condition as Record<string, unknown>).value === 0 &&
      (flagRules[1]!.condition as Record<string, unknown>).value === 1 &&
      (flagRules[1]!.condition as Record<string, unknown>).record === "newRec",
      "integer_flag_access_rule_not_normalized");
    const flagDeleted = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "delete",
        target: { tableId: ACL_TABLE_ID, columnIds: ["StatusCode"] }
      }), "integer_flag_access_rule_delete"
    );
    assert(flagDeleted.persistedDefinitionVerified === true,
      "integer_flag_access_rule_delete_not_verified");

    // Empty-string comparison remains closed native ACL metadata, not raw input.
    const emptyTextCreated = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "create",
        target: { tableId: ACL_TABLE_ID, columnIds: ["RequiredText"] },
        rules: [
          { condition: { kind: "match_empty_text", columnId: "RequiredText",
              operator: "equals" },
            permissions: { read: "unspecified", update: "deny" } },
          { condition: { kind: "match_empty_text", columnId: "RequiredText",
              operator: "not_equals", record: "newRec" },
            permissions: { read: "unspecified", update: "deny" } }
        ]
      }), "empty_text_access_rule_create"
    );
    assert(emptyTextCreated.persistedDefinitionVerified === true,
      "empty_text_access_rule_not_verified");
    assert(emptyTextCreated.effectiveEnforcementVerified === false,
      "empty_text_access_rule_overclaimed_enforcement");
    const emptyInspected = resultJson(
      await callTool(bridgeBaseUrl, "grist_inspect", { action: "access_rules", documentId }),
      "empty_text_access_rule_inspect"
    );
    const emptyGroup = (emptyInspected.groups as Array<Record<string, unknown>>).find((group) => {
      const target = group.target as Record<string, unknown> | undefined;
      return target?.tableId === ACL_TABLE_ID && Array.isArray(target.columnIds) &&
        target.columnIds.length === 1 && target.columnIds[0] === "RequiredText";
    });
    assert(emptyGroup?.editable === true, "empty_text_access_rule_not_editable");
    const emptyRules = emptyGroup.rules as Array<Record<string, unknown>>;
    assert(emptyRules.length === 2 &&
      emptyRules.every((rule) => (rule.condition as Record<string, unknown>).kind === "match_empty_text") &&
      (emptyRules[1]!.condition as Record<string, unknown>).record === "newRec",
      "empty_text_access_rule_not_normalized");
    const emptyDeleted = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "delete",
        target: { tableId: ACL_TABLE_ID, columnIds: ["RequiredText"] }
      }), "empty_text_access_rule_delete"
    );
    assert(emptyDeleted.persistedDefinitionVerified === true,
      "empty_text_access_rule_delete_not_verified");
    const aclDeleted = resultJson(
      await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "access_rule_group",
        documentId,
        mode: "delete",
        target: { tableId: ACL_TABLE_ID }
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
            (target as { tableId?: unknown }).tableId === ACL_TABLE_ID
          );
        }),
      "access_rule_deleted_group_still_present"
    );

    // Compare a bounded synthetic decision with actual native ordinary
    // R/C/U/D behavior in the compatibility document.
    const compatibilityPolicy = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure", {
      action: "access_rule_group", documentId, mode: "create", target: { tableId: ACL_TABLE_ID },
      rules: [
        {
          condition: { kind: "match_boolean", columnId: "Enabled", operator: "equals", value: true },
          permissions: { read: "allow", update: "allow", create: "allow", delete: "allow" }
        },
        {
          condition: { kind: "everyone" },
          permissions: { read: "deny", update: "deny", create: "deny", delete: "deny" }
        }
      ]
    }), "expected_decision_setup");
    assert(compatibilityPolicy.persistedDefinitionVerified === true, "expected_policy_not_persisted");

    const syntheticFields = [{ name: "Enabled", value: { kind: "boolean", value: true } }];
    for (const operation of ["read", "create", "update", "delete"] as const) {
      const expectedInspection = resultJson(await callTool(bridgeBaseUrl, "grist_inspect", {
        action: "access_rules", documentId,
        policyCoverage: {
          target: { kind: "table", tableId: ACL_TABLE_ID }, operation,
          context: { role: "owner",
            ...(operation !== "create" ? { rec: syntheticFields } : {}),
            ...(operation === "create" || operation === "update" ? { newRec: syntheticFields } : {})
          }
        }
      }), "bounded_expected_decision");
      const expectedCoverage = expectedInspection.policyCoverage as Record<string, unknown> | undefined;
      const decision = expectedCoverage?.expectedDecision as Record<string, unknown> | undefined;
      assert(decision?.decision === "allow" && expectedCoverage?.nativeQualification === "NOT_TESTED",
        `expected_decision_not_bounded_${operation}`);
    }

    const nativeRecordPath = `/api/docs/${encodeURIComponent(documentId)}/tables/${ACL_TABLE_ID}/records`;
    const createdRecord = await gristApi(gristBaseUrl, apiKey, nativeRecordPath, {
      method: "POST", body: JSON.stringify({ records: [{ fields: { Enabled: true } }] })
    }) as { records?: Array<{ id: number }> };
    const expectedRecordId = positiveResultId(createdRecord.records?.[0]?.id, "native_expected_create");
    const readRecord = async () => {
      const response = await gristApi(gristBaseUrl, apiKey, nativeRecordPath) as {
        records: Array<{ id: number; fields: Record<string, unknown> }>
      };
      return response.records.find(({ id }) => id === expectedRecordId);
    };
    assert((await readRecord())?.fields.Enabled === true, "native_expected_read");
    await gristApi(gristBaseUrl, apiKey, nativeRecordPath, {
      method: "PATCH", body: JSON.stringify({
        records: [{ id: expectedRecordId, fields: { RequiredText: "ordinary-update" } }]
      })
    });
    assert((await readRecord())?.fields.RequiredText === "ordinary-update", "native_expected_update");
    await gristApi(gristBaseUrl, apiKey,
      `/api/docs/${encodeURIComponent(documentId)}/tables/${ACL_TABLE_ID}/records/delete`, {
        method: "POST", body: JSON.stringify([expectedRecordId])
      });
    assert(!(await readRecord()), "native_expected_delete");

    const expectedPolicyRemoved = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure", {
      action: "access_rule_group", documentId, mode: "delete", target: { tableId: ACL_TABLE_ID }
    }), "expected_decision_cleanup");
    assert(expectedPolicyRemoved.persistedDefinitionVerified === true, "expected_policy_not_removed");

    // Qualify the actual Grist user-attribute metadata shape using a disposable
    // document. Native UserActions are test-only; Gia never exposes raw /apply.
    const nativeAclResources = await gristApi(gristBaseUrl, apiKey,
      `/api/docs/${encodeURIComponent(documentId)}/tables/_grist_ACLResources/records`);
    const resourceRows = (nativeAclResources as { records?: Array<{
      id: number; fields: Record<string, unknown>
    }> }).records ?? [];
    let defaultAclResource = resourceRows.find((row) =>
      row.fields.tableId === "*" && row.fields.colIds === "*");
    // Empty native documents need not have a default ACL resource yet. Create
    // it only inside the disposable compatibility document.
    if (!defaultAclResource) {
      await gristApi(gristBaseUrl, apiKey,
        `/api/docs/${encodeURIComponent(documentId)}/apply`, {
          method: "POST",
          body: JSON.stringify([["AddRecord", "_grist_ACLResources", null,
            { tableId: "*", colIds: "*" }]])
        });
      const createdResources = await gristApi(gristBaseUrl, apiKey,
        `/api/docs/${encodeURIComponent(documentId)}/tables/_grist_ACLResources/records`);
      defaultAclResource = (createdResources as { records: Array<{
        id: number; fields: Record<string, unknown>
      }> }).records.find((row) =>
        row.fields.tableId === "*" && row.fields.colIds === "*");
    }
    assert(defaultAclResource?.id, "native_default_acl_resource_missing");
    await gristApi(gristBaseUrl, apiKey,
      `/api/docs/${encodeURIComponent(documentId)}/apply`, {
        method: "POST",
        body: JSON.stringify([["AddRecord", "_grist_ACLRules", null, {
          resource: defaultAclResource.id, rulePos: 50,
          userAttributes: JSON.stringify({
            name: "CompatMember", tableId: ACL_TABLE_ID,
            lookupColId: "ShareToken", charId: "Email"
          })
        }]])
      });
    const nativeAttrsInspected = resultJson(
      await callTool(bridgeBaseUrl, "grist_inspect", {
        action: "access_rules", documentId
      }), "native_user_attribute_inspect"
    );
    const attrs = nativeAttrsInspected.userAttributes as {
      definitions?: Array<Record<string, unknown>>;
      protectedDefinitionCount?: number
    };
    assert(attrs && Array.isArray(attrs.definitions) &&
      attrs.definitions.some((def) =>
        def.name === "CompatMember" &&
        def.tableId === ACL_TABLE_ID && def.lookupColId === "ShareToken" &&
        (def.source as Record<string, unknown>)?.kind === "user_property" &&
        (def.source as Record<string, unknown>)?.property === "Email" &&
        def.editable === true), "native_user_attribute_not_normalized");
    assert(nativeAttrsInspected.effectiveEnforcementVerified === false,
      "native_user_attribute_overclaimed_enforcement");

    // Regression for native Grist imports whose default-resource user-attribute
    // rows persist SQL NULL, not empty strings, for both ACL permission fields.
    // This uses only the disposable compatibility document. Verify native
    // readback before claiming this is a genuine end-to-end NULL fixture.
    const nullDefinition = JSON.stringify({
      name: "CompatNullMember", tableId: ACL_TABLE_ID,
      lookupColId: "ShareToken", charId: "Email"
    });
    await gristApi(gristBaseUrl, apiKey,
      `/api/docs/${encodeURIComponent(documentId)}/apply`, {
        method: "POST",
        body: JSON.stringify([["AddRecord", "_grist_ACLRules", null, {
          resource: defaultAclResource.id, rulePos: 51,
          aclFormula: null, aclFormulaParsed: "", permissionsText: null,
          userAttributes: nullDefinition
        }]])
      });
    const readNativeAcl = async (): Promise<Array<{
      id: number; fields: Record<string, unknown>
    }>> => {
      const data = await gristApi(gristBaseUrl, apiKey,
        `/api/docs/${encodeURIComponent(documentId)}/tables/_grist_ACLRules/records`);
      return (data as { records?: Array<{
        id: number; fields: Record<string, unknown>
      }> }).records ?? [];
    };
    const originalNullRows = await readNativeAcl();
    const nativeNullRow = originalNullRows.find(
      row => row.fields.userAttributes === nullDefinition);
    assert(nativeNullRow && nativeNullRow.fields.aclFormula === null &&
      nativeNullRow.fields.permissionsText === null &&
      nativeNullRow.fields.aclFormulaParsed === "",
      "native_null_user_attribute_fixture_not_persisted");

    const nullInspected = resultJson(await callTool(bridgeBaseUrl,
      "grist_inspect", { action: "access_rules", documentId }),
      "native_null_user_attribute_inspect");
    assert((nullInspected.userAttributes as { definitions: Array<{
      name: string; editable: boolean; source: { kind: string; property?: string }
    }> }).definitions.some(def => def.name === "CompatNullMember" &&
      def.editable === true && def.source.kind === "user_property" &&
      def.source.property === "Email"), "native_null_user_attribute_not_normalized");

    const nullReplaced = resultJson(await callTool(bridgeBaseUrl,
      "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "replace",
        target: { userAttributeName: "CompatNullMember" },
        definition: { tableId: ACL_TABLE_ID, lookupColId: "ShareToken",
          source: { kind: "link_key", name: "Token" } }
      }), "native_null_user_attribute_replace");
    assert(nullReplaced.changed === true &&
      nullReplaced.persistedDefinitionVerified === true &&
      nullReplaced.effectiveEnforcementVerified === false,
      "native_null_user_attribute_replace_not_verified");

    const replacedNullRows = await readNativeAcl();
    const replacedNullRow = replacedNullRows.find(row => row.id === nativeNullRow.id);
    assert(replacedNullRow &&
      replacedNullRow.fields.aclFormula === null &&
      replacedNullRow.fields.permissionsText === null &&
      replacedNullRow.fields.aclFormulaParsed === "" &&
      JSON.stringify(JSON.parse(String(replacedNullRow.fields.userAttributes))) ===
        JSON.stringify({ name: "CompatNullMember", tableId: ACL_TABLE_ID,
          lookupColId: "ShareToken", charId: "LinkKey.Token" }),
      "native_null_user_attribute_rewrite_or_loss");
    assert(originalNullRows.length === replacedNullRows.length &&
      originalNullRows.filter(row => row.id !== nativeNullRow.id)
        .every(row => JSON.stringify(row) === JSON.stringify(
          replacedNullRows.find(candidate => candidate.id === row.id))),
      "native_null_user_attribute_replacement_changed_untargeted_rule");

    const afterNullInspection = resultJson(await callTool(bridgeBaseUrl,
      "grist_inspect", { action: "access_rules", documentId }),
      "native_null_user_attribute_inspect_after_replace");
    assert((afterNullInspection.userAttributes as { definitions: Array<{
      name: string; source: { kind: string; name?: string }
    }> }).definitions.some(def => def.name === "CompatNullMember" &&
      def.source.kind === "link_key" && def.source.name === "Token"),
      "native_null_user_attribute_link_key_not_projected");
    assert(!JSON.stringify(afterNullInspection).includes("aclFormula") &&
      !JSON.stringify(afterNullInspection).includes("LinkKey.Token"),
      "native_null_user_attribute_raw_metadata_leaked");

        const attrCreate = resultJson(await callTool(bridgeBaseUrl,
      "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "create",
        target: { userAttributeName: "CompatCreated" },
        definition: { tableId: ACL_TABLE_ID, lookupColId: "ShareToken",
          source: { kind: "user_property", property: "Email" } }
      }), "native_user_attribute_create");
    assert(attrCreate.changed === true && attrCreate.persistedDefinitionVerified === true &&
      attrCreate.effectiveEnforcementVerified === false,
      "native_user_attribute_create_not_verified");
    const attrReplace = resultJson(await callTool(bridgeBaseUrl,
      "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "replace",
        target: { userAttributeName: "CompatCreated" },
        definition: { tableId: ACL_TABLE_ID, lookupColId: "ShareToken",
          source: { kind: "link_key", name: "StageToken" } }
      }), "native_user_attribute_replace");
    assert(attrReplace.changed === true && attrReplace.persistedDefinitionVerified === true,
      "native_user_attribute_replace_not_verified");
    const attrsAfterReplace = resultJson(await callTool(bridgeBaseUrl,
      "grist_inspect", { action: "access_rules", documentId }),
      "native_user_attribute_after_replace");
    assert((attrsAfterReplace.userAttributes as {definitions: Array<Record<string, unknown>>})
      .definitions.some(def => def.name === "CompatCreated" &&
        (def.source as Record<string, unknown>).kind === "link_key" &&
        (def.source as Record<string, unknown>).name === "StageToken"),
      "native_user_attribute_link_key_source_not_preserved");
    // E1-C3: exercise native Grist's user.<attribute>.<column> references
    // through the typed MCP ACL interface, including post-write inspection,
    // idempotence and dependency-preserving definition replacement refusal.
    const attributed = resultJson(await callTool(bridgeBaseUrl,
      "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "create",
        target: { tableId: ACL_TABLE_ID, columnIds: ["ShareToken"] },
        rules: [{
          condition: { kind: "match_user_attribute", operator: "equals",
            columnId: "ShareToken", attributeName: "CompatCreated",
            attributeColumnId: "ShareToken" },
          permissions: { read: "allow", update: "unspecified" }
        }]
      }), "native_typed_user_attribute_rule_create");
    assert(attributed.changed === true && attributed.persistedDefinitionVerified === true &&
      attributed.effectiveEnforcementVerified === false,
      "native_typed_user_attribute_rule_not_verified");
    const attributedInspection = resultJson(await callTool(bridgeBaseUrl,
      "grist_inspect", { action: "access_rules", documentId }),
      "native_typed_user_attribute_rule_inspect");
    const attributedGroup = (attributedInspection.groups as Array<Record<string, unknown>>).find(group => {
      const target = group.target as { tableId?: unknown; columnIds?: unknown };
      return target?.tableId === ACL_TABLE_ID &&
        Array.isArray(target.columnIds) && target.columnIds.length === 1 &&
        target.columnIds[0] === "ShareToken";
    });
    assert(attributedGroup?.editable === true &&
      (attributedGroup.rules as Array<{condition?:{kind?:string; attributeName?:string}}>)
        [0]?.condition?.kind === "match_user_attribute" &&
      (attributedGroup.rules as Array<{condition?:{kind?:string; attributeName?:string}}>)
        [0]?.condition?.attributeName === "CompatCreated",
      "native_typed_user_attribute_rule_not_normalized");
    await callToolExpectError(bridgeBaseUrl, "grist_change_structure", {
      action: "access_rule_group", documentId, mode: "replace",
      target: { userAttributeName: "CompatCreated" },
      definition: { tableId: ACL_TABLE_ID, lookupColId: "ShareToken",
        source: { kind: "user_property", property: "Email" } }
    });
    const attributedRemoved = resultJson(await callTool(bridgeBaseUrl,
      "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "delete",
        target: { tableId: ACL_TABLE_ID, columnIds: ["ShareToken"] }
      }), "native_typed_user_attribute_rule_delete");
    assert(attributedRemoved.persistedDefinitionVerified === true,
      "native_typed_user_attribute_rule_delete_not_verified");

    // Native Grist accepts spaces around Python attribute access. Regress
    // deletion against its actual persisted parsed AST, not only Gia's mocks.
    await gristApi(gristBaseUrl, apiKey,
      `/api/docs/${encodeURIComponent(documentId)}/apply`, {
        method: "POST",
        body: JSON.stringify([
          ["AddRecord", "_grist_ACLResources", -31, {
            tableId: ACL_TABLE_ID, colIds: "*"
          }],
          ["AddRecord", "_grist_ACLRules", null, {
            resource: -31, rulePos: 1,
            aclFormula: "user . CompatCreated.ShareToken == rec.ShareToken",
            permissionsText: "+R"
          }]
        ])
      });
    const beforeRejectedDelete = await gristApi(gristBaseUrl, apiKey,
      `/api/docs/${encodeURIComponent(documentId)}/tables/_grist_ACLRules/records`);
    const dependentRows = (beforeRejectedDelete as { records?: Array<{
      id: number; fields: Record<string, unknown>
    }> }).records ?? [];
    const dependent = dependentRows.find(row =>
      row.fields.aclFormula === "user . CompatCreated.ShareToken == rec.ShareToken");
    assert(dependent &&
      String(dependent.fields.aclFormulaParsed).includes('"CompatCreated"'),
      "native_user_attribute_spaced_predicate_not_parsed");
    await callToolExpectError(bridgeBaseUrl, "grist_change_structure", {
      action: "access_rule_group", documentId, mode: "delete",
      target: { userAttributeName: "CompatCreated" }
    });
    const afterRejectedDelete = await gristApi(gristBaseUrl, apiKey,
      `/api/docs/${encodeURIComponent(documentId)}/tables/_grist_ACLRules/records`);
    assert(JSON.stringify(afterRejectedDelete) === JSON.stringify(beforeRejectedDelete),
      "native_user_attribute_rejected_delete_changed_state");
    const dependentResourceId = dependent.fields.resource;
    assert(typeof dependentResourceId === "number" && dependentResourceId > 0,
      "native_user_attribute_dependency_resource_missing");
    await gristApi(gristBaseUrl, apiKey,
      `/api/docs/${encodeURIComponent(documentId)}/apply`, {
        method: "POST",
        body: JSON.stringify([
          ["RemoveRecord", "_grist_ACLRules", dependent.id],
          ["RemoveRecord", "_grist_ACLResources", dependentResourceId]
        ])
      });
    const attrDelete = resultJson(await callTool(bridgeBaseUrl,
      "grist_change_structure", {
        action: "access_rule_group", documentId, mode: "delete",
        target: { userAttributeName: "CompatCreated" }
      }), "native_user_attribute_delete");
    assert(attrDelete.changed === true && attrDelete.persistedDefinitionVerified === true,
      "native_user_attribute_delete_not_verified");
    const attrsAfterDelete = resultJson(await callTool(bridgeBaseUrl,
      "grist_inspect", { action: "access_rules", documentId }),
      "native_user_attribute_after_delete");
    assert(!(attrsAfterDelete.userAttributes as {definitions: Array<Record<string, unknown>>})
      .definitions.some(def => def.name === "CompatCreated") &&
      (attrsAfterDelete.userAttributes as {definitions: Array<Record<string, unknown>>})
      .definitions.some(def => def.name === "CompatMember"),
      "native_user_attribute_delete_damaged_untargeted_definition");

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

    // Build the configuration fixture through Gia from the new empty document.
    const createFixtureTable = (id: string, columns: Array<{ id: string; fields: { type: string } }>) =>
      callTool(bridgeBaseUrl, "grist_add_structure", {
        action: "create_tables", documentId: emptyDocumentId, tables: [{ id, columns }]
      });
    const columnOf = (id: string, type: string) => ({ id, fields: { type } });
    await createFixtureTable("Classes", [columnOf("Name", "Text")]);
    await createFixtureTable("Mentors", [columnOf("Status", "Text"), columnOf("Class", "Ref:Classes")]);
    await createFixtureTable("Placements", [columnOf("Class", "Ref:Classes"),
      columnOf("Eligible", "RefList:Mentors"), columnOf("Oracle", "Ref:Mentors")]);
    const configuredRequest = {
      action: "create_columns", documentId: emptyDocumentId, tableId: "Placements", columns: [
        { ...columnOf("ActiveMentor", "Ref:Mentors"), configuration: {
          form: { question: "Preferred mentor", required: true, acceptFromUrl: true },
          dropdownCondition: { kind: "choice_field_equals_literal", choiceColumnId: "Status", value: "validé" }
        } },
        { ...columnOf("ClassMentor", "Ref:Mentors"), configuration: {
          dropdownCondition: { kind: "choice_field_equals_record_ref", choiceColumnId: "Class", recordColumnId: "Class" }
        } },
        { ...columnOf("EligibleMentors", "RefList:Mentors"), configuration: {
          dropdownCondition: { kind: "choice_id_in_record_reflist", recordColumnId: "Eligible" }
        } }
      ]
    };
    const configured = resultJson(await callTool(bridgeBaseUrl, "grist_add_structure", configuredRequest),
      "configured_columns_create");
    assert(configured.changed === true && configured.persistedOptionsVerified === true,
      "configured_columns_writes_not_verified");
    const replay = resultJson(await callTool(bridgeBaseUrl, "grist_add_structure", configuredRequest),
      "configured_columns_replay");
    assert(replay.changed === false && isDeepStrictEqual(replay.columns, configured.columns),
      "configured_columns_replay_duplicated_schema");
    await callToolExpectError(bridgeBaseUrl, "grist_add_structure", { ...configuredRequest, columns: [
      { ...configuredRequest.columns[0], configuration: { form: { question: "Different question" } } }
    ] });

    const configuredDocPath = `/api/docs/${encodeURIComponent(emptyDocumentId)}`;
    const columnPath = `${configuredDocPath}/tables/Placements/columns`;
    const nativeColumns = await gristApi(gristBaseUrl, apiKey, columnPath) as {
      columns: Array<{ id: string; fields: { colRef: number; widgetOptions: string } }>;
    };
    assert(nativeColumns.columns.length === 6, "configured_columns_replay_changed_count");
    const oracle = nativeColumns.columns.find(column => column.id === "Oracle");
    assert(oracle, "configured_native_parser_oracle_missing");
    for (const [id, text] of [
      ["ActiveMentor", 'choice.Status == "validé"'],
      ["ClassMentor", "choice.Class == $Class"],
      ["EligibleMentors", "choice.id in $Eligible"]
    ]) {
      const created = nativeColumns.columns.find(column => column.id === id);
      assert(created, "configured_dropdown_column_missing");
      const actual = JSON.parse(created.fields.widgetOptions).dropdownCondition;
      assert(actual.text === text, "configured_dropdown_text_mismatch");
      await gristApi(gristBaseUrl, apiKey, `${configuredDocPath}/apply`, {
        method: "POST", body: JSON.stringify([["UpdateRecord", "_grist_Tables_column", oracle.fields.colRef,
          { widgetOptions: JSON.stringify({ dropdownCondition: { text } }) }]])
      });
      const roundtrip = await gristApi(gristBaseUrl, apiKey, columnPath) as typeof nativeColumns;
      const parsed = JSON.parse(roundtrip.columns.find(column => column.id === "Oracle")!.fields.widgetOptions)
        .dropdownCondition.parsed;
      assert(isDeepStrictEqual(JSON.parse(parsed), JSON.parse(actual.parsed)),
        "configured_dropdown_differs_from_native_parser");
    }

    const configuredPage = resultJson(await callTool(bridgeBaseUrl, "grist_add_ui", {
      action: "create_page", documentId: emptyDocumentId, tableId: "Placements", name: "Applications"
    }), "configured_form_page");
    const configuredPageId = positiveResultId((configuredPage.page as { id: number }).id, "configured_form_page_id");
    const newConfiguredForm = resultJson(await callTool(bridgeBaseUrl, "grist_add_ui", {
      action: "add_widget", documentId: emptyDocumentId, pageId: configuredPageId, tableId: "Placements", type: "form"
    }), "configured_form");
    const configuredFormId = positiveResultId((newConfiguredForm.widget as { id: number }).id, "configured_form_id");
    const configuredFormPreview = await gristApi(gristBaseUrl, apiKey, `${configuredDocPath}/forms/${configuredFormId}`) as {
      formFieldsById: Record<number, { colId: string; question: string; options: Record<string, unknown> }>;
    };
    const question = Object.values(configuredFormPreview.formFieldsById).find(field => field.colId === "ActiveMentor");
    assert(question?.question === "Preferred mentor" && question.options.formRequired === true &&
      question.options.formAcceptFromUrl === true, "configured_form_defaults_not_used_natively");

    // #295: change and clear a native reference dropdown predicate on an existing column.
    const conditionRequest = {
      action: "update_dropdown_condition", documentId: emptyDocumentId,
      tableId: "Placements", columnId: "ActiveMentor",
      condition: { kind: "choice_field_equals_literal", choiceColumnId: "Status", value: "actif" }
    };
    const changedDropdown = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure",
      conditionRequest), "native_dropdown_update") as { changed: boolean; persistedOptionsVerified: boolean };
    assert(changedDropdown.changed && changedDropdown.persistedOptionsVerified,
      "native_dropdown_update_not_verified");
    const changedDropdownReplay = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure",
      conditionRequest), "native_dropdown_replay") as { changed: boolean; persistedOptionsVerified: boolean };
    assert(changedDropdownReplay.changed === false && changedDropdownReplay.persistedOptionsVerified,
      "native_dropdown_update_replayed");
    const activeOptionsAfterUpdate = await gristApi(gristBaseUrl, apiKey, columnPath) as typeof nativeColumns;
    const changedActive = JSON.parse(String(activeOptionsAfterUpdate.columns.find(
      column => column.id === "ActiveMentor")?.fields.widgetOptions)) as Record<string, unknown>;
    const changedCondition = changedActive.dropdownCondition as { text: string; parsed: string };
    assert(changedCondition.text === 'choice.Status == "actif"' &&
      isDeepStrictEqual(JSON.parse(changedCondition.parsed), [
        "Eq", ["Attr", ["Name", "choice"], "Status"], ["Const", "actif"]
      ]) && changedActive.question === "Preferred mentor" &&
      changedActive.formRequired === true && changedActive.formAcceptFromUrl === true,
      "native_dropdown_update_lost_form_defaults_or_compilation");
    await callToolExpectError(bridgeBaseUrl, "grist_change_structure", {
      ...conditionRequest, condition: { kind: "choice_id_in_record_reflist", recordColumnId: "Class" }
    });
    const clearedDropdown = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure", {
      ...conditionRequest, condition: null
    }), "native_dropdown_clear") as { changed: boolean; persistedOptionsVerified: boolean };
    assert(clearedDropdown.changed && clearedDropdown.persistedOptionsVerified,
      "native_dropdown_clear_not_verified");
    const activeOptionsAfterClear = await gristApi(gristBaseUrl, apiKey, columnPath) as typeof nativeColumns;
    const clearOptions = JSON.parse(String(activeOptionsAfterClear.columns.find(
      column => column.id === "ActiveMentor")?.fields.widgetOptions)) as Record<string, unknown>;
    assert(!Object.hasOwn(clearOptions, "dropdownCondition") &&
      clearOptions.question === "Preferred mentor" && clearOptions.formRequired === true &&
      clearOptions.formAcceptFromUrl === true, "native_dropdown_clear_lost_unrelated_form_options");

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

    // A full copy retains records, unlike native asTemplate:true.
    const fullCopied = resultJson(
      await callTool(bridgeBaseUrl, "grist_add_structure", {
        action: "copy_document",
        sourceDocumentId: documentId,
        workspaceId,
        name: "Compatibility Full Copy"
      }),
      "copy_document"
    );
    const fullCopiedId = createdDocumentId(fullCopied, "copy_document");
    assert(fullCopiedId !== documentId && fullCopiedId !== copiedDocumentId,
      "full_copy_id_reused");
    const fullRows = resultText(
      await callTool(bridgeBaseUrl, "grist_query", {
        documentId: fullCopiedId,
        tableId: TABLE_ID,
        limit: 10
      })
    );
    assert(fullRows.includes("Alpha") && fullRows.includes("Beta"),
      "full_copy_lost_source_rows");

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

    const settingsDocPath = `/api/docs/${encodeURIComponent(documentId)}`;
    const persistedDocSettings = JSON.stringify({ locale: "fr-FR", currency: "EUR", opaque: "synthetic-private-settings" });
    await gristApi(gristBaseUrl, apiKey, `${settingsDocPath}/apply`, {
      method: "POST",
      body: JSON.stringify([
        ["UpdateRecord", "_grist_DocInfo", 1, {
          timezone: "UTC",
          documentSettings: persistedDocSettings
        }],
        ["AddColumn", TABLE_ID, "TimezoneOffset", {
          type: "Numeric", isFormula: true,
          formula: "DTIME(DATE(2025, 1, 15)).utcoffset().total_seconds()"
        }]
      ])
    });
    for (const update of [
      { timezone: "Europe/Invalid" },
      { timezone: "America/Ciudad_Juarez" },
      { timezone: "Europe/Paris", name: "Unexpected name" }
    ]) {
      await callToolExpectError(bridgeBaseUrl, "grist_change_structure", {
        action: "update_document", documentId, update
      });
    }
    for (const [timezone, expectedChanged] of [
      ["Europe/Paris", true], ["Europe/Paris", false], ["UTC", true], ["Europe/Paris", true]
    ] as const) {
      const updateResult = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "update_document", documentId, update: { timezone }
      }), "native_document_timezone_update");
      assert(updateResult.changed === expectedChanged, "native_document_timezone_changed_mismatch");
      const computed = await gristApi(gristBaseUrl, apiKey,
        `${settingsDocPath}/tables/${TABLE_ID}/records?limit=1`) as {
          records: Array<{ fields: Record<string, unknown> }>;
        };
      assert(computed.records[0]?.fields.TimezoneOffset === (timezone === "UTC" ? 0 : 3600),
        "native_document_timezone_formula_mismatch");
    }
    // #295: synthetic native locale updates must preserve unprojected settings.
    await callToolExpectError(bridgeBaseUrl, "grist_change_structure", {
      action: "update_document", documentId, update: { locale: "de-DE" }
    });
    await callToolExpectError(bridgeBaseUrl, "grist_change_structure", {
      action: "update_document", documentId, update: { locale: "en-US", timezone: "UTC" }
    });
    for (const [locale, changed] of [["en-US", true], ["en-US", false], ["fr-FR", true]] as const) {
      const result = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure", {
        action: "update_document", documentId, update: { locale }
      }), "native_document_locale_write") as { changed: boolean; settings: {
        locale: string; timezone: string
      } };
      assert(result.changed === changed && result.settings.locale === locale &&
        result.settings.timezone === "Europe/Paris", "native_document_locale_postcondition");
    }
    const docInfo = await gristApi(gristBaseUrl, apiKey,
      `${settingsDocPath}/tables/_grist_DocInfo/records?hidden=true`) as {
        records: Array<{ id: number; fields: Record<string, unknown> }>;
      };
    const nativeSettings = docInfo.records.find(record => record.id === 1)?.fields;
    assert(nativeSettings?.timezone === "Europe/Paris" &&
      nativeSettings?.documentSettings === persistedDocSettings, "native_document_timezone_preservation_mismatch");
    const settingsInspection = resultJson(await callTool(bridgeBaseUrl, "grist_inspect", {
      action: "document", documentId
    }), "native_document_settings_inspection");
    const settings = (settingsInspection.document as Record<string, unknown>).settings;
    assert(isDeepStrictEqual(settings, { status: "supported", locale: "fr-FR", timezone: "Europe/Paris" }),
      "native_document_settings_shape_mismatch");
    assert(!JSON.stringify(settingsInspection).includes("synthetic-private-settings"),
      "native_document_settings_private_value_exposed");

    // Persist a native form in the disposable fixture. Section intent alone
    // cannot publish it because no native page share is created.
    const docPath = `/api/docs/${encodeURIComponent(documentId)}`;
    type MetaRecords = { records: Array<{ id: number; fields: Record<string, unknown> }> };
    const [nativeSections, sectionFields, columns] = await Promise.all(
      ["_grist_Views_section", "_grist_Views_section_field", "_grist_Tables_column"].map(
        async table => await gristApi(gristBaseUrl, apiKey,
          `${docPath}/tables/${table}/records?hidden=true`) as MetaRecords
      )
    );
    const formSection = nativeSections?.records.find(row => row.id === firstCardId);
    assert(formSection, "form_fixture_section_missing");
    const column = columns?.records.find(row =>
      row.fields.parentId === formSection.fields.tableRef && row.fields.colId === "Name");
    assert(column, "form_fixture_column_missing");
    const formField = sectionFields?.records.find(row =>
      row.fields.parentId === formSection.id && row.fields.colRef === column.id);
    assert(formField, "form_fixture_field_missing");
    const layoutSpec = JSON.stringify({
      id: "root", type: "Layout", submitText: "Send", successText: "Thank you",
      successURL: "https://example.test/?key=synthetic-private-form-marker",
      children: [
        { id: "paragraph", type: "Paragraph", text: "Application" },
        { id: "section", type: "Section", children: [{ id: "field", type: "Field", leaf: formField.id }] },
        { id: "submit", type: "Submit" }
      ]
    });
    await gristApi(gristBaseUrl, apiKey, `${docPath}/apply`, {
      method: "POST",
      body: JSON.stringify([
        ["UpdateRecord", "_grist_Tables_column", column.id, {
          widgetOptions: JSON.stringify({
            question: "Your name", formRequired: true, formAcceptFromUrl: true,
            dropdownCondition: { text: 'choice.Status == "active"' }
          })
        }],
        ["UpdateRecord", "_grist_Views_section_field", formField.id, {
          widgetOptions: JSON.stringify({ question: "Preferred name" })
        }],
        ["UpdateRecord", "_grist_Views_section", formSection.id, {
          parentKey: "form", layoutSpec, options: "", shareOptions: '{"form":true,"publish":true}'
        }]
      ])
    });
    // #295: publish a real native Form only after explicit confirmation and Owner proof.
    // Start from a synthetic unpublished Form, without changing any user document.
    await gristApi(gristBaseUrl, apiKey, `${docPath}/apply`, {
      method: "POST",
      body: JSON.stringify([["UpdateRecord", "_grist_Views_section", formSection.id, {
        shareOptions: '{"form":true,"publish":false}'
      }]])
    });
    await callToolExpectError(bridgeBaseUrl, "grist_change_ui", {
      action: "publish_form", documentId, pageId, widgetId: formSection.id
    });
    const publishedForm = resultJson(await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "publish_form", documentId, pageId, widgetId: formSection.id, confirmPublic: true
    }), "native_publish_form") as {
      changed: boolean; publicationRequested: boolean; persistedPublicationIntentVerified: boolean;
      persistedPageShareVerified: boolean; publicSubmissionQualified: boolean
    };
    assert(publishedForm.changed && publishedForm.publicationRequested &&
      publishedForm.persistedPublicationIntentVerified && publishedForm.persistedPageShareVerified &&
      publishedForm.publicSubmissionQualified === false,
      "native_form_publication_not_verified");
    const publishedFormRecords = await gristApi(gristBaseUrl, apiKey,
      `${docPath}/tables/_grist_Views_section/records?hidden=true`) as MetaRecords;
    assert(JSON.parse(String(publishedFormRecords.records.find(
      row => row.id === formSection.id)?.fields.shareOptions)).publish === true,
      "native_form_publication_not_persisted");
    const [publishedPages, publishedShares] = await Promise.all(
      ["_grist_Pages", "_grist_Shares"].map(table => gristApi(gristBaseUrl, apiKey,
        `${docPath}/tables/${table}/records?hidden=true`) as Promise<MetaRecords>)
    );
    assert(publishedPages && publishedShares, "native_form_share_snapshot_unavailable");
    const pageShareRef = publishedPages.records.find(row => row.fields.viewRef === pageId)?.fields.shareRef;
    assert(typeof pageShareRef === "number" && pageShareRef > 0 &&
      publishedShares.records.some(row => row.id === pageShareRef &&
        JSON.parse(String(row.fields.options)).publish === true &&
        typeof row.fields.linkId === "string"), "native_published_form_missing_page_share");
    const repeatedPublish = resultJson(await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "publish_form", documentId, pageId, widgetId: formSection.id, confirmPublic: true
    }), "native_publish_form_replay") as { changed: boolean };
    assert(repeatedPublish.changed === false, "native_form_publication_replay_wrote");
    const nativePreview = await gristApi(gristBaseUrl, apiKey, `${docPath}/forms/${formSection.id}`) as {
      formTableId: string;
      formFieldsById: Record<number, { colId: string; question: string }>;
    };
    assert(nativePreview.formTableId === TABLE_ID, "native_form_table_id_mismatch");
    const previewField = nativePreview.formFieldsById[formField.id];
    assert(previewField?.colId === "Name", "native_form_leaf_column_id_mismatch");
    assert(previewField.question === "Preferred name", "native_form_field_override_mismatch");
    const widgets = resultJson(await callTool(bridgeBaseUrl, "grist_inspect", {
      action: "page_widgets", documentId, pageId
    }), "native_form_inspection").widgets as Array<{ id: number; form?: unknown }>;
    const form = widgets.find(widget => widget.id === formSection.id)?.form;
    assert(isDeepStrictEqual(form, {
      status: "protected", sectionPublicationIntent: "requested", publicationQualification: "not_tested",
      tableId: TABLE_ID, submission: { submitText: "Send", successText: "Thank you", successUrlConfigured: true },
      layout: { type: "layout", children: [
        { type: "paragraph", text: "Application" },
        { type: "section", children: [
          { type: "field", columnId: "Name",
            columnOptions: { question: "Your name", required: true, acceptFromUrl: true },
            fieldOptions: { question: "Preferred name" }, dropdownConditionConfigured: true }
        ] },
        { type: "submit" }
      ] }
    }), "native_form_projection_mismatch");
    assert(!JSON.stringify(widgets).includes("synthetic-private-form-marker"),
      "native_form_secret_exposed");
    const dropdownDiscovery = resultJson(await callTool(bridgeBaseUrl, "grist_discover", {
      action: "columns", documentId, tableId: TABLE_ID
    }), "native_dropdown_column_inspection");
    const discoveredName = (dropdownDiscovery.columns as Array<{
      id: string; fields: Record<string, unknown>
    }>).find(item => item.id === "Name");
    assert(isDeepStrictEqual(discoveredName?.fields.dropdownCondition, { status: "protected" }),
      "native_dropdown_column_presence_missing");
    assert(isDeepStrictEqual(discoveredName?.fields.formColumnOptions, {
      status: "protected", question: "Your name", required: true, acceptFromUrl: true
    }), "native_form_column_options_projection_mismatch");
    const afterInspection = await gristApi(gristBaseUrl, apiKey,
      `${docPath}/tables/_grist_Views_section/records?hidden=true`) as MetaRecords;
    assert(afterInspection.records.find(row => row.id === formSection.id)?.fields.layoutSpec === layoutSpec,
      "form_inspection_modified_native_layout");

    // #295: write Form column options and preserve an existing opaque dropdown condition.
    const configuredForm = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure", {
      action: "update_form_column_options", documentId, tableId: TABLE_ID, columnId: "Name",
      update: { question: "Contact name", required: false, acceptFromUrl: false }
    }), "native_form_column_options_write") as { changed: boolean; persistedOptionsVerified: boolean };
    assert(configuredForm.changed && configuredForm.persistedOptionsVerified,
      "native_form_column_options_not_verified");
    const persistedFormColumn = await gristApi(gristBaseUrl, apiKey,
      `${docPath}/tables/_grist_Tables_column/records?hidden=true`) as MetaRecords;
    const persistedFormOptions = JSON.parse(String(persistedFormColumn.records.find(
      row => row.id === column.id)?.fields.widgetOptions)) as Record<string, unknown>;
    assert(persistedFormOptions.question === "Contact name" &&
      persistedFormOptions.formRequired === false &&
      persistedFormOptions.formAcceptFromUrl === false &&
      (persistedFormOptions.dropdownCondition as { text: string }).text === 'choice.Status == "active"',
      "native_form_column_options_preservation_failed");
    const repeatedForm = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure", {
      action: "update_form_column_options", documentId, tableId: TABLE_ID, columnId: "Name",
      update: { question: "Contact name", required: false, acceptFromUrl: false }
    }), "native_form_column_options_noop") as { changed: boolean };
    assert(repeatedForm.changed === false, "native_form_column_options_repeat_wrote");

    // #295: native form layout creation from stable column IDs, after an
    // explicit fixture-only removal of the protected legacy redirect URL.
    const sanitizedFormLayout = JSON.parse(layoutSpec) as Record<string, unknown>;
    delete sanitizedFormLayout.successURL;
    sanitizedFormLayout.anotherResponse = false;
    await gristApi(gristBaseUrl, apiKey, `${docPath}/apply`, {
      method: "POST",
      body: JSON.stringify([["UpdateRecord", "_grist_Views_section", formSection.id, {
        layoutSpec: JSON.stringify(sanitizedFormLayout)
      }]])
    });
    const semanticFormLayout = {
      children: [
        { type: "paragraph", text: "Application du stage" },
        { type: "section", children: [{ type: "field", columnId: "Name" }] },
        { type: "submit" }
      ],
      submitText: "Envoyer"
    };
    const createdFormLayout = resultJson(await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "update_form_layout", documentId, pageId, widgetId: formSection.id,
      layout: semanticFormLayout
    }), "native_form_layout_write") as { changed: boolean; persistedLayoutVerified: boolean };
    assert(createdFormLayout.changed && createdFormLayout.persistedLayoutVerified,
      "native_form_layout_write_not_verified");
    const persistedLayoutSections = await gristApi(gristBaseUrl, apiKey,
      `${docPath}/tables/_grist_Views_section/records?hidden=true`) as MetaRecords;
    const persistedFormLayout = JSON.parse(String(persistedLayoutSections.records.find(
      row => row.id === formSection.id)?.fields.layoutSpec)) as {
      children: Array<{children?: Array<{leaf?: number}>}>;
      submitText?: string;
      successText?: string;
      anotherResponse?: boolean;
    };
    assert(persistedFormLayout.children[1]?.children?.[0]?.leaf === formField.id &&
      persistedFormLayout.submitText === "Envoyer" && persistedFormLayout.successText === "Thank you" &&
      persistedFormLayout.anotherResponse === false,
      "native_form_layout_stable_field_reference_mismatch");
    const repeatedLayout = resultJson(await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "update_form_layout", documentId, pageId, widgetId: formSection.id,
      layout: semanticFormLayout
    }), "native_form_layout_noop") as { changed: boolean };
    assert(repeatedLayout.changed === false, "native_form_layout_repeat_wrote");
    const formPreviewAfterWrite = await gristApi(gristBaseUrl, apiKey,
      `${docPath}/forms/${formSection.id}`) as { formFieldsById: Record<number, { colId: string }> };
    assert(formPreviewAfterWrite.formFieldsById[formField.id]?.colId === "Name",
      "native_form_layout_broke_form_field");
    
    // #295: change the Form's own field overrides without changing column defaults.
    const formFieldChange = resultJson(await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "update_form_field_options", documentId, pageId,
      widgetId: formSection.id, columnId: "Name",
      update: { question: "Participant name", required: true, acceptFromUrl: false }
    }), "native_form_field_options_write") as {
      changed: boolean; persistedOptionsVerified: boolean
    };
    assert(formFieldChange.changed && formFieldChange.persistedOptionsVerified,
      "native_form_field_options_write_not_verified");
    const nativeFieldOverrides = await gristApi(gristBaseUrl, apiKey,
      `${docPath}/tables/_grist_Views_section_field/records?hidden=true`) as MetaRecords;
    const persistedFieldOptions = JSON.parse(String(nativeFieldOverrides.records.find(
      row => row.id === formField.id)?.fields.widgetOptions)) as Record<string, unknown>;
    assert(persistedFieldOptions.question === "Participant name" &&
      persistedFieldOptions.formRequired === true &&
      persistedFieldOptions.formAcceptFromUrl === false,
      "native_form_field_options_persistence_failed");
    const repeatFieldChange = resultJson(await callTool(bridgeBaseUrl, "grist_change_ui", {
      action: "update_form_field_options", documentId, pageId,
      widgetId: formSection.id, columnId: "Name",
      update: { question: "Participant name", required: true, acceptFromUrl: false }
    }), "native_form_field_options_noop") as { changed: boolean };
    assert(repeatFieldChange.changed === false, "native_form_field_options_repeat_wrote");
    const nativeFormPreviewAfterFieldUpdate = await gristApi(gristBaseUrl, apiKey,
      `${docPath}/forms/${formSection.id}`) as {
      formFieldsById: Record<number, { colId: string; question: string }>
    };
    assert(nativeFormPreviewAfterFieldUpdate.formFieldsById[formField.id]?.question === "Participant name",
      "native_form_field_override_not_rendered_in_preview");

    // #295: construct a real native conditional-format rule from an existing column.
    // Use the same formula capability as Grist columns, never ACL formulas.
    await callToolExpectError(bridgeBaseUrl, "grist_change_structure", {
      action: "style_rules", documentId, tableId: TABLE_ID, columnId: "Name",
      conditionFormula: "$Qty > 10", style: { fillColor: "red" }
    });
    const styleCreated = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure", {
      action: "style_rules", documentId, tableId: TABLE_ID, columnId: "Name",
      conditionFormula: "$Qty > 10", style: { fillColor: "#112233" }
    }), "native_style_rule_create") as {changed:boolean;persistedStyleVerified:boolean};
    assert(styleCreated.changed && styleCreated.persistedStyleVerified,
      "native_style_rule_create_not_verified");
    const rereadStyleColumns = await gristApi(gristBaseUrl, apiKey,
      `${docPath}/tables/_grist_Tables_column/records?hidden=true`) as MetaRecords;
    const styledColumn = rereadStyleColumns.records.find(row => row.id === column.id);
    const nativeStyleRules = styledColumn?.fields.rules;
    assert(Array.isArray(nativeStyleRules) && nativeStyleRules[0] === "L" &&
      nativeStyleRules.length === 2, "native_conditional_style_rule_not_persisted");
    const helper = rereadStyleColumns.records.find(row => row.id === nativeStyleRules[1]);
    assert(helper?.fields.formula === "$Qty > 10", "native_style_formula_not_persisted");
    const nativeStyleOptions = styledColumn?.fields.widgetOptions;
    assert(typeof nativeStyleOptions === "string" &&
      JSON.parse(nativeStyleOptions).rulesOptions?.[0]?.fillColor === "#112233",
      "native_conditional_style_options_missing");
    const styleRepeated = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure", {
      action: "style_rules", documentId, tableId: TABLE_ID, columnId: "Name",
      conditionFormula: "$Qty > 10", style: { fillColor: "#112233" }
    }), "native_style_rule_noop") as {changed:boolean};
    assert(styleRepeated.changed === false, "native_style_rule_idempotence_failed");
    const styleModified = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure", {
      action: "style_rules", documentId, tableId: TABLE_ID, columnId: "Name",
      conditionFormula: "$Qty >= 10", style: { fillColor: "#112233", textColor: "#FFFFFF" }
    }), "native_style_rule_modify") as {changed:boolean};
    assert(styleModified.changed, "native_style_rule_change_not_persisted");
    const schemaWithStyle = resultJson(await callTool(bridgeBaseUrl, "grist_discover", {
      action: "columns", documentId, tableId: TABLE_ID
    }), "native_conditional_style_inspection");
    const publicStyledColumn = (schemaWithStyle.columns as Array<{
      id: string; fields: Record<string, unknown>
    }>).find(item => item.id === "Name");
    assert(isDeepStrictEqual(publicStyledColumn?.fields.conditionalStyleRules, { status: "protected" }),
      "native_conditional_style_projection_mismatch");
    assert(isDeepStrictEqual(publicStyledColumn?.fields.conditionalStyleOptions, { status: "protected" }),
      "native_conditional_style_options_projection_mismatch");
    assert(!JSON.stringify(publicStyledColumn?.fields.conditionalStyleOptions).includes("#112233"),
      "native_conditional_style_options_leaked");
    assert(!Object.hasOwn(publicStyledColumn?.fields ?? {}, "rules"),
      "native_conditional_style_refs_exposed");

    // Qualify an actual Bool user attribute with two authenticated synthetic
    // viewers. Both can read the control table, and only the true flag may
    // read the protected table.
    const allowedFlagEmail = "compat-flag-allowed@example.invalid";
    const deniedFlagEmail = "compat-flag-denied@example.invalid";
    const allowedFlagKey = await createTestApiKey(gristBaseUrl, allowedFlagEmail, "Flag Allowed");
    const deniedFlagKey = await createTestApiKey(gristBaseUrl, deniedFlagEmail, "Flag Denied");
    await gristApi(gristBaseUrl, apiKey, `${docPath}/access`, {
      method: "PATCH",
      body: JSON.stringify({
        delta: { users: { [allowedFlagEmail]: "viewers", [deniedFlagEmail]: "viewers" } }
      })
    });
    await gristApi(gristBaseUrl, apiKey, nativeRecordPath, {
      method: "POST",
      body: JSON.stringify({
        records: [
          { fields: { ShareToken: allowedFlagEmail, Enabled: true } },
          { fields: { ShareToken: deniedFlagEmail, Enabled: false } }
        ]
      })
    });
    const flagTarget = { tableId: TABLE_ID };
    const nonOwner = { kind: "user_access", operator: "not_equals", role: "owner" };
    const flagRule = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure", {
      action: "access_rule_group", documentId, mode: "create", target: flagTarget,
      rules: [{
        condition: { kind: "all", conditions: [nonOwner, { kind: "not", condition: {
          kind: "user_attribute_flag", attributeName: "CompatMember", attributeColumnId: "Enabled"
        } }] },
        permissions: { read: "deny", update: "unspecified" }
      }]
    }), "native_bool_user_attribute_create");
    assert(flagRule.persistedDefinitionVerified === true && flagRule.effectiveEnforcementVerified === false,
      "native_bool_user_attribute_postcondition");
    assert((await readNativeAcl()).some(row => typeof row.fields.aclFormula === "string" &&
      row.fields.aclFormula.includes("not (user.CompatMember.Enabled)") &&
      row.fields.aclFormula.includes("user.Access != OWNER")),
      "native_bool_user_attribute_formula_missing");
    const controlPath = `${docPath}/tables/Compat_Events/records`;
    const protectedPath = `${docPath}/tables/${TABLE_ID}/records`;
    for (const key of [allowedFlagKey, deniedFlagKey]) {
      assert(await gristStatus(gristBaseUrl, key, controlPath, { method: "GET" }) === 200,
        "native_bool_user_attribute_viewer_control");
    }
    const authorizedFlagRows = await gristApi(gristBaseUrl, allowedFlagKey, protectedPath) as {
      records: Array<{ id: number; fields: Record<string, unknown> }>;
    };
    const alpha = authorizedFlagRows.records.find(row => row.fields.Name === "Alpha");
    assert(alpha, "native_bool_user_attribute_allowed_row_missing");
    assert(await gristStatus(gristBaseUrl, deniedFlagKey, protectedPath, { method: "GET" }) === 403,
      "native_bool_user_attribute_denial_missing");

    await gristApi(gristBaseUrl, apiKey, `${docPath}/apply`, {
      method: "POST",
      body: JSON.stringify([["AddColumn", ACL_TABLE_ID, "AllowedItems", {
        type: `RefList:${TABLE_ID}`, isFormula: false
      }]])
    });
    const principals = await gristApi(gristBaseUrl, apiKey, nativeRecordPath) as MetaRecords;
    const allowedPrincipal = principals.records.find(row => row.fields.ShareToken === allowedFlagEmail);
    assert(allowedPrincipal, "native_ref_list_user_attribute_fixture_missing");
    await gristApi(gristBaseUrl, apiKey, nativeRecordPath, {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id: allowedPrincipal.id, fields: { AllowedItems: ["L", alpha.id] } }] })
    });
    const membership = { kind: "record_in_user_attribute_ref_list", operator: "not_in", columnId: "id",
      attributeName: "CompatMember", attributeColumnId: "AllowedItems" };
    const memberRule = resultJson(await callTool(bridgeBaseUrl, "grist_change_structure", {
      action: "access_rule_group", documentId, mode: "replace", target: flagTarget,
      rules: [{
        condition: { kind: "all", conditions: [nonOwner, membership] },
        permissions: { read: "deny", update: "unspecified" }
      }]
    }), "native_ref_list_user_attribute_replace");
    assert(memberRule.persistedDefinitionVerified === true && memberRule.effectiveEnforcementVerified === false,
      "native_ref_list_user_attribute_postcondition");
    const allowedMembers = await gristApi(gristBaseUrl, allowedFlagKey, protectedPath) as MetaRecords;
    const deniedMembers = await gristApi(gristBaseUrl, deniedFlagKey, protectedPath) as MetaRecords;
    assert(allowedMembers.records.length === 1 && allowedMembers.records[0]?.id === alpha.id &&
      deniedMembers.records.length === 0, "native_ref_list_user_attribute_row_filter_mismatch");

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
