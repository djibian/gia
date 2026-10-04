# MCP contract

Current contract: **Gia MCP v2**

The contract version describes the model-facing MCP tool surface. It is intentionally independent from the package/server implementation version.

## v2 surface

A v2 server exposes exactly these ten tools:

| Tool | Intent |
| --- | --- |
| `grist_discover` | discover explicitly allowed workspaces, documents, tables or columns |
| `grist_inspect` | inspect compact semantic document/page/widget/access-rule context |
| `grist_query` | query a bounded set of records |
| `grist_add_records` | create a bounded record batch |
| `grist_change_records` | update or delete explicitly targeted records |
| `grist_add_structure` | create an empty document, copy a source as a template, or create bounded tables/columns |
| `grist_change_structure` | update, rename or delete targeted tables/columns, or mutate one bounded ACL group |
| `grist_add_ui` | create one page or add one widget |
| `grist_change_ui` | mutate/delete explicitly targeted supported UI |
| `grist_help` | progressive disclosure of the current contract |

`grist_help` returns `contractVersion: "2"` so a client can identify the contract without relying on implementation version strings.

One invocation represents one bounded semantic intention. Manager-style tools use a closed `action` discriminator; they do not accept an arbitrary operation list or a generic Grist `/apply` payload.

## Compatibility and migration

### Historical MCP v1

The historical MCP v1 exposed 23 granular tools. It stopped being registered when the lean R1-B surface became active. R3 removed its dormant registration modules and contract-only compatibility tests rather than shipping two MCP contracts in parallel.

There is deliberately:

- no environment switch that re-enables MCP v1;
- no dual v1/v2 tool registration;
- no hidden alias layer that preserves old tool names.

A v1 MCP client must migrate to the v2 manager tools. The semantic Grist service underneath is reused, but the public tool names/schemas are not compatibility-promised across that boundary.

### Historical GPT Actions/OpenAPI surface

GPT Actions/OpenAPI was a separate HTTP compatibility surface, not MCP v1. R3 retired it from the product candidate: the runtime does not register `/api/v1` or `/openapi.json`, and no GPT Actions token is required to start the bridge.

R5-E reintroduces only the optional `/.well-known/openai-apps-challenge` domain-verification route required for remote-MCP distribution. It is absent unless an exact portal-issued `OPENAI_APPS_CHALLENGE_TOKEN` is configured, returns only that token as plain text, and does **not** add a model-facing tool or compatibility API. It therefore does not change the MCP v2 contract version.

## Versioning rule

Increment the MCP contract major version when a model-facing change is incompatible, including removal/rename of a tool or action, incompatible input/output schema changes, or a materially changed semantic/safety meaning.

Compatible clarifications, descriptions, implementation fixes and additional result detail that existing clients may safely ignore do not require a major contract increment. New capabilities should first be justified by the roadmap; versioning is not permission to grow the surface speculatively.

Gia package/runtime version **0.7.0** therefore continues to implement MCP contract major **2**. The R6 capabilities and release-stabilization corrections are additive or corrective within the existing ten-tool shape.

## Compatible R6 widget detail

R6 C5 keeps the ten-tool MCP v2 surface unchanged. `grist_inspect.page_widgets` may additionally return a normalized `cardLayout` for native Card/Card List widgets, and `grist_change_ui.update_widget` may accept the corresponding complete stable-column layout tree. This is additive result/input detail inside the existing closed semantic action. C5 inputs never accept private Grist field refs, raw BoxSpec JSON or raw UserActions.

The pre-existing raw `layoutSpec`/UI-option read projections are an explicit **MCP v2 compatibility exception**. They may contain private Grist metadata references and are not the stable semantic contract for R6 writes. New clients should use normalized fields; new capabilities must not expand the raw surface. Removing those compatibility fields requires an incompatible MCP major-version decision rather than a silent 0.7.0 change.

`cardLayout` and `visibleFields` are deliberately separate intentions. The visible field set is changed first; card layout then arranges exactly those current fields. Native Grist may leave stale positive field refs in persisted Card layout after a field is hidden; Gia prunes only those known stale native leaves during normalization while still refusing malformed or ambiguous layouts.

## Compatible R6 page-order detail

R6 C10 keeps the ten-tool MCP v2 surface unchanged. `grist_change_ui(action="reorder_pages")` accepts one complete ordered list of the stable page IDs currently eligible for normal navigation.

The bridge resolves private `_grist_Pages` row IDs and native `pagePos` values internally. It reuses the current visible-page position slots, preserves untargeted/special page rows, does not expose or mutate `indentation`, and rejects any requested permutation that would change the existing page-parent relation or visible page set. The exact normalized navigation state is verified after write. C10 adds no folder/navigation framework and no raw metadata/UserAction input.

Document/page inspection additionally returns `navigationPageIds`, the exact current stable page-ID set that C10 expects for a complete reorder request. This avoids reconstructing the target set from a lossy flat page projection.

## Compatible R6 access-rule detail

R6 C1 keeps the ten-tool MCP v2 surface unchanged. `grist_inspect(action="access_rules")` returns a normalized view of persisted ordinary table/column access-rule groups, while `grist_change_structure(action="access_rule_group")` accepts exactly one `create`, `replace` or `delete` intention.

Targets use stable table/column IDs; private ACL resource/rule row IDs remain bridge-internal. Writable conditions are a deliberately small typed subset with no arbitrary literal or formula text: everyone, one native Grist role comparison, or one same-table record-column comparison with a bounded built-in user property. Permissions are explicit `allow|deny|unspecified`; native `S`, `all` and `none` forms are outside the writable subset.

Opaque formulas, memos, user-attribute definitions, default/special/schema-edit policy and other unsupported persisted semantics are preserved but not copied into editable model content. Before reading ACL metadata, the bridge performs a fresh native document metadata read and requires `access === "owners"`; this prevents censored non-owner metadata from being mistaken for an empty policy. The bridge also refuses incomplete/censored/truncated ACL metadata, duplicate or overlapping stable targets, and any selected group it cannot normalize without loss.

Mutations require local `doc.schema:write` and remain subject to Grist's native Owner enforcement. The bridge verifies the requested persisted definition and an internal fingerprint of all untargeted persisted ACL state after re-read. A successful result explicitly does **not** claim effective enforcement verification; persisted rule rows alone are not treated as a confidentiality proof. If post-write persisted verification fails, the MCP result preserves the operation's `UNCERTAIN` effect knowledge with `retryWholeOperation: false` rather than collapsing it into a generic failure.

## Compatible R6 document-bootstrap detail

R6 C8 keeps the ten-tool MCP v2 surface unchanged. `grist_discover(action="workspaces")` returns only deployment-allowed workspaces for which the current principal has an explicit workspace grant with `doc:read`; unlike document discovery it includes allowed workspaces that currently contain no documents. This discovery result is selection context only and never implies creation authority.

`grist_add_structure(action="create_document")` creates exactly one empty document in an explicit positive `workspaceId`. The destination must be inside the deployment workspace ceiling and one principal grant must name that same workspace with `doc.schema:write`. A document-only allowlist or an unrelated schema grant never authorizes its parent workspace. Native Grist workspace `ADD` authorization remains authoritative, and native Grist creator ownership plus destination inheritance are disclosed effects rather than bridge-managed grants.

`grist_add_structure(action="copy_document_as_template")` additionally requires a separately authorized source `documentId` with local `doc:read`. The bridge always invokes Grist's native same-installation copy with `asTemplate: true`; local source readability is only a bridge precondition and is **not** presented as proof of native full-copy authority. Grist's own template-copy/download authorization and destination `ADD` checks remain authoritative. Gia exposes no full-data copy flag, arbitrary upload/import, fork, destination auto-selection or sharing/grant mutation in this slice.

The tool-level OAuth security scheme remains the baseline `doc.schema:write` because `create_document` does not require source read authority. For `copy_document_as_template`, tool metadata also publishes `gia/actionScopeRequirements.copy_document_as_template = ["doc.schema:write", "doc:read"]`, and insufficient-scope results challenge specifically for a missing `doc:read` requirement. A resource denial is not misreported as an OAuth scope failure when the read scope is already present.

Both creation paths are non-idempotent. After a known created ID is returned, Gia invalidates principal-local discovery and verifies that the created document currently resolves inside the requested destination under the same principal and required destination capability. If verification fails, the model-facing result retains `effectState: "APPLIED"`, `postconditionVerified: false`, the exact `createdDocumentId`, and `retryWholeOperation: false`; the operation must not be retried by name or “cleaned up” by guessing. Response loss or an acknowledged mutation whose created ID cannot be normalized remains `UNCERTAIN`; the discovery cache is still invalidated, but Gia does not replay the request automatically.

Template mode removes user-table data, attachment rows/blobs and history according to native Grist behavior, while retaining substantial document metadata. It is therefore a bootstrap primitive, not a privacy scrub or a guarantee that copied application access rules remain operational after referenced data is removed.

## Safety invariants

MCP v2 does not expose generic HTTP forwarding, raw SQL, arbitrary Grist `/apply`, arbitrary UserActions or heterogeneous multi-action transactions. Grist remains authoritative for upstream permissions; the bridge may only reduce authority. Partial/ambiguous writes are not blindly replayed, private Grist references remain server-side where practical, and principal-derived state must not cross principal boundaries.

Release 0.7.0 also hardens JWT/JWKS verification: optional `nbf` is enforced, unsupported JOSE critical extensions are rejected, algorithms must match the JWK key family/curve, and RSA verification keys must be at least 2048 bits.
