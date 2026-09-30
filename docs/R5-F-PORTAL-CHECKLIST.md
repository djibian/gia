# R5-F public plugin portal checklist

Date: 2026-09-30

This checklist records the current publication state for the public remote-MCP submission. It does not claim OpenAI approval.

## Publisher prerequisites

- Individual developer identity: **VERIFIED** (operator-confirmed in OpenAI Platform).
- Submitter role: **Organization Owner** (operator-confirmed; includes Apps Management authority).
- OpenAI project: **Global data residency available** (operator-confirmed).
- OAuth/OIDC workspace-domain support: **PASS**, recorded in `docs/R5-F-OIDC-EVIDENCE.md`.

## Public listing identity

Public plugin name candidate:

`Structured Workspace Builder`

Repository/internal runtime name remains `grist-chatgpt`.

Rationale:

- avoids `GPT` / `ChatGPT` in the public product name;
- avoids using the Grist trademark as the product's own brand;
- describes the workflow rather than claiming to be an official connector;
- Grist Community is referenced only descriptively as the compatible target platform.

Default short description:

`Build and evolve structured workspaces`

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

All are public HTTPS URLs.

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

## Current production endpoint

Candidate MCP URL:

`https://grist-chatgpt.loeildumaitre.fr/mcp`

The hostname is an internal/deployment identifier, not the public plugin brand. It may remain technically unchanged unless the portal or trademark review requires otherwise.

## Portal sequence still required

1. Create or update the public draft in the verified individual publisher organization/project.
2. Select **With MCP** and enter the production HTTPS MCP URL.
3. Configure OAuth using the current OIDC provider.
4. Complete the portal-issued domain-verification challenge on the MCP host (or accepted parent host).
5. Run a fresh **Scan Tools** against the final production endpoint.
6. Require exactly the expected ten v2 tools with current schemas, annotations and OAuth security metadata.
7. Enter the public listing name/descriptions/category and URLs above.
8. Provide a non-infringing original logo that does not use OpenAI or Grist marks.
9. Provide availability countries/regions.
10. Enter the canonical five positive and three negative reviewer cases.
11. Provide ready-to-use reviewer credentials/instructions without inaccessible MFA, SMS, email confirmation or private-network dependencies.
12. Provide the demo-recording URL showing the principal workflows and tools.
13. Enter release notes and required policy attestations.
14. Submit for review.
15. Record the actual review result before changing product scope.
16. Publish only after approval and an explicit release decision.

## Remaining blockers before submission

- final public logo;
- final demo recording URL;
- final domain challenge from the current portal draft;
- fresh final Tool Scan;
- reviewer credential handoff in the portal;
- confirmation that the public deployment operational/audit-log retention matches the published privacy-policy commitment (no more than 30 days);
- actual OpenAI review and explicit publish decision.

The continuing third-party/unofficial-connector eligibility question remains a review-time risk. Submission wording must remain truthful: this is an independent bounded semantic workflow for one configured self-hosted Grist Community deployment, not an official Grist Labs integration and not a generic relay/proxy.
