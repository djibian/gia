# R5-F OIDC publication-readiness evidence

Date: 2026-09-29

This document records sanitized publication-readiness evidence for the production OAuth/OIDC path used by the current remote MCP endpoint. It contains no client secret, token, credential, raw OAuth subject or principal-map content.

## Endpoint identity

Observed MCP protected resource:

- resource: `https://grist-chatgpt.loeildumaitre.fr/mcp`
- authorization server count: `1`
- authorization server issuer: `https://auth-poc.loeildumaitre.fr/oidc`
- discovery document: `https://auth-poc.loeildumaitre.fr/oidc/.well-known/openid-configuration`

## OpenAI workspace-domain compatibility checks

The current authorization server discovery metadata was checked against the publication requirements documented by OpenAI for OAuth-backed remote MCP plugins.

Observed result:

- UserInfo endpoint advertised: **PASS**
- `openid` scope advertised: **PASS**
- `email` scope advertised: **PASS**
- `email` claim advertised: **PASS**
- `email_verified` claim advertised: **PASS**
- PKCE `S256` advertised: **PASS**

The OIDC discovery issuer matched the configured authorization-server URL.

## Boundary of this evidence

This proves that the current OIDC provider advertises the protocol capabilities OpenAI currently requires for workspace domain restrictions on OAuth-backed plugins.

It does not claim that:

- a final OpenAI publisher identity is verified;
- Apps Management write permission is granted;
- the publishing project has global data residency;
- the final public plugin name/listing is accepted;
- final domain verification or Tool Scan has been completed for the publication draft;
- reviewer credentials or the final review result exist.

Those remain R5-F external publication actions.