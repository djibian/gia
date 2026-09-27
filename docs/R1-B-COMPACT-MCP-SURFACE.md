# R1-B — Compact MCP surface decision

Status: implementation decision for the R1-B candidate  
Base: exact `main` `ee23bf172ee9d3238f98ff4af0fb67b8e052cf88`  
Date: 2026-09-27

## Reference-first review

### Official Grist MCP — functional oracle

Observed 2026-09-27 from the current Grist MCP documentation and current `grist-core` release notes.

The official server exposes granular discovery, data, schema and page/widget tools. Tool names are `grist_`-prefixed, permissions are enforced per tool, and tool descriptors carry MCP annotations. It separates adding, updating and removing records rather than hiding all writes behind an unrestricted transaction. The current official implementation also has broader capabilities (document creation, attachments, webhooks and query facilities) that are not required by R1.

Decision: **REIMPLEMENT the public behavior pattern**, not code. Use the official server as the semantic/risk oracle: `grist_` namespace, bounded explicit intentions, per-tool risk metadata and Grist-native permission boundaries. Do not copy full-edition implementation code.

Deliberately not imported in R1-B: attachments, webhooks, unrestricted/general query languages, document creation and other R2/R5 candidates.

### `gwhthompson/grist-mcp-server`

Observed revision: `d75706c2dec283502e2bedd1cd1feae8f709f379`.

The project documents a v2 consolidation from 22 tools to 11 manager-style tools, including `grist_manage_records`, `grist_manage_schema`, `grist_manage_pages` and `grist_help`. Its record manager uses an action-discriminated contract and can batch multiple heterogeneous operations in one invocation.

The repository README advertises Apache-2.0, but no root `LICENSE` file was present at the observed revision through the GitHub contents API. Therefore no source code is copied from this repository in R1-B.

Decision: **REIMPLEMENT the proven compaction pattern only**. A manager-like tool may group operations when they share one capability/risk class, but one invocation in `grist-chatgpt` still represents exactly one bounded semantic intention. Do not copy the community server's heterogeneous multi-operation batch, broad upsert, raw SQL, webhooks or document-creation breadth.

### `nic01asFr/GristCoder`

Observed current repository during R1-B; root `LICENSE` is MIT (copyright Nicolas LAVAL, 2025-2026).

Its principal value to the roadmap is semantic application context, relationship/page awareness and build-loop ideas. Those belong primarily to R1-C. R1-B does not need its wizard/session/sub-agent/generated-artifact architecture to define the public tool boundary.

Decision: **DEFER selective adaptation to R1-C**. No GristCoder code is copied in R1-B.

### Current `grist-chatgpt`

The active v1 MCP layer exposes 23 public operations. Its strongest assets are not the tool count but the already-implemented semantic boundaries behind them:

- principal/capability authorization;
- bounded reads/writes/schema counts;
- stable page/widget and column-facing identifiers;
- preservation and re-read verification for UI metadata;
- partial-write reporting;
- explicit uncertain-write/no-blind-replay semantics;
- output minimization and hidden `_grist_*` protection.

Decision: **ADAPT** the public MCP registration layer while reusing these existing execution semantics unchanged.

## Chosen R1-B surface

R1-B exposes ten MCP tools. The conceptual seven responsibilities remain visible, while write operations are split where MCP risk annotations would otherwise become imprecise.

| Tool | Responsibility | Capability/risk class |
| --- | --- | --- |
| `grist_discover` | discover documents/tables/columns | read-only |
| `grist_inspect` | inspect document/pages/widgets | read-only |
| `grist_query` | bounded record query | read-only |
| `grist_add_records` | create records | write, non-destructive |
| `grist_change_records` | update or delete records | write, destructive |
| `grist_add_structure` | create tables or columns | schema write, non-destructive |
| `grist_change_structure` | update/rename/delete tables or columns | schema write, destructive |
| `grist_add_ui` | create page or add widget | schema/UI write, non-destructive |
| `grist_change_ui` | rename/re-layout/reconfigure existing UI | schema/UI write, destructive |
| `grist_help` | disclose supported lean contract | read-only |

### Why ten, not seven

MCP annotations are tool-level. Combining creation and destructive modification into one `change_*` tool would force an always-destructive annotation and erase useful intent information. Keeping `add_*` separate preserves a compact surface while accurately distinguishing non-destructive creation from mutation/deletion.

### Why action-discriminated managers are acceptable

A manager tool contains an `action` discriminator, but **not an operations array**. Each invocation chooses exactly one semantic operation and one explicit target set. This is routing, not an opaque transaction or internal planner.

Examples:

- `grist_change_records(action="update", ...)` updates one explicit record batch;
- `grist_change_structure(action="rename_column", ...)` renames one explicit column;
- `grist_change_ui(action="update_widget", ...)` changes one explicit widget.

The agent still plans and sequences multi-step work across tool calls.

## Compatibility position

The existing v1 registration modules remain compiled temporarily as a compatibility/component bank because many focused regression tests exercise their schemas and callbacks. The MCP server entry point stops registering that 23-tool surface and registers the lean surface instead.

GPT Actions/OpenAPI routes remain separate compatibility debt and are not used to shape the MCP contract. Their final disposition belongs to R3.

No environment switch is added merely to publish both MCP surfaces simultaneously: doing so would preserve the tool-list cost and ambiguity R1-B is meant to remove.

## Safety preserved

The lean tools delegate directly to the existing authorized semantic service. R1-B does not add a new execution engine and does not weaken:

- upstream Grist authority;
- per-principal context isolation;
- input count bounds;
- hidden metadata-table protection;
- partial-write reporting;
- uncertain-write no-blind-replay behavior;
- stable semantic UI identifiers;
- targeted UI post-write verification/preservation.

No generic HTTP, raw SQL, arbitrary `/apply`, arbitrary UserAction or heterogeneous multi-action transaction is introduced.

## R1-B deliberate omissions

- no upsert until R2 establishes a generic safe requirement and semantics;
- no document creation/copy;
- no attachments or webhooks;
- no ACL administration;
- no new planner, journal, workflow engine or session state;
- no R4 domain/browser validation campaign;
- no GristCoder context expansion yet (R1-C).

## Review requirement

**Review gate: REQUIRED.**

This slice changes the primary public MCP contract and active server registration. Independent exact-head review plus green exact-head CI are required before integration.