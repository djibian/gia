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

The bounded `grist_add_ui(action="ensure_widget")` reconciles exactly one
native section on an existing page using its page ID, stable source table ID,
widget type and optional `groupByColumnIds`. An omitted grouping selects an
ordinary section. An empty grouping selects a grand total, and a grouping of
1–20 unique stable column IDs selects a summary of that set of columns.
Grouped reconciliation requires fresh native Owner proof. Gia verifies the
generated summary table using complete native column metadata so a hidden
grouping column cannot turn an existing section into a false grand total.
A sole existing section is reused with
its native widget ID and all configuration preserved. If absent, Gia invokes
the existing native `CreateViewSection`, verifies the returned ID and re-reads
the complete UI: earlier widget identities/settings and unrelated pages must
remain unchanged, with exactly one new matching section. Multiple matching
sections, incomplete UI state, unavailable tables, or changed pre-write
metadata fail closed. An uncertain native effect must be re-read before retry.
Use `add_widget` with client-owned stable IDs to create intentional duplicates.
The preflight and native creation are separate requests, so clients must
serialize writes to the same native UI.

The bounded `grist_add_structure(action="ensure_tables")` reconciles an
initial named-table schema when reconstructing an application from scratch.
Each table requires one or more explicit typed seed columns (`Any`, `Text`,
`Numeric`, `Int`, `Bool`, `Date`, `DateTime:UTC`, `DateTime:Europe/Paris`,
`Attachments`, `Choice`, `ChoiceList`, `Ref` or `RefList`). A legacy `fields:{type}` seed asserts type alone; a writable
initial data column uses `fields:{type,isFormula:false}` and must persist a
native `isFormula:false`. A matching computed column is a conflict before
any additional table creation. Gia reads the complete expanded native table and column identities,
rejects a missing or conflicting requested seed column on an existing table
before writing, and creates only absent tables. It verifies every created
stable ID, the requested column types, explicit writable intent when supplied,
and preservation of all preexisting table/column identities, types and observed
formula flags. Extra columns added later are preserved;
a repeat with the same seeds is a no-op. Incomplete metadata fails closed.
Native creation errors and unverified postconditions must be reconciled
before retry; no concurrency CAS is claimed. More advanced column properties
remain available via existing separate actions. This does not add an MCP tool.

The bounded `grist_add_records(action="ensure_record")` reconciles **one**
explicit keyed record on a caller-authorized document. A fresh native Owner
check prevents partially visible row sets from silently duplicating data.
The key must be an existing non-formula `Text` column with a nonempty
at-most-128-character string value supplied in `record.fields`. At most 32
explicit writable fields are accepted. Gia queries up to two native records
for that key and rejects duplicates, conflicting field values, malformed
metadata and unverified persistence. If one row matches every supplied field,
it returns its stable numeric ID without writing; otherwise it creates exactly
one record and verifies the unique exact persisted values on readback.
Unrelated native columns are not updated. Formula columns cannot be written.
Native coercion of submitted values that changes readback causes an uncertain
outcome instead of a false success. This is useful for synthetic application
seeding and safe sequential restarts, **not** a Grist uniqueness constraint,
atomic compare-and-swap or safe concurrent upsert. A failed or uncertain
write must be explicitly reconciled before repetition. No new MCP tool.

`grist_add_records(action="ensure_records")` reconciles 2–16 distinct Text-keyed rows
on one existing table in a single bounded request. The Owner-gated, complete
multi-key read rejects duplicate requested or persisted keys, conflicting values,
non-writable columns and truncated results before creating missing rows.
The adapter validates schema and prior records again, creates only missing keys,
then verifies all stable row IDs in input order. Replaying identical rows is a
no-op. Uncertain or partial effects preserve only confirmed created indices/IDs
and refuse blind batch retries. This is not a native uniqueness index, transaction,
concurrent upsert or cross-table orchestration; the external client reconciles
before retrying. No additional MCP tool is introduced.

Both `grist_add_structure(create_tables)` and `grist_add_structure(create_columns)` accept only creation metadata actually persisted by the supported native Grist operations: optional `label`, `type`, `isFormula`, `formula` and `widgetOptions`. Native `AddTable` and `AddVisibleColumn` do not persist `description` and do not resolve the public stable-ID alias `visibleColumnId` at creation time. These two update-only fields therefore fail validation **before any create write**, including mixed batches, rather than producing a misleading success. To set them, first create the column with supported fields, then call `grist_change_structure(action="update_columns")` on the resulting stable IDs; update verification and uncertain-write handling remain authoritative. This narrows previously advertised but ineffective create inputs, not a functioning native creation workflow.

`grist_add_structure(action="ensure_columns")` reconciles a bounded homogeneous
batch of explicit typed columns **on one existing table**, for incremental
application construction and restart. For every requested stable ID, either the
column already exists with precisely the requested native type and formula
intent, or Gia creates it and rereads the complete native column state.
A type-only seed is `fields:{type}` (preserving legacy behavior without
asserting whether Grist internally marks it as computed); an explicitly writable
data seed is `fields:{type,isFormula:false}` and requires native readback of
`isFormula:false` for the matching stable ID. A formula seed is
`fields:{type,isFormula:true,formula:nonemptyGristPython}`, with a 4096-character
bound and no unrelated native fields. Both use the same closed supported types:
`Any`, `Text`, `Numeric`, `Int`, `Bool`, `Date`, `DateTime:UTC`,
`DateTime:Europe/Paris`, `Attachments`, `Choice`, `ChoiceList`, `Ref:<table>` and
`RefList:<table>`. For `Text` and `Choice`, a seed of
`fields:{type,isFormula:false,formula:nonemptyGristPython}` creates a writable
column with an insert-only default. Grist evaluates it for an omitted field
on insertion, preserving explicitly supplied values and subsequent edits.
The same seed may include `recalculateOnColumnId` for one distinct existing
column on the same table. Grist then also evaluates the formula when that
column is edited. Gia resolves the dependency to a private native column
reference, verifies exact native trigger metadata and rejects conflicting
existing dependencies on replay. The reference destination and formula dependencies must
already be valid in native Grist. A matching existing formula is reused without
rewriting it; for an explicit formula seed a differing formula, an explicit data
seed targeting a formula column, or a conflicting type
fails before creating another requested column in the same batch. All prior
native column IDs, refs, types and observed formula metadata remain unchanged.
Missing/duplicate IDs, incomplete/censored metadata and malformed formula seeds
fail before any write. Other widget, dropdown and Form configuration uses the
existing independent operations. Generated native auxiliary columns are not
invented or identified as application fields. New-write normalization or
post-read uncertainty demands reconciliation, never blind replay. No native
cross-writer CAS, general schema migration engine or new MCP tool is implied.

`grist_add_structure(action="create_columns")` also accepts a homogeneous
batch of configured data columns. Each item has `id`, `fields:{type,label?}`
and `configuration:{form?,dropdownCondition?}`. The `form` object accepts
`question`, `required` and `acceptFromUrl` as native Form column defaults.
The `dropdownCondition` object accepts a single typed predicate:

| `kind` | Operand fields |
| --- | --- |
| `choice_field_equals_literal` | `choiceColumnId`, `value` (bounded plain text for a Text or Choice column) |
| `choice_field_equals_record_ref` | `choiceColumnId`, `recordColumnId` (both Ref to the same table) |
| `choice_id_in_record_reflist` | `recordColumnId` (RefList to the dropdown table) |

Conditions require a new `Ref` or `RefList` column and existing operand columns.
Gia builds the native definition in the creation action and verifies the stable
ID and persisted configuration. An exact existing definition is reconciled
without another create. A conflicting existing column fails preflight. If Grist
assigns a different ID or persisted state cannot be confirmed, reconcile the
issued IDs before retrying. Native Form settings and dropdown conditions are
stored separately from ACL enforcement. A stored dropdown predicate does not
establish filtering behavior in a native Form or authorization of submissions.

The bounded ACL condition input language is advertised using local JSON Schema `$defs`/`$ref` references for its finite depth levels. Clients must resolve these local references to discover the complete closed predicate variants; a client's flattened or `unknown` display is not evidence that Gia accepts arbitrary predicates. Server-side validation, depth/width/node bounds and closed actions remain unchanged. This is not a promise of support for every client's JSON Schema dialect.

`grist_change_structure(action="update_form_column_options")` writes one
existing stable column's Form question, required flag or URL-prefill flag, keeping
all other native `widgetOptions` untouched, including protected dropdown/style
configuration. It refuses malformed or truncated native state, verifies the
complete persisted options, and returns an idempotent no-op on re-execution.
`question:null` clears the question. This does **not** create, render, submit or
publish forms, accept link-bearing question text, or change native sharing.

`grist_change_structure(action="append_choice_options")` appends up to 64
unique, nonempty plain-text labels to one existing native
`Choice` or `ChoiceList` column, including calculated columns with complete formula metadata. Only missing labels are appended in the
caller-supplied order; existing choices are never removed, renamed or reordered.
Native `widgetOptions.choices` is updated while sibling options, including
choice colors, Form configuration and conditional styles, remain unchanged.
Gia rejects malformed/incomplete native metadata, duplicate labels, over-limit
lists and unrelated column types; re-reads the complete options and column
type to verify persistence. Identical repeated requests are no-ops.
Uncertain native writes require inspection before retrying; external
concurrent editors still need serialization. This action does not constrain
row-level data or bypass ACLs, and adds no MCP tool.

`grist_change_structure(action="reorder_choice_options")` reorders the exact
complete set of 2–64 already configured labels in a native
`Choice` or `ChoiceList` column, including calculated columns. The caller supplies the entire ordered set;
missing, extra, duplicate, malformed or unknown labels fail closed before a write.
A successful reorder changes only the ordered `widgetOptions.choices` array,
preserving all choice colors and sibling Form, style and other options. Gia
checks a complete current native schema snapshot, repeats the check before
writing, verifies post-read persistence and returns a no-op when the order
already matches. Transport/partial effects require inspection, never blind
replay. It cannot edit record values, authorizations or individual choice names.

`grist_change_structure(action="set_choice_colors")` changes one or both
closed `#RRGGBB` colors of a *previously configured* Choice or ChoiceList label.
It preserves the choice list, other label colors, Form settings and all sibling
native options; a repeated identical request is a verified no-op. Unknown labels,
non-choice columns, incomplete formula metadata, malformed existing color state, excessive metadata
and invalid color values are refused before any write. It uses `doc.schema:write`
and complete native readback, never updates row values or grants. All three choice
presentation operations verify unchanged formula ownership, expression and other
native column metadata as well as the requested options.
Uncertain effects must be reconciled without blind retries.

`grist_change_structure(action="update_dropdown_condition")` applies or clears
a typed native reference-dropdown predicate on one existing stable Ref/RefList
column, reusing the same three closed forms supported by configured-column
creation. `condition:null` clears the predicate. The operation validates the
reference operands against fresh expanded schema, preserves all other native
`widgetOptions`, refuses malformed existing native predicates, verifies the
complete persisted options, and returns a no-op for identical requested state.
It does not accept arbitrary expressions or establish Form visibility/ACL rights.

`grist_change_structure(action="style_rules")` creates or replaces one native
column conditional-format rule on a column with zero/one rule. With **multiple**
existing rules, the same closed action only replaces the colors of a **unique
existing exact `conditionFormula`**, preserving each helper formula, order and
all other styles; absent/duplicate formula or incomplete state is refused. The Grist
Python `conditionFormula` uses the existing authorized formula capability,
never an ACL predicate. Native conditional style accepts explicit `#RRGGBB`
colors and a boolean `fontBold`. A bold-only edit preserves both existing
colors. Color edits retain the existing bold setting unless explicitly
changed and keep the existing color replacement semantics. Gia resolves
stable table/column IDs to private native refs, uses Grist `AddEmptyRule` to
construct the formula helper and its owner link, then applies formula plus
`rulesOptions` in one fixed native bundle. Existing nonstyle widget options
are preserved, helpers are never exposed, exact native readback is required,
and identical requests are no-ops. Unrecognized or malformed
native rule metadata refuses mutation. A partial/transport-uncertain creation is not blindly
replayed: the caller must inspect the column state and reconcile before retry.

A separate `grist_change_structure(action="append_style_rule")` accepts the
same one-formula/closed-style input and appends **one** native conditional style
rule, up to eight ordered rules on the column. An identical existing
formula/style is a verified no-op; an existing matching formula with different
colors, malformed native helper, incomplete configuration or uncertain metadata
blocks the append. The adapter uses Grist `AddEmptyRule` and a fixed native
formula/style write, preserves ordered prior helpers, their formulas and styles,
and all nonstyle options, then rereads the full resulting sequence. Lost or
unverified effects must be reconciled rather than replayed. The original
`style_rules` retains its legacy ability to replace a formula only for a
zero/one-rule owner; multiple-rule owners can update colors only by exact
existing formula match. Neither action accepts ACL predicates or raw native actions.

A separate `grist_change_structure(action="replace_style_formula")` updates the
condition of **one unique existing** native column conditional-format rule.
The client supplies the stable table/column IDs, exact `previousFormula` and
bounded `conditionFormula`. Gia resolves the private helper ID from a complete
native snapshot and applies a single fixed helper formula update, without
rewriting owner `widgetOptions` or any other rule, style, order or auxiliary.
An absent/ambiguous previous formula, a formula collision, unconfigured rule
or incomplete native metadata is refused. An identical old/new formula is a
verified no-op. The entire rule sequence and owner options are reread to check
the postcondition. An uncertain write must be reconciled before retrying; this
is not a native atomic compare-and-swap, so concurrent native edits still
require external serialization. Formulas use the already authorized Grist Python
capability, never raw ACL expressions. No MCP tool is added.

`grist_change_structure(action="append_row_style_rule")` appends one
native conditional-format rule to the **raw table section**, rather than to
a column or arbitrary page widget. It accepts only a stable `tableId`, a
bounded Grist conditional `conditionFormula`, and nonempty closed
`#RRGGBB` colors. Native `AddEmptyRule(tableId,null,null)` creates a real
`gristHelper_RowConditionalRule` formula helper linked by
`_grist_Tables.rawViewSectionRef` to `_grist_Views_section.rules`.
Gia preserves other row styles, their order, the raw-section `options` and
all unrelated column or visible widget styles, then verifies both helper
identity and exact persisted state. At most eight row rules are supported.
Identical repeated requests are no-ops; matching formulas with different
colors, incomplete native metadata and ambiguous helpers refuse mutation.
As with column style append, a partial or transport-uncertain native action
requires inspection and reconciliation, never blind replay. Row-style
persistence is not a native rendering/visual acceptance assertion.


`grist_change_structure(action="update_row_style_rule")` updates the style of
**one existing unique formula** on the native raw-table row-style sequence.
The stable `tableId`, exact `conditionFormula` and closed colors are the only
inputs. A complete native metadata read resolves the raw section, ordered
helpers and styles. The action refuses missing/ambiguous formulas, incomplete
styles, foreign helpers and malformed options, and returns a verified no-op
when colors already match. A fixed update of the raw section's `options`
preserves helper identities, formulas, order and all nonstyle options, with
full post-read. This is not an atomic compare-and-swap: external concurrent
writers must be serialized and uncertain effects reconciled, not replayed.
No new MCP tool or widget/publication authority is introduced.


`grist_change_structure(action="remove_column_style_rule")` removes exactly one
uniquely selected native column conditional style from a complete 1–8-rule
owner. It requires stable table/column IDs, exact existing `conditionFormula`,
and `confirmRemoveRule:true`. Gia verifies that the private hidden helper is
exclusively owned by that column and is not referenced by another column,
section or field. Grist receives only a fixed bundled removal of the paired
style option and the native helper `RemoveColumn`; remaining helpers, their
formulas and colors, and all other owner options are re-verified. Missing,
duplicate, shared, malformed or incomplete state refuses deletion. No arbitrary
column deletion, unconditional retry, external CAS or ACL authority is granted.

`grist_change_structure(action="reorder_column_style_rules")` reorders two to eight
existing, fully configured native column conditional styles. The complete
`orderedFormulas` permutation selects unique existing formula helpers. Gia pairs
each helper with its closed colors using the verified row-style ordering planner;
a fixed owner-column native update changes only ordered `rules` and the paired
`widgetOptions.rulesOptions`. Native helpers/formulas and unrelated column
options remain intact. Fresh before/after reads enforce exact preservation;
missing, duplicate, opaque or incomplete rules are refused. Repeating the same
order is a no-op, and unverified writes require reconciliation, not blind replay.
Neither external CAS nor browser-visible precedence is claimed.

`grist_change_structure(action="remove_row_style_rule")` deletes exactly
one fully configured native raw-table conditional row-style rule among one to
eight unique rules. Only the stable table ID, an exact existing predicate and
`confirmRemoveRule:true` enter the request. Complete native metadata must prove
the selected helper belongs exclusively to the table's raw view section, and
no other column, field or section references it. Gia writes the surviving paired
style colors and the fixed native helper `RemoveColumn` in one bounded action
bundle, then verifies surviving ordered refs, formulas, colors, unrelated section
options and physical removal of the selected helper. Missing, duplicate, shared,
opaque or truncated owners fail closed. Removing the final rule preserves all
unrelated options and leaves an empty style sequence. A repeated removal
does not delete another rule. Effects without complete postconditions are
uncertain and must be inspected before retry; this is not a native CAS, broad
column-deletion API or browser-rendering proof. The ten-tool interface remains.

`grist_change_structure(action="reorder_row_style_rules")` reorders two to eight
**existing, fully configured raw-table row conditional styles**. The caller supplies
the stable `tableId` and `orderedFormulas` containing every existing unique
predicate exactly once in desired priority order. Gia resolves native helper IDs
from a complete snapshot and atomically writes only the raw section's ordered
`rules` references with the correspondingly reordered `rulesOptions` colors.
No helper is created, deleted or modified. Unrecognized, duplicate, incomplete
or missing rules, protected options and changed pre-write state are refused.
Readback verifies the exact reordered formula/style pairs and all other
section options; replay is a no-op. A native write without a confirmed readback
is uncertain and must be reconciled, not blindly retried. This is not a CAS
against external concurrent writers or proof of browser rendering.

`grist_change_structure(action="replace_row_style_formula")` replaces exactly
one unique existing **raw-table row** conditional-format formula, selected by
stable `tableId` and exact `previousFormula`, with a bounded nonempty
`conditionFormula`. It resolves the native raw section and formula helper
using a complete verified metadata snapshot, refusing absent/duplicate
predicates, collisions with sibling rules, malformed helpers and incomplete
styles. One fixed native helper-only formula update preserves all raw-section
options, rule colors, helper identities, ordered siblings and unrelated widget
styles. An identical replacement is an idempotent no-op. Before/after reads
verify persisted semantics; concurrent writers still require serialization,
and an uncertain write must be reconciled before replay. Native metadata
persistence is not proof of browser rendering.

An operator-approved `grist_change_ui(action="install_trusted_widget")` selects
one registered HTTPS widget on a blank native Custom section. The deployment
registry `GIA_TRUSTED_CUSTOM_WIDGETS_JSON` accepts up to 12 entries with
`{key,name,widgetId,url}`. Widgets may share a domain and use permanent URLs
with maintained code. Frame URLs use a hostname distinct from Grist and omit
credentials, queries and fragments. The caller sends a `trustedKey` and
`confirmExternalWidget:true`. Native Owner and `doc.schema:write` are required.
Gia verifies the saved identity and initial `access:none`, preserves unrelated
options and refuses occupied sections. Repeating the completed selection is a
no-op. An uncertain write requires reconciliation.

Use `directUrl:true` to select the registered frame URL directly and leave both
native catalog ID fields empty. Grist then loads that configured URL without
catalog substitution. Gia verifies the URL privately and returns the registered
key. Approved direct widgets accept bounded literal option changes and reset
with native Owner proof. Catalog selection uses Grist’s native widget ID.
Catalog widget IDs may include one native named variant suffix such as `#map`.
This suffix is part of the widget ID. Approved frame URLs still forbid fragments.

A separate `grist_change_ui(action="update_trusted_widget_revision")` replaces
one explicitly revision-labeled selection with another approved labeled
selection **of the same widget and asset at the same origin and selection mode**. The optional registry field `revision` labels each asset URL for that operation. The model supplies
`previousTrustedKey`, `trustedKey`, stable page/widget IDs and
`confirmExternalWidget:true`; no URL or code enters the call. Native Owner
and `doc.schema:write` remain mandatory. The persisted widget must exactly
match its approved source definition and have `access:none`, no column
mappings, no widget-owned options, and no active rendering. Gia preserves all
unrelated section options, verifies the full resulting metadata and treats
repeated completed upgrades as no-ops. Configured/data-bearing widgets are
refused: operators must explicitly deactivate and clear their settings before
an approved revision update. This does not prove the remote code is safe,
nor provide an external compare-and-set or a blind retry guarantee.

`grist_change_ui(action="configure_trusted_widget_references")` writes one
managed option of an already installed widget matching the approved selection in native URL mode with `access:none`. It requires native Owner proof, `doc.schema:write`
and `confirmExternalWidget:true`. The deployment entry may declare
`referenceOption:{key,version,tableSlots,columnSlots,defaults?}`. The
`columnSlots` map assigns each column slot to its expected table slot.
Optional `defaults` contains a bounded tree of inert operator-supplied
settings. The caller supplies exactly `tables:{slot:stableTableId}` and
`columns:{slot:stableColumnId}`; URLs, settings and numeric native refs
are absent from the request. Gia resolves references within this document
and writes the configured key in native widget-owned options with
`{version,tables,bindings,...defaults}`. The saved tables contain numeric
table refs and each binding contains `tableRef` and `columnRef`. Gia keeps
these refs private, verifies the resolved identities and preserves other
options and access. Identical requests are no-ops and uncertain writes
require reconciliation. The saved selection is metadata evidence. Grist's
browser resolves its catalog and frame URL separately. Effective rendering,
remote code behavior and any later grant of access require their own qualification.

To use an approved custom widget as a direct linking source, the operator adds
`allowSelectBy:true` to its approved `directUrl:true` entry after verifying that the widget
declares Grist's linking support. The caller makes a standalone
`update_widget` with `selectBy:{sourceWidgetId,trustedSourceKey}`. Gia requires
fresh native Owner, the exact approved active source on the same page and
table, and normally an acyclic graph. To admit a reciprocal direct cursor
pair, the operator must additionally set `allowReciprocalCursor:true` on the
exact entry, after auditing that the widget uses cursor linking only and
never activates a dynamic selected-row filter under any permitted settings.
This flag requires both `directUrl:true` and `allowSelectBy:true`. Create the
ordinary native-to-Custom edge first, then close the pair with the explicit
trusted source key. Only one Custom and one ordinary native grid/Card/Card
List/Form on the same verified non-summary table, with complete zero-column
metadata, are accepted. Replaying either edge is a no-op and requires the
active exact approved Custom selection and fresh Owner proof. Clear a
reciprocal link before changing a trusted widget revision.
Granting widget data access remains a separate operation under the registered widget policy. Native
metadata verification does not qualify remote cursor behavior or enforce
the operator's code audit in the browser.

`grist_change_ui(action="publish_form")` publishes one existing native Form widget and its
page-linked native share through a private fixed Grist action bundle. The request must
include `confirmPublic:true`, a `doc.schema:write` grant and fresh native
Grist document Owner proof. The operation accepts only the two native boolean
`shareOptions` flags (`form:true,publish:true`). A page without a share gains
a new native share and page reference atomically using Grist's internal native
actions and a server-generated unpredictable private link identifier. An
existing share is reused only when already published, unambiguous and not
reused by other pages; other existing share states are protected. All
relevant native records are reread and checked; layout/widget options and
document ACLs remain untouched. A repeated call is a no-op. Link identifiers
are never exposed to the model. Native persisted publication and page linkage
do not prove anonymous browsing or submission; those require separate
native acceptance checks.

`grist_change_ui(action="unpublish_form")` disables the native publication
flags of one previously published Form section. Exact existing page/widget IDs
and `confirmUnpublish:true` are required, together with `doc.schema:write`
and fresh upstream Grist document Owner authority. A uniquely verified native
published page share is required. One fixed native section update changes only
`shareOptions` to `{form:true,publish:false}`; it preserves page/share
metadata, Form layout and options, and unrelated native permissions. Before/after
reads verify this intention; a repeat is a no-op, and uncertain writes must be
reconciled, never blindly retried. Existing public home-database Share.keys
are **not** deleted or attested revoked. Disabling the section does not qualify
effective anonymous access revocation; that is a separate native boundary.

Plain Form instructional text supports ordinary spaced punctuation such as
`Stage : informations`, while URLs, scheme-prefixed strings and link-bearing
Markdown remain protected to prevent accidental capability disclosure.

`grist_change_ui(action="update_form_layout")` configures one existing
native Form section with a bounded tree of typed paragraphs, field groups and a
final submit element. All field references are supplied as stable column IDs and
resolved to existing native section-field IDs server-side. The action is
idempotent for an identical native layout. Omitted submission settings are
retained. The action refuses opaque/malformed existing layout properties
(including unverified redirect URLs) and re-reads the persisted layout and stable field
bindings. It does not add fields to native sections, create share links, publish,
execute submissions or assert rendered behavior. To place a column not already
present as a native section field, configure the widget fields separately first.

A layout may contain one `{type:"form_link",label,targetPageId,targetWidgetId}`
at the root or within a section. Optional `prefix` adds 1–160 characters of plain
instructional prose starting with a letter before the link label (no Markdown
control syntax or URL-like text); the whole generated paragraph remains limited to 300 characters. The request requires `confirmPublicLink:true`
and native Grist Owner access. Both IDs must resolve to another already
published Form in the same document. Gia verifies the native page-share
binding, resolves the separate public key with fixed Grist socket calls on
the configured origin, and checks the exact public Form endpoint without
credentials before writing the link. The caller supplies no URL or key.
Re-read confirms the target and persisted layout. The key is never returned
through MCP. An earlier protected link can be retained or edited only after
its target is resolved to that same verified key. Native anonymous submissions
are tested in disposable Grist qualification, never sent by the runtime.
Worker routes on another origin and unresolved organization paths fail closed.

`layout.successRedirect:{targetPageId,targetWidgetId}` with `confirmPublicLink:true`
uses the same verified published Form resolution and fresh native Owner gate.
Grist sanitizes success redirects as absolute HTTP(S) URLs, so Gia constructs the
absolute URL from its configured origin and verified public path, never caller URL
text. A simultaneous paragraph link must use that same target. A pre-existing
redirect may be replayed only when it exactly matches this verified URL; opaque
or differently targeted redirects are protected. Neither the URL nor the share
key is returned by Gia. Persisted redirect metadata is not proof of browser
navigation after submission.

`grist_change_ui(action="update_form_field_options")` targets one
existing native Form section field by page/widget and stable column ID. It
updates a nonempty subset of `question` (string or null to clear),
`required`, and `acceptFromUrl`, preserving all unrelated native field
widget options and column defaults. It requires a complete UI/field snapshot,
validates the exact section-field reference and verifies all persisted
field options after the write. An identical request returns no change. This
does not create fields, render/publish forms or grant access.

`grist_change_ui(action="update_widget", update:{customWidgetSettings:{optionsPatch}})`
can patch 1–24 inert literal options of an **already identified** native custom
widget. Only the supplied nested `customView.widgetOptions` keys change;
unrelated keys, widget identity, URL, access and mappings are preserved and
re-read. Values are bounded strings, numbers, booleans, string/number lists
or null. URLs, executable markup, secret-bearing keys, arbitrary objects and
prototype keys are rejected. This neither installs a widget nor establishes
publisher provenance, version pinning, or safe remote widget execution.

`grist_change_ui(action="update_widget", update:{customWidgetSettings:{resetWidgetOptions:true}})`
explicitly clears all widget-owned options to native `null` on an already
identified Custom section. The persisted widget access must already be `none`;
active `read table`/`full` widgets must be deactivated in a separate verified
operation. A fresh native document Owner proof and the existing schema grant
are required, because the reset deliberately discards previously configured
options. A reset cannot be combined with `optionsPatch` or data-access
escalation. Widget identity, approved external URL, mapping, other Custom
settings and all outer section options are preserved and checked on native
readback. Repeating a completed reset preserves the same state; uncertain
writes require inspection before retry. This does not remove the remote
widget, certify its code or grant any remote data access.

`grist_change_ui(action="update_widget", update:{customWidgetSettings:{access}})`
accepts the native levels `none`, `read table`, and `full`. Both data-bearing
levels require `doc.schema:write` and fresh native Grist document Owner proof.
An exact registered `directUrl:true` selection carries standing approval for
either level. This mode also works for widgets distributed by a catalog.
Native catalog selections and other selections use the existing
`confirmDataAccess:true` path, since Grist can substitute a cached catalog URL. A request relying on the registry
re-reads the widget immediately before the write. Reducing access to `none`
and schema-scoped inert settings changes use their existing authorization.

Grist runs the configured widget in the browser with the current Grist user’s
authority. Registry approval covers evolving code served through the approved
deployment. Persisted selection and grant verification describe metadata.
Browser behavior and remote code integrity require separate evidence.

### Individual document sharing (Owner-only)

`grist_change_structure(action="grant_document_user")` adds only one explicit
`email` as a `viewers` or `editors` member through native
`PATCH /api/docs/:docId/access` with `delta.users[email]`. The operation
requires Gia `doc.schema:write` and fresh native Grist Owner authority.
The recipient must be an **existing org member** already identified by a
stable positive Grist user ID in the Owner-visible native document access
snapshot, with no existing direct or inherited document role. An unknown
address is refused before mutation because Grist's native delta otherwise
creates a home-db account. A current direct grant of exactly the same role
is a no-op; an existing different or inherited grant is protected and
refused. No removal, public
access, owner creation, inherited role ceiling change, wildcard or bulk
grant is supported. The full native access list stays server-side; output
confirms only the target role and native persistence. Native API grant
verification is not evidence that all document ACLs were enforced or that
an invitation email was delivered. An uncertain or unverified mutation must
not be blindly retried. Publication is explicitly outside this operation.


A separately confirmed `grist_change_structure(action="revoke_document_user")`
removes **one existing direct** Grist document `viewers` or `editors` grant.
The client supplies an exact individual normalized email, the
`expectedRole` and `confirmRevocation:true`. Gia requires
`doc.schema:write` and fresh native document Owner authority. It refuses
public pseudo-users, unknown or ambiguous identities, inherited access,
other direct roles (including owners), or unexpected current roles.
Native `PermissionDelta.users[email]=null` removes direct document access,
not the Grist account, a workspace grant or any inherited permission.
The complete native access snapshot is checked before and after; unrelated
recipients and inherited-role ceiling must remain unchanged. A target
remaining visible with null direct access, or disappearing from the
document membership list, is consistent with native revocation. An
already-absent direct grant on a still-visible known user is a no-op.
Effects that cannot be read back are uncertain and must not be replayed
blindly. This is not a general user-management API, nor a proof of
end-to-end authenticated access enforcement.

A separately confirmed `grist_change_structure(action="change_document_user_role")`
changes only an **existing direct** document viewer/editor grant to the other
role. The caller supplies a normalized individual email, `expectedRole`, the
distinct desired `role`, and `confirmRoleChange:true`. Local
`doc.schema:write` plus a fresh native Owner proof are mandatory. A complete
native access snapshot must identify the existing target by positive user ID,
with neither inherited access nor a protected direct role. Gia sends only
`PermissionDelta.users[email]=role`, never a whole-list write or a new
identity. A previously completed transition is a no-op when the target already
has the desired direct role. After the write Gia verifies the same target ID,
desired role, unchanged membership/inherited state and identical unrelated
recipients and inherited-role ceiling. Failed or ambiguous effects are
uncertain and not blindly retryable; non-CAS native sharing changes must
be serialized and reconciled. No native authorization decision or invitation
delivery is certified by this persisted write.

All three individual sharing operations verify **persisted** access only.
Native Grist can continue to use an earlier effective document role after
a confirmed change, including allowing reads or writes after revocation or
downgrade. Grist Community 1.7.16–1.7.20 uses a nominal 5000 ms document
authorization cache, distinct from its invalidated permission-list cache.
The disposable application qualification on 1.7.19 records immediate
authorization outcomes separately and checks restrictions after a fixture-only
6 s interval. This is sampled native behavior, not an upper bound, an
instantaneous revocation guarantee, or a proof across workers, sessions or
deployments. Gia does not wait for, invalidate or bypass native authorization
caches; clients must not treat persisted verification as proof that effective
access has changed or retry uncertain mutations to accelerate propagation.

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

Gia package/runtime version **0.12.0** implements MCP contract major **2**.

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

Gia 0.12.0 retains three bounded end-to-end capabilities without adding an MCP tool or capability.

`grist_change_structure(action="update_document")` accepts an explicit `documentId` and an `update` object containing `name?` and/or `type?: "normal"|"template"|"tutorial"`, or a separate `{timezone}` update. Public `normal` maps to Grist's native null type. Both modes use existing `doc.schema:write` and are semantically idempotent. Name/type updates verify `{id,name,type}` by rereading native document metadata. The timezone write supports `UTC` and `Europe/Paris`, which are qualified across the supported Grist versions. It changes only the native timezone cell and returns the verified settings and whether a write occurred. The separate call keeps each request within a single native metadata path. Transport-ambiguous writes must be reconciled before replay.

The existing `update_document` action separately accepts the qualified
`locale` values `fr-FR` or `en-US`; locale cannot be combined with timezone,
name or type. The native documentSettings JSON is read in full, updated only
at the locale key and reread as a complete postcondition, without exposing
unrelated settings. Unsupported or incomplete native JSON refuses modification.

`grist_change_structure(action="replace_column_formula")` changes the formula on one **existing** calculated column (the default) or, with explicit `formulaKind:"trigger"`, one existing writable Text/Choice trigger formula. The trigger must use native DEFAULT recalculation with no dependency or one verified existing same-table dependency, matching the seed subset. A trigger update does not change its type, formula ownership, trigger mode or dependency. Plain writable data, unsupported trigger shapes, malformed or truncated schema, and uncertain target ownership are refused. The bounded Grist Python string requires `doc.schema:write`, a complete hidden-column snapshot and an exact positive native column identity; arbitrary UserActions and ACL text are not accepted. Identical input is a no-op; a changed formula is written using native column PATCH and reread. All untargeted native column fields and identities must be preserved, otherwise the effect is uncertain and must be reconciled before retry. The bridge verifies persisted schema, not every row value. Disposable native tests check calculated values, preservation of existing trigger values, subsequent insert defaults and declared dependency recalculation.

For Ref/RefList columns, `grist_change_structure(action="update_columns")` additionally accepts `visibleColumnId`, always as the stable ID of a column on the referenced table. Numeric `visibleCol`/`displayCol` refs remain bridge-private. Gia resolves the target privately and applies Grist's paired native semantics—updating `visibleCol` and setting the display formula—in one fixed internal action bundle, then verifies the target relation, visible column and generated display formula after re-read. `label` and `visibleColumnId` are intentionally separate mutations because a native label change may also canonicalize the source stable column ID.

Calendars remain one public widget concept, `calendar`. `grist_change_ui(action="update_widget")` accepts `calendarConfig: {titleColumnId,startDateColumnId,endDateColumnId?,allDayColumnId?,typeColumnId?}`; all values are stable column IDs on the widget table. Gia follows Grist's calendar mapping types: start/end are strict `Date|DateTime`, all-day is strict `Bool`, title accepts the native non-strict `Text|Any` semantics, and type accepts the native non-strict `Choice|ChoiceList|Any` semantics. Gia preserves untargeted widget options/mappings and verifies the normalized mapping after write. Calendar creation/configuration adapts internally across the supported Grist Community matrix: legacy persisted `custom.calendar` is used when the old bundled calendar is discoverable, otherwise native `calendar` is used. Inspection normalizes either representation back to public `calendar`. The compatibility probe exercises document type conversion, relation display and configured calendars on every supported Grist Community version 1.7.16–1.7.20.

## Page order and layout

`grist_change_ui(action="update_layout")` updates a page's complete bounded
widget layout using stable widget IDs, nested groups, optional finite
nonnegative sizes and explicit collapsed widget IDs. Every existing widget
must be placed or collapsed exactly once. Incomplete current layout is
refused before mutation. An equivalent normalized layout returns
`changed:false` without rewriting native layout metadata (including
unprojected collapsed sizes); otherwise the native write is verified by
re-read and returns `changed:true`. Unknown or uncertain effects require
reconciliation before replay.

Gia keeps the ten-tool MCP v2 surface unchanged. `grist_change_ui(action="reorder_pages")` accepts one complete ordered list of the stable page IDs currently eligible for normal navigation.

The bridge resolves private `_grist_Pages` row IDs and native `pagePos` values internally. It requests the current visible-page position slots and accepts Grist's native position canonicalization only for targetable visible pages. It preserves complete persisted order, identities, hierarchy and untargeted/special page positions; it does not mutate `indentation` and rejects permutations that change the existing page-parent relation or visible page set. The normalized navigation state is verified after write. Page ordering adds no folder/navigation framework and no raw metadata/UserAction input.

Document/page inspection additionally returns `navigationPageIds`, the exact current stable page-ID set that page reorder expects for a complete reorder request. When navigation is unavailable, unsupported or exceeds a bound, inspection retains the available context, omits guessed IDs and returns `navigationNormalizationIncomplete: true`. Document UI completeness summaries include this condition. The stricter complete-snapshot requirement still applies to reorder writes.

## Application access rules

Gia keeps the ten-tool MCP v2 surface unchanged. `grist_inspect(action="access_rules")` returns a normalized view of persisted ordinary table/column access-rule groups, while `grist_change_structure(action="access_rule_group")` accepts exactly one `create`, `ensure`, `replace` or `delete` intention.

`ensure` requires the existing Owner and document-schema authorization and
the same typed definition as `create`. It creates an absent group or user
attribute, reuses an equivalent existing definition, and refuses conflicts
before writing. Rule order and permissions are part of equivalence.

For all ordinary-group and user-attribute modes, Gia rechecks the complete
native ACL and schema snapshot before any actual write. A detected change
refuses mutation before submission; an equivalent no-op needs no write.
After submission, Gia verifies persisted definitions and untargeted state.
The preflight is stale-state detection, not an atomic compare-and-set
against external editors or effective native enforcement. Reconcile an
uncertain native outcome before retrying.

The separate `grist_change_structure(action="patch_access_rule_permissions")`
accepts an ordinary `target`, one typed `expected` rule (condition and current
permissions), and complete replacement `permissions` using the same bounded
R/C/U/D subset. It resolves exactly one supported current rule by semantic
equality, even within a mixed supported/opaque group. Mixed groups may expose
`patchableRules` containing uniquely identifiable supported typed rules; this
does not make the whole group editable. Missing, ambiguous or stale expected
rules and duplicates are refused. Only native `permissionsText` is updated;
the predicate, native IDs, positions, resource and all other ACL metadata must
remain identical on reread. Equal permissions are a no-op. The same Owner,
`doc.schema:write`, stale-state preflight and uncertain-write rules apply.
After a changed patch, the old expected rule is not a replay token: reinspect
before repeating. No raw IDs, predicates, memo edits or new permission types
are accepted.

The analogous `grist_change_structure(action="patch_access_rule_condition")`
accepts the same target and expected typed rule, and one replacement typed
`condition` (not formula text). It preserves permissions, identity, position,
resources and opaque siblings. Only the native formula is written; the
Grist-derived parsed predicate must independently normalize to the requested
condition on re-read. The unconditional rule must remain last, and current
permissions must be valid for the replacement condition. The same stale-state,
authorization, no-op, duplicate and uncertain-write requirements apply.

The bounded `grist_change_structure(action="swap_access_rule_order")`
accepts the same target and two distinct typed rules, `expected` and
`swapWith`. The former must currently precede the latter; both must resolve
uniquely in the same group and neither may be unconditional. This explicitly
swaps their native positions (including across opaque siblings), leaving
every other native ACL field and identity unchanged. Only the two positions
are submitted in one fixed native bulk update and verified by reread.
The original ordered request is refused on immediate replay; reverse the
selectors only to request an intentional reverse swap. No raw positions or
IDs are accepted. The same Owner/schema authority and preflight apply.

Targets use stable table/column IDs; private ACL resource/rule row IDs remain bridge-internal. Writable conditions are a deliberately small typed subset with no arbitrary literal or formula text: everyone, one native Grist role comparison or a bounded two/three-role `user.Access in/not in` membership, a `user.IsLoggedIn` equality/inequality against a native boolean literal, one same-table record-column comparison with a bounded built-in user property, or one equality/inequality comparison between a stable Text/Any record column and a bounded safe `user.LinkKey.<name>` reference, or a same-column equality/inequality comparison of `rec` and `newRec` for update-only decisions, or a Bool column compared with a native boolean `True`/`False` literal, or an existing Int column compared with the finite numeric flag `0`/`1`, or an existing Text column compared with an exact empty string.  The existing `match_user`, `match_link_key` and Bool-literal `match_boolean` leaves accept an optional `record: "newRec"` to compare the proposed post-change row instead of the current `rec` row. It is valid only for create/update permissions (read/delete must be unspecified). Absence of `record` retains the original `rec` form and normalized shape. These leaves may be combined through finite `all` / `any` / `not` boolean trees; other operand pairs, string/numeric literals and non-role membership forms remain unsupported. LinkKey names are structural policy metadata; LinkKey values and secret-bearing URLs are never accepted or returned. Both native operand orders for the supported LinkKey comparison normalize to the same public `match_link_key` condition, while writes use one canonical formula form. Permissions are explicit `allow|deny|unspecified`; native `S`, `all` and `none` forms are outside the writable subset.

A **separate, fixed** special-rule action,
`grist_change_structure(action="ensure_owner_schema_guard",
confirmSchemaRestriction:true)`, is the only writable exception for native
schema-edit permission `S`. It requires document `doc.schema:write`,
fresh native Owner proof and a complete unambiguous default ACL resource.
It can **only add** `user.Access != OWNER` with `permissionsText:"-S"`,
or report an exact idempotent no-op. It never accepts a caller-defined ACL
expression, permission set or target; it refuses unknown or conflicting default
rules and preserves any supported native user-attribute definitions. Before
mutating it checks the complete default policy; afterwards it verifies the
exact native formula, parsed predicate, rule identity and preservation of every
unrelated ACL resource and rule. This establishes only stored definition, not
effective native permission enforcement or safe concurrent browser edits.
Uncertain effects require reinspection, not blind replay. The ordinary
`access_rule_group` action still cannot write `S` rules.

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
table/column target. `create`, `ensure` and `replace` require exactly one typed
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
to `Ref:<lookup table>`. A native `rec.id` may also compare to the lookup
row's `id` only when the record table is that exact lookup table;
`newRec.id` and cross-table numeric ID comparisons are refused in this leaf.
No literal values, arbitrary attr traversal, raw
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

For protected ordinary groups, the additive read-only `nativeRuleObservations`
array describes up to 20 persisted rules in unambiguous native order (otherwise
`null`). Each item has a redacted structural `condition` projected from the
stored native parsed predicate and a bounded `permissions` projection or
`null`. Native operator tags and schema-verified record/user-attribute field
names, built-in user properties and roles are structural; all literal values,
comments, unverified names and LinkKey operands are redacted. Unknown or
over-budget subtrees are marked `["Unknown"]`; redaction is marked
`["Redacted"]`. This is persisted AST observation only: formula/AST agreement,
dependency completeness, reachability and effective enforcement are not
asserted. It is not writable input, and group editability, diagnostics,
dependency coverage and simulation remain unchanged.

The additive read-only `generalPolicy` observes the persisted default (*, *)
resource, with state `not_persisted`, `unknown` (duplicate resource, ambiguous
order or excessive rule count), or `persisted`. Only the last state supplies
ordered `nativeRuleObservations`, using the same redaction rules without a
record-table context. Ordinary rule observations have `kind:"rule"` and
the permission projection includes the schema-edit `S` bit as `schema`.
Rows carrying user-attribute metadata are marked
`kind:"user_attribute_or_mixed"` with unknown condition and null permissions,
rather than misinterpreting a definition as a grant.

The additive read-only `specialPolicy` uses the same observation for the
four persisted native `*SPECIAL` resource names `AccessRules`, `DocCopies`,
`FullCopies` and `SeedRule` in its `resources` array of
`{name, observation}` entries. The UI-only SchemaEdit pseudo-resource
is not a persisted target; other special resource rows are counted in
`unknownResourceCount` without returning their names or predicates.
General and special observations recognize native `all` and `none`
as explicit five-bit permission aliases, without changing ordinary
editable groups. These are stored bits, not computed effective permissions;
SeedRule is seed metadata rather than an effective grant. Neither observation
infers implicit defaults, share-generated rules or mutation authority.

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

## Restart-safe named page construction

`grist_add_ui(action="ensure_page")` reconciles one native page using a
caller-chosen **unique page name** as the explicit logical key. It requires an
authorized existing `tableId`, creates an empty native Grist page only when the
name is absent, and returns the stable page ID. An exact single existing visible
page is returned without altering its subsequent widgets or navigation; two
matching names, incomplete/censored UI metadata and changed pre-write state
fail closed. A new page must be empty, uniquely named, and preserve all earlier
page identities and UI state on readback. Unverified creation is **uncertain**,
never automatically retried. The caller must deliberately reserve page names;
Grist does not persist the input table association on an empty `AddView`, so
Gia does **not** claim that a pre-existing same-named page was created from the
same table. This is a small reconciliation primitive, not an application
planner, transaction, or general uniqueness enforcement under concurrent writers.

## Bounded homogeneous native widget creation

`grist_add_ui(action="ensure_widgets")` reconciles two to eight
ungrouped native sections on one page, each selected by a stable source table
ID and native widget type. Repeating an identity explicitly requests that
many instances; a single occurrence retains its exact-one semantics.
Existing matches are reused unchanged in ascending stable widget-ID order
within each identity; the response follows request order. Excess matches or
inconsistent native table identities are refused before writing. Missing
widgets are created in a single
bounded native bundle (one native action when only one is absent); the complete
post-read checks all original UI, exactly the new widgets, stable identities
and types. Repeated identical requests are no-ops; partial/uncertain native
effects require inspection and reconciliation, never blind retries. An existing
matched slot must retain its ID after creation. The caller owns the mapping
from returned IDs to individual widget purposes: cardinality reconciliation
does not identify titles, custom code, access, or configuration. The explicit
`add_widget` operation remains available when creation rather than
reconciliation is intended.

`grist_add_ui(action="add_widgets")` creates two to eight ungrouped native
sections on one existing page, using stable input `{tableId,type}` items and
the same closed widget types already supported by `add_widget`. It is a single
bounded Grist native `/apply` bundle of `CreateViewSection` actions, not a
heterogeneous workflow, summary-table constructor, or generic forwarding API.
Each native section response and subsequent full UI readback must match its
input page, stable source table and widget type; all existing page widgets and
all other pages remain. The response preserves creation order and returns fresh
stable widget IDs. Repeating the request intentionally creates new sections:
when a write or verification is uncertain, inspect the current page and
reconcile by returned IDs before deciding what to create, never replay blindly.
The existing one-widget `add_widget` remains for summary/group-by creation.
No extra MCP tool or authorization is introduced.

## Creating native page hierarchy from an empty document

`grist_change_ui(action="nest_page")` accepts an existing stable `pageId` and
`parentPageId` in the same document. The child must be a visible leaf sibling
immediately following the complete existing child subtree of the intended
visible parent, at the same current indentation. This enables new Grist pages
to be organized as nested navigation after native creation without reordering
other pages or editing private page record IDs. Grist's native
`_grist_Pages.indentation` is updated only for that one verified leaf; the
position, existing parents, visible-page list and special/censored rows must
remain unchanged. Nested existing children are no-ops. Other nesting shapes,
invisible/protected pages and depth beyond eight levels fail closed. Fresh
re-read precedes the write, and the exact normalized native tree, including
positions, must match postconditions. There is no external atomic CAS; uncertain
effects require inspection rather than blind replay. This operation changes
navigation only, not permissions or user records. Ten MCP v2 tools remain.

`grist_change_ui(action="unnest_page")` promotes one *visible, last-leaf*
nested page to the indentation of its current parent. It accepts only its stable
`pageId`; page position is not changed, and no other page, parent relation or
visibility may change. A root page is an idempotent no-op. Non-last children,
pages with descendants, protected ancestors and incomplete native trees fail
closed. A fresh pre-write snapshot and exact post-read protect concurrent
edits; an uncertain effect requires inspection before retry. This is the
bounded inverse of leaf nesting, not an arbitrary page-move or raw metadata
operation.

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
  link; null clears it. A reciprocal direct cursor pair is allowed only between
  two native grid/Card/Card List/Form widgets backed by the same explicitly
  verified non-summary table on one page, with complete zero-column link
  metadata, or the separately operator-approved Custom/native pair described
  above. Replay and clearing preserve the counterpart. Larger cycles,
  column/filter cycles, unverified metadata and unapproved custom-widget
  cycles remain refused. This verifies persisted links, not interactive
  cursor behavior.
  A native record selector may also filter a native summary grid by one
  explicit group-by column whose source and generated column both have the
  exact single-Ref type pointing to the selector's verified ordinary table.
  The summary source column reference must resolve to that group-by column;
  generated `group` RefLists, other derived columns, custom-widget sources
  and cyclic summary links are excluded. Use the advertised stable
  target column ID. Clearing the link is supported.
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
