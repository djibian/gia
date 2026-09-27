# R2 — Missing Grist Semantics Audit

Date: 2026-09-27

Baseline audited: `djibian/grist-chatgpt@9b25702a13c0891a69932bd592d0d4f6da1768f1` after R1 integration.

## Purpose

R2 is not a feature harvest. It asks a narrower question: after the R1 compression, is a generic Grist construction/modification capability materially incoherent because a necessary Grist semantic is missing?

A candidate is implemented only when all four conditions hold:

1. it is required for generic application construction or modification rather than one business case;
2. a stable Grist Community primitive exists;
3. it fits the compact authorized execution path without planner, lifecycle, arbitrary SQL, generic `/apply`, or opaque transaction machinery;
4. adding it is materially more coherent than composing existing bounded operations.

## References inspected

- Official Grist MCP documentation, inspected 2026-09-27: current surface includes document/schema/data/UI operations including page and page-widget removal.
- `gristlabs/grist-core@34542eab62f0decb309a7e0476c3009fc6567f29`: Community user actions show `RemoveView` and `RemoveViewSection` as deprecated wrappers and explicitly prefer `RemoveRecord` on `_grist_Views` and `_grist_Views_section` respectively.
- `gwhthompson/grist-mcp-server@d75706c2dec283502e2bedd1cd1feae8f709f379`: compact TypeScript behavior reference. Its README advertises Apache-2.0, but no root `LICENSE` file was present at the inspected ref; no source code is copied from it.
- `nic01asFr/GristCoder@9362a58382937334afd3330e9f25bd96bdcad9c0`: broad application-building/context reference. Wizard, agent/session lifecycle, generated artifacts and application-specific orchestration are intentionally not adopted.
- `nic01asFr/mcp-server-grist@8958198d008223e1c9e43d4a55ac7b31cab0ca51`: broad Python behavior reference. No source code is copied.

## Gap classification

| Candidate semantic | Classification | Decision |
| --- | --- | --- |
| Delete one page | **REIMPLEMENT** | Required to evolve/repair a generic application rather than only append UI. Use one targeted `RemoveRecord` on `_grist_Views`, behind existing `doc.schema:write`, with complete pre-read and absence verification after write. |
| Delete one page widget | **REIMPLEMENT** | Same reasoning. Use one targeted `RemoveRecord` on `_grist_Views_section`, verify exact page/widget membership before write and widget absence/page preservation after write. |
| Formula creation/update | **REUSE** | Already present in the bounded column mutation contract; no new public feature needed. |
| Organisation/workspace discovery tools | **REUSE** | Existing document discovery already returns organisation/workspace context for allowed documents. Separate tools would enlarge the surface without unlocking construction. |
| Raw SQL / natural-language-to-SQL | **REJECT** | The LLM client already reasons over semantic tools; arbitrary SQL would broaden authority and revive an escape hatch explicitly excluded by the product vision. |
| Generic `/apply` / arbitrary user actions | **REJECT** | Conflicts with bounded semantic operations and the authority boundary. |
| Upsert/import abstraction | **DEFER** | Existing query + explicit add/update operations can express the required semantics. A generic upsert would add target-resolution ambiguity before a concrete need exists. |
| Create/copy document | **DEFER** | Construction inside an existing empty/minimal document is sufficient for the product validation path. Workspace-level document creation broadens authority and is not required yet. |
| Page reordering / additional UI cosmetics | **DEFER** | Useful but not required for coherent generic construction/modification with current page/layout/widget operations. |
| Attachments, snapshots, exports, webhooks | **DEFER** | Useful ecosystem capabilities, but not required by the generic construction/modification kernel. |
| Generic ACL editing | **DEFER** | Access-policy preservation matters; generic ACL authoring is a separate authority problem and is not required by R2. |
| Wizard, planner, subagents, sessions, generated application artifacts | **REJECT** | These belong in the LLM client or business/product layers, not in the bridge runtime. |

## Implemented R2 delta

The only required generic gap is closed without adding an MCP tool:

- `grist_change_ui(action="delete_page", documentId, pageId)`;
- `grist_change_ui(action="delete_widget", documentId, pageId, widgetId)`.

Both reuse the existing authorization/audit path. Both require stable explicit IDs and a complete UI metadata snapshot. Both perform one targeted Community user action and verify the postcondition by re-reading current state. If verification is ambiguous after the write, the bridge returns the existing `UiWriteVerificationError` semantics so the whole destructive operation is not blindly replayed.

No external implementation source was copied.

## R2 conclusion

After these two deletion semantics, no remaining inspected ecosystem gap is required to make the R1 kernel coherent for generic Grist application construction and modification. Remaining candidates are either already expressible by composition, authority-expanding conveniences, business/lifecycle machinery, or features that should stay deferred until a concrete generic requirement exists.
