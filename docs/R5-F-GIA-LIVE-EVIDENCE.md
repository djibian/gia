# R5-F Gia live activation evidence

Date: 2026-09-30

This document records operator-observed production activation evidence for the final public Gia MCP hostname. It does not claim independent external verification or OpenAI approval.

## Final public endpoint

`https://gia.loeildumaitre.fr/mcp`

Observed DNS result from the production VPS:

```text
51.38.177.7
```

## Activation result

The prepared `/usr/local/sbin/activate-gia` procedure was executed after DNS propagation. It performed the production bridge restart, offline OAuth deployment preflight, Caddy configuration validation/reload, HTTPS availability check, public OAuth smoke checks and protected-resource metadata read.

Observed bridge state:

```text
grist-chatgpt: active
```

Observed offline preflight:

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

Caddy reported a valid configuration and remained active. Two transient TLS connection errors occurred while certificate/TLS state was becoming available; the activation loop subsequently reached HTTPS PASS and continued successfully.

Observed public OAuth smoke:

```text
health_endpoint: PASS
protected_resource_metadata: PASS
metadata_resource_binding: PASS
metadata_authorization_server: PASS
metadata_scopes: PASS
unauthenticated_mcp_challenge: PASS
```

Observed protected-resource metadata:

```json
{
  "resource": "https://gia.loeildumaitre.fr/mcp",
  "authorization_servers": ["https://auth-poc.loeildumaitre.fr/oidc"],
  "scopes_supported": ["doc:read", "doc:write", "doc.schema:write"]
}
```

## Interpretation

For the operator-observed production activation:

- the final Gia hostname resolves to the production VPS;
- the bridge accepts the Gia hostname and canonical resource URI;
- the production reverse proxy configuration is valid and HTTPS became available;
- protected-resource metadata binds exactly to `https://gia.loeildumaitre.fr/mcp`;
- the expected authorization server and three MCP scopes are advertised;
- unauthenticated MCP access returns the expected OAuth challenge;
- all non-secret public OAuth smoke checks pass.

The public MCP hostname deployment/smoke blocker in `docs/R5-F-PORTAL-CHECKLIST.md` is therefore satisfied. Remaining submission work is portal/reviewer material and OpenAI review, including the portal domain challenge, fresh Tool Scan, logo, demo recording, country availability and reviewer credential handoff.
