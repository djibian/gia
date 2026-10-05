import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LEAN_TOOL_REGISTRY } from "../src/mcp/leanRegistry.js";

test("readiness CLI rejects noncanonical URLs and duplicate scope/server metadata with sanitized results", () => {
  const directory = mkdtempSync(join(tmpdir(), "gia-readiness-test-"));
  try {
    const preload = join(directory, "public-metadata.mjs");
    writeFileSync(preload, `
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        let body;
        if (url.includes('oauth-protected-resource')) body = {
          resource: process.env.MCP_RESOURCE_URI,
          authorization_servers: JSON.parse(process.env.TEST_SERVERS),
          scopes_supported: JSON.parse(process.env.TEST_SCOPES)
        };
        else if (url.includes('openid-configuration')) body = {
          issuer: 'https://auth.example.org/oidc', client_id_metadata_document_supported: true,
          code_challenge_methods_supported: ['S256'], grant_types_supported: ['authorization_code','refresh_token'],
          authorization_response_iss_parameter_supported: true, token_endpoint_auth_methods_supported: ['none']
        };
        else if (url === 'https://chatgpt.com/oauth/client.json') body = {
          client_id: url, token_endpoint_auth_methods_supported: ['none'], redirect_uris: ['https://chatgpt.com/callback']
        };
        else if (init?.headers?.authorization) body = { result: { tools: JSON.parse(process.env.TEST_TOOLS) } };
        else return new Response('{}', {status:401, headers:{'www-authenticate':'Bearer resource_metadata="https://bridge.example.org/.well-known/oauth-protected-resource"'}});
        return new Response(JSON.stringify(body), {status:200, headers:{'content-type':'application/json'}});
      };
    `);
    const run = (extra: Record<string, string> = {}) => spawnSync(process.execPath,
      ["--import", preload, "--import", "tsx", "tools/chatgpt-oauth-readiness-probe.ts"], {
        env: { PATH: process.env.PATH, MCP_RESOURCE_URI: "https://bridge.example.org/mcp",
          TEST_SERVERS: JSON.stringify(["https://auth.example.org/oidc"]),
          TEST_SCOPES: JSON.stringify(["doc:read", "doc:write", "doc.schema:write"]), ...extra }, encoding: "utf8"
      });
    const valid = run();
    assert.equal(valid.status, 0, valid.stdout + valid.stderr);
    assert.match(valid.stdout, /ChatGPT OAuth readiness: PASS/);
    const tools = LEAN_TOOL_REGISTRY.map(({name, capability}) => {
      const securitySchemes = [{ type: "oauth2", scopes: capability ? [capability] : [] }];
      return { name, securitySchemes, _meta: { securitySchemes } };
    });
    const authenticated = { OAUTH_ACCESS_TOKEN: "synthetic-readiness-token", TEST_TOOLS: JSON.stringify(tools) };
    const validAuthenticated = run(authenticated);
    assert.equal(validAuthenticated.status, 0, validAuthenticated.stdout + validAuthenticated.stderr);
    assert.match(validAuthenticated.stdout, /Live tools\/list is exactly the ten-tool MCP v2 contract: PASS/);
    const reordered = tools.map(({name, securitySchemes}) => {
      const schemes = securitySchemes.map(({type, scopes}) => ({scopes, type}));
      return { name, securitySchemes: schemes, _meta: { securitySchemes: schemes } };
    });
    const validReordered = run({ ...authenticated, TEST_TOOLS: JSON.stringify(reordered) });
    assert.equal(validReordered.status, 0, validReordered.stdout + validReordered.stderr);
    assert.match(validReordered.stdout, /Root OAuth securitySchemes match lean tool capabilities: PASS/);
    assert.match(validReordered.stdout, /Compatibility _meta securitySchemes mirror matches: PASS/);
    for (const extra of [
      { MCP_RESOURCE_URI: "https://bridge.example.org/mcp?" },
      { MCP_RESOURCE_URI: "https://bridge.example.org/mcp#" },
      { MCP_RESOURCE_URI: "https://secret-sentinel@bridge.example.org/mcp" },
      { TEST_SCOPES: JSON.stringify(["doc:read", "doc:write", "doc.schema:write", "doc:read"]) },
      { TEST_SERVERS: JSON.stringify(["https://auth.example.org/oidc", "https://other.example.org"]) },
      { TEST_SERVERS: JSON.stringify(["https://auth.example.org/oidc#"]) },
      { ...authenticated, TEST_TOOLS: JSON.stringify([...tools, tools[0]]) },
      { ...authenticated, TEST_TOOLS: JSON.stringify([...tools, { malformed: true }]) },
      { ...authenticated, TEST_TOOLS: JSON.stringify([...tools.slice(1), null]) },
      { ...authenticated, TEST_TOOLS: JSON.stringify(tools.map(t => ({ ...t, securitySchemes: [{ type: "oauth2", scopes: [] }] }))) },
      { ...authenticated, TEST_TOOLS: JSON.stringify(tools.map(t => ({ ...t, securitySchemes: t.securitySchemes.map(s => ({...s, unexpected: true})) }))) }
    ]) {
      const result = run(extra);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /ChatGPT OAuth readiness: FAIL/);
      assert.doesNotMatch(result.stdout + result.stderr, /secret-sentinel|synthetic-readiness-token|example\.org/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
