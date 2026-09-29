# R5-C live service-account isolation evidence

Date: 2026-09-29 UTC  
Candidate commit: `b6df70e6dbb574bdacdfb3895b7cc2c9190c2178`  
Environment: authorized self-hosted Grist Community 1.7.19 qualification deployment  
Bridge: `grist-chatgpt` 0.5.0, OAuth MCP, `GRIST_CREDENTIAL_MODE=principal-map`

## Scope

This record closes the live evidence requirement for R5-C without storing API keys, OAuth bearer tokens, raw OAuth provider subjects or other deployment secrets.

Two real Grist Community service accounts were created through Grist's native service-account API with finite expiry and distinct native grants:

- service account A — label `grist-chatgpt-r5-a`, service-account ID `1`, expiry 2026-12-31;
- service account B — label `grist-chatgpt-r5-b`, service-account ID `2`, expiry 2026-12-31.

The qualification workspace was `R5-C Qualification`. It contained two independent documents:

- `R5C_A` (`fWECVTb2NJNcSVTnHgQYBU`), granted to service account A only;
- `R5C_B` (`oFn4pzHn1fCHsLrcqqEGMA`), granted to service account B only.

The protected operator mapping contained exactly two opaque OAuth principal entries, one per service-account key. `GRIST_API_KEY` was absent in `principal-map` mode.

## Deployment preflight

The reviewed candidate was installed and built on the deployment host. The repository regression suite passed 242/242 tests before activation.

The production preflight reported:

```text
configuration_valid: PASS
oauth_mode: PASS
canonical_mcp_resource: PASS
public_resource_host_allowed: PASS
grist_https: PASS
bounded_operation_limits: PASS
multi_principal_grist_credentials: PASS
live_oauth_validation: REQUIRED_SEPARATELY
```

After restart, the bridge health endpoint reported `status=ok` and the deployed Git HEAD remained the exact candidate commit above.

## Native Grist authority matrix

The two service-account keys were exercised directly against Grist before the bridge proof. Only HTTP status classes/results were retained.

| Native service-account authority | `R5C_A` | `R5C_B` |
| --- | --- | --- |
| service account A | ALLOW (`2xx`) | DENY (`403`) |
| service account B | DENY (`403`) | ALLOW (`2xx`) |

Result: `ISOLATION_GRIST: PASS`.

## Live OAuth -> MCP -> Grist evidence

Two distinct authenticated OAuth identities were exercised through the same live bridge process and the same MCP plugin surface.

### Principal A

- document discovery returned only `R5C_A` from the qualification workspace;
- bounded table discovery/read against `R5C_A` succeeded;
- no `R5C_B` document was returned to principal A.

### Principal B

- document discovery returned only `R5C_B` from the qualification workspace;
- bounded table discovery/read against `R5C_B` succeeded;
- an explicit `grist_discover` request for `R5C_A` failed with the bridge's `operation_failed` authorization result, identifying the target as not allowed for principal B with `doc:read`.

Together with the native authority matrix, these live observations prove that the same bridge instance selected different upstream service-account authority for the two OAuth principals and did not reuse principal A's discovery/context for principal B.

## Unmapped-principal fail-closed proof

The operator mapping was copied exactly, principal B's single mapping entry was removed, permissions were preserved, and the bridge was restarted so the immutable startup mapping was reloaded.

With the same still-valid OAuth B session:

- document discovery failed;
- access to the previously allowed `R5C_B` failed;
- the connector surfaced a generic 502 rather than any Grist data or credential detail;
- no shared `GRIST_API_KEY` existed in deployment configuration, so no shared-credential fallback path was available.

The exact saved mapping was then restored and the bridge restarted. Principal B again discovered only `R5C_B` and bounded table discovery/read succeeded.

Result: unmapped principal fails closed, and controlled mapping restoration restores only the expected authority.

## Security observations

- no Grist service-account API key was printed into this evidence;
- no OAuth token, authorization code, PKCE secret or raw provider subject was recorded;
- mapping keys are opaque bridge principal IDs derived by the reviewed implementation;
- Grist remains authoritative for the selected service account's resource permissions;
- the bridge deployment ceiling and OAuth capability checks continue to reduce, never elevate, native Grist authority;
- the qualification did not add service-account administration, generic ACL administration or secret inputs to the MCP contract.

## R5-C conclusion

R5-C live completion criteria are satisfied on the exact candidate commit above:

- two real Community service accounts provide distinct upstream authority;
- two authenticated OAuth principals resolve to the intended distinct authorities through the live MCP bridge;
- native resource grants remain effective;
- principal-derived discovery/context does not cross the observed A/B boundary;
- an unmapped principal fails closed with no shared credential fallback;
- restoration is controlled and returns the expected authority.

R5-D may become eligible after this evidence and the corresponding roadmap transition are independently reviewed and integrated.
