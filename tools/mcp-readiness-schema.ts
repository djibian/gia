import { isDeepStrictEqual } from "node:util";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import type { AuthorizedGristService } from "../src/grist/authorizedService.js";
import { LEAN_TOOL_REGISTRY } from "../src/mcp/leanRegistry.js";
import { registerLeanTools, type LeanToolLimits } from "../src/mcp/leanTools.js";
import { VERSION } from "../src/version.js";

export const READINESS_PROTOCOL_VERSION = "2026-07-28";
type JsonObject = Record<string, unknown>;

export function jsonObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject : undefined;
}

export function makeReadinessRequest(options: {
  resourceUri: string;
  method: string;
  protocol?: string;
  bearer?: string;
  params?: JsonObject;
  toolName?: string;
}): Request {
  const protocol = options.protocol ?? READINESS_PROTOCOL_VERSION;
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "MCP-Protocol-Version": protocol,
    "Mcp-Method": options.method
  });
  if (options.bearer) headers.set("authorization", `Bearer ${options.bearer}`);
  if (options.toolName) headers.set("Mcp-Name", options.toolName);
  return new Request(options.resourceUri, {
    method: "POST", headers, redirect: "error", signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: options.method, params: {
      ...options.params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": protocol,
        "io.modelcontextprotocol/clientInfo": { name: "gia-oauth-v2-readiness-probe", version: "2.0.0" },
        "io.modelcontextprotocol/clientCapabilities": {}
      }
    } })
  });
}

export async function referenceReadinessTools(limits: LeanToolLimits): Promise<JsonObject[]> {
  // Serialize with the same SDK as the server without a Grist client, socket or credentials.
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "gia", version: VERSION });
    registerLeanTools(server, {} as AuthorizedGristService, limits);
    return server;
  });
  const response = await handler.fetch(makeReadinessRequest({
    resourceUri: "https://gia-reference.invalid/mcp", method: "tools/list"
  }));
  const body = jsonObject(await response.json());
  const tools = jsonObject(body?.result)?.tools;
  if (!response.ok || !Array.isArray(tools)) throw new Error("reference_schema_unavailable");
  return tools as JsonObject[];
}

function property(schema: unknown, key: string): JsonObject | undefined {
  return jsonObject(jsonObject(jsonObject(schema)?.properties)?.[key]);
}

function limit(schema: JsonObject | undefined, key: string): number | undefined {
  if (!schema) return undefined;
  if (!Object.hasOwn(schema, key)) return 0;
  const value = schema[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

export async function qualifyReadinessSchemas(tools: readonly unknown[]): Promise<LeanToolLimits | undefined> {
  const byName = new Map<unknown, JsonObject>();
  for (const value of tools) {
    const tool = jsonObject(value);
    if (!tool || byName.has(tool.name)) return undefined;
    byName.set(tool.name, tool);
  }
  if (byName.size !== LEAN_TOOL_REGISTRY.length) return undefined;

  // The three caps may legitimately differ per deployment. Infer them from
  // representatives and require all other occurrences/defaults to agree.
  const tableBranches = jsonObject(byName.get("grist_add_structure")?.inputSchema)?.oneOf;
  const createTables = Array.isArray(tableBranches)
    ? tableBranches.find((branch) => property(branch, "action")?.const === "create_tables")
    : undefined;
  const maxReadRecords = limit(property(byName.get("grist_query")?.inputSchema, "limit"), "maximum");
  const maxWriteRecords = limit(property(byName.get("grist_add_records")?.inputSchema, "records"), "maxItems");
  const maxSchemaItems = limit(property(createTables, "tables"), "maxItems");
  if (maxReadRecords === undefined || maxWriteRecords === undefined || maxSchemaItems === undefined) return undefined;

  const limits = { maxReadRecords, maxWriteRecords, maxSchemaItems };
  const reference = await referenceReadinessTools(limits);
  const matches = reference.every((expected) => {
    const actual = byName.get(expected.name);
    return actual?.title === expected.title && actual?.description === expected.description &&
      isDeepStrictEqual(actual?.inputSchema, expected.inputSchema);
  });
  return matches ? limits : undefined;
}
