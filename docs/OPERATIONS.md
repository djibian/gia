# Operations

Requirements: Node.js 22+, one Grist Community deployment, protected server-side
credentials, and an explicit deployment document/workspace boundary.
[Security](SECURITY.md) applies to every deployment.

## Install and run

```sh
cp .env.example .env
npm ci
npm run dev
```

For a built process, use `npm run build` then `npm start`.
The process binds only to localhost. Expose `/mcp` through an HTTPS reverse proxy
and add its public hostname to `MCP_ALLOWED_HOSTS`. Do not expose the Node port directly.

| Endpoint | Availability |
| --- | --- |
| `/mcp` | authenticated MCP v2 |
| `/healthz` | health/service/version |
| `/.well-known/oauth-protected-resource` | OAuth mode |
| `/.well-known/openai-apps-challenge` | only when an exact single-line `OPENAI_APPS_CHALLENGE_TOKEN` is configured |

The optional challenge route returns only the configured portal token and adds
no MCP capability. Publication is outside current scope. Never commit a real token.

## Configuration

`.env.example` is the maintained configuration example; `src/config.ts` validates it.

| Setting | Meaning / default |
| --- | --- |
| `GRIST_BASE_URL` | HTTPS Grist base URL; HTTP only for localhost development; no credentials, query or fragment; path prefixes are supported |
| `GRIST_ALLOWED_DOCUMENT_IDS`, `GRIST_ALLOWED_WORKSPACE_IDS` | comma-separated explicit ceilings; at least one required |
| `GRIST_CREDENTIAL_MODE` | `static` or `principal-map`; default `static` |
| `GRIST_API_KEY` | required in static credential mode; forbidden in principal-map mode |
| `GRIST_PRINCIPAL_CREDENTIALS_FILE` | required absolute path in principal-map mode |
| `MCP_AUTH_MODE` | `static` or `oauth`; default `static` |
| `MCP_BEARER_TOKEN` | static authentication only; random value of at least 32 characters; absent in OAuth mode |
| `OAUTH_ISSUER`, `OAUTH_JWKS_URI`, `MCP_RESOURCE_URI` | OAuth mode: HTTPS issuer, JWKS and canonical public `/mcp` resource |
| `MCP_CAPABILITIES` | static principal capability ceiling; default all three capabilities |
| `GRIST_MAX_READ_RECORDS` | `5000` |
| `GRIST_MAX_WRITE_RECORDS` | `500` |
| `GRIST_WRITE_BATCH_RECORDS` | positive sequential batch size; `200` |
| `GRIST_MAX_SCHEMA_ITEMS` | `100` |
| `MCP_PRINCIPAL_RATE_LIMIT_PER_MINUTE` | positive authenticated per-principal HTTP ceiling; `120` |
| `MCP_ALLOWED_HOSTS` | additional public hostnames; localhost is always allowed |
| `HOST`, `PORT` | localhost binding; `127.0.0.1`, `3000` |

OAuth URLs reject credentials and fragments, including an empty `#` delimiter.
Deployment probes require the `/mcp` resource without any query or fragment,
including empty `?`/`#` delimiters, exactly one HTTPS authorization server,
and exactly the three fixed scopes. Authenticated readiness validation requires
ten distinct valid tool entries. Encoded delimiters inside URL paths remain valid
where those paths are supported; a JWKS query remains permitted.

Zero disables the configurable read/write/schema count ceiling; use finite positive
limits in production. Fixed semantic bounds still apply. Exhausted rate limits
return HTTP 429 with `Retry-After`. The fixed-window limiter is process-local;
a globally coordinated multi-replica ceiling belongs to shared/proxy infrastructure.
Bound anonymous/pre-authentication traffic separately at the reverse-proxy edge.
Inbound request/header timeouts are 120/60
seconds and do not cap streaming-response duration.

## Production OAuth and upstream isolation

Gia is a provider-neutral OAuth resource server, not an authorization server.
Use an Authorization Code + PKCE flow with the configured resource audience.
Public scopes remain exactly `doc:read`, `doc:write`, `doc.schema:write`.
Logto can provide authorization and ProConnect an upstream identity source;
no provider-specific login logic is required in bridge core.
Self-contained JWTs are validated without online grant introspection: revoking an
authorization-server grant alone need not invalidate an already-issued unexpired
JWT. For an immediate Grist cutoff, revoke its native upstream credential or remove
its principal mapping and restart; never rely on client disconnection alone.

For multi-principal production, use native Grist service accounts and
`GRIST_CREDENTIAL_MODE=principal-map`. The protected JSON schema is:

```json
{
  "version": 1,
  "principals": {
    "oauth:<opaque-principal-id>": "<grist-service-account-api-key>"
  }
}
```

The file accepts only the runtime's opaque OAuth IDs, not raw provider subjects.
It is read/validated once at startup, never written or hot-reloaded by Gia.

1. Enable native Grist service accounts where required by the installed version.
2. Outside Gia, provision narrowly granted service accounts with finite expiry.
3. Capture keys directly into protected deployment secrets. Derive the opaque
   mapping key locally with `npm run credential:principal-id`, supplying validated
   `OAUTH_ISSUER` and `OAUTH_SUBJECT` through protected environment state; never
   put the subject/key in command arguments, chat, issues or probe output.
4. Mount the mapping read-only, omit `GRIST_API_KEY`, configure OAuth and restart.
5. Run offline preflight, public smoke and authenticated isolation checks.

For rotation, generate the replacement key through Grist, atomically replace the
secret mapping, restart, verify the new authority and confirm the old key is invalid.
For revocation, remove/revoke the account/key and mapping; expiry independently
cuts off native authority. Revoke promptly when a principal is removed.
An OAuth login never creates or grants a service account.

## Deployment checks and rollback

```sh
npm run check:oauth-deployment
MCP_RESOURCE_URI='https://mcp.example.org/mcp' npm run smoke:oauth-deployment
MCP_RESOURCE_URI='https://mcp.example.org/mcp' npm run probe:chatgpt-oauth-readiness
```

Supply protected environment values locally; use `node --env-file=.env --import tsx tools/oauth-deployment-preflight.ts` when loading an existing protected file.
The offline preflight prints fixed PASS/FAIL identifiers, performs no network/write
and rejects static upstream credentials as production multi-principal isolation.
It does not parse the mapping file; startup does.
Public smoke/readiness perform non-mutating metadata, health and challenge checks.
The optional authenticated readiness extension takes `OAUTH_ACCESS_TOKEN` through
protected environment state and only calls `tools/list` to check the ten tools and
OAuth schemes. It never prints the token or writes Grist.

Before release/deployment, require exact-head review and CI, run relevant native
regressions, build the reviewed tree, and retain the previous deployable version.
After deployment or rollback, repeat smoke plus bounded authenticated allowed,
denied and unmapped-principal checks. Never roll back by blindly replaying writes.
If qualification fails, stop routing traffic to the candidate, restore the prior
known-good application artifact/configuration and restart with the **current valid
secret state**. Secrets remain outside application artifacts: never restore revoked
or expired credentials/mappings from an old snapshot. Repeat smoke and qualification
reads before resuming traffic.
Record sanitized results in GitHub/CI, not as committed evidence documents.

## Logs and monitoring

`grist.ops` emits only fixed events and process-local counts: `rate_limited`,
`oauth_rejected`, `oauth_jwks_unavailable`, `grist_credential_resolution_failed`,
`mcp_internal_error`. Counters reset on restart; alert transport and durable
aggregation belong to deployment infrastructure.

`grist.audit` records timestamp, request ID, opaque principal, transport,
internal operation, capability, optional authorized document ID/item count,
status, duration and optional error type. Error-event document targets and
secret-bearing URLs are omitted. No payload, key or exception message is included.
Keep audit sinks access-controlled and enforce the applicable retention policy;
the publisher-operated service policy caps operational/audit retention at 30 days.
Do not reuse principal/document/request IDs, URLs, formula contents or free-form
error messages as general metric labels. Metrics must use bounded operation,
capability, status, route/dependency and error-class dimensions only.
