# R5-F — current OpenAI public-plugin requirements audit

Date: 2026-09-29  
Repository baseline: `0d9f14485c189fa7efe14302b05130a22ff1f66d`  
Scope: public distribution of the frozen remote MCP v2 candidate. This audit does not change runtime behavior, the MCP contract, authorization, credentials or roadmap eligibility.

## Current OpenAI publication model

As of this audit, OpenAI publishes public integrations through the universal **Plugins Directory** shared by ChatGPT and Codex. A public plugin may be **remote MCP-only**; custom UI and bundled skills are optional.

Primary current references:

- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/deploy/app-review
- https://developers.openai.com/plugins/deploy/submission-errors
- https://developers.openai.com/plugins/app-guidelines
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/build/mcp-server
- https://openai.com/brand/
- https://openai.com/policies/developer-apps-terms/

The former app-oriented tracked `chatgpt-app-submission.json` remains useful as an internal regression/reviewer fixture, but the current public submission source of truth is the live MCP scan plus portal fields.

## Current required external submission material

For a remote MCP public plugin, the current portal requires or enforces:

- stable publicly reachable production HTTPS MCP endpoint;
- successful domain-verification challenge at `/.well-known/openai-apps-challenge`;
- current successful Tool Scan;
- accurate tool schemas, OAuth security schemes, `readOnlyHint`, `openWorldHint` and `destructiveHint`, with justifications;
- verified individual or business publisher identity;
- Apps Management write permission (`api.apps.write`); organization owners already have it;
- a publishing project eligible for MCP review: projects with EU data residency are currently not eligible, so use global data residency;
- public plugin name, short and long descriptions, developer name, category, logo, website, support, privacy-policy and terms URLs;
- up to three starter prompts;
- exactly five positive and three negative test cases;
- release notes;
- countries/regions of availability;
- reviewer-ready demo credentials when OAuth is used, with no MFA, SMS/email confirmation or private-network dependency;
- demo-recording URL showing the main workflows/tools;
- policy attestations and actual review approval before publication.

For OAuth integrations, OpenAI additionally documents workspace-domain-restriction support through OIDC discovery with enabled `openid` and `email` scopes and a UserInfo Endpoint returning `email` and `email_verified: true`. This must be verified against the deployed Logto configuration before submission; do not assume it from provider choice alone.

## Fit of the current R5-E candidate

| Requirement | Current state | R5-F action |
| --- | --- | --- |
| Remote MCP-only publication | PASS | No skill/UI is required merely for publication. |
| Stable public HTTPS MCP endpoint | PASS candidate | Keep the final origin stable; changing origin after publication requires a new plugin. |
| MCP v2 ten-tool contract | PASS | Preserve the frozen contract. |
| Accurate read/write/destructive/open-world annotations | PASS | Confirm again in final portal Tool Scan. |
| Exactly five positive + three negative cases | PASS | Reuse the R5-E reviewer package. |
| Reviewer identity without operator-only MFA | PASS | Preserve/refresh credentials through review. |
| Domain challenge route | PASS in runtime | Apply only the real portal-issued token. |
| Secret-safe logging / bounded authority | PASS | Preserve current deployment controls. |
| Current Tool Scan | PENDING external | Run in the final public draft after domain/OAuth setup. |
| Verified publisher identity | PENDING external | Verify individual or business identity in OpenAI Platform. |
| Apps Management / publishing project | PENDING external | Confirm permission and global-data-residency project. |
| Website/support/privacy/terms URLs | PENDING external | Publish truthful public pages before submission. |
| Logo | PENDING | Use an original production-ready asset; do not reuse OpenAI or Grist marks without rights. |
| Demo recording | PENDING external | Record final workflows against reviewer-safe synthetic data. |
| Country availability | PENDING external | Select intended countries in portal. |
| OAuth OIDC UserInfo/openid/email | VERIFY | Inspect deployed Logto discovery and UserInfo capability. |
| Restricted-data boundary | NEEDS PUBLIC POLICY | Public use must exclude PCI data, PHI, government identifiers and authentication secrets; deployment grants should avoid documents containing such data. |
| Third-party/unofficial-connector eligibility | REVIEW-TIME RISK | Keep positioning factual: independent software for an operator-controlled self-hosted Grist Community deployment; do not imply Grist Labs/DINUM/OpenAI endorsement. |

## Two current deltas from the R5-E package

### 1. Public name must not use the ChatGPT/GPT brand

OpenAI's current brand guidance does not permit the GPT brand in application/product/developer/company names. The repository may remain named `grist-chatgpt`, but the **public plugin display/product name must change** before submission.

Do not solve this by implying official Grist affiliation. The public name and copy must remain accurate and independent.

### 2. Restricted-data use must be explicitly excluded

Current plugin privacy rules prohibit collecting, soliciting or processing restricted data including:

- PCI DSS payment-card information;
- protected health information (PHI);
- government identifiers;
- credentials/authentication secrets.

The public privacy policy and terms must state this boundary, and the production Grist authority granted to public/reviewer principals should be limited to appropriate non-restricted documents. Do not add a broad content-inspection subsystem merely to satisfy publication; least-privilege document grants plus explicit terms/policy are the first-line product boundary unless OpenAI review produces a concrete additional requirement.

## Privacy-policy minimum content

The published policy must accurately describe at least:

- categories of personal/user data processed;
- purposes of processing;
- recipient categories;
- retention periods;
- user controls/deletion/contact path;
- explicit restricted-data exclusions.

Current product data categories already documented by R5-E are:

- OAuth identity claims needed for authentication and opaque principal derivation;
- Grist document/workspace/table/column/page/widget identifiers and metadata needed for requested operations;
- Grist record values explicitly queried or mutated by the user request;
- bounded secret-safe operational/audit metadata.

The bridge must continue not to expose bearer/refresh/ID tokens, authorization codes, PKCE verifiers, Grist API/service-account keys, principal-map contents or deployment secrets.

The R5-D runbook recommends short retention and gives 30 days as a conservative default, but the public policy must record the operator's actual chosen retention commitment rather than silently promote a documentation example into a legal promise.

## Public-name / branding recommendation

Keep the source repository name `grist-chatgpt` unchanged. For the directory, use an independent name that does not contain OpenAI/ChatGPT/GPT branding and do not use third-party logos without permission. The listing can truthfully state that it works with a configured self-hosted Grist Community deployment and is independent of Grist Labs, DINUM and OpenAI.

A final public display name is an external publisher decision; changing only the listing name does not require changing the MCP runtime.

## Third-party authorization / unofficial-connector risk

OpenAI currently states that it cannot approve plugins whose primary function is an unofficial connector to a third-party service. This remains the principal review-time eligibility risk.

Facts supporting truthful review positioning:

- the target is an operator-controlled **self-hosted Grist Community** deployment, not arbitrary pass-through access to getgrist.com;
- Grist Community (`grist-core`) is open source under Apache-2.0 and documents public API/extensibility;
- `grist-chatgpt` exposes a finite semantic application-construction surface rather than generic HTTP forwarding, raw SQL, arbitrary `/apply` or arbitrary UserActions;
- native Grist permissions remain authoritative;
- the project explicitly states that it is independent and not officially affiliated.

These facts do not guarantee OpenAI approval and must not be presented as pre-approval or Grist trademark authorization. If review requires a specific rights/authorization basis, obtain and record that evidence rather than changing wording to conceal the integration.

## Minimal R5-F execution sequence

1. **VERIFY OIDC** — inspect current Logto discovery for `openid`, `email`, UserInfo and verified-email capability.
2. **PUBLISHER DECISIONS** — choose verified individual/business identity, public plugin name, support/contact identity, actual log-retention commitment and intended countries.
3. **PUBLIC MATERIAL** — publish website/support/privacy/terms pages and an original logo; prepare the demo script.
4. **OPENAI PLATFORM** — use the publishing organization/project, verify identity, confirm Apps Management write and global data residency.
5. **CREATE DRAFT** — create a public plugin draft with **With MCP**, using the stable production HTTPS endpoint.
6. **DOMAIN + OAUTH** — apply the actual portal challenge token and configure reviewer authentication.
7. **SCAN TOOLS** — run current Tool Scan and resolve only concrete findings.
8. **REVIEW MATERIAL** — enter listing copy, starter prompts, exact 5+3 cases, release notes, countries, reviewer credentials and demo-recording URL.
9. **SUBMIT** — submit for review; record the actual response/finding.
10. **PUBLISH** — only after approval and an explicit publisher decision.

## Non-goals during R5-F

Do not add a skill, custom UI, general HTTP proxy, generic ACL administration, new public MCP tool, extra test platform or speculative capability solely because the current product is moving from the old app vocabulary to Plugins Directory publication.

Any review rejection or concrete portal finding becomes new evidence. Fix only the smallest demonstrated issue and preserve the frozen MCP v2/security boundary unless the finding proves a product change is necessary.
