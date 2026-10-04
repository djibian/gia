# R6 C3 — native summary construction

## Status

**Implemented in the R6.3 C3 slice.**

C3 extends the existing `grist_add_ui(action="add_widget")` intention. It does
not add an MCP tool, does not emulate summaries with ordinary tables, and does
not expose generic Grist `/apply` or generated-table internals.

## Current Grist provenance

The implementation rechecked current upstream Grist before coding.

- Upstream source inspected at `gristlabs/grist-core`
  `72345cbe06cad2ddeee4a9db1e133d82f1fd2294` on 2026-10-04.
- Native `CreateViewSection(tableRef, viewRef, type, groupby_colrefs, tableId)`
  creates a summary-backed section when `groupby_colrefs` is a list rather
  than `None`.
- Current Grist records the generated table's source in
  `_grist_Tables.summarySourceTable`.
- Each generated group-by column points back to its source column through
  `_grist_Tables_column.summarySourceCol`.
- Grist keys/reuses native summary tables by the source grouping set. A second
  widget may therefore reuse an already-generated summary table instead of
  creating another one.

Grist source is Apache-2.0 and is used here as the functional oracle. Gia
reimplements only the selected behavior through its existing private adapter;
no upstream code is copied.

## Public normalized contract

`grist_add_ui(action="add_widget")` keeps its existing inputs and adds one
optional field:

- `groupByColumnIds`: zero to 20 unique stable column IDs from the requested
  non-summary source table.

Omitting the field preserves ordinary widget creation. Supplying it, including
an empty list for a native grand-total summary, requests a Grist-native summary
section. Gia resolves the stable IDs to private numeric Grist refs internally.

The result keeps the normal created widget projection and adds:

- `summary.sourceTableId`;
- `summary.summaryTableId`, the actual generated/reused native summary table;
- `summary.groupByColumnIds`, the requested stable grouping identities after
  native postcondition verification.

No private table refs, column refs, summary metadata record IDs, aggregate
formula internals, or raw UserActions are public inputs.

## Bounds and deliberate exclusions

C3 is intentionally narrower than Grist's full summary machinery:

- the source must be an ordinary current table, not another generated summary;
- group-by IDs must exist on that exact source table and be unique;
- at most 20 group-by columns are accepted;
- generated summary tables remain non-generic internals: Gia does not promote
  them into a new create/update/delete surface;
- aggregate formulas and generated helper/group columns are owned by Grist;
- this slice does not add cross-table query/aggregation, import, styling, card
  layout, ACL authoring, or document lifecycle behavior.

The existing supported widget-type set is unchanged. Grist remains
authoritative for whether a requested native widget type is compatible with the
summary construction.

## Verification and authority

Native `CreateViewSection` returns the **source** `tableRef` even when it creates or reuses a distinct summary table. Gia therefore treats `sectionRef` as the created widget identity, verifies that the returned `tableRef` still matches the requested source, then re-reads the section and expanded table metadata. It verifies all of the following before returning success:

1. the returned widget exists on the requested page;
2. the re-read widget resolves to a generated/reused table distinct from the source;
3. that generated table identifies the requested source through native `summarySourceTable`;
4. its native group-by columns point through `summarySourceCol` to exactly the requested source-column set;
5. the public `summary.summaryTableId` is the stable ID of that verified re-read generated table.

If the action response or post-write read is incomplete or inconsistent, the
existing UI ambiguous-write rule applies: the native write may already have
succeeded and the whole request must not be blindly replayed.

C3 does **not** claim that a distinct generated summary table inherits every
source-table ACL effect. Grist remains authoritative for access enforcement,
and C1 is the separate R6 slice for bounded application-policy semantics.
