# OpenAI remote-MCP distribution package

**Status:** R5-E technical qualification is complete. R5-F public-submission preparation is active.

## Product submitted

The repository/runtime project remains `grist-chatgpt`: an independent **remote MCP-only** adaptation layer for one configured self-hosted Grist Community deployment. The public directory name is **Structured Workspace Builder**.

The product exposes exactly the ten tools documented in `docs/MCP-CONTRACT.md`; it does not ship a GPT Actions/OpenAPI compatibility surface, a custom ChatGPT UI, generic HTTP forwarding, raw SQL, arbitrary Grist `/apply`, account/ACL administration or a user-key onboarding flow.

The bridge authenticates MCP clients through OAuth and maps each production principal server-side to an operator-provisioned Grist Community service-account credential. Users do not enter Grist API keys into prompts or tool inputs. Grist remains authoritative for native resource permissions.

Structured Workspace Builder is independent and is not affiliated with, endorsed by, or sponsored by Grist Labs, DINUM or OpenAI. Grist is a trademark of Grist Labs, Inc.; references to Grist Community are descriptive compatibility references only.

## Current ten-tool package

The tracked `chatgpt-app-submission.json` and the live MCP endpoint cover exactly:

```text
grist_discover
grist_inspect
grist_query
grist_add_records
grist_change_records
grist_add_structure
grist_change_structure
grist_add_ui
grist_change_ui
grist_help
```

Repository tests lock tool names and risk annotations to the lean registry. The live MCP endpoint remains authoritative for input schemas, descriptions and OAuth `securitySchemes`; `test/oauth-tool-security.test.ts` locks each tool to its current capability (`doc:read`, `doc:write`, `doc.schema:write`, or no additional document scope for `grist_help`).

R5-E final evidence records an authenticated exact-candidate reviewer rerun exposing the ten-tool surface and exercising the canonical reviewer package.

## Canonical reviewer package

`docs/OPENAI-REVIEWER-TESTS.md` defines exactly five positive and three negative cases against one isolated synthetic reviewer fixture.

The positive cases cover:

1. semantic structure/UI inspection without row disclosure;
2. bounded filtering/sorting plus deterministic no-match behavior;
3. bounded record creation and ID-based verification;
4. bounded schema creation and semantic re-read;
5. page/widget creation, targeted select-by configuration and re-read verification.

The three negative cases require non-invocation for personal-calendar access, arbitrary HTTP forwarding and Grist account/ACL administration.

Final reviewer execution uses one dedicated reviewer OAuth identity, one synthetic document and one dedicated Grist Community service account. Credentials, tokens, raw OAuth subjects and service-account mappings remain outside the repository and model-visible data.

## Current public listing copy

### Display name

`Structured Workspace Builder`

### Short description

`Build and evolve structured workspaces`

### Long description

Inspect, structure and evolve documents on a configured self-hosted Grist Community deployment through ten bounded semantic MCP tools for data, schema, pages and widgets. Native Grist permissions remain authoritative, and credentials and secrets stay server-side. Independent project; not affiliated with Grist Labs, DINUM or OpenAI.

### Category

`PRODUCTIVITY`

### Starter prompts

Use these three bounded default prompts in the portal:

1. `Show me the Grist documents I can access and summarize the structure of the one I choose.`
2. `Inspect this Grist document and propose the smallest structural change needed for my goal.`
3. `Apply this requested change to the Grist document, then verify the resulting state.`

### Release notes

`First public release of the compact MCP v2 contract: ten bounded semantic tools to discover, inspect, query and change data, schema and document UI on a configured self-hosted Grist Community deployment, with OAuth, per-principal isolation and server-side Grist service accounts.`

## Public URLs

After the R5-F public-material change is integrated, use:

- website: `https://github.com/djibian/grist-chatgpt`;
- support: `https://github.com/djibian/grist-chatgpt/issues`;
- privacy: `https://github.com/djibian/grist-chatgpt/blob/main/PRIVACY.md`;
- terms: `https://github.com/djibian/grist-chatgpt/blob/main/TERMS.md`.

All are public HTTPS URLs.

## Privacy and data inventory

The plugin may process only data required by the requested operation:

- OAuth identity claims needed to authenticate and derive the opaque bridge principal;
- document/workspace/table/column/page/widget identifiers and metadata;
- Grist record values explicitly queried or mutated by the user request;
- bounded operation/audit metadata and secret-safe operational events.

The product does **not** intentionally expose or return OAuth bearer/refresh/ID tokens, authorization codes, PKCE verifiers, Grist API/service-account keys, raw principal-mapping contents, secret-manager data or internal server secrets. Principal-to-service-account mappings are operator-mounted protected deployment state.

The public Privacy Policy additionally excludes payment-card data subject to PCI DSS, protected health information, government identifiers and authentication secrets from the intended public-plugin data surface. Regulated sensitive/special-category personal data is not an intended public-plugin workload absent a lawful, necessary and explicitly disclosed basis.

The published privacy commitment sets public-deployment operational/audit-log retention to no more than 30 days. Final submission requires confirming that the deployment configuration matches that commitment.

## Publisher prerequisites

Operator-confirmed on 2026-09-30:

- individual OpenAI developer identity: verified;
- submitter: organization Owner;
- global-data-residency OpenAI project: available.

These are external publication facts, not runtime capabilities.

## OAuth/reviewer readiness established

R5-B records provider-neutral MCP OAuth behavior, protected-resource metadata, PKCE `S256`, resource binding, CIMD compatibility, fail-closed issuer/audience/scope handling and a reviewer-capable identity path.

R5-C records principal-to-Community-service-account selection, native least-privilege authority and fail-closed missing mappings. R5-D records rate bounds, secret-safe operational signals, controlled release/rollback, real JWKS outage/recovery and service-account rotation/revocation. R5-E records final exact-candidate reviewer qualification.

`docs/R5-F-OIDC-EVIDENCE.md` records the current authorization server advertising:

- a UserInfo endpoint;
- `openid` and `email` scopes;
- `email` and `email_verified` claims;
- PKCE `S256`.

## Domain verification route

`OPENAI_APPS_CHALLENGE_TOKEN` is optional deployment configuration.

- unset: `/.well-known/openai-apps-challenge` is not registered;
- set to the exact valid single-line portal token: that route returns only the token as `text/plain`;
- surrounding whitespace and line breaks are rejected;
- the token is never included in source, tool output, `/healthz`, logs or the tracked submission artifact.

Configure it only for the final portal-issued challenge. Domain verification itself remains an external R5-F action.

## Final Tool Scan boundary

Before public submission, the final production endpoint must receive a fresh portal **Scan Tools**. The scan, not a duplicated hand-maintained schema file, is authoritative for live names, descriptions, input/output schemas, annotations, `_meta` and per-tool OAuth security schemes.

Repository tests prevent regression to retired v1 names, and runtime tests keep the ten-tool registry and OAuth schemes aligned. A final successful scan on the chosen production hostname remains external evidence.

## R5-F remaining external gate

Repository code must not fabricate:

- the final portal-issued domain token or verification result;
- final Scan Tools output;
- reviewer credentials entered into the portal;
- demo-recording URL;
- OpenAI review outcome;
- final publish decision.

Current remaining operational/publication items are tracked in `docs/R5-F-PORTAL-CHECKLIST.md`.

OpenAI's current unofficial-connector rule remains a real review-time eligibility risk. Submission copy must remain factual about the bounded semantic workflow, one configured self-hosted Grist Community deployment and independent/non-official status. A rejection is evidence to record, not a reason to weaken security or imply an affiliation that does not exist.

## Final portal sequence

1. confirm public policy/support material and deployment log-retention commitment;
2. create/update the verified-individual public draft using **With MCP**;
3. enter the final production HTTPS MCP endpoint and OAuth configuration;
4. apply the exact portal-issued domain challenge token and verify the host;
5. run a fresh **Scan Tools** and resolve concrete blocking findings;
6. enter the listing, starter prompts, release notes and exact 5+3 reviewer cases;
7. upload an original non-infringing logo;
8. provide reviewer credentials and demo recording;
9. submit for review and record the actual outcome;
10. publish only after approval and an explicit release decision.
