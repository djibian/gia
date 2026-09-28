import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";

export const R4_PROTOCOL_VERSION = "2026-07-28";
export const R4_BEARER = "r4-validation-local-bearer-0123456789abcdef0123456789abcdef";

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
    signal: AbortSignal.timeout(20_000)
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

async function freePort(): Promise<number> {
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
}): Promise<{ baseUrl: string; child: ChildProcess }> {
  const port = await freePort();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GRIST_BASE_URL: options.baseUrl,
    GRIST_API_KEY: options.apiKey,
    GRIST_ALLOWED_DOCUMENT_IDS: options.documentIds.join(","),
    GRIST_ALLOWED_WORKSPACE_IDS: "",
    GRIST_MAX_READ_RECORDS: "100",
    GRIST_MAX_WRITE_RECORDS: "50",
    GRIST_WRITE_BATCH_RECORDS: "25",
    GRIST_MAX_SCHEMA_ITEMS: "50",
    MCP_AUTH_MODE: "static",
    MCP_BEARER_TOKEN: R4_BEARER,
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
      authorization: `Bearer ${R4_BEARER}`,
      "content-type": "application/json",
      "MCP-Protocol-Version": R4_PROTOCOL_VERSION,
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
          "io.modelcontextprotocol/protocolVersion": R4_PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientInfo": { name: "grist-chatgpt-r4-apps", version: "1.0.0" },
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
