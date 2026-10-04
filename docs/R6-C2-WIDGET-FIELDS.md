# R6.3 C2 — widget visible fields, order and width

Date: 2026-10-04

Status: implementation slice for the R6.2-selected **C2** capability.

## Current reference / provenance

Observed before implementation:

- Grist release **v1.7.16** documents MCP widget field configuration including column width; current Grist release at review time is **v1.7.20**.
- Current public `gristlabs/grist-core` default branch was observed at `72345cbe06cad2ddeee4a9db1e133d82f1fd2294`.
- Grist's native metadata model represents visible widget fields in `_grist_Views_section_field` with `parentId`, `parentPos`, `colRef`, `width` and additional field-owned metadata. Current Grist client code also creates/reorders those records for native view fields.

Disposition: **REIMPLEMENT the bounded semantic behavior**. No Grist MCP implementation source and no community-project source code is copied by this slice.

## Gia semantic boundary

C2 extends the existing `grist_inspect` / `grist_change_ui(action="update_widget")` shape; it does not add a public tool.

Inspection exposes only:

- ordered `visibleFields`;
- stable current `columnId`;
- positive stored `width` when explicitly present;
- an explicit incompleteness marker when the bridge cannot safely normalize the native metadata.

Mutation accepts a complete ordered visible-field list of zero to 200 entries. An empty list hides all fields. Each entry uses a stable current `columnId`; an optional width is an integer from 1 to 2000 pixels.

The bridge keeps native field record IDs and column references private. It preserves all untargeted widget metadata and all non-position/non-width metadata on fields that remain visible. Hiding a field uses Grist's native removal semantics for that view field; it never deletes the underlying table column.

## Safety / write semantics

Before writing, Gia requires:

- a complete UI metadata snapshot;
- expanded stable column metadata for the widget's current table;
- a complete, unambiguous mapping between native field records and stable column IDs;
- no duplicate or unknown requested columns.

The adapter generates only the finite metadata actions needed to remove hidden fields, reorder retained fields, resize explicitly targeted retained fields and add newly visible fields. These actions are sent in **one** Grist `/apply` request together with any other fields of the same bounded widget update.

After the write, Gia re-reads the widget with expanded columns and field metadata and verifies the complete normalized ordered field list. A failed or ambiguous postcondition raises the existing `UiWriteVerificationError`; callers must not blindly replay the operation.

## Deliberate non-work

C2 does not expose:

- raw `_grist_Views_section_field` record IDs;
- arbitrary `widgetOptions`, `visibleCol`, `displayCol`, rules or private JSON;
- field formatting or conditional styling (C6 remains deferred);
- card field layout (C5 remains a separate selected slice);
- persistent widget filters (C4 remains the next selected slice);
- generic Grist `/apply` or UserActions.
