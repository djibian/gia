# MCP contract

Current contract: **Gia MCP v2**

The contract version describes the model-facing MCP tool surface. It is intentionally independent from the package/server implementation version.

## Tool surface

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

## Versioning rule

Increment the MCP contract major version when a model-facing change is incompatible, including removal/rename of a tool or action, incompatible input/output schema changes, or a materially changed semantic/safety meaning.

Compatible clarifications, descriptions, implementation fixes and additional result detail that existing clients may safely ignore do not require a major contract increment. New capabilities should first be justified by the roadmap; versioning is not permission to grow the surface speculatively.

Gia package/runtime version **0.7.0** implements MCP contract major **2**.

## Widget detail

Gia keeps the ten-tool MCP v2 surface unchanged. `grist_inspect.page_widgets` returns a normalized `cardLayout` for native Card/Card List widgets, and `grist_change_ui.update_widget` accepts the corresponding complete stable-column layout tree. This is additive result/input detail inside the existing closed semantic action. Card layout inputs never accept private Grist field refs, raw BoxSpec JSON or raw UserActions.

The pre-existing numeric `layoutSpec`, sort and identity read detail remains available for MCP v2 compatibility and is not the stable semantic contract for writes. Public `options` contains only present, valid supported display flags and custom-widget access/identity; arbitrary URL/plugin/configuration fields remain internal. Layouts with unsupported attributes and invalid raw sort tokens are omitted rather than forwarded. `compatibilityMetadataOmitted: true` identifies omitted detail. This security correction does not remove the promised supported numeric layout shape; removal of the remaining non-secret compatibility fields requires an incompatible MCP major-version decision. New clients should use normalized stable-ID fields.

`cardLayout` and `visibleFields` are deliberately separate intentions. The visible field set is changed first; card layout then arranges exactly those current fields. Native Grist may leave stale positive field refs in persisted Card layout after a field is hidden; Gia prunes only those known stale native leaves during normalization while still refusing malformed or ambiguous layouts.

Custom-widget access and column mappings accept native empty configuration and preserve every untargeted setting. Native JSON-encoded settings and already persisted object settings can be read; updates use native encoding. Missing, malformed or unresolved state still refuses unsafe updates. URLs, plugin configuration and raw mappings remain private.

## Page order

Gia keeps the ten-tool MCP v2 surface unchanged. `grist_change_ui(action="reorder_pages")` accepts one complete ordered list of the stable page IDs currently eligible for normal navigation.

The bridge resolves private `_grist_Pages` row IDs and native `pagePos` values internally. It requests the current visible-page position slots and accepts Grist's native position canonicalization only for targetable visible pages. It preserves complete persisted order, identities, hierarchy and untargeted/special page positions; it does not mutate `indentation` and rejects permutations that change the existing page-parent relation or visible page set. The normalized navigation state is verified after write. Page ordering adds no folder/navigation framework and no raw metadata/UserAction input.

Document/page inspection additionally returns `navigationPageIds`, the exact current stable page-ID set that page reorder expects for a complete reorder request. When navigation is unavailable, unsupported or exceeds a bound, inspection retains the available context, omits guessed IDs and returns `navigationNormalizationIncomplete: true`. Document UI completeness summaries include this condition. The stricter complete-snapshot requirement still applies to reorder writes.

## Application access rules

Gia keeps the ten-tool MCP v2 surface unchanged. `grist_inspect(action="access_rules")` returns a normalized view of persisted ordinary table/column access-rule groups, while `grist_change_structure(action="access_rule_group")` accepts exactly one `create`, `replace` or `delete` intention.

Targets use stable table/column IDs; private ACL resource/rule row IDs remain bridge-internal. Writable conditions are a deliberately small typed subset with no arbitrary literal or formula text: everyone, one native Grist role comparison, or one same-table record-column comparison with a bounded built-in user property. Permissions are explicit `allow|deny|unspecified`; native `S`, `all` and `none` forms are outside the writable subset.

Opaque formulas, memos, user-attribute definitions, default/special/schema-edit policy and other unsupported persisted semantics are preserved but not copied into editable model content. Before reading ACL metadata, the bridge performs a fresh native document metadata read and requires `access === "owners"`; this prevents censored non-owner metadata from being mistaken for an empty policy. The bridge also refuses incomplete/censored/truncated ACL metadata, duplicate or overlapping stable targets, and any selected group it cannot normalize without loss.

Mutations require local `doc.schema:write` and remain subject to Grist's native Owner enforcement. The bridge verifies the requested persisted definition and an internal fingerprint of all untargeted persisted ACL state after re-read. A successful result explicitly does **not** claim effective enforcement verification; persisted rule rows alone are not treated as a confidentiality proof. If post-write persisted verification fails, the MCP result preserves the operation's `UNCERTAIN` effect knowledge with `retryWholeOperation: false` rather than collapsing it into a generic failure.

## Document bootstrap

Gia keeps the ten-tool MCP v2 surface unchanged. `grist_discover(action="workspaces")` returns only deployment-allowed workspaces for which the current principal has an explicit workspace grant with `doc:read`; unlike document discovery it includes allowed workspaces that currently contain no documents. This discovery result is selection context only and never implies creation authority.

`grist_add_structure(action="create_document")` creates exactly one empty document in an explicit positive `workspaceId`. The destination must be inside the deployment workspace ceiling and one principal grant must name that same workspace with `doc.schema:write`. A document-only allowlist or an unrelated schema grant never authorizes its parent workspace. Native Grist workspace `ADD` authorization remains authoritative, and native Grist creator ownership plus destination inheritance are disclosed effects rather than bridge-managed grants.

`grist_add_structure(action="copy_document_as_template")` additionally requires a separately authorized `sourceDocumentId` with local `doc:read`. The bridge always invokes Grist's native same-installation copy with `asTemplate: true`; local source readability is only a bridge precondition and is **not** presented as proof of native full-copy authority. Grist's own template-copy/download authorization and destination `ADD` checks remain authoritative. Gia exposes no full-data copy flag, arbitrary upload/import, fork, destination auto-selection or sharing/grant mutation in this contract.

The tool-level OAuth security scheme remains the baseline `doc.schema:write` because `create_document` does not require source read authority. For `copy_document_as_template`, tool metadata also publishes `gia/actionScopeRequirements.copy_document_as_template = ["doc.schema:write", "doc:read"]`, and insufficient-scope results challenge specifically for a missing `doc:read` requirement. A resource denial is not misreported as an OAuth scope failure when the read scope is already present.

Both creation paths are non-idempotent. After a known created ID is returned, Gia invalidates principal-local discovery and verifies that the created document currently resolves inside the requested destination under the same principal and required destination capability. If verification fails, the model-facing result retains `effectState: "APPLIED"`, `postconditionVerified: false`, the exact `createdDocumentId`, and `retryWholeOperation: false`; the operation must not be retried by name or “cleaned up” by guessing. Response loss or an acknowledged mutation whose created ID cannot be normalized remains `UNCERTAIN`; the discovery cache is still invalidated, but Gia does not replay the request automatically.

Template mode removes user-table data, attachment rows/blobs and history according to native Grist behavior, while retaining substantial document metadata. It is therefore a bootstrap primitive, not a privacy scrub or a guarantee that copied application access rules remain operational after referenced data is removed.

## Safety invariants

MCP v2 does not expose generic HTTP forwarding, raw SQL, arbitrary Grist `/apply`, arbitrary UserActions or heterogeneous multi-action transactions. Grist remains authoritative for upstream permissions; the bridge may only reduce authority. Partial/ambiguous writes are not blindly replayed, private Grist references remain server-side where practical, and principal-derived state must not cross principal boundaries.

JWT/JWKS verification enforces: optional `nbf` is enforced, unsupported JOSE critical extensions are rejected, algorithms must match the JWK key family/curve, and RSA verification keys must be at least 2048 bits.

## Supported UI intentions and bounds

- `visibleFields` is a complete ordered list of 0–200 current stable column IDs;
  optional widths are integers from 1–2000 pixels. Retained field-owned metadata
  is preserved. Hiding a field never deletes its table column.
- `filters` patches at most 200 columns using include/exclude sets of at most 200
  scalar values, finite ordered numeric ranges, or removal. Omitted pinning is
  preserved; new filters default to pinned. Final persisted state is also bounded
  to 200 filters. Unsupported native encodings or incomplete state refuse writes.
- Saved sort uses at most 20 stable columns with asc/desc, optional emptyLast,
  Text-only naturalSort and Choice/ChoiceList-only orderByChoice; null/[] clears it.
- Card/Card List layout is a complete tree over current visible fields, bounded
  to 500 nodes and depth 50 with finite positive sizes. `visibleFields` and
  `cardLayout` cannot be combined in one update; update the visible set first.
  Inspection reports `unplacedColumnIds` rather than guessing browser defaults.
- `groupByColumnIds` on widget creation accepts 0–20 unique columns from one
  ordinary source table; an empty list creates a native grand-total summary.
  Grist owns generated tables and formulas. The bridge verifies actual generated/
  reused table identity and grouping from the re-read section/metadata, rather than
  interpreting the returned source table reference as the summary identity.
- Page reorder uses a complete current `navigationPageIds` set, preserves the
  full existing hierarchy and special/censored rows, and verifies exact post-state.
- Select-by uses an advertised exact direct or supported non-summary Ref/RefList
  link; null clears it. Unsupported links/cycles are rejected.
- Existing custom-widget settings accept only bounded access and stable-column
  mappings, never URL/plugin identity or arbitrary widget-owned options.

Schema inputs accept only supported table/column metadata. Rename results report
the actual native resulting column ID. Table/column PATCH results retain the
requested `targetTableIds`/`targetColumnIds` and add `updatedTables`/`updatedColumns`
mapping each target to its re-read native stable ID. Grist may canonicalize table
names or rename a column with its label. Gia correlates private metadata identities
before and after PATCH, refuses ambiguous pre-state, and reports an applied,
unverified, non-retryable outcome if resulting IDs cannot be resolved. No raw
metadata refs are writable inputs or returned in these mappings.
ACL targets use one table and either all ordinary columns or 1–50 unique column
IDs, with 1–20 ordered rules. Table permissions are read/update/create/delete;
column permissions are read/update. Writable record/user comparisons accept only
built-in Email, UserID, Name, UserRef, Origin, IsLoggedIn with compatible types.

Success-only mutation results do not forward arbitrary upstream response bodies.
Schema verification failure retains applied effect knowledge; UI creation retains
known created IDs. Partial and uncertain outcomes use explicit typed errors and
`retryWholeOperation: false`. Error content is text-only to avoid validation against
a success output schema. No atomicity, effective confidentiality or automatic retry
guarantee is implied by a successful persisted-state verification.

Read-back and internal fingerprints detect divergence; they do not provide native
compare-and-set, transaction isolation or simultaneous-writer guarantees.
