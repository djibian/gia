# Development

Read [AGENTS.md](../AGENTS.md) before selecting or integrating work.
Node.js 22+ is required. Install from the committed lockfile.

```sh
npm ci
npm run check:convergence
npm audit --omit=dev --audit-level=high
npm run check
npm test
npm run build
```

The branch-protection-required `verify` CI job runs these checks. On pull
requests its final read-only integration gate also checks the declared review
classification, exact-head PR comment verdict and relevant native workflow runs.
For all subsequent PRs the gate executes the checked-out policy from protected
`main`, not the proposed PR implementation. The initial guard-introduction PR
must use its proposed script once, under independent review. No new production
dependency or external review/orchestration service is needed.

Every PR states scope, `Dependencies:`, net complexity, validation and a
reasoned `Review gate: REQUIRED` or `Review gate: NOT REQUIRED` declaration.
Runtime, contract, authorization, governance and related native security test
changes require independent exact-head review, including test-only changes
whose fixtures materially qualify an authorization boundary. Bounded factual
documentation edits may be declared NOT REQUIRED with an explicit rationale.
A distinct Controller execution, not necessarily a distinct GitHub account,
records a verdict with exactly `Head: <SHA>` and `Result: PASS` or
`Result: CHANGES REQUIRED` in a PR comment, and attests in prose it did not
materially author that head. CI can check matching evidence, not prove the
independence of two executions sharing one account; that remains a review duty.
A later CHANGES REQUIRED for the same head overrides earlier PASS.

The final evidence step intentionally reports failure while required review or
native validation remains pending. An independent reviewer may inspect green
individual build/test steps before commenting; after recording PASS and after
native workflows succeed, rerun failed `verify` jobs on that unchanged head.
If the head, base, dependencies or validation changes, reconstruct and recheck;
a stale review or an earlier green run cannot authorize a changed head.
Before merge the Controller must confirm that required `verify` is green for
the exact PR head and the independent verdict still applies. The integration
gate does not replace this final GitHub state check or grant new permissions.

Relevant native suites must run on the exact PR head: `Grist compatibility`
for supported Grist semantics, and `Application preservation` for user-state
safety. Their automatic path filters cover common runtime, tests, security and
contract edits; if a less obvious change affects either native boundary without
triggering its workflow, dispatch the matching workflow manually on the exact
PR branch and inspect the resulting head SHA before merging. Do not treat the
names-only `verify` result or a skipped workflow as native qualification. Unit/contract tests protect current behavior;
remove a test only when its subject is removed and no current invariant is lost.

## Current documentation

Each fact has one normative home; link to it instead of duplicating it.

| Document | Owns |
| --- | --- |
| [Product Vision](PRODUCT_VISION.md) | purpose, exclusions and evolution policy |
| [Architecture](ARCHITECTURE.md) | runtime responsibilities and dependencies |
| [MCP Contract](MCP-CONTRACT.md) | current tool/action semantics, compatibility and versioning |
| [Security](SECURITY.md) | trust, authorization, secrets, preservation and effect invariants |
| [Operations](OPERATIONS.md) | configuration, credentials, deployment, rollback and monitoring |
| [Development](DEVELOPMENT.md) | contributor workflow, checks, native tests and convergence enforcement |
| [Roadmap](ROADMAP.md) | finite authorized unfinished work only |

README is the entry point; AGENTS is the development contract; LICENSE, Privacy,
Terms and Support retain their current legal/user-facing purpose. PR descriptions
are the home for analysis, provenance, decisions, review and validation evidence.
Release notes belong to GitHub releases. Git retains removed files and earlier decisions.
Do not add report/evidence/POC archives, dated snapshots, completed tasks, milestone
labels or alternative contracts to the integrated tree.

`tools/check-convergence.mjs` checks the explicit document inventory, forbidden
artifact categories, current-only documentation, unfinished-only Roadmap and local
Markdown links. It also sees unignored new files during local development.
The guard rejects dormant parallel-contract/provider modules and declarations;
TypeScript rejects unused locals and parameters across runtime and maintained tools.
The PR template makes absorption/deletion and net complexity reduction part of
completion. Changes to the inventory/policy require a justified independent review.
The guard is deliberately small; semantic consistency still requires review and tests.

## Native Grist regressions

The retained native probes create synthetic documents/users only in disposable
Grist instances with test login enabled. Never enable test login in production
or run these mutating probes against a real user deployment.

| Workflow / tool | Current purpose |
| --- | --- |
| Grist compatibility / `tools/grist-compatibility.ts` | MCP transport plus native document metadata, relation display, calendar, schema/UI/ACL/template boundaries across Grist Community 1.7.16–1.7.20 |
| Grist compatibility / `tools/authorization-qualification.ts` | Native API allow/deny and independently re-read effects for R/C/U/D across synthetic row-policy cases |
| Grist compatibility / `tools/authorization-lock-qualification.ts` | Native API locking interleaving and stable-reference preservation on disposable Grist |
| Grist compatibility / `tools/grist-linkkey-web-acceptance.ts` | independent headless-Chrome web-client qualification of native `user.LinkKey` row filtering, absent/wrong LinkKeys and positive matches on disposable documents across the Grist Community matrix |
| Application preservation / `tools/application-validation.ts` | existing human configuration/data, differing native grants, a second application shape and repeat execution on Grist Community 1.7.19 |

Workflows run for relevant runtime/test/tool/dependency/workflow changes and can
also be dispatched for release verification. Native authorization probe changes
require exact-head Grist compatibility. Edits to the shared harness or fixtures
require both compatibility and application preservation. Results belong to their exact CI
head; passing a listed version is not a blanket guarantee for every Grist behavior
or an untested server version. Compatibility follows the executable probes.
The domain-shaped fixtures are test consumers, never product requirements.

Application preservation exercises maintained widget URLs on the disposable
from-empty witness when its acceptance script changes or the workflow is
dispatched with `live_widgets`. The browser checks the actual loaded frame,
Grist's ready handshake and mapped-data behavior. It checks cursor effects
from the Map and Structure Assistant in their native grids, re-reads the
geocoded and reassigned synthetic rows, and verifies that the Outlook draft
contains the native calculated personal link. The LinkKey browser cases
exercise those links against the newly created document. Ordinary
preservation runs use inert registry entries.

To run against a disposable local Grist with test login enabled:

```sh
GRIST_COMPAT_BASE_URL=http://127.0.0.1:8484 GRIST_COMPAT_VERSION=1.7.20 \
  node --import tsx tools/grist-compatibility.ts
GRIST_TEST_BASE_URL=http://127.0.0.1:8484 GRIST_TEST_VERSION=1.7.19 \
  node --import tsx tools/application-validation.ts
```

The native API qualification step derives its target from the job-owned local
Docker container ID. It verifies the selected image version, explicit disposable
label, test login, absence of persistent mounts and a loopback-only binding
before opening any Grist session. Node's environment-proxy mode is refused
so the HTTP destination stays at that binding. Run it with the compatibility workflow or
with `GIA_QUALIFICATION_CONTAINER` and `GRIST_COMPAT_VERSION` for a local
container created using that workflow's settings. The fixed synthetic R/C/U/D
cases use ordinary native API calls with two editors and a separate owner who
re-reads their effects. Each output row identifies version, surface, scope,
expected outcome and `PASS`, `FAIL`, `UNKNOWN`, `NOT_TESTED` or
`UNSUPPORTED`. Case failures leave the run unsuccessful. Output omits
credentials, document IDs, URLs and native response bodies. A separate synthetic
indirect-formula scope checks that a denied source row may still be disclosed
through a readable derived cell, and that a targeted column read restriction
protects the other derived cell in the exercised native REST context. Owner
values and a visible control establish the fixture; no cell value is logged.

The native reference-locking step uses the same container guard and evidence
states. A synthetic editor first proves permitted C/U/D operations while
unlocked. After the owner independently confirms the lock, the editor's
attempts and the owner's reference migration run in a bounded interleaving.
The old target is removed only after observed native refusals and independent
checks of the migrated and untouched rows. The final read confirms reference
integrity and retention of the lock. Scope is limited to the tested API
interleaving and fixture. It yields no general transaction or isolation
guarantee.

The LinkKey web probe uses the same disposable-container guard and flags.
It drives a disposable headless Chrome via ChromeDriver/WebDriver and prints
separate evidence for a matching key for each synthetic row, and for missing
and wrong keys. A separate control row is visible to logged-in viewers.
Its presence and the expected page route establish the tested browser context
before a missing row counts as evidence. The probe omits key values, URLs and browser response
bodies. This scope covers native web row visibility for the tested viewer.
API, widgets, anonymous visitors and published forms have their own scope.

The compatibility and preservation probes start a local Gia process, provision
synthetic native state, perform bounded tools and independently inspect native
postconditions. The application probe uses `application-fixtures.ts` and
`grist-harness.ts`.
No production browser/planner, model-facing command, new dependency or
committed proof platform is added.

## Licensing

Gia's original code in the current repository, and original Gia code from
every earlier published version, is offered under AGPL-3.0-or-later by the
copyright holder. Historical Git commits remain in the repository; earlier GitHub release tags
have been removed. Third-party dependencies
retain their own license metadata in the lockfile. Official Grist behavior/documentation is the primary oracle:
[API](https://support.getgrist.com/api/),
[access rules](https://support.getgrist.com/access-rules/),
[upstream source](https://github.com/gristlabs/grist-core).
Community references supplied manager-tool and semantic-context ideas, not copied
source. Check the relevant license before any reuse and keep required attribution
with incorporated code; document the concrete decision in the PR.
