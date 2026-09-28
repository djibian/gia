# R4 — Final Validation Campaign

## Purpose

This document is the durable execution record for the finite R4 campaign defined by `docs/ROADMAP.md`.

R4 validates the integrated MCP v2 candidate. It does not reopen product architecture by default. A validation failure becomes product work only when it demonstrates the smallest genuinely generic defect in the declared supported surface.

Candidate baseline at campaign start:

- integrated `main`: `024438e401259e628bb68bdb2ecd787516a88e15`;
- MCP contract: v2, ten model-facing tools;
- baseline CI: GitHub Actions CI run 601, PASS on the exact baseline SHA;
- active runtime: MCP-only;
- default controlled deployment: static bearer plus one server-side Grist API key and bounded document/workspace policy.

The baseline SHA identifies the start of R4, not an immutable final SHA. Every later result records the exact candidate SHA that was actually exercised.

## Evidence rules

A campaign result is accepted only when it records enough information to distinguish tested fact from assumption.

For each class record:

1. exact `grist-chatgpt` commit SHA;
2. test kind: deterministic local/CI, live MCP v2, or browser observation;
3. fixture alias and relevant structural precondition, without committing private document IDs, credentials, bearer tokens or user data;
4. bounded intention exercised;
5. material preconditions and postconditions;
6. PASS, FAIL, BLOCKED or UNSUPPORTED;
7. any generic defect revealed and the exact repair/rerun linkage.

Historical J0/J1/J2 evidence may inform test design but does not by itself satisfy R4. Existing tests may count when they still exercise the active candidate and are rerun on an R4 candidate SHA.

`BLOCKED` is not a product failure. `UNSUPPORTED` is acceptable only when the boundary is explicit and consistent with the current contract.

## Candidate fixtures

The real Grist instance currently available to the development connection provides enough independent applications to prepare the committed domain classes. Private document IDs are deliberately not recorded here.

### F1 — generic scratch

Observed shape at R4 start:

- 3 user tables;
- 9 columns;
- one `Ref` relationship;
- 4 pages;
- 5 widgets;
- one page containing two same-table widgets with a direct select-by link.

Use: new generic application / compact create-change-rerun work. The fixture is disposable enough for bounded validation, but every destructive target must still be identified from current state before mutation.

### F2 — existing generic tutorial

Observed shape at R4 start:

- 5 user tables;
- 27 columns;
- 9 pages;
- 11 widgets;
- existing instructional data and page/widget titles;
- multiple same-table master/detail select-by links;
- a dedicated sandbox table/page that can absorb bounded test changes while unrelated instructional content remains preservation evidence.

Use: existing generic application. The intended proof is not merely that one mutation succeeds: unrelated tables, instructional rows, page titles, widget titles and select-by configuration must remain materially unchanged.

### F3 — stage-tracking application

Observed shape at R4 start:

- 9 user tables;
- 76 columns;
- 12 `Ref` relationships;
- formula references and dereferences;
- 14 pages;
- 32 widgets;
- forms, native record/detail views, custom widgets, layouts and select-by links;
- existing human configuration that must not be normalized away or overwritten.

Use: complex domain validation only. Stage-tracking table names, rules and workflows must not enter the bridge architecture.

The existing inspection path also reports at least one formula-analysis incompleteness on this fixture. That is an observation to re-check through the MCP v2 candidate, not yet a product defect: R4 must distinguish unsupported/advisory analysis from incorrect mutation behavior.

### F4 — materially different CCF/pedagogy application

Observed shape at R4 start:

- 2 user tables;
- 4 columns;
- 4 pages;
- 4 widgets;
- a mission page with pre-existing response/information widgets;
- an intentionally empty restitution page.

Use: second independent application. The fixture is deliberately much smaller and structurally different from stage tracking.

## Finite class matrix

| # | Validation class | Prepared evidence / fixture | Current state at campaign start |
| --- | --- | --- | --- |
| 1 | New generic application | F1; create bounded schema/data/UI from a minimal starting state, then inspect resulting state | READY — live MCP v2 execution pending |
| 2 | Existing generic application | F2; bounded change in sandbox area plus explicit preservation checks over unrelated data/UI | READY — live MCP v2 execution pending |
| 3 | Stage-tracking application | F3 structural baseline captured | READY — live MCP v2 execution pending |
| 4 | Materially different second application | F4 structural baseline captured | READY — live MCP v2 execution pending |
| 5 | Rerun/idempotence | Replay already-satisfied semantic intentions from classes 1–4 and compare material state | READY — depends on live results of 1–4 |
| 6 | Partial/ambiguous failure | Active deterministic fault-injection tests already exercise transport loss, mutating HTTP failure, confirmed partial batches and `retryWholeOperation=false` | PARTIAL PASS — current CI rerun exists; live transport characterization still useful where controllable |
| 7 | Authorization/isolation | Active capability/resource/OAuth request-context regressions exist; live multi-principal/resource probes require the candidate endpoint/auth mode being exercised | PARTIAL PASS — current CI rerun exists; live candidate probe pending |
| 8 | Browser-dependent behavior | No blanket browser matrix. Escalate only if classes 1–4 reveal a material behavior that semantic MCP/API observation cannot establish | CONDITIONAL — not yet triggered |
| 9 | Grist Community compatibility | Candidate currently declares no concrete supported-version range | BLOCKED — support range/evidence must be made explicit before this class can pass |

No additional R4 class is committed by this document.

## R4-1 — New generic application

Minimum proof:

1. inspect a minimal/disposable starting document;
2. create one useful table with typed columns;
3. add a small data set;
4. create or extend native UI with at least one page/widget relation supported by v2;
5. inspect/query the resulting state through MCP v2;
6. verify the intended schema, rows and supported UI postconditions;
7. repeat the already-satisfied intention under R4-5 and demonstrate no accidental duplicate/degradation.

Do not require a general application builder or multi-action transaction.

## R4-2 — Existing generic application

Use F2 and target its dedicated sandbox area.

Minimum proof:

1. capture compact semantic before-state;
2. perform one bounded data change, one bounded schema change and one supported UI change where the fixture permits them safely;
3. re-inspect material postconditions;
4. verify unrelated instructional tables/rows and unrelated page/widget configuration remain intact;
5. rerun satisfied intentions under R4-5.

A destructive operation is not required merely to claim breadth. If deletion is exercised, the exact target must be identified immediately before mutation.

## R4-3 — Stage-tracking application

The stage fixture is a preservation stress case rather than a business acceptance test.

Required properties:

- compact inspection remains usable on the larger document;
- relationships/formulas/pages/widgets are represented without guessing unresolved metadata;
- a bounded generic change can be made without damaging unrelated existing human configuration;
- custom-widget-owned URL/plugin/arbitrary option state is not rewritten merely because the bridge cannot normalize all of it;
- supported select-by/layout/widget state survives unrelated changes;
- any incompleteness is explicit rather than silently fabricated.

Access-sensitive/browser-only behavior is tested only where the declared candidate contract can actually observe or affect it.

## R4-4 — Second independent application

Use F4 to test that the bridge is not overfit to the stage fixture.

A useful bounded evolution is sufficient: inspect the current mission/restitution structure, add a generic supported structure/UI element needed for a restitution workflow, and verify that existing mission/response state is preserved.

The pedagogical meaning remains entirely outside bridge code.

## R4-5 — Rerun/idempotence

Rerun is evaluated at semantic-intention level, not by blindly replaying raw writes.

For each eligible live scenario:

- re-inspect current state first;
- if the requested postcondition is already satisfied, the agent should avoid issuing a duplicating mutation;
- where a mutation is legitimately repeated, verify that the bridge targets current stable semantic identifiers and does not destructively drift unrelated state;
- an `uncertain_write` result is never blindly replayed as part of an idempotence test.

This validates the product model: the MCP client reasons from current state and the bridge performs one bounded intention.

## R4-6 — Partial and ambiguous failure

Active code-level fault injection already covers the safety invariant and was rerun by CI on the R4 baseline:

- mutating transport failure is `UNCERTAIN`;
- mutating 5xx/HTTP failures remain conservatively uncertain unless endpoint semantics prove no effect;
- confirmed earlier batches survive a later uncertain or definite failure;
- public MCP error results retain confirmed effects/counts;
- whole-operation blind replay is explicitly forbidden.

These tests are valid R4 evidence because they exercise the active `GristClient` / `GristService` / MCP-result path, not retired J1 orchestration.

A live forced network fault may supplement this evidence only when it can be performed without risking uncontrolled real-data mutation. R4 does not need a bespoke chaos platform to restate the deterministic safety contract.

## R4-7 — Authorization and isolation

The campaign separates two boundaries:

1. bridge authorization: deployment resource ceiling intersected with principal resource grant and required capability;
2. upstream authority: Grist remains authoritative and the bridge cannot elevate the configured credential.

Current regression coverage can establish request-context isolation and fail-closed capability/resource checks. A live candidate test should additionally demonstrate at least one denied out-of-grant resource/capability and verify that no secret appears in MCP outputs.

OAuth mode authenticates distinct MCP principals but still uses the configured shared server-side Grist API key. R4 must not misrepresent that as production per-user Grist credential isolation; production credential custody remains R5.

## R4-8 — Browser escalation rule

Browser automation is not a default validation dependency.

Escalate only if a concrete supported operation has a material postcondition that cannot be established by MCP result plus semantic Grist re-inspection. Custom widgets that the candidate intentionally treats as preserved opaque/partially normalized state do not justify a general browser framework by themselves.

If escalated, use a maintained browser library and one bounded scenario. Do not revive the retired J2 browser platform wholesale.

## R4-9 — Compatibility rule

The campaign cannot honestly claim compatibility across an unspecified range.

Before R4 closes, declare the smallest support statement justified by evidence, for example exact tested Grist Community release/revision(s) or an explicitly bounded range. Then run the same representative semantic slice against every declared boundary version.

Do not infer compatibility from historical dates or from a single rolling deployment. If only one version is actually available, declare that tested version and leave broader compatibility unsupported rather than inventing a range.

## Current execution constraint

At campaign start, the Grist connector available to the Controller exposes the older granular operation surface rather than the integrated ten-tool MCP v2 contract. It is therefore suitable for discovering and preparing real Grist fixtures, but results obtained through that connector must **not** be mislabeled as end-to-end validation of the current v2 candidate.

The historical public VPS deployment is also not automatically deployed from GitHub: the repository currently contains only the CI workflow, while the recorded public deployment uses `systemd`, Caddy and secrets held outside the checkout.

Consequently, fixture preparation and deterministic current-candidate tests may proceed autonomously, while live MCP v2 classes require an actual deployment of the current candidate through an environment that can hold the existing external secrets. This is an infrastructure condition, not permission to validate against the wrong contract.

## Completion rule

R4 is complete only when all nine committed classes have a current disposition and the Roadmap exit criteria are satisfied.

A final integrated candidate review must then PASS on the exact candidate SHA. R5 remains blocked until that transition is durably integrated.
