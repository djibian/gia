import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { oauthPrincipalId } from "../src/auth/oauthPrincipal.js";

const tool = ["--import", "tsx", "tools/oauth-principal-id.ts"];

test("operator principal-id helper emits only the opaque mapping key", () => {
  const issuer = "https://auth.example.test/oidc";
  const subject = "raw-provider-subject-sentinel";
  const expected = oauthPrincipalId(issuer, subject);
  const result = spawnSync(process.execPath, tool, {
    env: {
      PATH: process.env.PATH,
      OAUTH_ISSUER: issuer,
      OAUTH_SUBJECT: subject
    },
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), `principal_id: ${expected}`);
  assert.doesNotMatch(result.stdout + result.stderr, /raw-provider-subject-sentinel/);
  assert.doesNotMatch(result.stdout + result.stderr, /auth\.example\.test/);
});

test("operator principal-id helper fails without exposing incomplete inputs", () => {
  const result = spawnSync(process.execPath, tool, {
    env: {
      PATH: process.env.PATH,
      OAUTH_ISSUER: "https://auth.example.test/oidc"
    },
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "principal_id: FAIL");
  assert.doesNotMatch(result.stdout + result.stderr, /auth\.example\.test/);
});
