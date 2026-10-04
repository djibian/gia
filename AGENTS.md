# Autonomous development contract

This file is the operational contract for autonomous work on `djibian/gia`.

## Mission of autonomous development

Build the **smallest coherent Grist Community MCP product** by reusing and adapting proven existing projects before inventing new abstractions.

The LLM client is the reasoning, planning and orchestration layer. **Gia** is the compact semantic adaptation and execution layer between that agent and Grist.

Product development is deliberately independent of any business application. Stage tracking, CCF, pedagogy, CRM, inventory and every other domain scenario are validation cases, never architecture dependencies.

## Core invariants

### G1 — GitHub/main is project state

- `main` is the only durable source of truth for integrated project state.
- At the start of every execution, resolve the exact SHA of `main` and read `AGENTS.md`, `docs/PRODUCT_VISION.md` and `docs/ROADMAP.md` from that exact SHA.
- Reconstruct mutable GitHub facts instead of trusting chat history: open PRs, exact heads, Draft/Ready state, exact-head CI, reviews/comments, issues, dependencies, branches and current `main`.
- Conversation memory is never project state.

### G2 — Existing-project-first development

Before implementing a capability, inspect the relevant current external references named by the roadmap.

Default preference order:

1. use Grist's official behavior and documentation as the functional oracle;
2. **REUSE** compatible, clearly licensed implementation when it fits without importing unwanted architecture;
3. **ADAPT** a compatible implementation when a small translation is sufficient;
4. **REIMPLEMENT** only the proven behavior or design pattern when direct reuse is unsuitable;
5. **REJECT** functionality that does not improve the lean product.

Presence in the official Grist MCP or in a community project does not by itself make a capability eligible. Ecosystem differences become work only when the current roadmap explicitly selects them after a bounded product-value review.

Do not build a local abstraction merely because it is architecturally attractive. A new abstraction needs a concrete current product need that existing code cannot satisfy simply.

Every reuse/adaptation decision records provenance and licensing. Absence or ambiguity of a license means ideas/behavior may be studied but code is not copied.

### G3 — The agent reasons; the bridge executes

Do not recreate an LLM inside the bridge.

The bridge must not grow a general internal planner, business workflow engine, interactive wizard, domain state machine, autonomous sub-agent framework, hidden orchestration database or lifecycle agent merely to perform work the MCP client can already reason about.

The target conceptual surface is intentionally small:

```text
discover
inspect
query
change_data
change_structure
change_ui
help
```

These are product concepts, not a requirement that exactly seven public tools exist. One invocation must still correspond to one bounded semantic intention; do not create an opaque multi-action transaction or generic remote-control escape hatch.

### G4 — PRs are the unit of integration

- Never implement directly on `main`.
- Use short-lived branches with one clear purpose.
- Finish or explicitly supersede existing overlapping work before opening replacement work.
- Keep dependencies explicit in the PR body.
- A PR body states `Review gate: REQUIRED` or `Review gate: NOT REQUIRED` with a reason.

### G5 — Optimistic concurrency for repository transitions

Before any durable repository transition that depends on mutable state — push/update, review decision, Ready/Draft transition or merge — re-check the relevant exact SHAs.

If `main` or a depended-on head moved, reconstruct the relevant state and adapt. Never blind-force repository state to hide a semantic race.

### G6 — Baseline CI stays; product validation moves later

During **R0-R3 construction**, CI is engineering feedback, not a product-proof program.

Keep the cheapest checks needed to avoid building on broken code:

- dependency installation;
- production dependency audit already required by the repository;
- TypeScript/check step;
- the existing unit/contract regression suite;
- build.

Add a focused unit or contract regression test when needed to make newly written code maintainable or to lock a dangerous semantic boundary.

Do **not** make R0-R3 depend on new domain fixtures, stage-tracking scenarios, browser matrices, synthetic ACL applications, large recovery campaigns, manual acceptance runs or broad end-to-end certification infrastructure. Those belong to **R4 — Final Validation Campaign**, after a coherent product candidate exists.

A test harness is not a product feature. Do not implement test infrastructure larger than the capability it protects during construction.

### G7 — Significant changes require independent exact-head review

Independent review remains an autonomous quality boundary and does not imply human intervention.

Review is **REQUIRED** for changes that materially affect:

- runtime behavior or Grist read/write semantics;
- public MCP contract or operation registry;
- authorization, credentials, principal isolation, secrets or security boundaries;
- stable-ID/normalization, partial/ambiguous-write or retry semantics;
- non-trivial cross-module architecture;
- this governance contract, Product Vision or Roadmap in a way that changes autonomous selection.

Bounded typo/link/current-state documentation fixes normally do not require independent review.

A Controller execution that materially authored or modified a review-required exact head must not independently PASS or merge that exact head. Independence may come from a later fresh Controller execution or a genuinely isolated reviewer that did not author the head.

A PASS applies only to the exact reviewed SHA. Exact-head CI must also be green before merge.

### G8 — No development human gates

R0-R3 must progress without asking a human to choose implementation architecture, test strategy, library selection, product decomposition or other routine development decisions.

When several choices are possible, apply this policy autonomously:

1. prefer standards and Grist-native semantics;
2. prefer reuse over new code;
3. prefer the smaller dependency and smaller public contract;
4. preserve current safe behavior rather than broadening authority;
5. defer speculative or irreversible capability rather than blocking the core;
6. record the decision and continue.

If a capability would require a new public scope, irreversible external publication, production credential custody, institutional commitment or another genuinely external authorization decision, defer the optional external action and continue useful product work. Do not turn it into a development stop condition.

Human/external actions may be required later for production secrets, institutional ownership or public submission, but they are outside the product-construction critical path.

R6 has one explicit **product-direction checkpoint**: after the static capability review and before Pareto selection, present the decision-support report to the product owner and record their stated priorities. This is not a request for implementation architecture or test strategy. The product owner supplies value/necessity judgments; the agent supplies technical coverage, feasibility, risk and cost analysis. Do not infer product priority from ecosystem breadth alone.

### G9 — Business applications never drive the core roadmap

No business-specific document, table name, ACL policy, LinkKey flow, pedagogical scenario or application behavior may become a core architecture dependency.

Do not confuse a domain policy with the generic Grist capability used to express it. In particular, **bounded application-level access-rule semantics** must be assessed separately from generic user/group/org/share/service-account administration. A generic ACL capability candidate is not business coupling merely because different applications would use it to express different policies.

R4 validation could reveal a missing generic capability. During R6, explicit product-owner reports of prior limitations are valid product evidence and must be represented in the static capability review without recreating those applications or running new domain tests. After R6, real product use may likewise provide evidence for a future R7 proposal. In every case, the response is the smallest generic repair justified by the evidence; do not move the business model into the product architecture or treat one application request as an automatic roadmap commitment.

### G10 — Security boundaries survive simplification

Pareto simplification must not mean generic unsafe control.

Preserve these boundaries unless an explicit later reviewed product decision changes them:

- MCP is the primary product contract;
- Grist remains authoritative for upstream permissions;
- bridge policy may reduce but never elevate upstream authority;
- credentials, bearer/OAuth tokens, API keys, encryption keys, LinkKeys and session secrets are never model-visible outputs, logs or committed files;
- no generic HTTP forwarding;
- no raw SQL model surface merely for convenience;
- no arbitrary Grist `/apply` or arbitrary UserAction model surface;
- mutations remain explicitly bounded and targeted;
- partial/non-atomic writes and ambiguous post-write states are never blindly replayed;
- principal-derived clients, discovery results and caches never cross principal boundaries.

Existing J0/J1 safety code is a component bank, not an architectural mandate. Retain the parts that directly enforce these boundaries; remove or bypass orchestration machinery that is unnecessary for the lean product.

### G11 — Deferred distribution is not latent committed work

A public-directory submission, reviewer package, publisher-specific requirement or institutional publication action marked **DEFERRED** is not work merely because preparation material exists.

- Controllers must not reactivate public distribution autonomously.
- Only an explicit human product decision may make public distribution an active roadmap objective again.
- Product evolution may freely invalidate or supersede earlier submission assumptions, metadata, reviewer fixtures or platform-specific preparation.
- When publication is explicitly resumed, revalidate the then-current product and platform requirements rather than preserving stale submission compatibility.

### G12 — Expert is an advisory lane, not a second Controller

Gia may use a strong reasoning model in an **Expert** role in parallel with Controllers. The Expert exists to improve difficult product/architecture decisions without taking implementation authority.

The Expert:

- starts from the exact current `main` SHA and reconstructs relevant mutable GitHub facts;
- may inspect runtime code, normative documentation, open PRs, official Grist behavior/documentation and relevant external references;
- performs deep analysis, threat/risk review, semantic comparison, design compression and forward-looking compatibility review;
- **must not modify runtime code, tests, dependencies, configuration, deployment, MCP schemas or product implementation**;
- **must not change Roadmap eligibility, Product Vision or this governance contract during an ordinary Expert run**;
- leaves durable advice only under `docs/expert/`, following `docs/EXPERT-PROTOCOL.md`;
- may open and, when the change is advisory-documentation-only and CI is green, merge its own short-lived report PR with `Review gate: NOT REQUIRED`;
- does not create committed work merely by recommending it;
- does not satisfy the independent exact-head review required by G7 unless it is launched separately under the independent-review protocol for that exact head;
- never blocks Controllers solely because an Expert report is absent or stale.

Controllers must consult any **relevant, still-applicable** Expert report before implementing or independently reviewing the same high-risk semantic area. They must revalidate mutable facts and may disagree with the recommendation when current repository/upstream evidence justifies it. If a Controller departs materially from a current Expert recommendation, record the reason in the implementation/review PR.

Expert reports are evidence, not authority. `main`, the normative files and the active Roadmap remain authoritative.

## Startup recovery and coherence

Every Controller execution begins with one bounded coherence pass:

1. resolve exact `main`;
2. read the three normative files;
3. inventory open PRs and unique unintegrated branches relevant to current work;
4. close/supersede work that the current roadmap explicitly retired;
5. check material consistency in this direction:

```text
runtime + public contract
        -> docs/ROADMAP.md
        -> docs/ARCHITECTURE.md + docs/SECURITY.md
        -> README / secondary docs
```

Historical milestone/evidence documents may remain as history. They are not current requirements unless the Roadmap names them.

Selection/security-critical drift is repaired before overlapping feature work. Projection-only README/history drift may wait for the relevant cleanup tranche.

## Finite roadmap execution

`docs/ROADMAP.md` is the authoritative dependency map.

For each active tranche it defines a finite committed set. Candidate ideas are not work merely because they are visible.

For **R6 — Pareto Convergence**, observation, product prioritization and implementation are deliberately separated:

1. **R6.1a** inventories meaningful ecosystem deltas;
2. **R6.1b** performs a static product-capability review across Grist capability families, current Gia coverage, prior exclusions and explicit product-owner limitations, without running real-application tests;
3. the resulting report is presented at the product-direction checkpoint and the product owner's priorities are recorded;
4. **R6.2** classifies/selects the resulting candidates;
5. only `ADOPT` items selected by R6.2 may enter **R6.3** implementation.

`ALREADY COVERED`, `DEFER` and `REJECT` items are not implementation work. R6.1b must decompose broad exclusions before discarding them; for example, application-level ACL rules are evaluated separately from generic identity/share administration, and bounded cross-table semantics separately from unrestricted SQL. **R7 — Usage-Driven Evolution** remains inactive until concrete real-use evidence is explicitly promoted into a finite roadmap tranche.

Selection order:

1. integrate or explicitly supersede already-open overlapping work;
2. complete the current finite tranche;
3. reuse/adapt existing external implementation before writing equivalent code;
4. remove obsolete complexity before adding replacement complexity;
5. implement only gaps required by the current tranche;
6. stop when the committed set is exhausted; do not invent another tranche.

A high-priority future production or distribution item does not block useful product construction. A **DEFERRED** distribution item is not a hidden next tranche and must not be selected without explicit human promotion.

## Reference review protocol

For every external source used in a product decision, record:

- repository/project and observed revision or date when practical;
- the exact behavior/component inspected;
- `REUSE`, `ADAPT`, `REIMPLEMENT` or `REJECT`;
- licensing implications;
- what is deliberately not imported.

Do not copy code from a repository whose relevant license is not confirmed.

The initial recomposition references are recorded in `docs/RECOMPOSITION-REVIEW.md`.

## Independent review protocol

A reviewer challenges only the submitted exact head and current tranche goal. Look for:

- correctness defects;
- accidental scope growth;
- duplicate implementation of something already available upstream;
- unsafe authority broadening;
- secret/privacy regressions;
- ambiguous/partial-write replay hazards;
- unstable Grist identifiers or guessed normalization;
- contract/documentation drift;
- licensing/provenance errors;
- test-platform growth disguised as product work.

Durable result:

```text
AUTONOMOUS REVIEW
Head: <exact full SHA>
Result: PASS
```

or:

```text
AUTONOMOUS REVIEW
Head: <exact full SHA>
Result: CHANGES REQUIRED

- <blocking finding>
```

A PASS plus green exact-head CI permits the same independent execution to merge if the head is unchanged.

## Construction versus validation

### R0-R3 — construct the product

Optimize for a coherent, small, reusable implementation. Keep only engineering feedback needed to maintain a working codebase.

### R4 — validate the product

Only after the product contract is frozen enough to be worth testing, run the comprehensive campaign: domain scenarios, real Grist documents, creation and modification, security cases, failure/recovery, browser-dependent behavior when relevant, reruns, compatibility and regression characterization.

### R5 — harden production; distribution remains optional

Production identity, credential custody and operational hardening may be completed after R4 when they serve real deployments. Public directory submission is optional future work and does not become active merely because R5 publication material exists.

### R6 — Pareto convergence

First compare the stable product against current official Grist MCP semantics and relevant ecosystem references. Then perform a **static product-capability review** designed to expose blind spots and over-broad exclusions before any selection. Do not use new real-application tests or domain fixtures to discover needs in this tranche. Present the capability report to the product owner, record their priorities, then classify/select the minimum useful subset. Do not pursue parity, and do not implement before the roadmap's selection step has classified a gap `ADOPT`.

### R7 — usage-driven evolution

No predeclared feature backlog follows R6. Real usage may justify a future finite tranche, but until such evidence is explicitly promoted, Controllers stop rather than inventing work.

## Controller protocol

1. Resolve exact `main` and read `AGENTS.md`, `docs/PRODUCT_VISION.md`, `docs/ROADMAP.md`.
2. Reconstruct current PR/branch state and retire superseded work.
3. Select the highest-value committed item in the active R tranche.
4. Perform the bounded external-reference review first.
5. Implement the smallest coherent change on a short branch.
6. Run baseline CI; add only focused construction-time tests when needed.
7. Open/update the PR with provenance, scope, what was deliberately not built, and review-gate classification.
8. Leave authored review-required heads for independent review, then continue any genuinely non-overlapping eligible work.
9. Never request a human implementation decision while useful committed work can progress by simplification or deferral. At an explicit roadmap product-direction checkpoint, however, present the requested decision-support report and stop rather than substituting an autonomous product-priority judgment.
10. Stop when no committed useful work remains. Deferred public-distribution actions are not committed work and must not be revived autonomously.
