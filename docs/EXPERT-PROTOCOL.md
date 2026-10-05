# Expert protocol

## Purpose

Gia has two explicit, model-agnostic Expert modes alongside the ordinary Controller lane:

- **Expert Analyst** — deep read-only analysis, challenge and recommendation;
- **Expert Developer** — deep implementation of an explicitly validated Analyst scope.

Controllers remain responsible for ordinary Roadmap execution. The two Expert modes exist to preserve a clean separation between understanding a difficult product problem and exhaustively resolving a validated expert diagnosis.

## Shared state discipline

Every Expert execution:

1. resolves the exact current `main` SHA;
2. reads `AGENTS.md`, `docs/PRODUCT_VISION.md`, `docs/ROADMAP.md`, this protocol, `docs/ARCHITECTURE.md` and `docs/SECURITY.md` from that state;
3. reconstructs relevant mutable GitHub facts instead of trusting chat history;
4. inventories materially relevant `docs/expert/` reports and their staleness triggers;
5. rechecks current upstream/external evidence when it can materially change the conclusion;
6. treats conversation memory as non-authoritative.

Experts never coordinate through guessed private execution state. Durable GitHub state is the coordination surface.

## Expert Analyst

### Purpose

The Expert Analyst spends deeper reasoning and research effort on difficult semantic, architectural, security, code-quality and product-boundary questions. It challenges the product as a system and recommends what should change.

Good uses include whole-product or pre-release reviews, authority-sensitive design, repeated defects that suggest a wrong abstraction, architectural compression, upstream semantic comparison, and investigation of recommendations that ordinary Roadmap execution may not naturally surface.

### Read-only phase

Before explicit human validation, an Analyst run is repository read-only. It may inspect code, tests, documentation, PRs, official Grist behavior/source and admitted external references, but it must not modify the repository in any way.

The Analyst must:

- distinguish facts, upstream observations and inference;
- identify bugs, architectural gaps, unsafe assumptions, missing generic capability, obsolete complexity and maintenance risk;
- consider the smallest viable option and explicit non-work;
- group all genuine human decisions instead of discovering them one by one during implementation;
- finish with a concise proposed treatment and proposed Expert Developer scope;
- stop for explicit human validation before any repository write.

The Analyst does not issue a G7 PASS merely because it inspected an implementation head.

### Validated report

After explicit validation, the Analyst may create exactly one new report under:

`docs/expert/YYYY-MM-DD-<short-scope>-<main7>.md`

The report records:

- exact base `main`;
- evidence and material findings;
- the human decisions actually made;
- accepted, rejected and deferred recommendations;
- a finite `Expert Developer scope` made of accepted finding IDs;
- staleness triggers and provenance.

Its header is:

```text
EXPERT ANALYSIS
Date: YYYY-MM-DD
Base main: <exact full SHA>
Scope: <bounded subject>
Status: VALIDATED ANALYSIS — NOT CONTROLLER ROADMAP AUTHORITY
Expert Developer scope: <accepted finding IDs, or none>
Activation: EXPLICIT EXPERT DEVELOPER LAUNCH REQUIRED
```

A validated report is durable decision/evidence input. It does not by itself start implementation, alter the Roadmap or create ordinary Controller eligibility.

The Analyst may integrate that report through a documentation-only PR after validation. It must not combine the report with product implementation or normative governance changes.

## Expert Developer

### Purpose

The Expert Developer exists for the gap between ordinary Roadmap execution and a deep validated expert diagnosis. It is launched explicitly on one or more validated Analyst reports and treats the accepted scope exhaustively rather than stopping because a recommendation is not encoded as a Roadmap task.

### Authority

The combination of:

1. an integrated validated Analyst report with a finite `Expert Developer scope`; and
2. an explicit Expert Developer launch on that scope

is implementation authority for that Expert Developer execution.

This authority is exceptional and local to the validated scope. It **does not**:

- rewrite or implicitly promote the Roadmap;
- make the work automatically eligible to Controllers;
- authorize unrelated feature development;
- authorize a new product/public-contract/authority decision that the validated analysis did not settle.

Inside the validated scope, the Expert Developer may modify runtime code, tests, dependencies, configuration and documentation as necessary. Ordinary technical choices are autonomous.

If a new material product, public-contract, security/authority, compatibility or irreversible external decision appears, the Expert Developer must stop before that affected change, group all such decisions, and return them for human choice.

### Resolution discipline

At startup, the Expert Developer revalidates every named report against current `main` and classifies applicability as `CURRENT`, `PARTIALLY STALE` or `STALE`.

It then creates a resolution ledger covering every accepted in-scope finding. No finding may disappear merely because it is absent from the active Roadmap.

Allowed terminal states are:

- `RESOLVED`;
- `ALREADY RESOLVED`;
- `NO CHANGE JUSTIFIED`;
- `DEFERRED BY VALIDATED DECISION`;
- `SUPERSEDED`;
- `HUMAN GATE`.

Implementation should investigate root cause, minimize product surface, preserve Gia's safety invariants and verify relevant postconditions. A recommendation may be narrowed or rejected only with concrete current evidence.

### PR and review rules

Normal repository rules remain in force:

- PRs are the unit of integration;
- optimistic concurrency applies;
- relevant Expert reports must be declared in the PR's `Expert advisory` block;
- G7 review is required whenever the change falls under G7;
- an Expert Developer that authored or materially modified a review-required exact head cannot independently PASS or merge that same head.

A PR that implements a validated Analyst finding must identify the source report and finding IDs plus their resulting resolution status.

## Controllers and Expert reports

Controllers remain the ordinary autonomous development lane and select work from the current authoritative Roadmap. A validated Analyst report does not add hidden Controller work.

Controllers must still inventory `docs/expert/*.md` and consult every materially relevant still-applicable report before finalizing implementation or independent review conclusions.

For each relevant report they classify applicability:

- `CURRENT` — material findings still apply;
- `PARTIALLY STALE` — only identified parts remain applicable;
- `STALE` — a staleness trigger or semantic change invalidates it for the current decision.

Every `Review gate: REQUIRED` PR keeps the existing evidence block:

```text
Expert advisory:
- consulted: <docs/expert/... paths, or none>
- applicability: CURRENT | PARTIALLY STALE | STALE | NONE RELEVANT
- applied constraints: <compact list, or none>
- departures: <none, or concise evidence-backed reason>
```

When no report is materially relevant, use `consulted: none` and `applicability: NONE RELEVANT`.

The independent G7 reviewer repeats this relevance check. A PASS is invalid when a materially relevant current report was omitted, unread, materially misclassified or departed from without evidence.

## Staleness and history

A report is not stale merely because `main` advanced. Use its declared staleness triggers and the semantics of intervening changes.

Historical reports remain immutable evidence of the state and protocol that existed at their exact base. Do not rewrite old reports merely because prompt names, Expert roles or governance later changed.

Validated Analyst reports may authorize later Expert Developer work only for findings that remain applicable. If staleness changes the product decision rather than merely the technical implementation, obtain a fresh Analyst/human decision before proceeding.

## Parallelism

Zero, one or many Controllers and Experts may exist concurrently. Each execution reconstructs durable state independently. No role should delay unrelated eligible work merely because another private execution may exist.