# MCP contract

Current contract: **Gia MCP v2**

The contract version describes the model-facing MCP tool surface. It is intentionally independent from the package/server implementation version.

The current HTTP transport supports MCP protocol `2026-07-28` via `server/discover`. Versions `2025-03-26`, `2025-06-18` and `2025-11-25` are refused, and legacy `initialize` is unavailable. A client's transport and JSON Schema dialect support are separate from its knowledge of Gia MCP v2.

## Tool surface

A v2 server exposes exactly these ten tools:

| Tool | Intent |
| --- | --- |
| `grist_discover` | discover explicitly allowed workspaces, documents, tables or columns |
| `grist_inspect` | inspect compact semantic document/page/widget/access-rule context |
| `grist_query` | query a bounded set of records |
| `grist_add_records` | create a bounded record batch |
| `grist_change_records` | update or delete explicitly targeted records |
| `grist_add_structure` | create an empty document, copy an authorized source as a template or full data, or create bounded tables/columns |
| `grist_change_structure` | update bounded document metadata, update/rename/delete targeted tables/columns, or mutate one bounded ACL group |
| `grist_add_ui` | create one page or add one widget |
| `grist_change_ui` | mutate/delete explicitly targeted supported UI |
| `grist_help` | progressive disclosure of the current contract |

`grist_help` returns `contractVersion: "2"` so a client can identify the contract without relying on implementation version strings.

Unselected `grist_help({})` remains a compact ten-tool index. Selecting named tools returns actionable closed actions, key request shapes, fixed semantic safeguards, synthetic schema-validated examples, and the deployment-configured read/write/schema limits separately from fixed ACL bounds. It is guidance, not a second authorization source: the registered input schema, service checks and native Grist permissions remain authoritative. Client-side flattening of nested schema types does not authorize permissive inputs.

`grist_add_structure(action="create_tables")` requires a nonempty `columns` array per new table, matching native Grist TablePost. Missing or empty arrays are refused before any native write; Gia does not invent application columns.

Both `grist_add_structure(create_tables)` and `grist_add_structure(create_columns)` accept only creation metadata actually persisted by the supported native Grist operations: optional `label`, `type`, `isFormula`, `formula` and `widgetOptions`. Native `AddTable` and `AddVisibleColumn` do not persist `description` and do not resolve the public stable-ID alias `visibleColumnId` at creation time. These two update-only fields therefore fail validation **before any create write**, including mixed batches, rather than producing a misleading success. To set them, first create the column with supported fields, then call `grist_change_structure(action="update_columns")` on the resulting stable IDs; update verification and uncertain-write handling remain authoritative. This narrows previously advertised but ineffective create inputs, not a functioning native creation workflow.

The bounded ACL condition input language is advertised using local JSON Schema `$defs`/`$ref` references for its finite depth levels. Clients must resolve these local references to discover the complete closed predicate variants; a client's flattened or `unknown` display is not evidence that Gia accepts arbitrary predicates. Server-side validation, depth/width/node bounds and closed actions remain unchanged. This is not a promise of support for every client's JSON Schema dialect.

One invocation represents one bounded semantic intention. Manager-style tools use a closed `action` discriminator; they do not accept an arbitrary operation list or a generic Grist `/apply` payload.

Expanded column discovery (`grist_discover(columns)` and
`grist_discover(tables, expandColumns=true)`) reports
`conditionalStyleRules: {status: "protected" | "incomplete"}` for
a nonempty or malformed native conditional-style rule reference list.
`protected` means a bounded, structurally valid native list is present, not
that its formulas, styles or behavior can be reconstructed; `incomplete`
means the native list is malformed or over budget. Empty native lists produce
no signal, and absence of the native field is **not** proof that no styles
exist. This additive diagnostic exposes no helper IDs or rule formulas and
does not grant a conditional-style write operation.

Column discovery independently reports `conditionalStyleOptions:
{status:"protected"|"incomplete"}` when a nonempty native
`widgetOptions.rulesOptions` style array is present, or when its
metadata is malformed or exceeds a bound. A bounded array of objects
is `protected`: styles, colors, formula helpers and option values are
never reconstructed by this new diagnostic. Empty arrays produce no
signal; missing metadata does not prove absence of style behavior.
The separate native `fields.rules` diagnostic remains authoritative
only for its own private helper-reference presence. Neither signal
qualifies rendered styles nor grants style mutations. Existing raw
`widgetOptions` remains MCP v2 compatibility output and is *not*
redacted by this additive diagnostic.

## Versioning rule

Increment the MCP contract major version when a model-facing change is incompatible, including removal/rename of a tool or action, incompatible input/output schema changes, or a materially changed semantic/safety meaning.

Compatible clarifications, descriptions, implementation fixes and additional result detail that existing clients may safely ignore do not require a major contract increment. New capabilities should first be justified by the roadmap; versioning is not permission to grow the surface speculatively.

Gia package/runtime version **0.11.0** implements MCP contract major **2**.

Column discovery additionally reports `dropdownCondition: {status:"protected"|"incomplete"}`
for a valid opaque native dropdown predicate or malformed/oversized column
widget options. The condition expression and parsed native representation
are not duplicated in this diagnostic. Missing metadata is not proof of
absence. A persisted condition does **not** guarantee filtering in a native
Form, and it is never an authorization boundary. The supported-version native
Form behavioral limitation is recorded in #295; this read-only diagnostic
does not qualify Form display or submission.

Column discovery also projects `formColumnOptions` when a native column stores
at least one of `question`, `formRequired` or `formAcceptFromUrl` in its
persisted `widgetOptions`. It reports the normalized `question`, `required`
and `acceptFromUrl` fields independently of Form widget existence.
A link-bearing or oversized question is replaced with `{protected:true}`.
`status:"supported"` means these present option values have supported types
and no other option keys were found; `protected` indicates omitted question
text or additional native options, and `incomplete` means malformed or
oversized native options or invalid Form option values. Other section/field
options may still override column values. Absence of this projection is not a
complete Form-state guarantee. This additive preview does not change the
existing MCP v2 raw `widgetOptions` compatibility output, whose removal or
redaction requires a separate compatibility decision. It does not qualify
native Form publication, filtering, submission or access control.

## Widget detail

For native form widgets, read-only `grist_inspect(action="page_widgets")` adds
the `form` result. Its bounded `layout` preserves ordered Layout, Section,
Field, Paragraph and Submit nodes. The form's `tableId` and the field's
`columnId` are stable IDs. Question, required and URL-prefill options retain
their column and field origins. Native field options override the column
options. A configured dropdown condition is indicated without returning its
expression; while no stable typed projection exists, its containing form is
`protected`, not reconstructible. Malformed or oversized dropdown metadata
makes the form `incomplete`. The projection includes supported submit and
success text and whether a redirect is configured.

`status: "protected"` identifies omitted text, an opaque dropdown condition,
a protected redirect, or unprojected native form layout-node, field-option,
section-option or section share-option attributes. Such attributes remain private: a layout
and publication intent may be readable without being fully reconstructible. Text
containing potential links is omitted entirely, including links in Markdown.
The redirect URL and raw share options are never returned by this projection.
`status: "incomplete"` covers unresolved field references, insufficient
metadata, unsupported layout, malformed native section options and inspection
bounds. An empty native section options object is valid. The result pairs `sectionPublicationIntent`
(`requested`, `not_requested` or `unknown`) with
`publicationQualification: "not_tested"`. Native share and page state also
affect publication. Inspecting an intent does not perform an anonymous or
authenticated form access test.

Gia keeps the ten-tool MCP v2 surface unchanged. `grist_inspect.page_widgets` returns a normalized `cardLayout` for native Card/Card List widgets, and `grist_change_ui.update_widget` accepts the corresponding complete stable-column layout tree. This is additive result/input detail inside the existing closed semantic action. Card layout inputs never accept private Grist field refs, raw BoxSpec JSON or raw UserActions.

The pre-existing numeric `layoutSpec`, sort and identity read detail remains available for MCP v2 compatibility and is not the stable semantic contract for writes. Public `options` contains only present, valid supported display flags and custom-widget access/identity; arbitrary URL/plugin/configuration fields remain internal. Layouts with unsupported attributes and invalid raw sort tokens are omitted rather than forwarded. `compatibilityMetadataOmitted: true` identifies omitted detail. This security correction does not remove the promised supported numeric layout shape; removal of the remaining non-secret compatibility fields requires an incompatible MCP major-version decision. New clients should use normalized stable-ID fields.

`cardLayout` and `visibleFields` are deliberately separate intentions. The visible field set is changed first; card layout then arranges exactly those current fields. Native Grist may leave stale positive field refs in persisted Card layout after a field is hidden; Gia prunes only those known stale native leaves during normalization while still refusing malformed or ambiguous layouts.

Custom-widget access and column mappings accept native empty configuration and preserve every untargeted setting. Native JSON-encoded settings and already persisted object settings can be read; updates use native encoding. Missing, malformed or unresolved state still refuses unsafe updates. URLs, plugin configuration and raw mappings remain private.

For native custom widgets, `grist_inspect(page_widgets)` also reports
`customWidgetConfiguration: {status: "supported" | "protected" | "incomplete"}`.
`supported` means the persisted outer section options and customView contain
only the currently projected access, catalogue identity and stable-column
mapping metadata; it does **not** prove the remote widget code exists or works.
`protected` means non-projected native mode, URL, plugin, widget-owned
options or unknown attributes could affect behavior; their names and values
remain private. `incomplete` covers malformed, missing or unresolved native
configuration. Normalized access and resolvable mappings may remain visible
when other configuration is protected. None of these states authorizes installing
or executing an external widget.


## Document metadata, relation display and calendars

`grist_inspect(action="document")` adds `document.settings` for the persisted
document locale and timezone. A readable, valid setting appears as `locale`
or `timezone`. The result records `status: "supported" | "incomplete" | "protected"`.
An unavailable setting is omitted, without inferring a locale or timezone
from a server or client default. Other native settings stay internal.

Gia 0.11.0 retains three bounded end-to-end capabilities without adding an MCP tool or capability.

`grist_change_structure(action="update_document")` accepts an explicit `documentId` and an `update` object containing `name?` and/or `type?: "normal"|"template"|"tutorial"`, or a separate `{timezone}` or `{locale}` update. Public `normal` maps to Grist's native null type. Both modes use existing `doc.schema:write` and are semantically idempotent. Name/type updates verify `{id,name,type}` by rereading native document metadata. The timezone write supports `UTC` and `Europe/Paris`, which are qualified across the supported Grist versions. It changes only the native timezone cell and returns the verified settings and whether a write occurred. A separate bounded locale write supports `en-US` and `fr-FR`; it validates native document settings, retains opaque nested keys, verifies the entire persisted JSON and unchanged timezone, and refuses malformed or incomplete snapshots. The separate call keeps each request within a single native metadata path. Transport-ambiguous writes must be reconciled before replay.

For Ref/RefList columns, `grist_change_structure(action="update_columns")` additionally accepts `visibleColumnId`, always as the stable ID of a column on the referenced table. Numeric `visibleCol`/`displayCol` refs remain bridge-private. Gia resolves the target privately and applies Grist's paired native semantics—updating `visibleCol` and setting the display formula—in one fixed internal action bundle, then verifies the target relation, visible column and generated display formula after re-read. `label` and `visibleColumnId` are intentionally separate mutations because a native label change may also canonicalize the source stable column ID.

Calendars remain one public widget concept, `calendar`. `grist_change_ui(action="update_widget")` accepts `calendarConfig: {titleColumnId,startDateColumnId,endDateColumnId?,allDayColumnId?,typeColumnId?}`; all values are stable column IDs on the widget table. Gia follows Grist's calendar mapping types: start/end are strict `Date|DateTime`, all-day is strict `Bool`, title accepts the native non-strict `Text|Any` semantics, and type accepts the native non-strict `Choice|ChoiceList|Any` semantics. Gia preserves untargeted widget options/mappings and verifies the normalized mapping after write. Calendar creation/configuration adapts internally across the supported Grist Community matrix: legacy persisted `custom.calendar` is used when the old bundled calendar is discoverable, otherwise native `calendar` is used. Inspection normalizes either representation back to public `calendar`. The compatibility probe exercises document type conversion, relation display and configured calendars on every supported Grist Community version 1.7.16–1.7.20.

## Page order

Gia keeps the ten-tool MCP v2 surface unchanged. `grist_change_ui(action="reorder_pages")` accepts one complete ordered list of the stable page IDs currently eligible for normal navigation.

The bridge resolves private `_grist_Pages` row IDs and native `pagePos` values internally. It requests the current visible-page position slots and accepts Grist's native position canonicalization only for targetable visible pages. It preserves complete persisted order, identities, hierarchy and untargeted/special page positions; it does not mutate `indentation` and rejects permutations that change the existing page-parent relation or visible page set. The normalized navigation state is verified after write. Page ordering adds no folder/navigation framework and no raw metadata/UserAction input.

Document/page inspection additionally returns `navigationPageIds`, the exact current stable page-ID set that page reorder expects for a complete reorder request. When navigation is unavailable, unsupported or exceeds a bound, inspection retains the available context, omits guessed IDs and returns `navigationNormalizationIncomplete: true`. Document UI completeness summaries include this condition. The stricter complete-snapshot requirement still applies to reorder writes.

## Application access rules

Gia keeps the ten-tool MCP v2 surface unchanged. `grist_inspect(action="access_rules")` returns a normalized view of persisted ordinary table/column access-rule groups, while `grist_change_structure(action="access_rule_group")` accepts exactly one `create`, `replace` or `delete` intention.

Targets use stable table/column IDs; private ACL resource/rule row IDs remain bridge-internal. Writable conditions are a deliberately small typed subset with no arbitrary literal or formula text: everyone, one native Grist role comparison or a bounded two/three-role `user.Access in/not in` membership, a `user.IsLoggedIn` equality/inequality against a native boolean literal, one same-table record-column comparison with a bounded built-in user property, or one equality/inequality comparison between a stable Text/Any record column and a bounded safe `user.LinkKey.<name>` reference, or a same-column equality/inequality comparison of `rec` and `newRec` for update-only decisions, or a Bool column compared with a native boolean `True`/`False` literal, or an existing Int column compared with the finite numeric flag `0`/`1`, or an existing Text column compared with an exact empty string.  The existing `match_user`, `match_link_key` and Bool-literal `match_boolean` leaves accept an optional `record: "newRec"` to compare the proposed post-change row instead of the current `rec` row. It is valid only for create/update permissions (read/delete must be unspecified). Absence of `record` retains the original `rec` form and normalized shape. These leaves may be combined through finite `all` / `any` / `not` boolean trees; other operand pairs, string/numeric literals and non-role membership forms remain unsupported. LinkKey names are structural policy metadata; LinkKey values and secret-bearing URLs are never accepted or returned. Both native operand orders for the supported LinkKey comparison normalize to the same public `match_link_key` condition, while writes use one canonical formula form. Permissions are explicit `allow|deny|unspecified`; native `S`, `all` and `none` forms are outside the writable subset.

The same Owner-gated `grist_inspect(action="access_rules")` additionally
returns `userAttributes: {definitions, protectedDefinitionCount}`.
The inspection operation itself is read-only. Each definition reports
`name`, stable `tableId` and `lookupColId`, a closed `source` of either
`{kind:"user_property",property:<built-in property>}` or
`{kind:"link_key",name:<safe LinkKey name>}`, and an `editable` boolean.
`editable:true` reports only structural support for the bounded mutation
target described below; it neither grants the caller write authority nor
asserts native enforcement. Actual changes require the separate
`grist_change_structure` action with fresh native Owner proof and
`doc.schema:write`.
Definitions must belong to the native default ACL resource, have a valid
closed structural JSON shape, and reference an existing ordinary table/column.
Malformed, duplicate, ambiguous or unsupported definitions count as protected
and their original text is never returned. Neither user-attribute values nor
LinkKey values, secret-bearing URLs, raw ACL JSON/formulas or native row IDs are
model-visible. This is not an evaluation of the native lookup or enforcement.
The same `grist_change_structure(action="access_rule_group")` also supports a
closed `target:{userAttributeName:<safe identifier>}` in place of an ordinary
table/column target. `create` and `replace` require exactly one typed
`definition:{tableId,lookupColId,source}`, where source is either
`{kind:"user_property",property:<bounded native built-in>}` or
`{kind:"link_key",name:<safe LinkKey name>}`. `delete` accepts no definition.
An attribute target accepts no `rules`. Existing ordinary group semantics
and tool count are unchanged. Names cannot shadow reserved properties or methods of Grist’s native ACL user.
Only known, structurally verified native user-attribute definitions are
mutable; any opaque/duplicate definition blocks user-attribute writes.
Replacing preserves native rule identity; deletion refuses known references in
persisted ACL conditions. Untargeted resources/rules must be unchanged and
post-write definition/identity is re-read and verified. Unknown effects forbid
blind replay. The operation does **not** verify effective enforcement.
Editable ordinary ACL conditions additionally admit one closed
`match_user_attribute` leaf: `{kind:"match_user_attribute",operator:"equals"|"not_equals",columnId:<stable record column>,attributeName:<defined safe name>,attributeColumnId:<stable lookup-table field or "id">,record?:"newRec"}`.
It maps only to `rec|newRec.<column> ==|!= user.<attribute>.<field>`, with the
reverse native operand order normalized identically. The user attribute must
already be structurally verified and unambiguous on the native default ACL
resource. Target and source fields must be comparable: native Text/Choice,
matching Int/Numeric/Bool, same-target Ref, or the native `id` field compared
to `Ref:<lookup table>`. No literal values, arbitrary attr traversal, raw
formulas, unknown fields or unrestricted coercions are supported. Optional
`newRec` is create/update-only, consistent with existing typed leaves.
Deleting **or rebinding** a user-attribute definition refuses existing ACL
predicate dependencies, including opaque or noncanonical native formula syntax.
This structural validation is not proof of effective Grist enforcement.

E1-D1 adds a read-only `dependencies` object to each ordinary persisted ACL
group returned by `grist_inspect(action="access_rules")`. For groups whose
entire ordered rule list belongs to Gia's closed normalized subset, it reports
`coverage:"supported_rules"` and sorted, deduplicated `recordColumnIds`,
`newRecordColumnIds`, `userProperties`, `linkKeyNames`, and
`userAttributeFields` (pairs of attribute name and stable lookup-field ID,
including `id`). The original ordered `rules` remain the only source of
condition/permission order. For a protected or otherwise unnormalizable
group, `dependencies:{coverage:"unknown"}` contains no inferred identifiers.
These are syntactic references only: no raw ACL formulas, lookup values or
LinkKey values are inspected or exposed; neither effective permissions nor
native dependency completeness outside this subset are asserted.

An additive `diagnostics` array accompanies fully normalized ordinary groups.
`shadowed_same_condition_permission` has `certainty:"proven"`, 1-based
`ruleIndex` and `earlierRuleIndex`, and a permission name. It reports only
that an **identical normalized condition** earlier in the same ordered group
already decides that permission. Under Grist's first-applicable-decision rule,
the later decision cannot take effect. It does not infer equivalence between
different formulas. `link_key_web_acceptance_unverified` is a `warning` for
supported groups using a direct LinkKey comparison or an attribute whose
source is a LinkKey; native API inspection does not test web-only LinkKey enforcement. Protected/opaque groups have `diagnostics:null`:
unassessed, never a clean lint result. These findings do not prove confidentiality.

An optional `schemaImpact` on `grist_inspect(action="access_rules")`
accepts one existing table or column stable identity (`kind:"table"` or
`kind:"column"`). The additive `schemaChangeImpact` result identifies
known references in ordinary ACL targets, typed `rec`/`newRec` predicates
and verified user-attribute lookups/fields. It explicitly counts opaque
ordinary groups, other policy resources and protected user attributes as
unknown. It is read-only structural context before a possible rename/delete,
not a forecast of Grist's native schema rewrite, authorization or confidentiality.

An optional `policyCoverage: {target, operation}` on the same action classifies
persisted policy for one existing ordinary table or column using the
`schemaImpact` target shape and `operation: "read"|"create"|"update"|"delete"`.
The additive `policyCoverage` result lists relevant ordinary groups as
`SUPPORTED` or `PROTECTED`, structurally verified user-attribute references and
the count of protected definitions. Read and update include the table-wide
group and the applicable column groups. Create and delete target rows, so a
column target for either returns `UNSUPPORTED`. Grist-generated helper
columns also return `UNSUPPORTED` because native implementation rules can
extend other columns' ACL groups to them.

Explicit document defaults and other protected resources, including special
and schema policy, are reported separately and conservatively may leave
`persistedStatus: "UNKNOWN"`. `SUPPORTED` covers the persisted structural
classification only. Rules generated by native shares and published forms
are outside this inspection's scope. `nativeQualification` is always `NOT_TESTED`.
Coverage discloses no raw metadata or secret values.

Set `policyCoverage.context` to request an `expectedDecision` using the same
closed invented inputs as `simulation` below. This models one ordinary native
document role in a synthetic scenario. It follows column → table → built-in
default precedence for the selected operation. A native viewer's ordinary
write gate still denies create, update and delete. For create, supply row
values in `newRec` only. For delete, use `rec` only. Grist uses that single row
for both operands in those operations. For update, supply the prior and
proposed values separately.

The response gives `allow` or `deny` only for a fully covered result, with a
trace of contributing groups and 1-based rule indexes. Missing inputs,
protected policy or differing column decisions for a table-wide request
yield `UNKNOWN`. Unsupported targets remain `UNSUPPORTED`. Grist skips the
legacy empty resource seeded in a new document. Gia counts it separately
and preserves it. This evaluation does not
resolve live lookups, simulate a share or form, or echo synthetic operands.
The expected decision is theoretical and leaves native qualification
`NOT_TESTED`.

An optional `simulation` on `grist_inspect(action="access_rules")`
selects exactly one existing ordinary ACL group by stable table/column target
and supplies an **invented** closed `context`: optional built-in role,
synthetic user/rec/newRec fields, symbolic LinkKey names and attribute fields.
Each value is only one of four fixed symbols `A`–`D`, a Boolean, an Int
0/1 flag, or an explicit empty-Text marker. LinkKey inputs accept **symbols
only**, never actual URL token values. At most 20 fields per collection and
eight user-attribute collections are accepted. No record rows, URLs, secret
strings or arbitrary formulas are fetched or submitted for simulation.

The additive `simulatedPolicyGroup` reports each normalized rule's
`true`/`false`/`unknown` match and the first potentially deciding rule
for each R/U/C/D permission. Unknown earlier conditions remain unknown
rather than yielding an unjustified later allow/deny. A missing or protected
ordinary group returns no permission verdict. Simulation is restricted to
the selected ordinary group: it does **not** apply native precedence across
column/table/default/special policies, resolve live user attributes, call
the Grist API with LinkKeys, or test effective native authorization.
`simulated:true`, `nativeEnforcementVerified:false`, and
`confidentialityVerified:false` are mandatory. The simulation never
echoes input symbols or values; it is an explanation/debugging aid, not a
policy safety certificate.

Opaque formulas, memos, unsupported user-attribute definitions, default/special/schema-edit policy and other unsupported persisted semantics are preserved but not copied into editable model content. Before reading ACL metadata, the bridge performs a fresh native document metadata read and requires `access === "owners"`; this prevents censored non-owner metadata from being mistaken for an empty policy. The bridge also refuses incomplete/censored/truncated ACL metadata, duplicate or overlapping stable targets, and any selected group it cannot normalize without loss.

An ordinary group is editable only when its bounded formula text and native parsed predicate normalize to the same supported condition for every rule. Malformed, oversized, unsupported or contradictory parsed predicates protect the group from mutation and leave condition dependencies, diagnostics and simulation unknown. Gia keeps raw predicate metadata private and applies the same consistency check when verifying a persisted write.

Mutations require local `doc.schema:write` and remain subject to Grist's native Owner enforcement. The bridge verifies the requested persisted definition and an internal fingerprint of all untargeted persisted ACL state after re-read. A successful result explicitly does **not** claim effective enforcement verification; persisted rule rows alone are not treated as a confidentiality proof. Native `user.LinkKey` context exists in the Grist web client but not in API calls, so Gia's persisted LinkKey-rule verification is deliberately not presented as an end-to-end LinkKey authorization test. If post-write persisted verification fails, the MCP result preserves the operation's `UNCERTAIN` effect knowledge with `retryWholeOperation: false` rather than collapsing it into a generic failure.

## Document bootstrap

Gia keeps the ten-tool MCP v2 surface unchanged. `grist_discover(action="workspaces")` returns only deployment-allowed workspaces for which the current principal has an explicit workspace grant with `doc:read`; unlike document discovery it includes allowed workspaces that currently contain no documents. This discovery result is selection context only and never implies creation authority.

`grist_add_structure(action="create_document")` creates exactly one empty document in an explicit positive `workspaceId`. The destination must be inside the deployment workspace ceiling and one principal grant must name that same workspace with `doc.schema:write`. A document-only allowlist or an unrelated schema grant never authorizes its parent workspace. Native Grist workspace `ADD` authorization remains authoritative, and native Grist creator ownership plus destination inheritance are disclosed effects rather than bridge-managed grants.

`grist_add_structure(action="copy_document_as_template")` additionally requires a separately authorized `sourceDocumentId` with local `doc:read`. The bridge always invokes Grist's native same-installation copy with `asTemplate: true`; local source readability is only a bridge precondition and is **not** presented as proof of native full-copy authority. Grist's own template-copy/download authorization and destination `ADD` checks remain authoritative. Gia exposes no arbitrary upload/import, fork, destination auto-selection or sharing/grant mutation in this contract.

`grist_add_structure(action="copy_document")` is a native **full-data** copy with fixed `asTemplate: false` and input `{sourceDocumentId,workspaceId,name}`. It requires deployment opt-in, a `doc:download` grant explicitly naming the source document, a destination workspace `doc.schema:write` grant, fresh native Owner proof on the source and Grist's own full-copy/download authorization. An OAuth caller also needs the verified `doc:download` scope. Document data and metadata may be sensitive. The new document inherits native destination access, which can expose data to a different audience. Gia reports the known created ID, source Owner check and destination membership. The native tests establish retention of the fixture rows. Effective ACLs, sharing, publication, attachments and history equivalence are outside the verification result.

The full-copy request and source grant must use the canonical native document ID.
This binds the source Owner check and the native copy to one stable identity
even if the document's URL alias moves. Template copy keeps its existing ID rules.

The tool-level OAuth security scheme remains the baseline `doc.schema:write`. Template copy metadata publishes `gia/actionScopeRequirements.copy_document_as_template = ["doc.schema:write", "doc:read"]`. Opted-in deployments additionally advertise `doc:download` and publish `gia/actionScopeRequirements.copy_document = ["doc.schema:write", "doc:download"]`. A missing enabled action-specific scope is challenged precisely. Resource authorization remains a separate prerequisite even with an adequate token.

All three creation paths are non-idempotent. After a known created ID is returned, Gia invalidates principal-local discovery and verifies that the created document currently resolves inside the requested destination under the same principal and required destination capability. If verification fails, the model-facing result retains `effectState: "APPLIED"`, `postconditionVerified: false`, the exact `createdDocumentId`, and `retryWholeOperation: false`; the operation must not be retried by name or “cleaned up” by guessing. Response loss or an acknowledged mutation whose created ID cannot be normalized remains `UNCERTAIN`; the discovery cache is still invalidated, but Gia does not replay the request automatically.

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
- Calendar configuration accepts stable IDs for required Title/Start Date and
  optional End Date/All Day/Type mappings. Private native mapping refs remain
  internal and untargeted widget options are preserved.
- Existing custom-widget settings accept only bounded access and stable-column
  mappings, never URL/plugin identity or arbitrary widget-owned options.

Schema inputs accept only supported table/column metadata. Relation display uses only semantic `visibleColumnId`; native `visibleCol`, `displayCol` and helper references are never writable model inputs. Rename results report
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
Typed LinkKey comparisons additionally accept one safe LinkKey name and one
same-table Text/Any stable record column; LinkKey values are never model inputs
or outputs. The `match_user` and `match_link_key` leaves may instead target the
proposed `newRec` row through `record: "newRec"`; such rules can only set create
and/or update permissions, never read/delete, and remain unverified as to effective
enforcement. The typed `column_change` leaf tests equality/inequality of `rec.<stableColumnId>` and `newRec.<sameStableColumnId>` for update-only permissions. Text, Choice, Int, Numeric and Bool columns are supported; both native operand orders normalize to one typed condition. It accepts no arbitrary literal, operand or raw formula and cannot set read, create or delete permissions. The `match_boolean` leaf accepts only an actual Bool column and a JSON boolean value, serializes to native `True` or `False`, and optionally uses `newRec` for create/update permissions (never read/delete). Both native literal operand orders normalize to the same typed leaf. The `user_access_membership` leaf accepts only `in|not_in` with two or three distinct built-in roles (`owner|editor|viewer`), serialized canonically as `user.Access in [OWNER, EDITOR]` or `not in`; order is normalized. No arbitrary strings, numbers or record-column membership. The `user_login_status` leaf supports only `user.IsLoggedIn ==/!= True/False`, with both native operand orders normalized and no arbitrary user properties. The `match_integer_flag` leaf accepts only exact JSON numeric `0` or `1` against an existing Int column, optionally with `newRec` for create/update; native operand orders normalize and arbitrary numeric/string literals remain unsupported. The `match_empty_text` leaf compares only an existing Text column with the empty string, without any model-facing literal field; its optional `newRec` context is create/update-only. No nonempty string or arbitrary numeric ACL literal is accepted. Finite boolean condition trees allow `all` / `any` (2–6 children)
and `not` over supported leaves, with at most 4 nesting levels, 20 total nodes
and a serialized native formula of at most 2,048 characters. Nested `everyone`
is invalid. Opaque or unsupported composite formulas remain protected.

The `user_attribute_flag` leaf references an existing normalized user
attribute and a native Bool field using `attributeName` and
`attributeColumnId`. Grist evaluates the native `user.<attribute>.<field>`
predicate. Use `not` to negate the flag. Gia verifies native parsed metadata
and tracks the attribute field as a schema dependency. In a synthetic context,
an absent or non-Bool value leaves the decision unknown.

`record_in_user_attribute_ref_list` checks `in` or `not_in` against a verified
user attribute's native RefList. The row operand is `id` of the target table
or a stable Ref column targeting the same table as the RefList. Its optional
`newRec` operand is limited to create/update permissions. Both stable field
dependencies are tracked. The current synthetic input cannot represent lists,
so symbolic evaluation leaves this predicate unknown and native testing
supplies any access evidence.

Success-only mutation results do not forward arbitrary upstream response bodies.
Record-field, query-filter and custom-mapping dictionaries reject the own key
`__proto__` before parsing, rather than silently dropping it. Other ordinary
string keys and arbitrary nested cell values remain supported. Persisted custom
mappings containing this unsupported key are explicitly marked incomplete.
Schema verification failure retains applied effect knowledge; UI creation retains
known created IDs. Partial and uncertain outcomes use explicit typed errors and
`retryWholeOperation: false`. Error content is text-only to avoid validation against
a success output schema. No atomicity, effective confidentiality or automatic retry
guarantee is implied by a successful persisted-state verification.

Missing, malformed or duplicate page/widget identity metadata marks the UI
snapshot incomplete and prevents graph-dependent mutations, including widgets
whose view has no page and fields/filters whose parent section does not exist.
Native raw sections remain valid outside the page/widget graph. Column normalization
and mutation require unique stable IDs, document-wide unique column references
in a complete schema of at most 5000 columns, and agreement between a widget's
table ID and table reference. Ambiguous or oversized select-by schema produces no
advertised column links, marks existing column links incomplete and refuses writes.
ACL and navigation visibility resolution also reject duplicate metadata identities.

Read-back and internal fingerprints detect divergence; they do not provide native
compare-and-set, transaction isolation or simultaneous-writer guarantees.
