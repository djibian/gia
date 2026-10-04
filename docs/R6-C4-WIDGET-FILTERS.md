# R6 C4 — persistent widget filters

## Status

**Implemented in the R6.3 C4 slice.**

C4 extends the existing `grist_inspect` / `grist_change_ui(action="update_widget")`
surface. It does not add a public MCP tool and does not expose raw Grist metadata
tables or UserActions.

## Current Grist provenance

The implementation rechecked current upstream Grist before coding.

- Upstream source inspected at `gristlabs/grist-core`
  `72345cbe06cad2ddeee4a9db1e133d82f1fd2294` (2026-10-03).
- Current Grist persists saved per-widget filters in `_grist_Filters` with
  `viewSectionRef`, `colRef`, serialized `filter`, and `pinned`.
- Schema migration 25 moved persisted filters away from the legacy
  `_grist_Views_section_field.filter`; migration 34 added `pinned` and deprecated
  the old section `filterBar` option.
- Current `app/common/FilterState.ts` represents native filter state as either
  `included`/`excluded` values or `min`/`max` bounds.
- Current Grist help documents saved filters as persistent widget/view state and
  pinning as a UI exposure choice, not an access-control mechanism.

Grist source was used as a behavior oracle. Gia's implementation is independent;
no upstream code is copied into this repository.

## Public normalized contract

Inspection exposes only stable current column IDs:

- `mode: "include"` with bounded scalar `values`;
- `mode: "exclude"` with bounded scalar `values`;
- `mode: "range"` with at least one finite numeric `min`/`max`;
- explicit `pinned` state;
- `filtersNormalizationIncomplete: true` when native state cannot be represented
  safely by this selected subset.

`grist_change_ui(action="update_widget")` accepts a targeted `filters` list.
Each column may appear at most once in one call:

- `include`, `exclude`, and `range` set that column's saved filter;
- `remove` deletes only that column's saved filter;
- omitted `pinned` preserves pinning for an existing filter;
- a newly created filter defaults to `pinned: true`.

The bridge resolves stable column IDs to private Grist references internally.
Native filter record IDs, column refs, serialized filter JSON, and generic
`_grist_Filters` access are never public inputs.

## Bounds and deliberate exclusions

One update targets at most 200 columns. An include/exclude filter contains at most
200 scalar values; string values are capped by the MCP schema. Numeric range
bounds must be finite and ordered.

This slice deliberately excludes:

- relative-date objects and other version-sensitive native filter encodings;
- arbitrary filter JSON;
- generic metadata-table access;
- transient `grist_query` predicates (a different semantic);
- saved sorting (already supported separately);
- conditional styling;
- ACL or security-policy semantics.

If current native filter metadata is malformed, duplicated, truncated, references
an unknown column, or uses an unsupported encoding, Gia refuses mutation rather
than guessing.

## Preservation and write semantics

C4 is a targeted patch, not a complete-list replacement. Untargeted saved filter
records and their pinning are not rewritten. Filter changes are combined with any
other requested widget changes in one bounded Grist `/apply` call generated
inside the private UI adapter.

After the write, Gia re-reads the widget metadata and verifies the complete
normalized filter state. A missing/ambiguous response or failed re-read is treated
with the existing UI ambiguous-write rule: the write may already have succeeded,
so the whole operation must not be blindly replayed.

Persistent filters are presentation/view state. They must never be described or
relied on as access control; Grist ACL enforcement remains the security boundary.
