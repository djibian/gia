# R6 C5 — Card/Card List field layout

Status: **integrated in R6.3 C5**. Release stabilization additionally handles the native stale-leaf state produced when C2 hides or re-shows fields.

## Product boundary

C5 adds one bounded semantic capability to the existing MCP v2 UI surface:

- inspect the persisted field layout of native Grist **Card** (`single`) and **Card List** (`detail`) widgets using stable column IDs;
- replace that layout with one complete bounded tree over the widget's **currently visible** fields;
- accept only stable column IDs in the C5 contract; C5 adds no raw BoxSpec or private field-ref mutation input. The pre-existing raw `layoutSpec` compatibility output remains unchanged and is not the C5 semantic interface.

C5 does **not** show or hide fields. C2 remains the separate intention for the visible-field set/order/width. A single `update_widget` call cannot combine `visibleFields` and `cardLayout`; callers update the visible set first, then arrange it.

## Current Grist provenance

Reviewed against current `gristlabs/grist-core` main:

- commit: `72345cbe06cad2ddeee4a9db1e133d82f1fd2294`
- `app/client/ui/widgetTypesMap.ts`: `single` is Card and `detail` is Card List;
- `app/client/ui/ViewLayoutMenu.ts`: both native types expose **Edit card layout**;
- `app/client/components/RecordLayout.js`: persisted card layouts use view-field row IDs as private leaves and are saved in `_grist_Views_section.layoutSpec`;
- `app/common/BoxSpec.ts`: native layout nodes are bounded JSON objects made from `leaf`, `children` and optional positive `size`;
- `app/client/components/Layout.ts`: `size` is the native flex-size value.

Gia reimplements only the semantic translation needed for C5. No Grist source code is copied.

## Stable public representation

The public normalized tree is:

```text
field(columnId, size?)
group(children[], size?)
```

Read results also expose `unplacedColumnIds`. These are currently visible fields that are absent from the persisted BoxSpec. Grist's client can synthesize/default-place such fields at render time; Gia deliberately does **not** reproduce that version-sensitive UI algorithm. This makes the read model explicit rather than guessed.

A write must place every currently visible field exactly once. Unknown, duplicate, omitted, malformed, too-deep or too-large trees are rejected.

## Safety and postconditions

- Only `single` / `detail` widgets accept `cardLayout`.
- Private view-field IDs are resolved from current metadata immediately before the write.
- The layout is bounded to 500 nodes and depth 50.
- Sizes must be finite and strictly positive, matching the native BoxSpec constraint.
- Positive persisted field leaves that no longer resolve after a native hide/re-show are treated as stale native leaves and pruned from the normalized view; redundant size-less wrappers created only by that pruning are collapsed. Existing malformed, ambiguous or otherwise unsupported card-layout metadata is still not overwritten.
- The bridge writes only the trusted resolved `layoutSpec` on the explicitly targeted section.
- The exact stable normalized layout is re-read and compared after mutation.
- Ambiguous post-write state retains the existing non-blind-retry `UiWriteVerificationError` behavior.
- No tool is added; MCP v2 remains ten tools.
- C5 does not expand the historical raw `layoutSpec` compatibility surface; callers use normalized `cardLayout` for this capability.
