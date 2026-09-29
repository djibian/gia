# R5-D minimal operational hardening

This document is the operator runbook for the bounded R5-D controls around the MCP v2 candidate. It deliberately does not turn `grist-chatgpt` into a monitoring platform, secret manager or deployment orchestrator.

## Product/runtime controls

### Per-principal request ceiling

Authenticated `/mcp` requests are limited independently per principal by an in-process fixed one-minute window.

Configuration:

```dotenv
MCP_PRINCIPAL_RATE_LIMIT_PER_MINUTE=120
```

Rules:

- the value is a required positive integer when configured; default `120`;
- static mode has the single controlled `mcp-client` principal;
- OAuth mode keys the limiter by the opaque principal ID already derived by the authenticated principal boundary;
- a principal at the ceiling receives HTTP `429 Too Many Requests` plus `Retry-After`;
- one principal cannot consume another principal's window;
- principal IDs are private map keys only and are not exported by the limiter;
- inactive entries are swept after expiry;
- the `rate_limited` operational signal is emitted only for the first rejection in each principal/window, avoiding log amplification from a client that keeps retrying while limited;
- the limiter is intentionally process-local: a multi-replica deployment must apply an equivalent shared/reverse-proxy ceiling if a globally coordinated limit is required.

The bridge keeps operation-size bounds (`GRIST_MAX_*`) separately. Request rate and Grist mutation/read size solve different risks. Anonymous/pre-authentication traffic should additionally be bounded at the deployment/reverse-proxy edge because per-principal identity is available only after authentication.

### Secret-safe operational events

`grist.ops` JSON events provide only low-cardinality alert inputs:

- `rate_limited`;
- `oauth_rejected`;
- `oauth_jwks_unavailable`;
- `grist_credential_resolution_failed`;
- `mcp_internal_error`.

Each event contains exactly:

```json
{
  "type": "grist.ops",
  "timestamp": "<ISO-8601>",
  "event": "<bounded event code>",
  "count": 1
}
```

`count` is monotonic only within the current process lifetime and is reset on restart. Durable aggregation, alert thresholds and delivery are deployment infrastructure. The unauthenticated OAuth discovery challenge is not counted as an `oauth_rejected` event.

General operational events never contain principal IDs, document/workspace/table/record IDs, request IDs, bearer/JWT values, Grist API keys, mapping contents, request/response bodies, URLs or arbitrary exception messages.

Request-level `grist.audit` events remain a separate protected stream as documented in `docs/OPERATIONS-OBSERVABILITY.md`.

## Production preflight

Before activating a candidate on a production-like OAuth deployment, run the repository baseline and offline deployment checks against the exact candidate:

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm run check
npm test
npm run build
npm run check:oauth-deployment
```

The OAuth deployment preflight must report PASS for:

- OAuth mode;
- canonical HTTPS `/mcp` resource;
- accepted public hostname;
- HTTPS Grist endpoint;
- bounded Grist operation sizes;
- positive per-principal request ceiling;
- `principal-map` upstream credentials.

It intentionally prints status identifiers only, not configured values or secrets.

## Controlled release and rollback smoke

### Release

1. Record the exact Git commit/artifact being deployed.
2. Keep the previous known-good artifact available for rollback.
3. Keep the protected principal mapping and other secrets outside the artifact.
4. Run the baseline checks and `npm run check:oauth-deployment` before activation.
5. Activate the exact built candidate without modifying it in place.
6. Run:

```bash
npm run smoke:oauth-deployment
```

7. Require PASS for health, protected-resource metadata, resource binding, authorization-server declaration, scopes and unauthenticated MCP challenge.
8. Run one authorized bounded read with a qualification principal when production policy permits it; do not place its bearer token or Grist key in durable evidence.

### Rollback

If release smoke or the authorized qualification request fails:

1. stop routing traffic to the candidate;
2. restore the previous known-good application artifact/configuration;
3. retain the **current valid secret state** rather than restoring revoked/expired credentials from an old artifact snapshot;
4. restart;
5. rerun `npm run smoke:oauth-deployment` and the bounded qualification read;
6. record only exact artifact identifiers, PASS/FAIL results, timestamps and bounded error classes.

Rollback must never require copying API keys or OAuth tokens into Git, issues, CI logs or review evidence.

## OAuth issuer/JWKS outage and recovery exercise

Repository behavior is fail-closed: a JWKS fetch/parse availability failure yields HTTP `503 Authorization service unavailable`. The verifier performs a fresh JWKS fetch for a later request, so recovery does not require process restart or cache invalidation.

Before R5-D can be marked DONE, exercise this on an authorized production-like deployment:

1. Establish a baseline with a still-valid OAuth token and a successful bounded MCP read.
2. Make the configured JWKS dependency unreachable or return a controlled invalid/unavailable response at the deployment/network test boundary. Do not replace the production configuration with an invented credential or commit a test endpoint.
3. Repeat the authenticated request.
4. Require a generic HTTP `503` with no token/claim/upstream body leakage.
5. Confirm a `grist.ops` `oauth_jwks_unavailable` event is emitted without identity or secret values.
6. Restore the real JWKS dependency.
7. Repeat the request with a still-valid token and require normal authenticated behavior to recover without bridge restart.
8. Store only sanitized timing/result evidence.

The focused `test/jwks-recovery.test.ts` regression proves the same fail-closed-then-recover behavior at the verifier boundary; it is not a substitute for the live exercise.

## Grist service-account credential rotation/revocation exercise

`principal-map` is immutable within one process. Rotation therefore uses an operator-controlled mapping update plus restart; the bridge does not create, grant, rotate or revoke Grist accounts.

For one qualification principal:

1. Verify the current mapped service account can access only its intended Grist resources.
2. Create a replacement finite-expiry Grist Community service account using native Grist administration.
3. Give the replacement the same minimum intended native grants; do not broaden resource authority merely to simplify rotation.
4. Verify the replacement key directly against the intended/denied resource matrix before changing the bridge mapping.
5. Atomically replace only that principal's entry in the protected mapping.
6. Restart the bridge so the immutable startup mapping is reloaded.
7. Verify that the OAuth principal retains only the intended MCP/Grist access.
8. Revoke or expire the old service-account credential in Grist.
9. Verify the old credential is denied directly by Grist and that the bridge continues to work with the replacement.
10. Preserve sanitized evidence only: service-account labels/IDs when non-secret, resource aliases, status classes and exact application commit. Never retain API key values.

A rollback after old-key revocation must use the current replacement mapping; never roll back a revoked secret merely because an older application artifact referenced the previous deployment state.

## Logging and retention guidance

The bridge minimizes what it emits; the deployment operator still controls storage and retention.

### `grist.ops`

These events have no user/document identifiers or payloads. Retain only as long as needed for operational trends and incident diagnosis. A typical deployment may choose a short operational window such as 30 days, but local policy is authoritative.

### `grist.audit`

Audit events may contain an opaque principal ID, successful authorized document ID and request ID. Treat these as protected operational/pseudonymous data:

- access-control the sink;
- do not make it model-visible;
- do not use principal/document/request IDs as general metric labels;
- do not ingest request/response bodies, formulas, token claims or credentials;
- choose the shortest retention period that satisfies the operator's accountability/security need;
- absent a documented requirement for longer retention, a short window such as 30 days is a conservative default;
- document deletion/rotation of the sink and restrict exports to sanitized aggregates/evidence.

This repository does not impose a legal retention period. Institutional/privacy requirements for the actual deployment remain operator responsibilities.

## Alerting boundary

The product emits enough bounded signals for an external system to alert on rate limiting, authentication rejection spikes, JWKS availability failures, credential resolution failures and internal errors. Thresholds, storage, dashboards, paging transport, log shipping and secret-manager selection remain deployment infrastructure.

## R5-D completion boundary

Repository implementation is a candidate only until the runtime controls, regressions, preflight/smoke integration and this runbook are independently reviewed with green exact-head CI and integrated into `main`.

Even after that repository implementation is integrated, R5-D remains incomplete until sanitized live evidence records both:

- OAuth/JWKS outage **and recovery** on an authorized deployment; and
- service-account credential **rotation and revocation** with preserved least privilege.

Only then may the authoritative roadmap advance R5-D to DONE and make R5-E eligible.
