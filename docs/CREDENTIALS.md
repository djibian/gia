# Grist credential boundary

The runtime obtains upstream Grist credentials only through `GristCredentialProvider`; model-facing services never read, accept or return Grist API keys.

## Credential modes

### Controlled single-principal / development

`GRIST_CREDENTIAL_MODE=static` uses `StaticApiKeyCredentialProvider` and requires server-side `GRIST_API_KEY`.

This mode intentionally resolves the same upstream key for its controlled deployment principal. It is useful for local development, probes and a deliberately single-principal deployment. It is **not** production multi-principal upstream isolation.

### Production multi-principal

`GRIST_CREDENTIAL_MODE=principal-map` uses `FilePrincipalApiKeyCredentialProvider`.

Required environment:

```dotenv
GRIST_CREDENTIAL_MODE=principal-map
GRIST_PRINCIPAL_CREDENTIALS_FILE=/run/secrets/grist-principals.json
```

`GRIST_API_KEY` must be absent in this mode. The bridge therefore has no shared-key fallback when a principal is missing.

The operator-mounted JSON file has one deliberately small schema:

```json
{
  "version": 1,
  "principals": {
    "oauth:<opaque-sha256-principal-id>": "<grist-service-account-api-key>"
  }
}
```

Only opaque bridge OAuth principal IDs are accepted as keys. Raw Logto/ProConnect subject identifiers do not belong in this file.

The provider reads and validates the file once at process startup, copies it into an in-memory map and never writes or hot-reloads it. A missing file, malformed document, malformed principal ID, blank key or unmapped principal fails closed with a secret-safe error. Rotation is therefore an operator-side atomic secret replacement followed by a controlled restart.

The mapping must be supplied by protected deployment state and mounted read-only. Suitable sources include systemd credentials, Docker/Kubernetes-style secrets or another secret manager that can materialize the file. The repository does not implement a secret database.

### Deriving the opaque principal mapping key

The mapping key is exactly the same non-reversible identifier produced by the runtime from the already-validated OAuth issuer + subject pair. An operator may derive it locally without printing the raw subject:

```sh
export OAUTH_ISSUER='<validated OAuth issuer>'
read -rsp 'OAuth subject: ' OAUTH_SUBJECT; export OAUTH_SUBJECT; echo
npm run credential:principal-id
unset OAUTH_SUBJECT
```

The helper prints only `principal_id: oauth:<opaque-hash>` and emits a generic failure status otherwise. Do not pass the raw subject as a command-line argument or copy it into tickets, GitHub, chat or durable evidence. Obtain issuer/subject only from the protected authorization-server/operator context used to provision the identity.

## Grist Community service accounts

R5-C adapts Grist Community's native service-account primitive instead of collecting users' personal API keys.

Current Grist Community behavior reviewed on 2026-09-28:

- service accounts are gated by `GRIST_ENABLE_SERVICE_ACCOUNTS`;
- `POST /api/service-accounts` creates an account with `label`, `description` and `expiresAt`, returning its API key;
- each service account is a Grist user with its own native resource grants;
- `POST /api/service-accounts/{saId}/apikey` rotates/generates the account key;
- `DELETE /api/service-accounts/{saId}/apikey` invalidates its key;
- deleting or expiring the service account independently removes upstream authority.

Reference implementation: `gristlabs/grist-core`, Apache-2.0, service-account routes in `app/gen-server/ApiServer.ts` (reviewed current upstream revision `531501d33c7e8fa801bd94b3a2ec9e7b65d7341a`).

Decision: **ADAPT** the native Grist identity/grant/rotation model, while **REIMPLEMENTING** only the tiny bridge-side read-only principal selector. No Grist server code is copied and no service-account/ACL administration becomes model-facing.

## Operator provisioning sequence

1. Enable `GRIST_ENABLE_SERVICE_ACCOUNTS` on the controlled Grist Community instance.
2. Using an operator account outside the bridge, create a narrowly scoped service account with a finite `expiresAt`.
3. Grant that service-account user only the required Grist documents/workspaces using native Grist sharing/access controls.
4. Capture the returned API key directly into the deployment secret mechanism. Never place it in chat, GitHub, logs or an MCP field.
5. Derive the target opaque OAuth principal ID with `npm run credential:principal-id`, then map that ID to the service-account key in the protected JSON file.
6. Mount the file read-only, remove `GRIST_API_KEY`, select `GRIST_CREDENTIAL_MODE=principal-map`, then restart the bridge.
7. Run `npm run check:oauth-deployment`; production OAuth readiness requires `multi_principal_grist_credentials: PASS`.
8. For rotation, generate the service account's replacement key, atomically replace the mounted secret file, restart the bridge, verify the new path, then ensure the old key no longer authorizes requests.
9. For revocation, delete the service-account key or account (and remove its mapping). Expiry remains a Grist-native independent cutoff.

Service-account creation, grants, expiry, rotation and revocation are operator-side administration. `grist-chatgpt` only consumes the resulting secret mapping.

## Principal isolation

`GristContextFactory` constructs a fresh credential-derived `GristClient`, resource discovery/cache, access policy and authorized service graph for each principal context. `FilePrincipalApiKeyCredentialProvider` selects only the exact current principal's service-account key.

Effective authority remains:

```text
native service-account Grist permissions
∩ deployment document/workspace ceiling
∩ OAuth principal resource grant
∩ required MCP capability
```

The bridge cannot elevate a service account beyond Grist's own grants.

## R5-C live proof

R5-C repository implementation is integrated in #182 and the required live multi-principal proof was completed on 2026-09-29 against an authorized self-hosted Grist Community 1.7.19 deployment.

`docs/R5-C-LIVE-EVIDENCE.md` records the sanitized evidence that:

- two authenticated OAuth principals resolved to distinct upstream service-account authority;
- each principal observed only the Grist resources granted to its selected service account, with an explicit cross-resource denial recorded for principal B;
- the native A/B service-account matrix independently produced the expected allow/deny results;
- removing principal B from the immutable startup mapping caused its still-valid OAuth session to fail closed while `GRIST_API_KEY` was absent;
- restoring the exact mapping and restarting restored only B's intended authority;
- no credential value or raw provider subject was recorded in durable evidence.

R5-D owns the still-required exercised rotation/revocation and broader operational hardening work; those are no longer R5-C completion blockers.
