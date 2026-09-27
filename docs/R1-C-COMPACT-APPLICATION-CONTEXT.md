# R1-C — Compact application context

Status: implementation candidate  
Base: exact `main` `ee23bf172ee9d3238f98ff4af0fb67b8e052cf88`  
Date: 2026-09-27

## Reference-first conclusion

### GristCoder

Observed revision: `nic01asFr/GristCoder@9362a58382937334afd3330e9f25bd96bdcad9c0`.

GristCoder's documented live context treats a Grist document as an application and combines schema, a foreign-key graph, pages and quality/state information in one contextual resource. Its architecture also includes plan/session state, quality auditing, plan-vs-reality delta, wizard phases, sub-agents and generated artefact code.

The repository is MIT-licensed. No source code is copied in this slice.

Decision: **ADAPT the semantic snapshot idea only**. `grist-chatgpt` already has the high-value generic ingredients — expanded table metadata, formula analysis, Ref/RefList graph, normalized pages/widgets and explicit incompleteness. It does not need GristCoder's session model, wizard, internal plan, sub-agents, artefact generator or plan-vs-reality engine.

### Existing `grist-chatgpt`

`DocumentContextService` already produces:

- tables and stable column IDs;
- formula text and bounded reference/dereference diagnostics;
- Ref/RefList relationships with verified reverse links when resolvable;
- normalized page/widget context through `DocumentUiService`;
- no user-table row scan.

The remaining issue is that the global document snapshot embeds the full `DocumentUiContext`, including raw/private Grist metadata that is useful internally for precise updates but unnecessary for reasoning about the application:

- `pageRecordId`;
- numeric `tableRef`;
- raw `layoutSpec`;
- raw widget `options`;
- raw numeric `sortColRefs`;
- raw numeric select-by section/column references.

These coexist with already-normalized semantic equivalents.

## R1-C change

`inspectDocument` keeps one compact application snapshot but now projects its UI part to semantic state only.

Kept in the compact snapshot:

- stable page and widget IDs;
- page name/type/order/indentation;
- normalized layout expressed with stable widget IDs;
- widget table ID/type/title/description/chart type;
- saved sort expressed with stable column IDs;
- normalized select-by expressed with stable widget/column IDs;
- normalized custom-widget settings and grid options;
- granular normalization-incomplete markers;
- document/UI counts;
- an explicit aggregate `uiIncomplete` / `ui.summary.incomplete` signal;
- `metadataSnapshotIncomplete` when the bounded metadata read may have truncated the page/widget graph.

The detailed `getPages` / `getPageWidgets` paths remain unchanged. Internal raw metadata also remains available to the update implementation where it is needed to preserve untargeted state and verify writes; it is simply no longer copied indiscriminately into the global reasoning snapshot.

## Why no generic delta engine

The roadmap says a requested/known-state delta may be exposed when it can be expressed generically. R1-C does not introduce a server-side desired-state object, session plan or internal lifecycle, so there is no generic requested state to compare against current Grist state.

The agent can instead:

1. inspect the compact current snapshot;
2. reason about the user's requested state externally;
3. issue one bounded semantic mutation at a time;
4. re-inspect the relevant semantic state.

This preserves the product rule: **agent reasons; bridge executes**.

## Deliberate omissions

- no session/project-plan persistence;
- no wizard or phase machine;
- no sub-agent architecture;
- no generated artefact/code context;
- no generic diff/patch engine;
- no row-data preload;
- no new private metadata exposure;
- no comprehensive domain/browser validation campaign.

## Review requirement

**Review gate: REQUIRED.**

This changes the active `inspectDocument` runtime output contract. Exact-head CI and an independent exact-head review are required before integration.