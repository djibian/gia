# R5-F public plugin portal checklist

Date: 2026-09-30

This checklist records the current publication state for the public remote-MCP submission. It does not claim OpenAI approval.

## Publisher prerequisites

- Individual developer identity: **VERIFIED** (operator-confirmed in OpenAI Platform).
- Submitter role: **Organization Owner** (operator-confirmed; includes Apps Management authority).
- OpenAI project: **Global data residency available** (operator-confirmed).
- OAuth/OIDC workspace-domain support: **PASS**, recorded in `docs/R5-F-OIDC-EVIDENCE.md`.
- Public deployment journal retention: **PASS** — `systemd-journald` is explicitly configured with `MaxRetentionSec=30day`, matching the published privacy commitment.
- Final Gia public MCP hostname deployment and non-secret OAuth smoke: **PASS**, recorded in `docs/R5-F-GIA-LIVE-EVIDENCE.md`.

## Public listing identity

Validated public plugin name:

`Gia by L’Œil du Maître`

Short name:

`Gia`

Repository/internal runtime name remains `grist-chatgpt`.

Rationale:

- avoids `GPT` / `ChatGPT` in the public product name;
- avoids using the Grist trademark as the product's own brand;
- ties the public identity to the publisher's existing `loeildumaitre.fr` domain;
- Grist Community is referenced only descriptively as the compatible target platform.

Default short description:

`Build and evolve Grist Community applications`

Default long description:

`Inspect, structure and evolve documents on a configured self-hosted Grist Community deployment through ten bounded semantic MCP tools for data, schema, pages and widgets. Native Grist permissions remain authoritative, and credentials and secrets stay server-side. Independent project; not affiliated with Grist Labs, DINUM or OpenAI.`

Category:

`PRODUCTIVITY`

## Public URLs

Use:

- Website: `https://github.com/djibian/grist-chatgpt`
- Support: `https://github.com/djibian/grist-chatgpt/issues`
- Privacy: `https://github.com/djibian/grist-chatgpt/blob/main/PRIVACY.md`
- Terms: `https://github.com/djibian/grist-chatgpt/blob/main/TERMS.md`

All are public HTTPS URLs. The historical repository name is an open-source project identifier; the public directory listing and hosted service use the separate `Gia by L’Œil du Maître` identity.

## Starter prompts

Use these three initial prompts:

1. `Show me the Grist documents I can access and summarize the structure of the one I choose.`
2. `Inspect this Grist document and propose the smallest structural change needed for my goal.`
3. `Apply this requested change to the Grist document, then verify the resulting state.`

## Release notes

`First public release of the compact MCP v2 contract: ten bounded semantic tools to discover, inspect, query and change data, schema and document UI on a configured self-hosted Grist Community deployment, with OAuth, per-principal isolation and server-side Grist service accounts.`

## Reviewer package

Canonical reviewer cases remain:

- exactly five positive cases P1-P5 from `docs/OPENAI-REVIEWER-TESTS.md`;
- exactly three negative non-invocation cases N1-N3;
- one dedicated reviewer OAuth identity;
- one synthetic reviewer Grist document;
- one dedicated least-privilege Grist Community service account.

R5-E final evidence already records exact-candidate execution of the five positive cases, the three negative routing cases, an unrelated-resource deny, fixture reset and secret-safe logging.

## Final public MCP hostname

Do **not** submit or re-verify the historical qualification hostname `grist-chatgpt.loeildumaitre.fr` as the final public plugin endpoint.

Final public endpoint:

`https://gia.loeildumaitre.fr/mcp`

The Gia hostname is deployed on the reviewed service. The bridge configuration uses the Gia canonical resource URI and public host, Caddy is active with the Gia host, and the operator-observed production OAuth smoke passes all six non-secret checks. Protected-resource metadata binds exactly to Gia, advertises `https://auth-poc.loeildumaitre.fr/oidc`, and exposes exactly `doc:read`, `doc:write`, and `doc.schema:write`. Evidence is recorded in `docs/R5-F-GIA-LIVE-EVIDENCE.md`.

The historical repository/internal runtime name may remain unchanged. Gia remains a single-configured-instance product for the initial public submission; multi-instance routing is not part of R5-F.

## Portal sequence still required

1. **DONE** — establish and validate `gia.loeildumaitre.fr` as the final HTTPS MCP hostname.
2. **DONE** — preserve the verified `MaxRetentionSec=30day` deployment retention setting.
3. Create or update the public draft in the verified individual publisher organization/project.
4. Select **With MCP** and enter `https://gia.loeildumaitre.fr/mcp`.
5. Configure OAuth using the current OIDC provider.
6. Complete the portal-issued domain-verification challenge on the Gia MCP host (or accepted parent host).
7. Run a fresh **Scan Tools** against the final production endpoint.
8. Require exactly the expected ten v2 tools with current schemas, annotations and OAuth security metadata.
9. Enter the public listing name/descriptions/category and URLs above.
10. Provide a non-infringing original logo that does not use OpenAI or Grist marks.
11. Provide availability countries/regions.
12. Enter the canonical five positive and three negative reviewer cases.
13. Provide ready-to-use reviewer credentials/instructions without inaccessible MFA, SMS, email confirmation or private-network dependencies.
14. Provide the demo-recording URL showing the principal workflows and tools.
15. Enter release notes and required policy attestations.
16. Submit for review.
17. Record the actual review result before changing product scope.
18. Publish only after approval and an explicit release decision.

## Remaining blockers before submission

- final public logo;
- final demo recording URL;
- final domain challenge from the current portal draft;
- fresh final Tool Scan;
- reviewer credential handoff in the portal;
- country/region availability selection;
- actual OpenAI review and explicit publish decision.

The continuing third-party/unofficial-connector eligibility question remains a review-time risk. Submission wording must remain truthful: this is an independent bounded semantic workflow for one configured self-hosted Grist Community deployment, not an official Grist Labs integration and not a generic relay/proxy.
