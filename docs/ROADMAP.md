# Roadmap

This roadmap is the authoritative dependency map for `grist-chatgpt` after the 2026-09-27 Pareto recomposition decision.

The project no longer develops around stage tracking or any other business application. It no longer treats a generalized internal Builder/lifecycle architecture as the next dependency. The product is rebuilt from the best existing Grist/MCP components and the useful parts of this repository, then validated only after a coherent candidate exists.

## Status vocabulary

- **DONE** — integrated historical/current result; no active work remains.
- **ELIGIBLE** — the finite committed work may start now.
- **ACTIVE** — committed work is underway.
- **BLOCKED** — only a named technical dependency blocks the tranche.
- **DEFERRED** — deliberately outside the current product-construction path.
- **RETIRED** — an earlier roadmap path remains historical but is no longer a product dependency.

## Current direction

```text
R0  RECOMPOSE FROM EXISTING PROJECTS      DONE
 |
 v
R1  MINIMAL CORE                          DONE
 |
 v
R2  MISSING GRIST SEMANTICS ONLY          DONE
 |
 v
R3  AUTONOMOUS PRODUCT CANDIDATE          DONE
 |
 v
R4  FINAL VALIDATION CAMPAIGN             ELIGIBLE
 |
 v
R5  HARDENING / PRODUCTION / DISTRIBUTION BLOCKED by R4
```

There are no parallel business-application axes during R1-R3.

Stage tracking, CCF, pedagogy and all other concrete applications are **R4 validation cases only**.

## Historical baseline retained as component bank

The following work was integrated before the recomposition and remains useful evidence/code, but it no longer dictates future architecture:

```text
V0.6 bounded document UI          DONE
C1 credential abstraction         DONE
C2 MCP contract v1                DONE
C3 user-aware Grist context       DONE
C4-P0 Logto/ProConnect POC        DONE
P0 architecture baseline          DONE
P1 document UI parity             DONE
P2 formula/schema safety          DONE
P3 semantic context/discovery     DONE
P4 v1 surface evaluation          DONE
Q0 retrospective assurance       DONE
J0 engine stabilization           DONE
J1 contractual execution          DONE
```

These results may be **KEEP**, **SIMPLIFY**, **REUSE AS PRIMITIVES**, or **REMOVE FROM ACTIVE PATH** during R1. Their historical completion records remain valid as history.

The former sequence `J2 -> J3 -> J4 -> J5 -> J6` is **RETIRED**. It is not a dependency chain and Controllers must not continue it.

Former C4/C5/C6 productionization and S0/S1/C7/C8 public-distribution work are **DEFERRED to R5**. Existing completed evidence is retained; no new work on those axes is product-critical before R4 passes.

## Global execution rules

1. **Existing project first.** Before equivalent implementation, inspect official Grist behavior and the external projects listed in `docs/RECOMPOSITION-REVIEW.md`.
2. **No business coupling.** No R1-R3 task may require a stage/CCF/CRM/inventory fixture, schema or policy.
3. **No development human gate.** When a choice is unresolved, select the smallest safe standard option or defer the optional capability. External/production authorization belongs to R5.
4. **Construction tests stay cheap.** Existing CI, unit/contract regressions and focused safety tests remain. Domain E2E, browser matrices and broad failure campaigns wait for R4.
5. **Remove before adding.** Retire obsolete complexity before building a local replacement.
6. **MCP first.** GPT Actions/OpenAPI is compatibility debt, not a reason to shape the new core.
7. **No speculative feature promotion.** A visible ecosystem feature is not R1/R2 work unless required by the finite exit criteria below.

---

# R0 — Existing-project recomposition

**Status: DONE**  
**Goal:** replace architecture-first continuation with an evidence-based composition strategy.

Authoritative evidence: `docs/RECOMPOSITION-REVIEW.md`.

R0 decisions:

- Grist official MCP/full-edition behavior is the primary functional oracle/convergence target;
- `gwhthompson/grist-mcp-server` is the strongest compact TypeScript surface reference;
- `nic01asFr/GristCoder` is the strongest application-context/build-loop reference;
- `Xe138/grist-mcp-server` informs simple resource/capability authorization but is not copied without a confirmed reusable license;
- `nic01asFr/mcp-server-grist` is a broad MIT-licensed API/formula reference, not a target surface;
- current `grist-chatgpt` is treated as a component bank rather than an indivisible architecture;
- the LLM remains the planner/orchestrator;
- business-specific proof infrastructure is removed from the product path;
- comprehensive product validation is deferred to R4;
- production/distribution axes are deferred to R5.

R0 also supersedes and closes the remaining J2 PRs #158 and #160 without merge.

Exit criteria:

- Product Vision reflects the lean MCP boundary;
- AGENTS contract implements existing-project-first/no-development-human-gate/build-then-validate policy;
- current architecture/security docs no longer make J2/J3/J4/J5/J6 future dependencies;
- a finite R1 set is defined.

No further R0 slice is committed.

---

# R1 — Minimal Core

**Status: DONE**  
**Priority: highest**

## Goal

Produce the smallest coherent MCP runtime for Grist Community by composing existing code rather than extending the retired Builder architecture.

The target conceptual responsibilities are:

```text
discover
inspect
query
change_data
change_structure
change_ui
help
```

The final public schema may use a slightly different count when required to preserve bounded semantic intentions and MCP risk annotations.

## Finite committed R1 work

### R1-A — active-runtime inventory and removal map

Audit the current TypeScript runtime by module/import path, not by old roadmap labels.

Classify every material current runtime area:

- **KEEP** — already the simplest good implementation;
- **ADAPT** — useful but should be reshaped around the lean core;
- **REPLACE** — an external implementation/pattern is demonstrably simpler or better;
- **DORMANT** — keep history/code temporarily but remove from active runtime/product path;
- **DELETE** — no longer used and provides no reusable value.

Special attention:

- J2 observer/provisioner/isolation/browser code;
- J1 journal/execution coordinator versus its directly useful safety primitives;
- GPT Actions/OpenAPI compatibility adapters;
- operation registry/tool-schema duplication;
- document-context/UI normalization;
- auth/principal/context isolation.

Deliver one bounded inventory document plus the minimal mechanical removals that are already provably dead. Do not refactor the whole runtime in this slice.

### R1-B — compact MCP surface

Create the lean MCP-facing surface by adapting the best current/external patterns.

Reference-first order:

1. compare Grist official MCP semantics for overlapping functions;
2. inspect `gwhthompson/grist-mcp-server` manager contracts and help/discovery pattern;
3. inspect GristCoder context/delta ideas where relevant;
4. map them onto the strongest existing `grist-chatgpt` business operations.

Requirements:

- no domain-specific inputs;
- stable semantic identifiers;
- precise read/write/destructive MCP annotations;
- bounded payloads;
- no arbitrary multi-action transaction;
- no generic `/apply`, raw SQL or HTTP escape hatch;
- retain partial/ambiguous-write safety at the operation boundary;
- preserve unrelated Grist state on bounded read-modify-write operations.

The current 23-tool v1 surface may remain temporarily behind a compatibility adapter while the lean surface is constructed, but it is not the target architecture. Do not preserve a duplicate public surface indefinitely merely to avoid a version decision; final disposition is part of R3 cleanup.

### R1-C — compact application context

Consolidate discovery/inspection around one compact semantic snapshot suitable for LLM reasoning.

Prefer existing `inspect_document` normalization where strong. Adapt only proven useful ideas from GristCoder, such as:

- relationship graph/links;
- pages/sections/widgets relevant to application structure;
- explicit incompleteness instead of guessed state;
- a small observable delta between requested/known state and current state when this can be expressed without an internal planner.

Do not add session phases, wizard state, sub-agents, hidden plan persistence or business contracts.

### R1-D — simplify active safety path

Retain the smallest runtime mechanisms needed for safe direct operations:

- authority/capability check;
- input bounds;
- stable-ID translation where required;
- exact/targeted post-write verification where cheap and material;
- partial-result retention;
- ambiguous-write no-blind-replay behavior;
- principal isolation;
- secret/output minimization.

Remove active dependence on generalized execution-contract/journal/orchestration machinery when the lean operation does not need it. Do not delete reusable J0/J1 code merely for aesthetic cleanliness; first make it non-essential, then let R3 remove dead residue.

## R1 exit criteria

- one coherent MCP-first runtime exposes the lean responsibilities;
- no business application or J2 test infrastructure is required to run the product;
- an LLM can discover, inspect, query, mutate data, mutate structure and perform the supported UI changes using generic Grist semantics;
- the active safety path is materially simpler than J1/J2 architecture while retaining the security invariants in `docs/SECURITY.md`;
- baseline CI is green;
- no R1 committed slice remains.

No comprehensive domain E2E proof is required for R1 completion.

R1-A, R1-B, R1-C and R1-D are integrated. No further R1 slice is committed.

---

# R2 — Missing Grist semantics only

**Status: DONE**

Authoritative evidence: `docs/R2-MISSING-GRIST-SEMANTICS-AUDIT.md`.

## Goal

Fill only the generic Grist capabilities whose absence makes the R1 product incoherent or materially weaker than the best existing references.

## Method

Run a bounded gap comparison against:

- current official Grist MCP behavior/documentation;
- `gwhthompson/grist-mcp-server`;
- `nic01asFr/GristCoder`;
- `nic01asFr/mcp-server-grist`;
- the now-simplified R1 runtime.

For every candidate gap, ask:

1. Is it required for generic application construction/modification?
2. Does Grist Community expose a stable enough primitive?
3. Does an existing licensed implementation already solve it?
4. Can it fit the compact safety boundary without new product architecture?

Only candidates answering all relevant questions positively become committed work.

## Candidate categories, not committed features

Possible examples include document creation/copy, additional native page/widget configuration, safer upsert/import semantics, formula support or other Grist-native configuration. Attachments, webhooks, generated code, generic access administration and lifecycle automation are not automatically promoted.

## Exit criteria

- the bounded gap audit records why each inspected ecosystem capability is REUSE/ADAPT/REIMPLEMENT/REJECT/DEFER;
- every **required** generic gap is implemented;
- no speculative gap remains committed;
- baseline CI is green.

The bounded audit found only two required generic gaps: deletion of one page and deletion of one page widget. They are implemented as bounded `grist_change_ui` actions without adding an MCP tool or expanding the historical v1 operation surface. No other inspected gap is committed.

---

# R3 — Autonomous Product Candidate

**Status: DONE**

## Goal

Turn the lean runtime into a self-contained candidate worth validating, without adding application-specific functionality.

## Finite completion work

1. remove dead/dormant code that is demonstrably outside the candidate, including retired J2 machinery and obsolete compatibility layers where safe;
2. freeze/version the MCP contract and migration position for any retained v1 compatibility;
3. simplify configuration and deployment to the minimum needed for a generic controlled Grist Community instance;
4. reconcile README/architecture/security/current-state docs with the actual runtime;
5. produce a short generic usage flow showing how an MCP agent discovers, inspects and modifies Grist without embedding a business scenario;
6. perform a dependency/licensing/provenance pass over reused/adapted external code.

Integrated completion evidence:

- #167 removes retired J1/J2 executable residue;
- #168 freezes MCP contract v2 and removes the dormant v1 registration layer;
- #169 records the dependency/licensing/provenance audit;
- #170 documents the generic MCP usage flow;
- #171 simplifies runtime/configuration to the MCP-only candidate and reconciles README/architecture/security/current-state docs.

## Exit criteria

- product installation/configuration is coherent;
- public MCP contract is versioned and documented;
- no retired Builder/J2/business path is an active dependency;
- no known dead compatibility surface remains without an explicit reason;
- baseline CI is green;
- the candidate is frozen enough that a comprehensive validation campaign is meaningful.

All R3 exit criteria are satisfied on integrated `main`. No further R3 slice is committed.

---

# R4 — Final Validation Campaign

**Status: ELIGIBLE**

## Goal

Now test the finished candidate broadly and aggressively.

This is the first tranche where domain applications and comprehensive end-to-end proof are product dependencies.

## Required validation classes

The committed R4 set is the nine validation classes below. Fixture preparation is part of R4 execution, not a separate human gate.

1. **new generic application** — construct useful schema/data/UI from an empty or minimal Grist document;
2. **existing generic application** — inspect and modify while preserving unrelated human data/configuration;
3. **stage-tracking application** — complex existing schema plus access-sensitive behavior; this is a validation case, not architecture;
4. **a materially different second application**, with the CCF/pedagogy case a strong candidate;
5. **rerun/idempotence** — repeat satisfied intentions without duplication/degradation;
6. **partial/ambiguous failure** — characterize safe behavior and no-blind-replay guarantees;
7. **authorization/isolation** — principals cannot gain upstream authority or leak credentials/context;
8. **browser-dependent behavior only where a validated application actually requires it**;
9. **compatibility** across the supported Grist Community version range declared by the candidate.

R4 may add test infrastructure because the product is now stable enough to justify it. Prefer maintained standard test/browser libraries over bespoke transports.

## Outcome rules

- a domain failure becomes a generic product bug only when the missing behavior is genuinely generic;
- repair the smallest generic defect, rerun affected validation, and continue;
- do not import stage/CCF business concepts into the core;
- record unsupported behavior honestly rather than expanding scope indefinitely.

## Exit criteria

- the campaign's required classes have current results;
- no unresolved critical correctness/security/data-integrity defect remains in the declared supported scope;
- supported/unsupported boundaries are explicit;
- repeated runs do not reveal systematic duplication or destructive drift;
- an integrated product-candidate review records PASS.

---

# R5 — Hardening, production and distribution

**Status: BLOCKED by R4**

## Goal

Productionize only a product that already proved useful and coherent.

Re-evaluate, rather than mechanically resume, the earlier production/distribution work:

- C4 production OAuth identity;
- C5 per-user Grist credential onboarding/custody;
- C6 operational hardening;
- S0/S1 OpenAI submission work;
- C7 reviewer environment;
- C8 publisher/submission package.

Existing completed POC/submission evidence may be reused when still current.

This is also the place for unavoidable external actions such as production secrets, institutional ownership/authorization and public submission. Those actions do not block R1-R4.

## R5 exit criteria

Defined only after R4, against the actual candidate and current distribution requirements. Do not pre-build production architecture for a product shape that may still change.

---

# Permanently deferred unless promoted by evidence

The following are not active roadmap items merely because existing projects implement them:

- generated HTML/React application framework;
- custom-widget IDE;
- wizard UI;
- sub-agent delegation;
- lifecycle scheduler;
- dependency/version monitoring;
- general webhook/integration framework;
- attachments;
- generic ACL/user/org administration;
- raw SQL model surface;
- arbitrary browser control;
- arbitrary generated code/network destinations;
- multi-instance routing.

Promotion requires a post-R4 product decision or a demonstrated generic R2 gap.

# Superseded domain documents

Stage-tracking/J2 documents remain historical design and future validation material. They do not control eligibility, architecture, testing order or implementation selection.

Controllers must not revive J2/J3/J4/J5/J6 simply because those documents remain in the repository.
