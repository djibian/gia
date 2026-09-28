# ChatGPT / Codex MCP OAuth readiness

**Historical live proof:** 2026-09-19  
**R5-B revalidation:** 2026-09-28  
**Current public contract:** MCP v2, ten tools

This document separates the historical live interoperability proof from the current R5-B production revalidation. The 2026-09-19 proof established that ChatGPT could complete the standards-based Logto/ProConnect OAuth path. R5-B revalidates that same provider-neutral architecture against the **current ten-tool MCP v2 runtime** rather than assuming the retired v1 tool surface is still authoritative.

Never record OAuth access/refresh/ID tokens, authorization codes, PKCE verifiers, cookies, ProConnect/Logto client secrets, raw provider identities or Grist API keys in this document, GitHub, chat or test output.

## Current bridge contract

The OAuth resource server exposes:

1. RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource`;
2. the canonical MCP resource URI through that metadata and `WWW-Authenticate` challenges;
3. fixed public scopes only: `doc:read`, `doc:write`, `doc.schema:write`;
4. OAuth `securitySchemes` on each of the ten lean tools, derived from the lean MCP registry and mirrored in `_meta` for compatibility;
5. runtime `_meta["mcp/www_authenticate"]` insufficient-scope challenges derived from the same lean-tool capability;
6. provider-neutral JWT/JWKS verification with fail-closed issuer, audience/resource, expiry and scope enforcement.

The bridge does not implement Logto client registration and does not depend on a Logto SDK.

## Ten-tool OAuth capability map

| MCP v2 tool | OAuth capability |
| --- | --- |
| `grist_discover` | `doc:read` |
| `grist_inspect` | `doc:read` |
| `grist_query` | `doc:read` |
| `grist_add_records` | `doc:write` |
| `grist_change_records` | `doc:write` |
| `grist_add_structure` | `doc.schema:write` |
| `grist_change_structure` | `doc.schema:write` |
| `grist_add_ui` | `doc.schema:write` |
| `grist_change_ui` | `doc.schema:write` |
| `grist_help` | OAuth required, no additional document scope |

This map is metadata, not an authority elevation. Grist permissions remain authoritative and bridge policy may only reduce them.

## Current readiness probe

Public, non-destructive checks:

```bash
MCP_RESOURCE_URI='https://grist-chatgpt.loeildumaitre.fr/mcp' \
  npm run probe:chatgpt-oauth-readiness
```

Optional authenticated ten-tool proof, using a fresh token only from protected local environment state:

```bash
MCP_RESOURCE_URI='https://grist-chatgpt.loeildumaitre.fr/mcp' \
OAUTH_ACCESS_TOKEN='<protected environment only>' \
  npm run probe:chatgpt-oauth-readiness
```

The authenticated probe performs only `tools/list`. It requires the exact ten-tool v2 set and exact root plus compatibility OAuth schemes. It never prints the token and never performs a Grist write.

Use `npm run probe:oauth-negative` separately for isolated wrong-audience/resource and insufficient-scope evidence. The runtime verifier/unit suite also locks issuer, audience, expiry and scope rejection.

## Historical live result retained

The 2026-09-19 ChatGPT Developer Mode flow used:

```text
MCP resource: https://grist-chatgpt.loeildumaitre.fr/mcp
Client registration: CIMD
Client metadata: https://chatgpt.com/oauth/client.json
Callback: https://chatgpt.com/connector_platform_oauth_redirect
```

Logto 1.43.0 accepted the ChatGPT CIMD metadata. Authorization Code + PKCE `S256`, RFC 8707 resource binding, JWT/JWKS verification, session persistence and reconnect behavior were exercised successfully. The initial Logto `email` permission mismatch was a provider configuration issue and was corrected without adding a bridge scope.

The historical proof also confirmed bounded read/write/delete behavior, but it ran against the older public tool surface and used `StaticApiKeyCredentialProvider` upstream of the bridge. It therefore **does not by itself prove the current ten-tool v2 deployment or R5-C multi-principal Grist credentials**.

Configured access-token lifetime for the historical revocation proof was 3600 seconds. Removing the Logto grant did not retroactively revoke the already-issued self-contained JWT; after expiry, ChatGPT required reconnection.

## R5-B completion gate

Repository-level R5-B work is complete only when code/CI and the operating probes agree on the ten-tool v2 contract. Final live completion additionally requires an authorized deployment of the reviewed candidate and sanitized evidence that:

- protected-resource discovery succeeds;
- PKCE `S256`, resource binding and current CIMD registration succeed;
- authenticated `tools/list` exposes exactly ten v2 tools with exact schemes;
- issuer/audience/expiry/scope failures remain fail-closed;
- a reviewer-capable Logto identity can authenticate without operator-only MFA/SMS/email/private-network access;
- ChatGPT/Codex can complete the current OAuth connection and a bounded reviewer-safe read.

Those deployment identities and credentials are external protected material. They are not created, copied or committed by the repository Controller.

R5-C separately replaces the static upstream Grist credential with operator-provisioned service-account mappings for multi-principal production.
