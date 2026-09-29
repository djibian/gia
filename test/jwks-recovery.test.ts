import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign as signData,
  type JsonWebKey
} from "node:crypto";
import test from "node:test";

import {
  JwksAccessTokenVerifierError,
  JwksOAuthAccessTokenVerifier,
  type OAuthJwksFetcher
} from "../src/auth/jwksAccessTokenVerifier.js";

const JWKS_URI = "https://auth.example.test/oidc/jwks";

function encoded(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

test("a JWKS fetch outage fails closed and a later request recovers without verifier restart", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048
  });
  const jwk = {
    ...(publicKey.export({ format: "jwk" }) as JsonWebKey),
    kid: "recovery-key",
    use: "sig",
    alg: "RS256"
  };
  const header = encoded({ alg: "RS256", kid: "recovery-key", typ: "JWT" });
  const payload = encoded({
    iss: "https://auth.example.test/oidc",
    sub: "recovery-principal",
    aud: "https://bridge.example.test/mcp",
    exp: 2_000_000_000,
    scope: "doc:read"
  });
  const signingInput = `${header}.${payload}`;
  const signature = signData(
    "sha256",
    Buffer.from(signingInput, "ascii"),
    privateKey
  ).toString("base64url");
  const token = `${signingInput}.${signature}`;

  let available = false;
  let calls = 0;
  const fetcher: OAuthJwksFetcher = async () => {
    calls += 1;
    if (!available) throw new Error("synthetic outage");
    return new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const verifier = new JwksOAuthAccessTokenVerifier({
    jwksUri: JWKS_URI,
    fetcher
  });

  await assert.rejects(
    verifier.verify(token),
    (error: unknown) =>
      error instanceof JwksAccessTokenVerifierError &&
      error.code === "jwks_fetch_failed"
  );

  available = true;
  const claims = await verifier.verify(token);
  assert.equal(claims.subject, "recovery-principal");
  assert.equal(calls, 2);
});
