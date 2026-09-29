# OpenAI remote-MCP distribution package

**Status:** R5-E technical package candidate for the frozen MCP v2 product. Public submission remains the external R5-F gate.

## Product submitted

`grist-chatgpt` is an independent **remote MCP-only** adaptation layer for one configured Grist Community deployment. It exposes exactly the ten tools documented in `docs/MCP-CONTRACT.md`; it does not ship a GPT Actions/OpenAPI compatibility surface, a custom ChatGPT UI, generic HTTP forwarding, raw SQL, arbitrary Grist `/apply`, account/ACL administration or a user-key onboarding flow.

The bridge authenticates ChatGPT/Codex through MCP OAuth and maps each production principal server-side to an operator-provisioned Grist Community service-account credential. Users do not enter Grist API keys into prompts or tool inputs. Grist remains authoritative for native resource permissions.

## Current ten-tool package

The tracked `chatgpt-app-submission.json` is derived from `src/mcp/leanRegistry.ts` and contains only:

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

Repository tests lock its names and risk annotations to the lean registry. The live MCP endpoint remains authoritative for input schemas, descriptions and OAuth `securitySchemes`; `test/oauth-tool-security.test.ts` locks each tool to its current capability (`doc:read`, `doc:write`, `doc.schema:write`, or no additional document scope for `grist_help`). R5-B already recorded an authenticated ChatGPT Tool Scan exposing exactly these ten tools.

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

## Listing copy

### Display name

`grist-chatgpt`

### Short description

`Concevoir des documents Grist`

### Long description

Inspecter, structurer et faire évoluer des documents Grist Community avec dix outils MCP sémantiques bornés pour les données, le schéma, les pages et les widgets. Grist reste l'autorité des permissions; les identifiants et secrets restent côté serveur. Projet indépendant, sans affiliation officielle à Grist Labs, DINUM ou OpenAI.

### Category

`PRODUCTIVITY`

### Starter prompts

Use at most these three bounded prompts in the portal:

1. `Montre-moi les documents Grist auxquels j’ai accès et leur structure.`
2. `Analyse ce document Grist et propose la plus petite modification nécessaire.`
3. `Ajoute cette évolution au document puis vérifie explicitement le résultat.`

### Release notes

`Première version publique du contrat MCP v2 compact : dix outils bornés pour découvrir, inspecter, interroger et modifier données, schéma et interface Grist Community, avec OAuth, isolation par principal et comptes de service Grist.`

## Privacy and data inventory

The plugin may process only data required by the requested Grist operation:

- OAuth identity claims needed to authenticate and derive the opaque bridge principal;
- document/workspace/table/column/page/widget identifiers and metadata;
- Grist record values explicitly queried or mutated by the user request;
- bounded operation/audit metadata and secret-safe operational events.

The product does **not** intentionally expose or return OAuth bearer/refresh/ID tokens, authorization codes, PKCE verifiers, Grist API/service-account keys, raw principal-mapping contents, secret-manager data or internal server secrets. Principal-to-service-account mappings are operator-mounted protected deployment state. Logging/retention must follow `docs/R5-D-OPERATIONS.md` and avoid model-visible secret material.

Public privacy/support/terms URLs and final retention commitments are publisher/deployment facts supplied in R5-F; the repository must not invent them.

## OAuth/reviewer readiness already established

R5-B records current provider-neutral MCP OAuth behavior, protected-resource metadata, PKCE `S256`, resource binding, CIMD compatibility, fail-closed issuer/audience/scope handling, a reviewer-capable Logto-native identity path and authenticated ChatGPT Tool Scan.

R5-C records principal-to-Community-service-account selection, native least-privilege authority and fail-closed missing mappings. R5-D records rate bounds, secret-safe operational signals, controlled release/rollback, real JWKS outage/recovery and service-account rotation/revocation.

These are production/security prerequisites, not substitutes for the final R5-E synthetic reviewer exercise.

## Domain verification route

`OPENAI_APPS_CHALLENGE_TOKEN` is optional deployment configuration.

- unset: `/.well-known/openai-apps-challenge` is not registered;
- set to the exact valid single-line portal token: that route returns only the token as `text/plain`;
- surrounding whitespace and line breaks are rejected;
- the token is never included in source, tool output, `/healthz`, logs or the tracked submission artifact.

Configure it only for the final portal-issued challenge. Domain verification itself is an external R5-F action.

## Final Tool Scan boundary

Before public submission, the final production endpoint must receive a fresh portal Tool Scan. The scan, not a duplicated hand-maintained schema file, is authoritative for the live names, descriptions, input/output schemas, annotations, `_meta` and per-tool OAuth security schemes.

Repository tests prevent the tracked package from regressing to retired v1 names, and current runtime tests keep the ten-tool registry and OAuth schemes aligned. A final successful Tool Scan on the chosen production hostname remains external evidence.

## R5-F external publication gate

Repository code must not fabricate any of the following:

- production hostname ownership or production secrets;
- final Grist service accounts/grants or reviewer credentials;
- institutional ProConnect authorization;
- a global-data-residency OpenAI publishing project;
- verified publisher/business identity or Apps Management permission;
- public website/support/privacy/terms URLs or demo recording;
- a third-party API/instance/branding authorization basis;
- the portal-issued domain token, final Tool Scan or review result;
- an approval/publish decision.

OpenAI's current unofficial-connector rule remains a review-time eligibility risk. Submission copy must stay factual about the bounded semantic product and its independent/non-official status. A rejection is evidence to record, not a reason to weaken security or imply an affiliation that does not exist.

## Final portal sequence

After R5-E technical integration and the final isolated reviewer exercise:

1. select the final production HTTPS MCP endpoint and deployment secrets;
2. provision final Community service accounts/grants and the reviewer identity/fixture;
3. configure final OAuth/publisher settings and required public policy/support URLs;
4. apply the exact portal-issued domain challenge token and verify the final host;
5. run a fresh Tool Scan and resolve concrete blocking findings;
6. enter the listing, starter prompts, release notes and exact 5+3 reviewer cases;
7. provide reviewer credentials and demo recording;
8. submit for review and record the actual outcome;
9. publish only after approval and an explicit release decision.
