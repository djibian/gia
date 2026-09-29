# R5-D live operational-hardening evidence

Date: 2026-09-29 UTC  
Candidate commit: `fda4e68b86372b75750336a1f2c3ff00fa42edec`  
Environment: authorized self-hosted Grist Community 1.7.19 qualification deployment  
Bridge: `grist-chatgpt` 0.5.0, OAuth MCP, `GRIST_CREDENTIAL_MODE=principal-map`

## Scope

This record closes the live deployment exercises required by `docs/R5-D-OPERATIONS.md` without storing API keys, OAuth bearer tokens, raw OAuth subjects or principal-mapping contents.

The qualification deployment used a dedicated workspace with two synthetic resources:

- `R5D_ALLOWED` — the qualification service account had editor access;
- `R5D_DENIED` — the qualification service account had no direct grant.

The bridge deployment ceiling was restricted to `R5D_ALLOWED`. `GRIST_API_KEY` was absent in `principal-map` mode.

## Production preflight and release smoke

The exact candidate was installed on the deployment host and the repository regression suite passed before activation.

The OAuth deployment preflight reported:

```text
configuration_valid: PASS
oauth_mode: PASS
canonical_mcp_resource: PASS
public_resource_host_allowed: PASS
grist_https: PASS
bounded_operation_limits: PASS
per_principal_rate_limit: PASS
multi_principal_grist_credentials: PASS
live_oauth_validation: REQUIRED_SEPARATELY
```

The controlled public smoke then reported:

```text
health_endpoint: PASS
protected_resource_metadata: PASS
metadata_resource_binding: PASS
metadata_authorization_server: PASS
metadata_scopes: PASS
unauthenticated_mcp_challenge: PASS
```

A real ChatGPT OAuth qualification principal then discovered only `R5D_ALLOWED`, discovered its `Table1`, and completed a bounded read successfully.

## Native least-privilege baseline

The initial finite-expiry Grist service account was label `grist-chatgpt-r5d`, service-account ID `3`, expiry 2026-12-31.

Direct Grist requests established the intended native authority matrix before bridge qualification:

| Native service-account authority | `R5D_ALLOWED` | `R5D_DENIED` |
| --- | --- | --- |
| initial R5-D account | ALLOW (`200`) | DENY (`403`) |

Result: least-privilege baseline PASS.

## Live OAuth issuer/JWKS outage and recovery

A still-valid OAuth qualification session first completed the bounded `R5D_ALLOWED/Table1` read successfully.

The configured real JWKS path was then made temporarily unavailable at the deployment reverse-proxy boundary. Logto and the bridge remained running and no invented credential or test issuer was substituted.

During the controlled outage:

- the real JWKS path returned `503`;
- authenticated `POST /mcp` requests were observed at the reverse proxy returning HTTP `503`;
- the bridge emitted secret-safe `grist.ops` events with `event="oauth_jwks_unavailable"`;
- the client surfaced only a generic upstream failure; no bearer token, claim, Grist credential or upstream body was exposed in the retained evidence.

Sanitized timing evidence from the strict status check:

```text
2026-09-29T12:02:05Z  POST /mcp -> 503
2026-09-29T12:02:05Z  grist.ops oauth_jwks_unavailable
2026-09-29T12:02:06Z  POST /mcp -> 503
2026-09-29T12:02:06Z  grist.ops oauth_jwks_unavailable
```

The real JWKS dependency was restored and returned `200`. The bridge remained on the same process (`MainPID=444838`, active since 2026-09-29 11:58:38 UTC) across the strict outage/recovery exercise. Without restarting the bridge, the same OAuth qualification principal again completed the bounded `R5D_ALLOWED/Table1` read successfully.

Result: JWKS fail-closed and no-restart recovery PASS.

## Live service-account rotation and revocation

A replacement finite-expiry Grist Community service account was created through native Grist administration:

- label `grist-chatgpt-r5d-rotation`;
- service-account ID `4`;
- expiry 2026-12-31.

The replacement received exactly the same minimum native grants. Before changing the bridge mapping, direct Grist requests produced:

| Replacement authority | `R5D_ALLOWED` | `R5D_DENIED` |
| --- | --- | --- |
| replacement account | ALLOW (`200`) | DENY (`403`) |

Only the qualification principal's protected mapping entry was atomically replaced, then the bridge was restarted so the immutable startup mapping was reloaded. The same OAuth principal immediately retained its bounded `R5D_ALLOWED/Table1` access.

Only after that successful OAuth verification was the old service-account key revoked through Grist's native service-account API. Postconditions were:

```text
old credential /api/profile/user -> 401
old credential R5D_ALLOWED       -> 401
new credential /api/profile/user -> 200
new credential R5D_ALLOWED       -> 200
new credential R5D_DENIED        -> 403
```

The same OAuth principal then completed the bounded `R5D_ALLOWED/Table1` read again through the bridge after old-key revocation.

Result: rotation/revocation PASS with least privilege preserved.

## Operational observations

- `principal-map` was used with exactly the qualification principal entry required for this exercise;
- no shared `GRIST_API_KEY` fallback was present;
- the protected mapping was updated atomically and the old revoked secret was not restored during any rollback/recovery step;
- service-account administration, grants, rotation and revocation remained operator-side and were not exposed through MCP;
- the retained operational event evidence contained only bounded event metadata;
- no OAuth token, raw provider subject, service-account API key or mapping content is present in this document.

The deployment also confirmed that browser authentication and native Grist Bearer API authentication can remain separate reverse-proxy paths: browser traffic stays behind the deployment identity layer while Bearer API requests reach Grist for native credential validation. This is deployment configuration, not a new model-facing product capability.

## R5-D conclusion

The repository implementation integrated in #184 and the authorized live qualification together satisfy the committed R5-D result:

- per-principal request bounds are active and preflight-checked;
- secret-safe operational signals are emitted;
- release/preflight/smoke checks pass on the exact candidate;
- OAuth/JWKS outage fails closed with HTTP `503` and recovers without bridge restart;
- service-account rotation and old-credential revocation preserve the intended native allow/deny boundary and live OAuth access;
- logging/retention guidance remains deployment-oriented without adding a monitoring, alert-transport or secret-manager subsystem.

No R5-D live blocker remains. The roadmap may transition R5-D to DONE and make R5-E eligible after independent exact-head review of the completion transition.
