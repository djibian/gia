# R5-F public plugin portal checklist — historical/deferred snapshot

Date: 2026-09-30

**Status: DEFERRED.** This file records the publication-preparation state reached on 2026-09-30. It is historical planning/evidence, not an active checklist. Do not execute its portal steps unless an explicit future product decision reactivates public distribution.

If publication is reactivated, revalidate every requirement, listing field, endpoint, reviewer assumption and sequence against the then-current product and platform rules before using this snapshot.

## Publisher prerequisites snapshot

Observed/confirmed during the 2026-09 preparation:

- Individual developer identity: **VERIFIED** (operator-confirmed in OpenAI Platform).
- Submitter role: **Organization Owner** (operator-confirmed; included Apps Management authority at that time).
- OpenAI project: **Global data residency available** (operator-confirmed).
- OAuth/OIDC workspace-domain support: **PASS**, recorded in `docs/R5-F-OIDC-EVIDENCE.md`.
- Public deployment journal retention: **PASS** — `systemd-journald` was configured with `MaxRetentionSec=30day`, matching the published privacy commitment at that time.
- Gia public MCP hostname deployment and non-secret OAuth smoke: **PASS**, recorded in `docs/R5-F-GIA-LIVE-EVIDENCE.md`.

These facts may become stale and do not constitute active submission prerequisites until publication is explicitly resumed and revalidated.

## Prepared public listing identity

Prepared public plugin name:

`Gia by L’Œil du Maître`

Short name:

`Gia`

Repository/internal runtime name at the time remained `grist-chatgpt`.

Rationale recorded during preparation:

- avoids `GPT` / `ChatGPT` in the public product name;
- avoids using the Grist trademark as the product's own brand;
- ties the public identity to the publisher's existing `loeildumaitre.fr` domain;
- Grist Community is referenced only descriptively as the compatible target platform.

Prepared short description:

`Build and evolve Grist Community applications`

Prepared long description:

`Inspect, structure and evolve documents on a configured self-hosted Grist Community deployment through ten bounded semantic MCP tools for data, schema, pages and widgets. Native Grist permissions remain authoritative, and credentials and secrets stay server-side. Independent project; not affiliated with Grist Labs, DINUM or OpenAI.`

Prepared category:

`PRODUCTIVITY`

All listing copy must be revalidated if publication is resumed.

## Prepared public URLs

The 2026-09 preparation used:

- Website: `https://github.com/djibian/grist-chatgpt`
- Support: `https://github.com/djibian/grist-chatgpt/issues`
- Privacy: `https://github.com/djibian/grist-chatgpt/blob/main/PRIVACY.md`
- Terms: `https://github.com/djibian/grist-chatgpt/blob/main/TERMS.md`

These URLs are not frozen product requirements and may be superseded by later naming/hosting changes.

## Prepared starter prompts

1. `Show me the Grist documents I can access and summarize the structure of the one I choose.`
2. `Inspect this Grist document and propose the smallest structural change needed for my goal.`
3. `Apply this requested change to the Grist document, then verify the resulting state.`

## Prepared release notes

`First public release of the compact MCP v2 contract: ten bounded semantic tools to discover, inspect, query and change data, schema and document UI on a configured self-hosted Grist Community deployment, with OAuth, per-principal isolation and server-side Grist service accounts.`

## Reviewer package snapshot

The prepared package used:

- exactly five positive cases P1-P5 from `docs/OPENAI-REVIEWER-TESTS.md`;
- exactly three negative non-invocation cases N1-N3;
- one dedicated reviewer OAuth identity;
- one synthetic reviewer Grist document;
- one dedicated least-privilege Grist Community service account.

R5-E final evidence records exact-candidate execution of that package. Future product changes may invalidate it; a future submission must rebuild/revalidate reviewer material rather than preserving this shape.

## Prepared public MCP hostname

The endpoint prepared during R5-F was:

`https://gia.loeildumaitre.fr/mcp`

The historical qualification hostname `grist-chatgpt.loeildumaitre.fr` was not intended for final portal verification.

The Gia hostname deployment and OAuth smoke are historical evidence only. Endpoint, resource URI, authorization-server details, tool count and deployment topology may all change before any future publication attempt.

## Historical portal sequence — DO NOT EXECUTE WHILE DEFERRED

At the moment R5-F was deferred, the preparation sequence was:

1. **DONE at snapshot time** — establish and validate `gia.loeildumaitre.fr` as the HTTPS MCP hostname.
2. **DONE at snapshot time** — preserve the verified `MaxRetentionSec=30day` deployment retention setting.
3. Create or update the public draft in the selected publisher organization/project.
4. Select the applicable MCP submission mode and enter the chosen endpoint.
5. Configure authentication using the then-current provider.
6. Complete the then-current portal/domain verification mechanism.
7. Run a fresh tool scan against the chosen production endpoint.
8. Check the scanned tools against the then-current product contract.
9. Enter the listing metadata and URLs.
10. Provide an original non-infringing logo if required.
11. Provide availability countries/regions if required.
12. Enter reviewer cases appropriate to the then-current product.
13. Provide ready-to-use reviewer access that satisfies then-current review requirements.
14. Provide a demo recording if required.
15. Enter release notes and policy attestations.
16. Submit for review.
17. Record the actual review result before changing product scope in response to it.
18. Publish only after approval and an explicit release decision.

This sequence is not active. Revalidate and replace it if publication is explicitly reactivated.

## Historical remaining items at deferral

At deferral time, the remaining publication-only items included:

- final public logo;
- demo recording URL;
- portal-issued domain challenge;
- fresh final tool scan;
- reviewer credential handoff;
- country/region availability selection;
- actual OpenAI review and explicit publish decision.

None of these items is a current product blocker or active roadmap obligation.

The third-party/unofficial-connector eligibility question recorded during preparation remains historical review-risk context only. Any future submission must assess the then-current rules and keep its wording truthful and non-affiliative.
