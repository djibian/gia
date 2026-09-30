# OpenAI remote-MCP distribution package

**Status:** R5-E technical qualification is complete. R5-F public-submission work is **DEFERRED**. This file is retained as historical preparation and must not drive implementation or portal actions unless an explicit future product decision reactivates public distribution.

If publication is reactivated, revalidate every platform requirement, listing field, reviewer assumption, endpoint/deployment fact and sequence below against the then-current product and OpenAI rules before using it.

## Product submitted

The repository/runtime project remains `grist-chatgpt`: an independent **remote MCP-only** adaptation layer for one configured self-hosted Grist Community deployment. The prepared public directory name is **Gia by L’Œil du Maître**.

The prepared package exposes exactly the ten tools documented in `docs/MCP-CONTRACT.md`; it does not ship a GPT Actions/OpenAPI compatibility surface, a custom ChatGPT UI, generic HTTP forwarding, raw SQL, arbitrary Grist `/apply`, account/ACL administration or a user-key onboarding flow.

The bridge authenticates MCP clients through OAuth and maps each production principal server-side to an operator-provisioned Grist Community service-account credential. Users do not enter Grist API keys into prompts or tool inputs. Grist remains authoritative for native resource permissions.

Gia by L’Œil du Maître is independent and is not affiliated with, endorsed by, or sponsored by Grist Labs, DINUM or OpenAI. Grist is a trademark of Grist Labs, Inc.; references to Grist Community are descriptive compatibility references only.

## Prepared ten-tool package

The tracked `chatgpt-app-submission.json` and the prepared MCP endpoint covered exactly:

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

## Canonical reviewer package snapshot

`docs/OPENAI-REVIEWER-TESTS.md` defines exactly five positive and three negative cases against one isolated synthetic reviewer fixture.

The positive cases cover:

1. semantic structure/UI inspection without row disclosure;
2. bounded filtering/sorting plus deterministic no-match behavior;
3. bounded record creation and ID-based verification;
4. bounded schema creation and semantic re-read;
5. page/widget creation, targeted select-by configuration and re-read verification.

The three negative cases require non-invocation for personal-calendar access, arbitrary HTTP forwarding and Grist account/ACL administration.

The prepared reviewer execution used one dedicated reviewer OAuth identity, one synthetic document and one dedicated Grist Community service account. Credentials, tokens, raw OAuth subjects and service-account mappings remain outside the repository and model-visible data.

## Prepared public listing copy

The values below are historical preparation, not current submission instructions. Revalidate or replace them if publication is explicitly reactivated.

### Display name

`Gia by L’Œil du Maître`

### Short description

`Build and evolve Grist Community applications`

### Long description

Inspect, structure and evolve documents on a configured self-hosted Grist Community deployment through ten bounded semantic MCP tools for data, schema, pages and widgets. Native Grist permissions remain authoritative, and credentials and secrets stay server-side. Independent project; not affiliated with Grist Labs, DINUM or OpenAI.

### Category

`PRODUCTIVITY`

### Starter prompts

Prepared prompts:

1. `Show me the Grist documents I can access and summarize the structure of the one I choose.`
2. `Inspect this Grist document and propose the smallest structural change needed for my goal.`
3. `Apply this requested change to the Grist document, then verify the resulting state.`

### Release notes

`First public release of the compact MCP v2 contract: ten bounded semantic tools to discover, inspect, query and change data, schema and document UI on a configured self-hosted Grist Community deployment, with OAuth, per-principal isolation and server-side Grist service accounts.`

## Prepared public URLs

If publication is explicitly reactivated, revalidate the repository identity and then update these URLs as needed:

- website: `https://github.com/djibian/grist-chatgpt`;
- support: `https://github.com/djibian/grist-chatgpt/issues`;
- privacy: `https://github.com/djibian/grist-chatgpt/blob/main/PRIVACY.md`;
- terms: `https://github.com/djibian/grist-chatgpt/blob/main/TERMS.md`.

## Prepared public MCP endpoint

The endpoint prepared during R5-F was:

`https://gia.loeildumaitre.fr/mcp`

The historical qualification hostname `grist-chatgpt.loeildumaitre.fr` was not intended for final portal domain verification. This endpoint choice does not constrain future product evolution; if publication is reactivated, verify the then-current endpoint, OAuth resource/audience/public-host configuration and deployment before any portal action.

## Privacy and data inventory

The plugin may process only data required by the requested operation:

- OAuth identity claims needed to authenticate and derive the opaque bridge principal;
- document/workspace/table/column/page/widget identifiers and metadata;
- Grist record values explicitly queried or mutated by the user request;
- bounded operation/audit metadata and secret-safe operational events.

The product does **not** intentionally expose or return OAuth bearer/refresh/ID tokens, authorization codes, PKCE verifiers, Grist API/service-account keys, raw principal-mapping contents, secret-manager data or internal server secrets. Principal-to-service-account mappings are operator-mounted protected deployment state.

The public Privacy Policy additionally excludes payment-card data subject to PCI DSS, protected health information, government identifiers and authentication secrets from the intended public-plugin data surface. Regulated sensitive/special-category personal data is not an intended public-plugin workload absent a lawful, necessary and explicitly disclosed basis.

The published privacy commitment sets public-deployment operational/audit-log retention to no more than 30 days. A future submission would need to reconfirm that the then-current deployment matches any then-current privacy commitment.

## Publisher prerequisites snapshot

Operator-confirmed on 2026-09-30:

- individual OpenAI developer identity: verified;
- submitter: organization Owner;
- global-data-residency OpenAI project: available.

These are historical external publication facts, not runtime capabilities, and must be revalidated if publication is resumed.

## OAuth/reviewer readiness established

R5-B records provider-neutral MCP OAuth behavior, protected-resource metadata, PKCE `S256`, resource binding, CIMD compatibility, fail-closed issuer/audience/scope handling and a reviewer-capable identity path.

R5-C records principal-to-Community-service-account selection, native least-privilege authority and fail-closed missing mappings. R5-D records rate bounds, secret-safe operational signals, controlled release/rollback, real JWKS outage/recovery and service-account rotation/revocation. R5-E records final exact-candidate reviewer qualification.

`docs/R5-F-OIDC-EVIDENCE.md` records the authorization-server state observed during the 2026-09 publication-preparation snapshot.

## Domain verification route

`OPENAI_APPS_CHALLENGE_TOKEN` is optional deployment configuration.

- unset: `/.well-known/openai-apps-challenge` is not registered;
- set to the exact valid single-line portal token: that route returns only the token as `text/plain`;
- surrounding whitespace and line breaks are rejected;
- the token is never included in source, tool output, `/healthz`, logs or the tracked submission artifact.

Do not configure a portal challenge merely because this preparation exists. Configure it only after explicit publication reactivation and receipt of the then-current portal challenge.

## Tool Scan boundary

A future public submission would require whatever fresh tool scan or equivalent validation the platform requires at that time. The historical R5-F scan assumptions do not constrain future tool count, names, schemas, annotations or security metadata.

Repository tests continue to protect the product contract independently of publication.

## Deferred R5-F external actions

No remaining publication action is active work. Historical preparation identified actions such as:

- portal-issued domain verification;
- final tool scanning;
- reviewer credential handoff;
- demo recording;
- OpenAI review;
- explicit publish decision.

These are preserved only as a planning snapshot in `docs/R5-F-PORTAL-CHECKLIST.md`. They must not be executed unless public distribution is explicitly reactivated.

## Historical portal sequence — DO NOT EXECUTE WHILE R5-F IS DEFERRED

The sequence below records the 2026-09 preparation state only. If publication is later reactivated, replace it with a freshly validated sequence rather than assuming these steps remain current.

1. establish and validate the chosen final production endpoint;
2. confirm public policy/support material and deployment retention commitments;
3. create/update the appropriate public draft;
4. enter the production MCP endpoint and authentication configuration;
5. complete the then-current domain-verification mechanism;
6. run the then-current tool scan and resolve blocking findings;
7. enter listing/reviewer material;
8. provide required original branding assets;
9. provide reviewer access and demonstration material;
10. submit for review and record the actual outcome;
11. publish only after approval and an explicit release decision.
