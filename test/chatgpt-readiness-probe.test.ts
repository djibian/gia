import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { leanToolHelp } from "../src/mcp/leanRegistry.js";
import { VERSION } from "../src/version.js";
import { addRootOAuthSecuritySchemesToToolList } from "../src/mcp/oauthToolSecurity.js";
import { READINESS_PROTOCOL_VERSION, referenceReadinessTools } from "../tools/mcp-readiness-schema.js";

test("readiness CLI distinguishes public metadata and qualifies the authenticated current wire contract", async () => {
  const directory = mkdtempSync(join(tmpdir(), "gia-readiness-test-"));
  try {
    const preload = join(directory, "public-metadata.mjs");
    writeFileSync(preload, `
      globalThis.fetch = async (input) => {
        const url = input instanceof Request ? input.url : String(input);
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
        else if (input instanceof Request && input.headers.has('authorization')) {
          const message = await input.json();
          const protocol = input.headers.get('MCP-Protocol-Version');
          const current = '${READINESS_PROTOCOL_VERSION}';
          const envelope = { jsonrpc: '2.0', id: 1 };
          const cache = { resultType: 'complete', cacheScope: 'private', ttlMs: 0 };
          const error = (status, value) => Response.json({ ...envelope, error: value }, { status });
          if (protocol !== current && !process.env.TEST_ACCEPT_OLD) {
            return error(400, { code: -32022, data: { supported: [current], requested: protocol } });
          }
          if (message.method === 'initialize') return error(404, { code: -32601 });
          if (message.method === 'server/discover') body = { ...envelope, result: {
            ...cache, supportedVersions: [current],
            capabilities: process.env.TEST_MISSING_CAPABILITIES ? undefined : { tools: { listChanged: true } },
            _meta: { 'io.modelcontextprotocol/serverInfo': {
              name: 'gia', version: process.env.TEST_VERSION || '${VERSION}'
            } }
          } };
          if (message.method === 'tools/list') body = { ...envelope, result: {
            ...cache, tools: JSON.parse(process.env.TEST_TOOLS),
            cacheScope: process.env.TEST_MISSING_LIST_CACHE ? undefined : 'private',
            nextCursor: process.env.TEST_PAGINATED_LIST || undefined,
            resultType: process.env.TEST_INCOMPLETE_LIST ? 'input_required' : 'complete'
          } };
          if (message.method === 'tools/call' && message.params.name === 'grist_help') {
            if (input.headers.get('Mcp-Name') !== 'grist_help') return error(400, { code: -32603 });
            const help = JSON.parse(process.env.TEST_HELP);
            if (process.env.TEST_STALE_HELP) help.tools[0].guide.examples = [];
            if (process.env.TEST_INCONSISTENT_CAP) help.configuredLimits.maxReadRecords = 1;
            if (process.env.TEST_INVALID_CAP) help.configuredLimits.maxReadRecords = 'unlimited';
            body = { ...envelope, result: { resultType: 'complete',
              content: [{ type: 'text', text: JSON.stringify(help) }] } };
          }
        } else return new Response('{}', {status:401, headers:{'www-authenticate':'Bearer resource_metadata="https://bridge.example.org/.well-known/oauth-protected-resource"'}});
        const wrongMediaType = process.env.TEST_WRONG_MEDIA_TYPE && input instanceof Request && input.headers.has('authorization');
        return new Response(JSON.stringify(body), {status:200, headers:{'content-type':wrongMediaType ? 'application/jsonp' : 'application/json'}});
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
    assert.match(valid.stdout, /Public OAuth metadata and challenge: PASS/);
    assert.match(valid.stdout, /Authenticated schema qualification: SKIPPED/);
    assert.match(valid.stdout, /ChatGPT OAuth readiness: NOT QUALIFIED/);
    const fixture = async (limits: Parameters<typeof referenceReadinessTools>[0]) => {
      const wire = await referenceReadinessTools(limits);
      const tools = (addRootOAuthSecuritySchemesToToolList({ result: { tools: wire } }).value as any).result.tools;
      return { tools, authenticated: { OAUTH_ACCESS_TOKEN: "synthetic-readiness-token", TEST_TOOLS: JSON.stringify(tools),
        TEST_HELP: JSON.stringify(leanToolHelp(["grist_inspect", "grist_change_structure"], limits)) } };
    };
    const { tools, authenticated } = await fixture({ maxReadRecords: 7, maxWriteRecords: 0, maxSchemaItems: 11 });
    const validAuthenticated = run(authenticated);
    assert.equal(validAuthenticated.status, 0, validAuthenticated.stdout + validAuthenticated.stderr);
    assert.match(validAuthenticated.stdout, /Live tools\/list is exactly the ten-tool MCP v2 contract: PASS/);
    assert.match(validAuthenticated.stdout, /Authenticated schema qualification: PASS/);
    assert.match(validAuthenticated.stdout, /Principal isolation and client catalog refresh: NOT QUALIFIED/);
    const unlimited = await fixture({ maxReadRecords: 0, maxWriteRecords: 0, maxSchemaItems: 0 });
    const validUnlimited = run(unlimited.authenticated);
    assert.equal(validUnlimited.status, 0, validUnlimited.stdout + validUnlimited.stderr);
    assert.match(validUnlimited.stdout, /Authenticated schema qualification: PASS/);
    const reordered = tools.map((tool: any) => {
      const schemes = tool.securitySchemes.map(({type, scopes}: any) => ({scopes, type}));
      return { ...tool, securitySchemes: schemes, _meta: { ...tool._meta, securitySchemes: schemes } };
    });
    const validReordered = run({ ...authenticated, TEST_TOOLS: JSON.stringify(reordered) });
    assert.equal(validReordered.status, 0, validReordered.stdout + validReordered.stderr);
    assert.match(validReordered.stdout, /Root OAuth securitySchemes match lean tool capabilities: PASS/);
    assert.match(validReordered.stdout, /Compatibility _meta securitySchemes mirror matches: PASS/);
    const corrupt = (name: string, change: (tool: any) => void) => {
      const copy = structuredClone(tools);
      change(copy.find((tool: any) => tool.name === name));
      return { ...authenticated, TEST_TOOLS: JSON.stringify(copy) };
    };
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
      corrupt("grist_query", (t) => { t.securitySchemes = [{ type: "oauth2", scopes: [] }]; }),
      corrupt("grist_query", (t) => { t.securitySchemes[0].unexpected = true; }),
      corrupt("grist_query", (t) => { delete t.inputSchema; }),
      corrupt("grist_help", (t) => { t.inputSchema = true; }),
      corrupt("grist_help", (t) => { t.inputSchema.$schema = "http://json-schema.org/draft-07/schema#"; }),
      corrupt("grist_help", (t) => { t.description = ""; }),
      corrupt("grist_help", (t) => { t.annotations.readOnlyHint = false; }),
      corrupt("grist_help", (t) => { t.outputSchema = true; }),
      corrupt("grist_add_structure", (t) => { t.inputSchema.oneOf.pop(); }),
      corrupt("grist_add_structure", (t) => { delete t._meta["gia/actionScopeRequirements"]; }),
      corrupt("grist_change_structure", (t) => { delete t.inputSchema.$defs; }),
      ...["schemaImpact", "simulation"].map((field) => corrupt("grist_inspect", (t) => {
        const acl = t.inputSchema.oneOf.find((branch: any) => branch.properties.action.const === "access_rules");
        acl.required.push(field);
      })),
      corrupt("grist_inspect", (t) => {
        const acl = t.inputSchema.oneOf.find((branch: any) => branch.properties.action.const === "access_rules");
        delete acl.properties.simulation;
      }),
      { ...authenticated, TEST_ACCEPT_OLD: "yes" },
      { ...authenticated, TEST_VERSION: "stale-identity" },
      { ...authenticated, TEST_STALE_HELP: "yes" },
      { ...authenticated, TEST_INCONSISTENT_CAP: "yes" },
      { ...authenticated, TEST_INVALID_CAP: "yes" },
      { ...authenticated, TEST_MISSING_CAPABILITIES: "yes" },
      { ...authenticated, TEST_MISSING_LIST_CACHE: "yes" },
      { ...authenticated, TEST_PAGINATED_LIST: "next-page" },
      { ...authenticated, TEST_INCOMPLETE_LIST: "yes" },
      { ...authenticated, TEST_WRONG_MEDIA_TYPE: "yes" }
    ]) {
      const result = run(extra);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /ChatGPT OAuth readiness: FAIL/);
      assert.doesNotMatch(result.stdout + result.stderr, /secret-sentinel|synthetic-readiness-token|example\.org/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
