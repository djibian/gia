import assert from "node:assert/strict";
import type { Server } from "node:http";
import test from "node:test";

import { createMcpExpressApp } from "@modelcontextprotocol/express";

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

test("MCP server input-element ceiling is finite and preserves typical write batch sizes", () => {
  assert.ok(Number.isInteger(MCP_MAX_TOOL_INPUT_ELEMENTS));
  assert.ok(MCP_MAX_TOOL_INPUT_ELEMENTS >= 500);
  assert.ok(MCP_MAX_TOOL_INPUT_ELEMENTS <= 10_000);
});
