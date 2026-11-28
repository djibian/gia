# Security

Grist remains authoritative for the selected upstream credential's permissions.
Gia can reduce that authority through the intersection of deployment resource
ceiling, principal grants and required capability; it cannot elevate it.
The baseline vocabulary is `doc:read`, `doc:write`, `doc.schema:write`.
Native full-data copy adds the opt-in `doc:download` capability.

## Authentication and credentials

Static bearer authentication is a controlled single-principal mode. OAuth mode
verifies JWT signatures using configured HTTPS JWKS, issuer, resource audience,
expiry and optional `nbf`; rejects unsupported critical JOSE extensions; enforces
algorithm/key-family/curve compatibility and at least 2048-bit RSA keys.
Unknown or unavailable verification state fails closed. Invalid authentication
returns a sanitized challenge; JWKS availability failure returns HTTP 503.

The exact validated OAuth issuer/subject produce an opaque non-reversible principal ID;
identity strings are not trimmed or canonicalized; malformed Unicode is rejected
before UTF-8 hashing. OAuth scopes
restrict capabilities; they neither grant Grist access nor create resource authority.
Each OAuth request gets a fresh principal-bound Grist client/context/cache.
The transport access token is used only for verification and is never forwarded
to Grist; upstream credentials come exclusively from the server-side provider.

`principal-map` credentials are loaded once from a protected operator-mounted
read-only file. Missing/invalid mapping or an unmapped principal fails closed.
`GRIST_API_KEY` is forbidden in this mode. Static upstream credentials are for
controlled single-principal use, not production multi-principal isolation.
Service-account provisioning, grants, expiry, rotation and revocation remain
operator-side Grist administration. See [Operations](OPERATIONS.md).

## Enforced invariants

1. **Secret exclusion.** API keys, bearer/OAuth/refresh tokens, authorization codes,
   PKCE verifiers, cookies, encryption/session secrets, LinkKey values,
   secret-bearing LinkKey URLs, credential-map contents and raw provider subjects
   never become model outputs or committed
   artifacts. Do not log payloads, arbitrary upstream bodies or secret-bearing URLs.
2. **Principal isolation.** Credentials, clients, contexts, discovery and caches
   never cross principal boundaries. Static mode has one explicitly controlled principal.
3. **Native authority.** Local capabilities are additional restrictions. A denial
   never causes credential substitution, role/grant changes or bypass of Grist enforcement.
4. **Closed surface.** No generic HTTP/SQL, arbitrary `/apply`/UserAction, browser,
   file/system command or heterogeneous action-list input. Private native actions
   use fixed validated translations for supported semantic operations only.
5. **Explicit bounds and targets.** MCP POST requests require a parsed
   `application/json` body (unsupported or missing media type returns HTTP 415).
   The Express JSON parser limits decoded POST bodies to 100 KiB, and the MCP
   server enforces a finite ceiling of 52,000 combined array elements and object
   members before tool-schema validation. The cardinality ceiling is above what
   can fit within the JSON-body bound, preserving currently valid dense Grist
   inputs; it also applies defensively to any separately pre-parsed MCP call.
   Closed schemas additionally validate counts, stable identifiers and supported
   fields. Destructive actions require exact explicit targets.
6. **State preservation.** Read-modify-write operations preserve unrelated human
   configuration. Incomplete, censored, malformed, ambiguous or unsupported metadata
   refuses unsafe writes; native references are resolved server-side rather than guessed.
7. **Effect knowledge.** Confirmed partial writes retain completed targets/counts.
   Response loss and unverified post-state are not proven no-effect. Results forbid
   blind whole-operation replay; known created IDs are retained. No guessed cleanup.
8. **Minimized output.** Inspection favors structure; rows are queried explicitly.
   Formula, cell, comment and external content are untrusted data and cannot alter
   authorization or tool policy. Numeric compatibility output is limited to the
   supported safe shape and is distinct from stable mutation inputs.
9. **Operational isolation.** Rate limits are per authenticated principal; general
   operational events contain no principal/document identifiers. Protected audit
   identifiers never become general metric labels or a model retrieval surface.

## Native document user grants

Document-user grants are narrowly append-only: a caller with
`doc.schema:write` also needs fresh upstream Grist Owner proof. The target is
one explicit normalized individual address and a viewer/editor role, never
an owner, public group, wildcard or list. The Owner-visible native document
access list must identify the target as an **existing Grist org member** by
positive user ID, with no existing direct/inherited doc role; absent/opaque
members fail closed *before* Grist's otherwise account-creating share delta.
Native per-user access deltas are used; Gia never writes an entire access list. Existing, inherited or
ambiguous targets cannot be reassigned. Grist's readback must confirm the
target and preserve unrelated grant identities/roles or an uncertain-effect
error is returned. The full access list and personal emails of unrelated
members are kept private. Persisted grants are not represented as proof of
effective row ACL enforcement, and this operation never publishes a Form.

## Application access rules

Both ACL inspection and mutation require fresh native document metadata proving
`access === "owners"` before ACL metadata is read. Editing additionally requires
local `doc.schema:write`; native Grist Owner enforcement remains mandatory.

Only ordinary stable table/column groups and the contract's typed secret-safe
conditions/permission subset are writable. Explicit `record: "newRec"` is
allowed on the existing typed user/LinkKey record matches only for proposed row
creation/update; read/delete decisions with `newRec` remain protected and
non-editable. An omitted record context always means `rec`. The typed `column_change` condition compares a single stable column's old `rec` value with its proposed `newRec` value using equality/inequality only; it requires an existing Text, Choice, Int, Numeric or Bool column and is update-only (read, create and delete stay unspecified), including in nested conditions. It admits no literal or arbitrary operand. The separately bounded `match_boolean` leaf accepts only a JSON boolean against an existing Bool column; native `True`/`False` constants are not secret-bearing and can be inspected. Explicit `newRec` is create/update-only, with the same recursive permission guard as existing conditions. The `user_access_membership` leaf admits only two or three distinct native built-in roles and `in|not_in`, never arbitrary strings or model-provided identities. The `user_login_status` leaf compares only native `user.IsLoggedIn` with a JSON boolean; it never accepts arbitrary user properties, identity values, raw ACL text or extra fields. The `match_integer_flag` leaf is restricted to an existing Int column and numeric 0/1 literals, with the existing recursive `newRec` permission guard. The `match_empty_text` leaf compares only an existing Text column to the zero-length string and has no model-facing value field. Its optional `newRec` is create/update-only. Nonempty string literals, arbitrary numeric literals, arbitrary formulas and other membership operands remain protected. A bounded LinkKey name may be exposed
as structural policy metadata only when it participates in a normalized supported
record comparison; LinkKey values, secret-bearing URLs and literal-bearing opaque
formulas remain excluded. Finite `all` / `any` / `not` trees over the existing
typed leaves are bounded in width, depth, total node count and output formula
length; nested `everyone` and unrecognized expressions refuse mutation. Opaque formulas, memos, user attributes,
legacy/special/default/schema-edit policy and virtual overlays are not converted
into editable model content. Incomplete/censored/truncated metadata, overlapping
targets or lossy normalization refuses mutation. Untargeted persisted policy is
fingerprinted internally and verified unchanged after the write.

User-attribute definitions are inspected only from the default native ACL
resource after the fresh Owner proof, as a closed structural projection with
validated existing table/column IDs and safe built-in user-property or LinkKey
**names**. The projection excludes values, raw definition JSON, formulas,
LinkKey tokens and URLs. Unknown, malformed, misplaced or duplicate-name
definitions remain protected. A separately bounded typed create/ensure/replace/delete
target in the existing access_rule_group action requires fresh Owner proof and
local doc.schema:write, refuses all native user-attribute writes whenever any
definition is opaque/ambiguous, rejects reserved names and missing stable
lookup columns, and never accepts raw JSON or arbitrary user properties.
Ensure creates an absent definition, reuses an equivalent one and refuses
conflicts. A fresh complete ACL and schema snapshot guards all actual
ordinary-group and user-attribute writes against detected stale planning
state; this preflight is not an atomic compare-and-set.
A local ordinary ACL permission patch selects one uniquely matching supported
typed rule under the same Owner and schema capability, including within a
protected mixed group. It changes only native permissionsText and verifies
all persisted ACL resource/rule fields and identities otherwise unchanged.
A local typed condition patch shares this selector and guard, preserves
permissions and all unrelated fields, and independently validates the native
derived parsed predicate. A bounded order swap selects two distinct supported
rules in the explicitly expected relative order and changes only their native
positions in one bulk update. Native position allocation is checked by
the resulting full order and exact preservation of untargeted fields;
ambiguous or insufficient position gaps are refused before writing.
Unconditional rules cannot be swapped. Local removal selects one supported
rule explicitly, refuses removal of the last rule in a group and verifies
exact preservation of all resources and remaining rule fields.
Opaque rules are never accepted as writable selectors or rewritten.
Deletion and non-noop replacement refuse existing native ACL dependencies,
including opaque or noncanonical predicate forms. Typed `match_user_attribute`
ACL leaves accept only existing structurally verified attribute/field names
and comparable native primitive or Ref/id types; they expose no lookup values,
LinkKey tokens, identities or arbitrary Python. Unknown definitions and
unverifiable predicate dependencies fail closed. Writes preserve all
untargeted native ACL rows/resources, verify selected post-state and native
identity, and return uncertain/non-retryable effect on failed re-read.
Ordinary ACL writes still fingerprint and preserve user-attribute rows.
The lookup's effective results and confidentiality are not asserted.

The read-only ACL dependency projection traverses only already-normalized
closed typed conditions. It reports stable record/new-record column IDs,
built-in user-property names, LinkKey names and user-attribute name/field
pairs, deduplicated within each supported group. A protected or opaque group
reports unknown coverage without inspecting its raw formula or attempting a
partial dependency guess. Protected ordinary groups additionally expose a bounded ordered observation
of the persisted parsed AST and recognized permission bits; ambiguous ordering
or excessive group size gives no observation. Only fixed native node tags,
verified schema names and fixed built-in symbols may be returned. All literal
values, comments, unverified names and LinkKey operands remain redacted.
The same redaction applies to bounded persisted general and known special
resources, without resolving record fields or interpreting attribute rows
as grants. Unknown special names are counted, not returned. Permission
bits (including native aliases and schema-edit) are observational only;
absence is not evidence of implicit defaults or share-generated rules. This observation is not evidence of formula/AST
agreement or dependencies and cannot authorize mutation or simulation.
Dependency lists do not imply rule reachability,
native policy validity or effective confidentiality. Read-only lint reports
only first-applicable-decision shadowing for the **same normalized condition
and permission** as `proven`; it never tries to compare arbitrary formulas or
reconstruct native authorization. Presence of LinkKey conditions produces an
explicit web-acceptance `warning`, including when a referenced user attribute
is sourced from a LinkKey. Protected/opaque groups return
`diagnostics:null` to avoid a false all-clear. No secrets, private values or
raw formulas enter model outputs; explanatory simulation is separate.

Optional read-only `schemaImpact` inspection of one existing table/column
projects supported structural references only, including user-attribute source
table, lookup column and referenced attribute field. Unresolved ordinary
groups, special/default policy and opaque user attributes are explicitly
unknown; absence of a reported reference is not a safety guarantee. The
same fresh native Owner proof is required. It neither writes nor simulates
native schema rewrites, effective access or confidentiality.

Owner-only inspection has distinct evidence levels. The optional
`policyCoverage` classifies persisted ordinary components for the requested
operation, including protected/unknown influence. Its optional invented
context can yield a bounded expected decision for ordinary document access.
The separate `simulation` explains rule order and decisions in a single
ordinary group. Both use closed synthetic inputs. LinkKey operands are enum
symbols `A`–`D`; real values and secret-bearing URLs stay outside the tool
contract. Unknown inputs and unresolved required policy remain unknown.
The [MCP Contract](MCP-CONTRACT.md) defines the supported scope and trace.

Grist decides live access. Inspection and persisted-write verification expose
structural or theoretical evidence. Native regression qualification runs on
synthetic disposable Grist and identifies the version, surface and property
actually exercised. Model-facing `observe_record_access` reuses the ordinary
document grant and public-table boundary; it uses only the current native
credential, returns no cells or native error bodies and accepts no identity
override or LinkKey. It distinguishes an observed row, an empty result,
native HTTP 403 and unknown; none proves unobserved permissions or a stable
policy snapshot. A native API result applies to that API case. A LinkKey
browser result applies to the tested web-client context. Native production
qualification is read-only, and any unexercised case remains unqualified.

Custom widget data access requires a fresh native Grist Owner role and
`doc.schema:write`. The deployment registry grants standing authority for
`read table` or `full` on exact approved direct selections. The existing
explicit `confirmDataAccess:true` path applies to other selections, including
catalog mode where Grist can substitute a URL cached by the browser. Initial
installation still starts at `none`.

Permanent HTTPS URLs may serve evolving, operator-trusted code, including
multiple entries on one domain. The registered frame hostname must differ from
Grist's to separate the Grist origin and host cookies. Grist executes the
widget on the current user's behalf. The registry and readback verify the
configured metadata. The operator trusts the deployment, redirect behavior
and its dependencies.

Form-column writes are one-column, schema-gated, complete-snapshot
read-modify-write operations, refusing ambiguous/truncated native metadata,
preserving unrelated option keys and verifying exact persisted post-state.
An uncertain post-state must not be blindly retried. Questions exclude
link-bearing text, and Form publication/ACL behavior is not implied.

Reference-dropdown condition updates accept only three validated typed predicates
or explicit removal on an existing Ref/RefList column. The compiler is shared
with column creation. The mutation refuses malformed native state, preserves
untargeted options, verifies the complete post-read state, and does not claim
that dropdown filtering is an authorization boundary.

Native conditional-format changes require doc.schema:write and target only one
verified public column. Formula text is a Grist column formula, not an ACL
condition. A fixed private `AddEmptyRule` plus paired native formula/style
updates creates one conditional rule; existing opaque/multiple rule states are
protected. The operation preserves unrelated widget options and refuses
malformed helpers or incomplete metadata. Partial or ambiguous writes are
reported uncertain and must be inspected before replay, never blindly retried.

The separate locale operation accepts only two qualified canonical locales,
preserves unprojected native documentSettings keys and verifies the entire
post-write JSON. Missing, malformed or over-budget metadata refuses mutation;
uncertain writes cannot be blindly retried. Unprojected values never appear in
the model output.

Native Form publication is a separate bounded write, requiring an explicit
`confirmPublic:true`, Gia `doc.schema:write` and fresh upstream Owner proof.
Only an existing native Form's two recognized `shareOptions` flags may be
published, together with its required native page share. The fixed private
creation bundle uses a generated unpredictable link ID and a private
cross-action negative reference; none of these identifiers appears in MCP
output. Existing shares are accepted only when already published and uniquely
linked to the page; ambiguous, shared, unknown or unpublished native state
refuses mutation. Form layout, fields and document ACL state remain untargeted.
Readback verifies the native page/section/share graph, never anonymous
reachability or permission enforcement. Lost or unverified publication is uncertain; the
caller must not blindly replay it.

Form layout mutation accepts a finite, typed tree and server-side resolution of
stable column identifiers to existing native section fields. A protected,
unrecognized or partially readable existing layout refuses replacement rather
than discarding unknown attributes; destination layout has no URL-bearing or
arbitrary HTML elements. After write, the native persisted layout and stable
field bindings must match or the outcome remains uncertain. Layout changes do
not confer Form publication rights.

Native Form field-override edits are scoped to an existing verified Form widget,
column ID and unique native section field. A bounded complete metadata snapshot
is required before mutation, and the native post-state must preserve all
untargeted widget options. Input questions exclude URLs and link-like text.
An uncertain post-state is not a no-effect guarantee; native publication and
access privileges remain unchanged.

Hidden fields and saved filters are presentation state. A generated summary
table has its own native policy. Native roles, sharing and credential
administration remain in Grist and its deployment.

A same-document Form link requires explicit confirmation and native Owner
proof. Only the fixed Grist document-open and share-lookup messages are used.
The socket is constrained to a server-advertised worker on the configured
origin. The returned home share must match the exact native document and
document-local link identity. Gia verifies the public Form without credentials
before persisting the link and protects it in model-facing projections. No
raw share replies, credentials or public capability keys enter tool results.

## Document bootstrap

Creation/copy requires both the explicit deployment workspace ceiling and one
same-principal grant naming that workspace with `doc.schema:write`.
A document-only grant or capabilities from unrelated grants cannot manufacture
destination authority. Template copy separately requires source `doc:read`;
full-data copy requires deployment opt-in, a capability grant explicitly naming
the canonical native source ID, and fresh native Owner verification on that
same ID. A source workspace grant or URL alias is insufficient. OAuth additionally requires a verified
`doc:download` scope. Grist's native copy/download and destination `ADD`
authorization remain decisive.

Creator ownership and destination inheritance are native effects. A new document
may therefore expose full-copy data to a different audience. Copy verification
covers the observed destination and returned identifier. Sharing and publication
require separate qualification. A new document ID never widens the bridge
allowlist. Discovery is invalidated on every creation
attempt. Known created IDs survive failed membership verification; ambiguous
creation is not replayed by name or automatically deleted.

A native template is a bootstrap primitive, not a privacy scrub: it removes
user-table data, attachments/history according to Grist behavior while retaining
substantial metadata, formulas, comments/configuration and policy. Effective copied
policy is not guaranteed after referenced data is removed.

## Deployment and reporting

The process binds only to localhost behind an HTTPS reverse proxy with an explicit
host allowlist. Keep production operation limits finite, protect secret files and
audit sinks, and test native account rotation/revocation without logging keys.
No log backend, alert transport or secret database is embedded in the product.
Applicable hosted-service obligations remain in [Privacy](../PRIVACY.md),
[Terms](../TERMS.md) and [Support](../SUPPORT.md).

## Existing custom widget options

An additive bounded update can patch only inert literal `widgetOptions` keys
on an already identified custom widget. The native section and customView
identity, URL, access, mappings, and unrelated settings are preserved and
verified after write. URL, HTML/script, credential-like option names, nested
JSON and absent widget identity are rejected. This does not install or
approve a publisher, grant access, or verify remote widget execution. Lost
responses require read/reconciliation, not a blind replay.
