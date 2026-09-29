# OAuth operating model — R5

This is the current operating runbook for the MCP v2 product. The bridge remains a provider-neutral OAuth 2.1 resource server. Logto OSS is the reference authorization server and ProConnect may remain an upstream identity source, but no Logto SDK or provider-specific login logic is embedded in bridge core.

Public bridge scopes remain exactly:

```text
doc:read
doc:write
doc.schema:write
```

The ten-tool MCP v2 registry is the single source of each tool's required capability. Root `securitySchemes`, compatibility `_meta.securitySchemes`, and insufficient-scope `mcp/www_authenticate` challenges must all agree with that registry.

Never record OAuth access/refresh/ID tokens, authorization codes, PKCE verifiers, cookies, Logto/ProConnect secrets, raw provider identities, Grist API keys or principal credential mapping contents in GitHub, chat, durable evidence or probe output.

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

The preflight is offline and sanitized. It does not make network requests, start the server, mutate Grist or print configuration values. It checks OAuth mode, canonical HTTPS `/mcp` resource, public-host allowlist, HTTPS Grist upstream, bounded operation limits and `GRIST_CREDENTIAL_MODE=principal-map`.

A production-ready R5-C credential configuration includes:

```dotenv
GRIST_CREDENTIAL_MODE=principal-map
GRIST_PRINCIPAL_CREDENTIALS_FILE=/run/secrets/grist-principals.json
```

and deliberately omits `GRIST_API_KEY`.

Expected credential status:

```text
multi_principal_grist_credentials: PASS
live_oauth_validation: REQUIRED_SEPARATELY
```

A static Grist credential makes `multi_principal_grist_credentials` fail and makes the preflight exit non-zero. This is intentional: static upstream credentials remain valid for controlled development but cannot be represented as production multi-principal isolation.

The mapping file itself is parsed by the server at startup, not by the offline preflight. See `docs/CREDENTIALS.md`.

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

The probe checks RFC 9728 metadata/resource binding, the fixed three scopes, authorization-server discovery, Authorization Code + refresh support, PKCE `S256`, CIMD/dynamic-client support and the unauthenticated `/mcp` resource challenge.

For an authenticated proof, supply a fresh access token only through protected local environment state. The authenticated extension performs only `tools/list`, requires exactly the ten MCP v2 tools and verifies their OAuth schemes. It never prints the token or performs a Grist write.

Issuer, audience/resource, expiry and scope rejection remain covered by verifier/unit tests and isolated negative probes. Do not weaken those checks to make a deployment pass.

## Reviewer-capable identity path

R5-B established an isolated Logto identity path suitable for a reviewer or automated review session without operator-only MFA/SMS/email/private-network steps.

R5-C adds a separate upstream requirement: every production OAuth principal used for Grist access must have an exact opaque principal entry in the operator-mounted credential mapping and a distinct/narrow Grist Community service account where isolation requires it.

OAuth authorization never creates, rotates or grants that service account. Service-account lifecycle remains operator-side Grist administration.

## R5-C release/evidence sequence

1. Resolve the exact reviewed candidate SHA and require green exact-head CI.
2. Provision at least two Grist Community service accounts outside the bridge, each with narrow native grants and finite expiry.
3. Build the protected mapping using the bridge's opaque `oauth:<sha256>` principal IDs; do not store raw provider subjects.
4. Mount the mapping read-only, set `GRIST_CREDENTIAL_MODE=principal-map`, remove `GRIST_API_KEY`, and restart.
5. Run the offline preflight and require `multi_principal_grist_credentials: PASS`.
6. Run public OAuth smoke/readiness checks.
7. Through authenticated principals A and B, exercise bounded reads against resources whose native grants differ.
8. Verify an unmapped principal fails closed and no shared fallback credential is attempted.
9. Retain only sanitized evidence: exact commit, UTC time, environment label, service-account labels/IDs only if non-secret, allowed/denied resource result, probe name and PASS/FAIL. Never record API keys or raw provider subjects.
10. Exercise one rotation/restart and one revocation/expiry path when R5-D performs operational hardening.

## Current boundary

R5-B and R5-C are complete. The repository implementation for principal-aware service-account selection is integrated in #182, and `docs/R5-C-LIVE-EVIDENCE.md` records the 2026-09-29 sanitized live two-service-account isolation and unmapped-principal fail-closed proof.

R5-C does not add scopes, a credential database, service-account administration, generic ACL administration or model-facing secret inputs. R5-D is now the next eligible tranche and owns operational rate/counter hardening plus exercised OAuth issuer/JWKS outage/recovery and service-account rotation/revocation.
