# R6 C10 — Page navigation ordering

Status: **integrated in R6.3 C10**. The current inspection contract also exposes the exact eligible navigation set as `navigationPageIds`.

## Product boundary

C10 adds one bounded semantic capability to the existing MCP v2 UI surface:

- inspect page IDs through the existing page inspection operation;
- replace the order of the pages currently eligible for normal navigation with one complete stable page-ID list;
- preserve the existing page tree exactly.

C10 does **not** add folders, navigation groups, indentation editing, hidden-page administration or a generic metadata-table mutation surface.

## Current Grist provenance

Reviewed against current `gristlabs/grist-core` main:

- commit: `72345cbe06cad2ddeee4a9db1e133d82f1fd2294`;
- `app/common/schema.ts`: `_grist_Pages.pagePos` is the native `PositionNumber` ordering field and `indentation` carries hierarchy;
- `app/client/models/DocModel.ts` and `app/client/ui/Pages.ts`: normal page navigation is derived from pages ordered by `pagePos`, with hidden/special page handling;
- `app/client/models/TreeModel.ts`: native drag/drop can mutate both order and indentation when the user intentionally reparents a subtree;
- `sandbox/grist/treeview.py`: hierarchy is encoded by indentation in ordered page records.

Grist is Apache-2.0. Gia **REIMPLEMENTS** only the selected stable semantic behavior on top of the existing bounded metadata action adapter. No Grist source code is copied.

## Stable public representation

The public C10 input is a complete ordered array of positive stable page IDs:

```text
pageIds: [pageId, ...]
```

The list must contain every currently navigable page exactly once. `grist_inspect(action="document")` and `grist_inspect(action="pages")` return `navigationPageIds`, the exact stable page-ID set accepted by this complete-list intention. Private `_grist_Pages` record IDs and raw `pagePos` values are never C10 mutation inputs; legacy MCP v2 detailed read projections may still contain raw compatibility metadata outside this normalized C10 contract.

Gia conservatively treats censored/empty-name pages, `GristDocTour`, `GristDocTutorial` and pages backed by `GristHidden_*` primary tables as non-targetable. This deliberately avoids importing client-only flags that can temporarily expose Grist's special pages.

## Hierarchy-preserving semantics

A page's parent is implied by its position and indentation. Therefore a flat permutation can accidentally reparent a nested page even when no `indentation` field is written.

C10 prevents that:

- current page metadata must have unique finite positions and a supported indentation shape;
- requested IDs are resolved against a fresh complete metadata snapshot;
- each requested visible page is assigned one of the exact `pagePos` slots previously occupied by visible pages;
- special/censored/untargeted page rows keep their positions;
- the resulting full page sequence is simulated before writing;
- every persisted page must retain the same parent and indentation;
- a hierarchy-changing permutation is rejected rather than normalized or guessed.

This permits sibling/subtree reordering when the existing tree remains identical, without creating an indentation/folder API.

## Native write and postconditions

The bridge emits at most one trusted `BulkUpdateRecord` over `_grist_Pages`, changing only `pagePos` for the resolved page records whose slot changes.

After the write Gia re-reads the same bounded page/view/table metadata and requires exact equality with the expected normalized snapshot:

- same page identities;
- same visible page-ID order;
- same native positions;
- same indentation and parent relation;
- same censored/special classification.

A divergent or unreadable post-state becomes the existing non-blind-retry `UiWriteVerificationError`. A no-op order is accepted without emitting a Grist write.

## Deliberate exclusions

C10 does not expose:

- raw `_grist_Pages` record IDs as mutation inputs;
- raw `pagePos` values as mutation inputs;
- `indentation` mutation;
- arbitrary tree moves/reparenting;
- page visibility/collapse settings;
- generic metadata or UserAction input.

The ten-tool MCP v2 surface stays unchanged.
