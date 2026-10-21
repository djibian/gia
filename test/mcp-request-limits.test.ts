import assert from "node:assert/strict";
import type { Server } from "node:http";
import test from "node:test";

import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  MCP_JSON_BODY_LIMIT,
  MCP_MAX_TOOL_INPUT_ELEMENTS
} from "../src/mcp/requestLimits.js";

async function listen(): Promise<{ server: Server; url: string }> {
  const app = createMcpExpressApp({
    host: "127.0.0.1",
    jsonLimit: MCP_JSON_BODY_LIMIT
  });
  app.post("/probe", (req, res) => {
    res.json({ accepted: req.body?.values?.length === 1 });
  });
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, url: `http://127.0.0.1:${address.port}/probe` };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test("the Express MCP parser accepts a legitimate bounded JSON request", async () => {
  const { server, url } = await listen();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: ["valid"] })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accepted: true });
  } finally {
    await close(server);
  }
});

test("the Express MCP parser rejects a JSON body above 100 KiB", async () => {
  const { server, url } = await listen();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: ["x".repeat(105 * 1024)] })
    });
    assert.equal(response.status, 413);
  } finally {
    await close(server);
  }
});

test("MCP server rejects excessive nested arguments before tool dispatch", async () => {
  assert.equal(MCP_MAX_TOOL_INPUT_ELEMENTS, 10_000);
  let dispatched = 0;
  const handler = createMcpHandler(() => {
    const server = new McpServer(
      { name: "limit-regression", version: "0.9.0" },
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
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "bounded",
          arguments: { values: Array(count).fill(1) }
        }
      })
    }));
    assert.equal(response.status, 200);
    return response.text();
  };

  try {
    const accepted = await call(MCP_MAX_TOOL_INPUT_ELEMENTS - 1);
    assert.match(accepted, /9999/);
    assert.equal(dispatched, 1);

    const rejected = await call(MCP_MAX_TOOL_INPUT_ELEMENTS);
    assert.match(rejected, /maximum of 10000 elements/);
    assert.match(rejected, /isError/);
    assert.equal(dispatched, 1, "over-limit call must not enter the tool handler");
  } finally {
    await handler.close();
  }
});
