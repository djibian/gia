# R5-F public plugin portal checklist

Date: 2026-09-30

This checklist records the current publication state for the public remote-MCP submission. It does not claim OpenAI approval.

## Publisher prerequisites

- Individual developer identity: **VERIFIED** (operator-confirmed in OpenAI Platform).
- Submitter role: **Organization Owner** (operator-confirmed; includes Apps Management authority).
- OpenAI project: **Global data residency available** (operator-confirmed).
- OAuth/OIDC workspace-domain support: **PASS**, recorded in `docs/R5-F-OIDC-EVIDENCE.md`.

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

After the public-material PR is integrated, use:

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

Validated target alias:

`https://gia.loeildumaitre.fr/mcp`

Reason: the public endpoint is short, consistent with the validated Gia identity and free of OpenAI/Grist marks in the hostname. The alias changes only deployment/publication identity; the repository/internal runtime name may remain unchanged.

Before portal verification, the Gia alias must be wired to the same reviewed service and the OAuth resource/audience/public-host configuration must be updated coherently, followed by production preflight, OAuth smoke and a bounded authenticated reviewer read. No portal domain challenge should be applied until that validation passes.

## Portal sequence still required

1. Establish and validate `gia.loeildumaitre.fr` as the final HTTPS MCP hostname.
2. Confirm deployment operational/audit-log retention matches the published privacy-policy commitment (no more than 30 days).
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

- `gia.loeildumaitre.fr` deployed and smoke-tested;
- final public logo;
- final demo recording URL;
- final domain challenge from the current portal draft;
- fresh final Tool Scan;
- reviewer credential handoff in the portal;
- confirmation that the public deployment operational/audit-log retention matches the published privacy-policy commitment (no more than 30 days);
- actual OpenAI review and explicit publish decision.

The continuing third-party/unofficial-connector eligibility question remains a review-time risk. Submission wording must remain truthful: this is an independent bounded semantic workflow for one configured self-hosted Grist Community deployment, not an official Grist Labs integration and not a generic relay/proxy.
