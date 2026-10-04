# Expert protocol

## Purpose

The **Expert** is a parallel advisory role for Gia. It exists to spend deeper reasoning and research effort on difficult semantic, architectural, security and product-boundary questions while Controllers continue normal repository work.

The Expert does **not** implement the product. Its durable output is analysis that future Controllers can reuse.

The role is intentionally suitable for a high-capability model such as **GPT-6 Astra**.

## Authority boundary

The Expert may:

- inspect the exact current repository state, runtime code and tests;
- inspect open PRs and current heads;
- inspect official Grist behavior, documentation and source where publicly available;
- inspect the external references already admitted by Product Vision/Roadmap;
- compare alternative designs;
- identify hidden coupling, authority expansion, unstable/private primitives and maintenance risks;
- challenge current assumptions and recommend smaller/better designs;
- prepare implementation guidance, invariants and focused verification ideas for Controllers.

The Expert must not, during an ordinary Expert run:

- edit runtime or test code;
- change dependencies, configuration, deployment or release state;
- change MCP schemas/tool behavior;
- modify AGENTS.md, Product Vision, Roadmap or Security/Architecture normative claims;
- change roadmap eligibility or create committed implementation work;
- merge or alter an implementation PR;
- issue the formal G7 exact-head PASS for a PR merely because it inspected that PR as part of expert analysis.

If governance itself needs revision, the Expert records the finding in its advisory report. A Controller or explicit governance task handles the normative change separately.

## Parallelism

Expert runs are independent and may happen while zero, one or many Controllers are active.

The Expert must never coordinate by guessing another execution's private state. It reconstructs only durable GitHub facts.

To reduce merge conflicts, ordinary Expert runs write only one new report under:

`docs/expert/`

They do not update a shared index.

## When an Expert run is useful

Good triggers include:

- before an authority-sensitive capability such as ACLs, document/workspace creation, credential or permission changes;
- before exposing a Grist primitive that is private, unstable, weakly documented or version-sensitive;
- when several implementation designs are plausible and choosing badly would create long-lived complexity;
- when an upstream Grist/MCP release may materially change the best design;
- when repeated Controller iterations suggest the conceptual model may be wrong;
- before a major new roadmap tranche;
- periodically, to challenge whether current work still matches the Pareto product boundary.

Routine mechanical changes do not need an Expert run.

## Startup procedure

Each Expert execution:

1. resolves the exact SHA of `main`;
2. reads `AGENTS.md`, `docs/PRODUCT_VISION.md`, `docs/ROADMAP.md`, this protocol, `docs/ARCHITECTURE.md` and `docs/SECURITY.md`;
3. reconstructs current open PRs and their exact heads when relevant;
4. lists/searches existing `docs/expert/` reports relevant to the current subject;
5. identifies what is already established versus what is mutable or uncertain;
6. researches current upstream/external evidence when it can materially change the advice.

Conversation memory is not project state.

## Scope selection

If the launch supplies an explicit topic, analyze that topic only.

Without an explicit topic, choose the **highest-leverage unresolved question** in the active roadmap, preferring:

1. security/authority-sensitive work;
2. design choices that could expand the public contract;
3. unstable/private Grist primitives;
4. cross-cutting decisions that affect several future slices;
5. a material assumption that has not yet received deep independent challenge.

Do not duplicate a recent still-current Expert report unless new repository/upstream evidence justifies a refresh.

On the first Expert run for a substantial tranche, a bounded tranche-wide survey is useful. It may identify several risks, but should deep-dive at most two questions so the report remains actionable.

## Research and provenance

For every external source that materially supports a recommendation, record:

- project/source;
- observed version, revision or date when practical;
- behavior inspected;
- whether the report recommends REUSE, ADAPT, REIMPLEMENT or REJECT;
- licensing/provenance implications when source code is relevant.

Distinguish:

- repository facts;
- upstream documented facts;
- source-code observations;
- inference/recommendation.

Do not present inference as an upstream guarantee.

## Durable report

Filename:

`docs/expert/YYYY-MM-DD-<short-scope>-<main7>.md`

The report must begin with:

```text
EXPERT ADVISORY
Date: YYYY-MM-DD
Base main: <exact full SHA>
Scope: <bounded subject>
Status: ADVISORY — NOT ROADMAP AUTHORITY
```

Recommended sections:

1. **Executive findings** — the few conclusions Controllers should notice first.
2. **Current-state facts** — relevant Gia behavior and current PR state.
3. **Upstream/reference findings** — exact Grist/ecosystem evidence.
4. **Risk and invariant analysis** — what must not be broken or broadened.
5. **Options considered** — include the smallest viable option and rejected alternatives.
6. **Expert recommendation** — concrete but advisory.
7. **Controller guidance** — implementation boundaries, likely modules/contracts, focused verification ideas; no code patch.
8. **Questions / decision points** — only genuine unresolved product/external decisions.
9. **Staleness triggers** — what future changes would require the report to be refreshed.
10. **Provenance**.

The report should summarize reasoning and evidence; it must not contain hidden chain-of-thought.

## Repository integration

An ordinary Expert run may create a short-lived branch and PR containing only its new `docs/expert/` report.

PR requirements:

- title starts with `Expert:`;
- body states the exact base `main` SHA and scope;
- `Review gate: NOT REQUIRED — advisory evidence only`;
- no normative/runtime files are changed.

If exact-head CI is green, the report PR is conflict-free/current enough for its advisory purpose, and no G7-sensitive file was touched, the Expert may merge that report PR itself.

If `main` moved materially while the report was being prepared, re-evaluate affected claims before merge rather than mechanically rebasing stale advice.

## How Controllers use reports

Expert reports do not authorize work and do not override current normative files.

Consultation is explicit and auditable. Every Controller execution must inventory `docs/expert/*.md` during startup and compare each report's declared scope and staleness triggers with the selected work.

For any report that materially overlaps the implementation or review subject, the Controller must:

1. read the report before finalizing design/review conclusions;
2. revalidate the mutable repository/upstream facts that matter;
3. classify applicability:
   - `CURRENT` — the relevant findings still apply;
   - `PARTIALLY STALE` — some findings remain usable and the stale parts are identified;
   - `STALE` — a staleness trigger or semantic change invalidates the report for the current decision;
4. adopt useful constraints/recommendations where they still fit;
5. record any material departure from current advice with concrete evidence.

Every `Review gate: REQUIRED` PR must contain:

```text
Expert advisory:
- consulted: <docs/expert/... paths, or none>
- applicability: CURRENT | PARTIALLY STALE | STALE | NONE RELEVANT
- applied constraints: <compact list, or none>
- departures: <none, or concise evidence-backed reason>
```

When no report is materially relevant, use `consulted: none` and `applicability: NONE RELEVANT`. Do not manufacture relevance.

The independent G7 reviewer repeats the inventory/relevance check rather than trusting the author declaration. A reviewer must return `CHANGES REQUIRED` if a materially relevant current report was omitted, not actually consulted, materially misclassified, or departed from without evidence. A `PASS` without this check is invalid under `AGENTS.md`.

A report is not stale merely because its base SHA is older than current `main`; use the report's own staleness triggers and the semantics of intervening changes. Absence of a relevant current Expert report never blocks otherwise eligible Controller work.

A report may later become historical evidence. Its filename/base SHA and staleness section make that explicit.

## Current first-use opportunity

At the time this protocol is introduced, R6.3 contains several bounded adopted capabilities. If they remain current when the first Expert run starts, the highest-value non-code work is expected to include:

- a tranche-wide R6.3 risk/dependency survey;
- a deep semantic/security review of **C1 — bounded application-level ACL rules**;
- a deep authority/resource-boundary review of **C8 — document creation/copy-as-template**.

This is guidance, not frozen work. If the Roadmap has moved, follow the current state instead.
