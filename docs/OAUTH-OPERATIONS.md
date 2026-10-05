# OAuth operating model — current Gia runtime

This is the current operating runbook for the MCP v2 product. The bridge remains a provider-neutral OAuth 2.1 resource server. Logto OSS is the reference authorization server and ProConnect may remain an upstream identity source, but no Logto SDK or provider-specific login logic is embedded in bridge core.

Public bridge scopes remain exactly:

```text
doc:read
doc:write
doc.schema:write
```

The ten-tool MCP v2 registry remains the source of each tool's **baseline** capability. Root `securitySchemes` and compatibility `_meta.securitySchemes` publish that baseline. Closed actions may declare an additional requirement when their semantics genuinely need it: `grist_add_structure(action="copy_document_as_template")` additionally requires source `doc:read` while empty document creation remains `doc.schema:write`-only. Insufficient-scope `mcp/www_authenticate` challenges are derived from the actual call arguments and missing applicable scopes; they never manufacture a resource grant or native Grist authority.

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

Issuer, audience/resource, expiry/`nbf`, JOSE critical-extension/key-family constraints and scope rejection remain covered by verifier/unit tests and isolated negative probes. Do not weaken those checks to make a deployment pass.

## Reviewer-capable identity path

R5-B established an isolated Logto identity path suitable for a reviewer or automated review session without operator-only MFA/SMS/email/private-network steps.

R5-C adds a separate upstream requirement: every production OAuth principal used for Grist access must have an exact opaque principal entry in the operator-mounted credential mapping and a distinct/narrow Grist Community service account where isolation requires it.

OAuth authorization never creates, rotates or grants that service account. Service-account lifecycle remains operator-side Grist administration.

## Historical R5-C release/evidence sequence

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

R5-B, R5-C, R5-D and R5-E are complete; their live evidence remains historical qualification of those exact candidates. R6 is also complete. The current release candidate is Gia 0.7.0, with no new public OAuth scope: `doc:read`, `doc:write` and `doc.schema:write` remain the complete capability vocabulary.

The bridge still does not add a credential database, service-account lifecycle, generic identity/share/organization administration or model-facing secret inputs. C1 is a separate bounded **application-level persisted access-rule** capability and must not be described as generic identity/ACL administration. R7 and R5-F public distribution remain deferred; neither is latent release work.
