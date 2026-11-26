import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";

export const TEST_PROTOCOL_VERSION = "2026-07-28";
export const TEST_BEARER = "test-validation-local-bearer-0123456789abcdef0123456789abcdef";

export function assertThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) throw new Error(`http_${response.status}:${text.slice(0, 800)}`);
  if (!text) return undefined;
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

function cookieHeader(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [];
  const fallback = response.headers.get("set-cookie");
  const source = values.length > 0 ? values : fallback ? [fallback] : [];
  const cookies = source
    .map((value) => value.split(";", 1)[0]?.trim())
    .filter((value): value is string => Boolean(value));
  assertThat(cookies.length > 0, "test_login_cookie_missing");
  return cookies.join("; ");
}

export async function createTestApiKey(baseUrl: string, email: string, name: string): Promise<string> {
  const loginUrl = new URL("/test/login", baseUrl);
  loginUrl.searchParams.set("username", email);
  loginUrl.searchParams.set("name", name);
  const login = await fetch(loginUrl, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
  assertThat(login.status >= 200 && login.status < 400, `test_login_failed:${email}:${login.status}`);
  const cookie = cookieHeader(login);
  const response = await fetch(new URL("/api/profile/apikey", baseUrl), {
    method: "POST",
    redirect: "error",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ force: true }),
    signal: AbortSignal.timeout(10_000)
  });
  const key = await readJson(response);
  assertThat(typeof key === "string" && key.length > 0, `api_key_missing:${email}`);
  return key;
}

export async function gristApi(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  if (init.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers,
    redirect: "error",
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)])
      : AbortSignal.timeout(20_000)
  });
  return readJson(response);
}

export async function gristStatus(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit
): Promise<number> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(20_000)
  });
  await response.arrayBuffer();
  return response.status;
}

export async function applyActions(baseUrl: string, apiKey: string, docId: string, actions: unknown[][]): Promise<void> {
  await gristApi(baseUrl, apiKey, `/api/docs/${encodeURIComponent(docId)}/apply`, {
    method: "POST",
    body: JSON.stringify(actions)
  });
}

export async function waitForUrl(url: string, attempts = 120): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(750) });
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`service_not_ready:${url}`);
}

export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assertThat(address && typeof address !== "string", "listen_failed");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

export async function startBridge(options: {
  baseUrl: string;
  apiKey: string;
  documentIds: string[];
  workspaceIds?: readonly number[];
  trustedWidgetsJson?: string;
}): Promise<{ baseUrl: string; child: ChildProcess }> {
  const port = await freePort();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GRIST_BASE_URL: options.baseUrl,
    GRIST_API_KEY: options.apiKey,
    GRIST_ALLOWED_DOCUMENT_IDS: options.documentIds.join(","),
    GRIST_ALLOWED_WORKSPACE_IDS: (options.workspaceIds ?? []).join(","),
    ...(options.trustedWidgetsJson === undefined ? {} : {
      GIA_TRUSTED_CUSTOM_WIDGETS_JSON: options.trustedWidgetsJson
    }),
    // Full native section/field metadata must fit the acceptance read budget.
    // Use the existing bounded production default for representative topology.
    GRIST_MAX_READ_RECORDS: "5000",
    GRIST_MAX_WRITE_RECORDS: "50",
    GRIST_WRITE_BATCH_RECORDS: "25",
    GRIST_MAX_SCHEMA_ITEMS: "50",
    MCP_AUTH_MODE: "static",
    // Disposable application acceptance exercises hundreds of sequential calls
    // without throttling sleeps; production's bounded default remains unchanged.
    MCP_PRINCIPAL_RATE_LIMIT_PER_MINUTE: "1000",
    MCP_BEARER_TOKEN: TEST_BEARER,
    MCP_ALLOWED_HOSTS: "127.0.0.1,localhost",
    HOST: "127.0.0.1",
    PORT: String(port)
  };
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: process.cwd(), env, stdio: ["ignore", "inherit", "inherit"]
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForUrl(`${baseUrl}/healthz`);
  return { baseUrl, child };
}

export async function stopBridge(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => child.once("exit", () => resolve(true))),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2_000))
  ]);
  if (!exited && child.exitCode === null) child.kill("SIGKILL");
}

export async function callTool(baseUrl: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${TEST_BEARER}`,
      "content-type": "application/json",
      "MCP-Protocol-Version": TEST_PROTOCOL_VERSION,
      "Mcp-Method": "tools/call",
      "Mcp-Name": name
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": TEST_PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientInfo": { name: "gia-test-apps", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {}
        }
      }
    }),
    signal: AbortSignal.timeout(30_000)
  });
  const body = await readJson(response) as { result?: Record<string, unknown>; error?: unknown };
  assertThat(body.error === undefined && body.result, `${name}_jsonrpc_error:${JSON.stringify(body.error)}`);
  assertThat(body.result.isError !== true, `${name}_tool_error:${JSON.stringify(body.result)}`);
  const content = body.result.content;
  if (!Array.isArray(content) || !content[0] || typeof content[0] !== "object") return body.result;
  const text = (content[0] as { text?: unknown }).text;
  if (typeof text !== "string") return body.result;
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

export function containsValue(value: unknown, expected: unknown): boolean {
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some((item) => containsValue(item, expected));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) => containsValue(item, expected));
  }
  return false;
}

export function countKeyValue(value: unknown, key: string, expected: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countKeyValue(item, key, expected), 0);
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  let count = record[key] === expected ? 1 : 0;
  for (const child of Object.values(record)) count += countKeyValue(child, key, expected);
  return count;
}

export function recordsFrom(value: unknown): Array<{ id: number; fields: Record<string, unknown> }> {
  assertThat(value && typeof value === "object", "records_body_invalid");
  const records = (value as { records?: unknown }).records;
  assertThat(Array.isArray(records), "records_missing");
  return records.map((entry) => {
    assertThat(entry && typeof entry === "object", "record_invalid");
    const item = entry as { id?: unknown; fields?: unknown };
    assertThat(typeof item.id === "number" && item.fields && typeof item.fields === "object", "record_shape_invalid");
    return { id: item.id, fields: item.fields as Record<string, unknown> };
  });
}

// Shared disposable native browser harness; no production sessions or credentials.
interface DriverState { text: string; url: string }

function driverBinary(): string {
  if (process.env.CHROMEDRIVER_BIN) return process.env.CHROMEDRIVER_BIN;
  if (process.env.CHROMEWEBDRIVER) return process.env.CHROMEWEBDRIVER + "/chromedriver";
  return "chromedriver";
}

export async function driverRequest(driverBase: string, method: string, path: string, payload?: unknown): Promise<unknown> {
  const response = await fetch(driverBase + path, {
    method,
    ...(payload === undefined ? {} : {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }),
    signal: AbortSignal.timeout(25_000)
  });
  const message = await response.json() as {
    value?: unknown; sessionId?: string
  };
  const value = message.value;
  if (!response.ok ||
      (value && typeof value === "object" && "error" in value)) {
    throw new Error("webdriver_request_failed");
  }
  return value;
}

export async function startBrowser(): Promise<{ driver: ChildProcess; driverBase: string; sessionId: string }> {
  const driverPort = await freePort();
  const driverBase = "http://127.0.0.1:" + driverPort;
  const driver = spawn(driverBinary(), ["--port=" + driverPort], {
    stdio: "ignore"
  });
  try {
    await new Promise<void>((resolve, reject) => {
      driver.once("spawn", resolve);
      driver.once("error", reject);
    });
    await waitForUrl(driverBase + "/status", 50);
    const session = await driverRequest(driverBase, "POST", "/session", {
      capabilities: {
        alwaysMatch: {
          browserName: "chrome",
          "goog:chromeOptions": {
            args: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
              "--window-size=1440,900", "--no-proxy-server"]
          }
        }
      }
    }) as { sessionId?: unknown };
    assertThat(typeof session?.sessionId === "string", "webdriver_session_missing");
    return { driver, driverBase, sessionId: session.sessionId };
  } catch (error) {
    driver.kill("SIGTERM");
    throw error;
  }
}

export async function navigate(driverBase: string, sessionId: string, url: string): Promise<void> {
  await driverRequest(driverBase, "POST", "/session/" + sessionId + "/url", { url });
}

export async function inspectPage(driverBase: string, sessionId: string): Promise<DriverState> {
  const value = await driverRequest(driverBase, "POST",
    "/session/" + sessionId + "/execute/sync", {
      script: "return {text: document.body ? document.body.innerText : '', url: location.href};",
      args: []
    }) as DriverState;
  assertThat(typeof value?.text === "string" && typeof value.url === "string",
    "webdriver_dom_snapshot_invalid");
  return value;
}

export async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Submit one synthetic native Text field in a fresh anonymous browser and
 * require navigation to the exact published target and a rendered target form. */
export async function qualifyAnonymousFormRedirect(sourceUrl: string, targetUrl: string, value: string): Promise<void> {
  const { driver, driverBase, sessionId } = await startBrowser();
  const sessionPath = "/session/" + sessionId;
  const fieldSelector = 'form .test-form-field input[type="text"], form .test-form-field textarea';
  const submitSelector = 'form button[type="submit"]';
  const waitForForm = async (url: string) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = await driverRequest(driverBase, "POST", sessionPath + "/execute/sync", {
        script: "return {url: location.href, fields: document.querySelectorAll(arguments[0]).length, submits: document.querySelectorAll(arguments[1]).length};",
        args: [fieldSelector, submitSelector]
      }).catch(() => undefined) as {url?: string; fields?: number; submits?: number} | undefined;
      if (ready?.url === url && ready.fields === 1 && ready.submits === 1) return;
      await delay(500);
    }
    throw new Error("native_form_browser_expected_page_not_rendered");
  };
  const find = async (selector: string): Promise<string> => {
    const element = await driverRequest(driverBase, "POST", sessionPath + "/element", {
      using: "css selector", value: selector
    }) as Record<string, unknown>;
    const id = element?.["element-6066-11e4-a52e-4f735466cecf"];
    assertThat(typeof id === "string", "native_form_browser_element_missing");
    return sessionPath + "/element/" + encodeURIComponent(id);
  };
  try {
    await navigate(driverBase, sessionId, sourceUrl);
    await waitForForm(sourceUrl);
    await driverRequest(driverBase, "POST", await find(fieldSelector) + "/value", {text: value});
    await driverRequest(driverBase, "POST", await find(submitSelector) + "/click", {});
    await waitForForm(targetUrl);
  } finally {
    await driverRequest(driverBase, "DELETE", sessionPath).catch(() => {});
    driver.kill("SIGTERM");
  }
}
