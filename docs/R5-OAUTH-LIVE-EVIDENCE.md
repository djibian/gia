# R5-B live OAuth completion evidence

**Date:** 2026-09-28  
**Candidate:** `6ed8cbacacfa78d2d9b1f1dcfa8becda3499b1b6`  
**Scope:** protected live OAuth deployment/reviewer-identity completion evidence for R5-B.

This document records sanitized operational evidence only. It does not contain OAuth access/refresh/ID tokens, authorization codes, PKCE verifiers, cookies, raw Logto subject identifiers, Grist API keys or other credentials.

## Deployment and public OAuth readiness — PASS

The reviewed candidate was fast-forward deployed to the authorized production-like bridge host and restarted successfully in OAuth mode.

Repository preflight completed with the expected R5-B boundary:

```text
configuration_valid: PASS
oauth_mode: PASS
canonical_mcp_resource: PASS
public_resource_host_allowed: PASS
grist_https: PASS
bounded_operation_limits: PASS
multi_principal_grist_credentials: BLOCKED_R5_C_STATIC_GRIST_CREDENTIAL
live_oauth_validation: REQUIRED_SEPARATELY
```

The public OAuth smoke validated health, protected-resource metadata, canonical resource binding, authorization-server discovery, fixed bridge scopes and the unauthenticated MCP challenge.

The current ChatGPT OAuth readiness probe validated the protected-resource metadata, authorization-server issuer, CIMD support, PKCE `S256`, Authorization Code and refresh-token grants, RFC 9207 issuer identification, stable ChatGPT CIMD metadata and the unauthenticated MCP challenge.

## Isolated reviewer identity and ChatGPT connection — PASS

A dedicated Logto-native reviewer identity was provisioned independently of the operator identity. It authenticates with its own username/password path and does not require operator-only MFA, SMS, email or private-network access.

ChatGPT completed the OAuth connection against the reviewed MCP endpoint using this reviewer identity.

The reviewer was intentionally granted only `doc:read` for the live read proof. The bridge therefore exercised the real scope-to-capability mapping rather than an operator-wide token.

## Authenticated ten-tool MCP v2 scan — PASS

The authenticated ChatGPT Tool Scan exposed exactly the ten frozen MCP v2 tools and no retired v1 tool:

### Read

```text
grist_discover
grist_help
grist_inspect
grist_query
```

### Write

```text
grist_add_records
grist_add_structure
grist_add_ui
grist_change_records
grist_change_structure
grist_change_ui
```

The live descriptions matched the bounded semantic contract and the write/read grouping matched the current per-tool OAuth security metadata.

## Reviewer-safe bounded read — PASS

The reviewer used ChatGPT to inspect the allowed synthetic Grist document `aGUygEv64sRs` (`Test ChatGPT MCP`) without modification.

Observed semantic result:

- 3 tables, 9 columns, 4 pages and 5 widgets;
- bounded row reads from `MCP_Test`, `Personnes` and `Inventaire_Exemple`;
- page/widget relationships were returned through semantic inspection;
- no write operation succeeded or was requested in the read proof.

Sanitized bridge audit evidence after authorization repair:

```text
operation=inspect_document capability=doc:read status=success documentId=aGUygEv64sRs
operation=query_records  capability=doc:read status=success documentId=aGUygEv64sRs
operation=query_records  capability=doc:read status=success documentId=aGUygEv64sRs
operation=query_records  capability=doc:read status=success documentId=aGUygEv64sRs
```

Earlier attempts by the same opaque OAuth principal failed closed with `AuthorizationError` before the required Logto role/scope was assigned; after scope correction the same principal succeeded, demonstrating that authorization changed without identity substitution.

## Missing `doc:write` — PASS

With the reviewer still restricted to `doc:read`, ChatGPT attempted one bounded `create_records` intention. ChatGPT received a reauthorization requirement and did not receive elevated permission.

Sanitized bridge audit evidence:

```text
operation=create_records
capability=doc:write
itemCount=1
status=error
errorType=AuthorizationError
```

No successful write audit event was present. The write was rejected at the authorization boundary before a permitted mutation could be performed.

## Wrong resource / audience — PASS

A temporary non-production Logto API resource and Native/Device-flow client were used only to obtain a correctly signed token whose audience was deliberately different from the canonical MCP resource. No token value was printed or persisted.

Sanitized live diagnostics:

```text
Token audience is temporary wrong resource: PASS
Wrong-resource token JWT/JWKS verification: PASS
Token audience differs from canonical MCP resource: yes
Bridge wrong-resource rejection: PASS
Principal/context created after wrong-resource rejection: no
```

The bridge therefore rejected a validly signed wrong-resource token before Principal or Grist context construction.

## R5-B conclusion

All completion evidence named by the R5-B roadmap is now present against the reviewed current candidate:

- authorized live OAuth deployment;
- protected-resource metadata, PKCE `S256`, resource binding and current CIMD compatibility;
- authenticated Tool Scan proving exactly the ten lean MCP v2 tools;
- isolated reviewer-capable Logto identity;
- bounded reviewer-safe real Grist read;
- insufficient-scope write fail-closed behavior;
- wrong-resource/audience fail-closed behavior before Principal/context construction.

R5-B is complete.

## Deliberate boundary / next tranche

The deployed bridge still uses the R5-B static upstream Grist credential provider. This is expected and is not evidence for per-principal upstream authority. R5-C must replace that production path with an operator-mounted read-only principal-to-service-account-key mapping, fail closed on missing mappings, and prove at least two distinct Grist Community service-account authorities without cross-principal credential/context reuse.
