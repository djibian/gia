import type { Request } from "express";

/** Bound decoded HTTP JSON at the actual Express parser before the Node SDK adapter. */
export const MCP_JSON_BODY_LIMIT = "100kb" as const;

/**
 * Under 100 KiB of JSON, each counted array item or object member needs at
 * least two serialized bytes. The SDK threshold must not reject an otherwise
 * admissible JSON request (at most ~51,200 elements). It remains finite for
 * defense in depth if the handler receives a pre-parsed input from elsewhere.
 */
export const MCP_MAX_TOOL_INPUT_ELEMENTS = 52_000;

/** Only POST /mcp carries JSON-RPC messages. GET/DELETE remain bodyless. */
export function hasSupportedMcpPostBody(req: Request): boolean {
  return req.method !== "POST" ||
    (req.is("application/json") === "application/json" && req.body !== undefined);
}
