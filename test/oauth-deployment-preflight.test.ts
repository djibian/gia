import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";
import { checkOAuthDeployment } from "../tools/oauth-deployment-preflight.js";

const environment = {
  GRIST_BASE_URL: "https://grist.example.org",
  GRIST_CREDENTIAL_MODE: "principal-map",
  GRIST_PRINCIPAL_CREDENTIALS_FILE: "/run/secrets/grist-principals.json",
  GRIST_ALLOWED_DOCUMENT_IDS: "fixture",
  MCP_AUTH_MODE: "oauth",
  OAUTH_ISSUER: "https://auth.example.org/oidc",
  OAUTH_JWKS_URI: "https://auth.example.org/oidc/jwks",
  MCP_RESOURCE_URI: "https://bridge.example.org/mcp",
  MCP_ALLOWED_HOSTS: "bridge.example.org",
  GPT_ACTION_TOKEN: "secret-action-sentinel-01234567890123456789"
};

test("deployment preflight rejects incompatible transport, shared credentials and unlimited limits", () => {
  const saved = process.env;
  process.env = { ...environment };
  try {
    const config = loadConfig();
    assert.ok(checkOAuthDeployment(config).every((check) => check.passed));
    const failures = checkOAuthDeployment({
      ...config,
      mcpAuth: { mode: "oauth", issuer: environment.OAUTH_ISSUER,
        jwksUri: environment.OAUTH_JWKS_URI,
        resourceUri: "https://other.example.org/wrong?query=1" },
      gristCredentials: { mode: "static", apiKey: "secret-grist-sentinel" },
      gristBaseUrl: "http://localhost:8484",
      maxReadRecords: 0
    }).filter((check) => !check.passed).map((check) => check.id);
    assert.deepEqual(failures, [
      "canonical_mcp_resource",
      "public_resource_host_allowed",
      "grist_https",
      "bounded_operation_limits",
      "multi_principal_grist_credentials"
    ]);
    assert.equal(checkOAuthDeployment({
      ...config,
      mcpAuth: { mode: "static", bearerToken: "secret" }
    })[0]?.passed, false);
  } finally {
    process.env = saved;
  }
});

test("CLI reports only sanitized status and requires R5-C principal mapping", () => {
  const run = (extra: Record<string, string> = {}) => spawnSync(process.execPath,
    ["--import", "tsx", "tools/oauth-deployment-preflight.ts"],
    { env: { PATH: process.env.PATH, ...environment, ...extra }, encoding: "utf8" });
  const good = run();
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /multi_principal_grist_credentials: PASS/);

  const staticCredential = run({
    GRIST_CREDENTIAL_MODE: "static",
    GRIST_PRINCIPAL_CREDENTIALS_FILE: "",
    GRIST_API_KEY: "secret-grist-sentinel"
  });
  assert.equal(staticCredential.status, 1, staticCredential.stderr);
  assert.match(staticCredential.stdout, /multi_principal_grist_credentials: FAIL/);

  const bad = run({ MCP_CAPABILITIES: "secret-invalid-capability-sentinel" });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, "configuration_valid: FAIL\n");
  for (const result of [good, staticCredential, bad]) {
    assert.doesNotMatch(result.stdout + result.stderr, /secret-|example\.org|fixture/);
  }
});
