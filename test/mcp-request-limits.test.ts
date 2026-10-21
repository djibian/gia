import assert from "node:assert/strict";
import type { Server } from "node:http";
import test from "node:test";

import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { isAuthorizedBearerHeader } from "../src/auth/staticBearer.js";
import type { AuthorizedGristService } from "../src/grist/authorizedService.js";
import { registerLeanTools } from "../src/mcp/leanTools.js";
import { VERSION } from "../src/version.js";
import {
  MCP_JSON_BODY_LIMIT,
  MCP_MAX_TOOL_INPUT_ELEMENTS,
  hasSupportedMcpPostBody
} from "../src/mcp/requestLimits.js";

const AUTH_TOKEN = "fixture-static-bearer-token-with-adequate-length";
const MAX_JSON_BODY_BYTES = 100 * 1024;

interface Invocation {
  operation: string;
  arguments: unknown[];
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

/**
 * Replicates production's MCP parser, content-type guard, bearer boundary,
 * pre-parsed Node adapter and actual ten Gia schemas. Grist is a recording
 * stub: no real upstream credentials, data or side effects.
 */
async function fixture(): Promise<{
  server: Server;
  url: string;
  calls: Invocation[];
}> {
  const calls: Invocation[] = [];
  const grist = new Proxy({}, {
    get: (_target, operation: string | symbol) => {
      if (typeof operation !== "string") return undefined;
      return async (...args: unknown[]) => {
        calls.push({ operation, arguments: args });
        return { ok: true };
      };
    }
  }) as AuthorizedGristService;

  const handler = createMcpHandler(() => {
    const server = new McpServer(
      { name: "gia-limit-regression", version: VERSION },
      { maxToolInputElements: MCP_MAX_TOOL_INPUT_ELEMENTS }
    );
    registerLeanTools(server, grist, {
      maxReadRecords: 5000,
      maxWriteRecords: 500,
      maxSchemaItems: 100
    });
    return server;
  });

  const adapter = toNodeHandler(handler);
  const app = createMcpExpressApp({
    host: "127.0.0.1",
    jsonLimit: MCP_JSON_BODY_LIMIT
  });
  app.all("/mcp", (req, res) => {
    if (!hasSupportedMcpPostBody(req)) {
      res.status(415).json({ error: "Unsupported Media Type" });
      return;
    }
    if (!isAuthorizedBearerHeader(req.get("Authorization"), AUTH_TOKEN)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    void adapter(req, res, req.body);
  });
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, url: `http://127.0.0.1:${address.port}/mcp`, calls };
}

function rpc(name: string, args: Record<string, unknown>): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args }
  });
}

async function post(
  url: string,
  body: string | Uint8Array,
  mediaType: string | null = "application/json",
  authorize = true
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = {
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-06-18"
  };
  if (authorize) headers.authorization = `Bearer ${AUTH_TOKEN}`;
  if (mediaType !== null) headers["content-type"] = mediaType;
  const response = await fetch(url, { method: "POST", headers, body });
  return { status: response.status, body: await response.text() };
}

test("real Gia record-create and record-update batches survive both ingress limits", async () => {
  const { server, url, calls } = await fixture();
  const records = Array.from({ length: 500 }, () => ({
    fields: Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`C${i + 1}`, 0])
    )
  }));

  try {
    const create = rpc("grist_add_records", {
      documentId: "doc1", tableId: "T", records
    });
    assert.ok(Buffer.byteLength(create) < MAX_JSON_BODY_BYTES);
    const added = await post(url, create);
    assert.equal(added.status, 200, added.body.slice(0, 500));
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.operation, "createRecords");
    assert.equal((calls[0]?.arguments[2] as unknown[]).length, 500);

    const update = rpc("grist_change_records", {
      action: "update",
      documentId: "doc1",
      tableId: "T",
      records: records.map((record, i) => ({ id: i + 1, ...record }))
    });
    assert.ok(Buffer.byteLength(update) < MAX_JSON_BODY_BYTES);
    const changed = await post(url, update);
    assert.equal(changed.status, 200, changed.body.slice(0, 500));
    assert.equal(calls.length, 2);
    assert.equal(calls[1]?.operation, "updateRecords");
    assert.equal((calls[1]?.arguments[2] as unknown[]).length, 500);
  } finally {
    await close(server);
  }
});

test("real Gia query and widget-update schemas remain reachable", async () => {
  const { server, url, calls } = await fixture();
  try {
    const query = rpc("grist_query", {
      documentId: "doc1", tableId: "T",
      filter: { C1: Array(40_000).fill(0) }
    });
    assert.ok(Buffer.byteLength(query) < MAX_JSON_BODY_BYTES);
    const queried = await post(url, query);
    assert.equal(queried.status, 200, queried.body.slice(0, 500));
    assert.equal(calls[0]?.operation, "queryRecords");

    const widget = rpc("grist_change_ui", {
      action: "update_widget",
      documentId: "doc1", pageId: 1, widgetId: 2,
      update: { title: "A bounded widget edit" }
    });
    const updated = await post(url, widget);
    assert.equal(updated.status, 200, updated.body.slice(0, 500));
    assert.equal(calls[1]?.operation, "updatePageWidget");
  } finally {
    await close(server);
  }
});

test("actual POST /mcp rejects oversized and unsupported media before Grist dispatch", async () => {
  const { server, url, calls } = await fixture();
  try {
    const valid = rpc("grist_add_records", {
      documentId: "doc1", tableId: "T", records: [{ fields: { Name: "ok" } }]
    });
    assert.equal((await post(url, valid)).status, 200);
    assert.equal(calls.length, 1);

    const tooLarge = rpc("grist_add_records", {
      documentId: "doc1", tableId: "T",
      records: [{ fields: { Name: "x".repeat(MAX_JSON_BODY_BYTES) } }]
    });
    assert.equal((await post(url, tooLarge)).status, 413);
    assert.equal(calls.length, 1);

    assert.equal((await post(url, valid, "text/plain")).status, 415);
    assert.equal(calls.length, 1);
    assert.equal((await post(url, Buffer.from(valid), null)).status, 415);
    assert.equal(calls.length, 1);

    assert.equal((await post(url, valid, "application/json", false)).status, 401);
    assert.equal(calls.length, 1);
  } finally {
    await close(server);
  }
});

test("the SDK still blocks excessive element counts before any handler dispatch", async () => {
  assert.equal(MCP_MAX_TOOL_INPUT_ELEMENTS, 52_000);
  let dispatched = 0;
  const handler = createMcpHandler(() => {
    const server = new McpServer(
      { name: "limit-regression", version: VERSION },
      { maxToolInputElements: MCP_MAX_TOOL_INPUT_ELEMENTS }
    );
    server.registerTool(
      "bounded",
      { inputSchema: z.object({ values: z.array(z.number()) }) },
      async ({ values }) => {
        dispatched += 1;
        return { content: [{ type: "text" as const, text: String(values.length) }] };
      }
    );
    return server;
  });

  const call = async (count: number): Promise<string> => {
    const response = await handler.fetch(new Request("https://test.local/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-06-18"
      },
      body: rpc("bounded", { values: Array(count).fill(1) })
    }));
    assert.equal(response.status, 200);
    return response.text();
  };

  try {
    const accepted = await call(MCP_MAX_TOOL_INPUT_ELEMENTS - 1);
    assert.match(accepted, /51999/);
    assert.equal(dispatched, 1);
    const rejected = await call(MCP_MAX_TOOL_INPUT_ELEMENTS);
    assert.match(rejected, /maximum of 52000 elements/);
    assert.match(rejected, /isError/);
    assert.equal(dispatched, 1);
  } finally {
    await handler.close();
  }
});
