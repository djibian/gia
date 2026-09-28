# OAuth operating model — R5

This is the current operating runbook for the MCP v2 candidate. The bridge remains a provider-neutral OAuth 2.1 resource server. Logto OSS is the reference authorization server and ProConnect may remain an upstream identity source, but no Logto SDK or provider-specific login logic is embedded in bridge core.

Public bridge scopes remain exactly:

```text
doc:read
doc:write
doc.schema:write
```

The ten-tool MCP v2 registry is the single source of each tool's required capability. Root `securitySchemes`, compatibility `_meta.securitySchemes`, and insufficient-scope `mcp/www_authenticate` challenges must all agree with that registry.

Never record OAuth access/refresh/ID tokens, authorization codes, PKCE verifiers, cookies, Logto/ProConnect secrets, raw provider identities or Grist API keys in GitHub, chat, durable evidence or probe output.

## Offline deployment preflight

Run on the operator host with protected environment values supplied through the deployment secret mechanism:

```sh
npm ci
npm run check
npm test
npm run build
npm run check:oauth-deployment
```

For an existing protected `.env` file:

```sh
node --env-file=.env --import tsx tools/oauth-deployment-preflight.ts
```

The preflight is offline and sanitized. It does not make network requests, start the server, mutate Grist or print configuration values. It checks OAuth mode, the canonical HTTPS `/mcp` resource, the public-host allowlist, HTTPS Grist upstream configuration and bounded operation limits.

Until R5-C replaces the upstream static credential path, a successful preflight deliberately reports:

```text
multi_principal_grist_credentials: BLOCKED_R5_C_STATIC_GRIST_CREDENTIAL
live_oauth_validation: REQUIRED_SEPARATELY
```

That is not an OAuth failure. It records that R5-B validates ChatGPT/Codex -> bridge identity while R5-C separately owns multi-principal Grist service-account credentials.

## Unauthenticated public smoke

After an authorized deployment or rollback:

```sh
MCP_RESOURCE_URI='https://example.invalid/mcp' npm run smoke:oauth-deployment
```

The smoke performs only public, non-mutating requests to `/healthz`, RFC 9728 protected-resource metadata and unauthenticated `/mcp`. It validates service health, exact resource binding, the fixed three scopes, one HTTPS authorization server and the `WWW-Authenticate` resource-metadata challenge. It never accepts or sends a bearer token.

## Current ChatGPT OAuth readiness probe

Run the non-destructive public checks with:

```sh
MCP_RESOURCE_URI='https://example.invalid/mcp' \
  npm run probe:chatgpt-oauth-readiness
```

The probe checks:

- RFC 9728 protected-resource metadata and exact canonical resource;
- exactly the fixed three bridge scopes;
- authorization-server discovery;
- Authorization Code and refresh-token support;
- PKCE `S256`;
- CIMD/dynamic-client support;
- compatibility of the current stable ChatGPT CIMD document with the authorization server;
- unauthenticated `/mcp` resource challenge.

For an authenticated proof, supply a fresh access token only through the protected local environment:

```sh
MCP_RESOURCE_URI='https://example.invalid/mcp' \
OAUTH_ACCESS_TOKEN='<protected environment only>' \
  npm run probe:chatgpt-oauth-readiness
```

The authenticated extension performs only `tools/list`. It requires the live surface to be **exactly the ten MCP v2 tools** and verifies the exact root plus compatibility OAuth schemes for every tool. It does not print the token and does not perform a Grist write.

Issuer, audience/resource, expiry and scope rejection remain covered by the existing verifier/unit tests and the isolated `probe:oauth-negative` cases. Do not weaken those checks to make a deployment pass.

## Reviewer-capable identity path

R5-B requires an isolated Logto identity path suitable for a reviewer or automated review session. The account used for this path must be able to complete authorization without access to the operator's private network, phone, SMS inbox, personal email inbox or an operator-mediated MFA step.

This reviewer path is separate from ProConnect institutional login. It may use a dedicated Logto-native reviewer identity, but it must preserve the same MCP resource, fixed scopes, PKCE/resource binding and token validation as the normal path. Reviewer credentials are external protected deployment material and are never committed.

## Release/evidence sequence

1. Resolve the exact candidate SHA and require green baseline CI.
2. Run the offline preflight against the intended protected environment.
3. Deploy only after the operator authorizes the candidate and retains a rollback reference.
4. Run `smoke:oauth-deployment` against the canonical public MCP resource.
5. Run `probe:chatgpt-oauth-readiness` without a token, then with a fresh protected token for the authenticated ten-tool `tools/list` proof.
6. Run the existing isolated negative cases for wrong audience/resource and insufficient scope; retain only sanitized PASS/FAIL results.
7. Connect ChatGPT/Codex through the current OAuth flow and verify discovery plus a bounded read using a synthetic/reviewer-safe Grist fixture. R5-C must complete before treating distinct principals as isolated Grist upstream identities.
8. Record only exact commit, UTC time, environment label, probe name and sanitized result. Never record bearer tokens, provider subjects, cookies, codes or keys.
9. On failure, stop stronger operations and restore the previous reviewed artifact/configuration. Never downgrade to static bearer merely to obtain a PASS.

## Current boundary

R5-B does **not** create or store Grist service-account credentials; that is R5-C. It does not add scopes, implement a credential database, make ProConnect mandatory for reviewers or submit a public plugin.

A live authenticated proof necessarily depends on a deployed candidate plus external authorization-server/reviewer credentials. Repository work can prepare and validate the code path, but those protected external actions are the final R5-B gate.
