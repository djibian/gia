EXPERT ADVISORY
Date: 2026-10-04
Base main: f0da0c8fdbbf7c62dddb18283686ed6c2110da4a
Scope: R6.3 risk/dependency survey; C1 application access rules and C8 document bootstrap
Status: ADVISORY — NOT ROADMAP AUTHORITY

## 1. Executive findings

1. **C1 is feasible as a small document-policy adapter, but not as ordinary metadata CRUD.** Grist requires an upstream Owner for deliberate rule changes. Gia's existing `doc.schema:write` can remain the local capability, provided that it never substitutes for that native authority. Ordered rules, per-permission fallthrough, defaults and user attributes must survive translation. No users, memberships or sharing grants are needed.
2. **Row restrictions are not a confidentiality boundary while the affected Editor can edit structure/formulas.** Native `S` permission can bypass data restrictions through formulas. C1 must inspect and explain this interaction; a policy operation that claims protected visibility needs an explicit, bounded treatment of document-wide structure permission. Silently copying Grist's UI “Enable Access Rules” initialization would change additional policy; silently omitting its consequences would mislead the agent.
3. **Persisted ACL definitions and effective ACLs are different objects.** Built-in defaults, helper-column expansion and virtual form/share rules must not be written back as user rules. Invalid/incomplete/censored metadata must not be mistaken for an empty policy. Native fallback to an emergency policy also means that a successful metadata write/re-read is weaker than proof of valid enforcement.
4. **C8's missing abstraction is destination-workspace authorization, not a new public scope.** The configured `workspaceIds` already provide a ceiling, but current authorization only resolves existing documents. An allowed source document does not authorize creation in its workspace. Empty allowed workspaces must remain discoverable.
5. **Prefer native empty creation and fixed `asTemplate: true` copy for the first C8 slice.** A template removes user data, attachments and history; it retains other metadata, including much of the ACL policy, removes the special `FullCopies` exception and disables triggers. It is not a privacy scrub or a promise that copied policies remain operational after lookup-table rows disappear. New documents acquire destination inheritance and creator ownership, not the source's home-level sharing grants.
6. **One native request is not optimistic concurrency or idempotence.** ACL writes need differential targeting and truthful race limitations. Create/copy needs explicit uncertainty, retention of a known created ID and no retry by document name. Neither capability justifies a planner, durable workflow journal, generic `/apply`, upload surface or automatic cleanup.

These are implementation constraints and recommendations. The seven selected items, their order, review gates and eligibility remain exactly those of the current Roadmap.

## 2. Current-state facts

### Authoritative snapshot

- `main` resolves to the full Base main SHA above; its tip integrates the Expert lane in [#203](https://github.com/djibian/gia/pull/203).
- All six startup documents were read from that SHA: `AGENTS.md`, Product Vision, Roadmap, Expert Protocol, Architecture and Security.
- R6.1a, R6.1b and R6.2 are integrated. R6.3's finite order is **C2 -> C4 -> C3 -> C5 -> C10 -> C1 -> C8**. C1 and C8 are selected but not implemented on this base.
- No report exists under `docs/expert/` on this base. No open Expert report PR was found. This is the first tranche survey, with two deep dives only.
- The open implementation PR is [#202](https://github.com/djibian/gia/pull/202), Ready, C2 widget fields. The latest observed head is `0c9ce4d45268635bb94ef1b8a56a016b214fbae9`; [exact-head `verify`](https://github.com/djibian/gia/actions/runs/37192109230/job/111406301327) succeeded. The recorded `CHANGES REQUIRED` review is on the older `cfdb976ff89e25cd461c96c9144ad5327e96c264`, so it is not a verdict on the latest head. This Expert run issues no formal G7 review.
- Branch inventory found no separate C1/C8 or Expert implementation/report branch. Historical branches were not changed. [Issue #58](https://github.com/djibian/gia/issues/58) remains explicitly deferred public-distribution evidence.

PR/head/CI facts are timestamped observations, not durable eligibility declarations. Controllers must fetch them again.

### Runtime seams that matter

| Observed Gia fact on Base main | Consequence for the selected work |
| --- | --- |
| `DeploymentResourcePolicy` accepts document OR workspace allowlists; principal grants also carry `workspaceIds`. [G2, G3] | Reuse both ceilings. Do not infer a workspace grant from an allowed document. |
| Discovery stores `{org, workspace, document}` entries only while iterating existing docs. `AuthorizationService` has `assertDocumentAllowed`, not a workspace assertion. [G2, G3] | A dedicated, small workspace read/authorization path is necessary for C8, including zero-document destinations. |
| `GristContextFactory` builds fresh principal-derived clients and discovery caches. [G4] | Destination discovery, copy and result verification must use this same principal's credential and context. |
| Public table operations reject `_grist_` identifiers. UI translation accesses private metadata internally. [G5] | C1 requires a private bounded adapter; never relax the generic metadata-table prohibition. |
| Ten manager tools and three capabilities remain the MCP v2 contract. Tool OAuth metadata/challenges currently choose one capability by tool name. [G6] | C1/C8 can use closed variants, but C8 copy's source-read plus destination-schema requirements must be enforced and described coherently. |
| The client conservatively classifies mutation response loss, non-JSON success and non-success mutation responses as uncertain. MCP errors prohibit whole-operation replay. [G7] | Reuse this safety policy; do not make create/copy “safe to retry” on a guessed HTTP classification. |
| R4 compatibility evidence covers Community 1.7.16–1.7.19. [G8] | The source study below is not new runtime qualification of C1/C8 or certification of 1.7.20. |

Architecture/Security describe the earlier validated candidate and still contain broad ACL-administration exclusion wording. The newer authoritative G9/R6 selection separates application policy from identity/share administration. `SECURITY.md` S3's phrase about never broadening native access rules needs precise treatment in the eventual independently reviewed C1 change: an explicit Owner-authorized application-policy edit may alter collaborator access; it must never bypass native enforcement, change nominal roles, elevate the acting credential or expand Gia's grants. This report changes none of those files.

## 3. Upstream/reference findings

### Observed revisions and confidence

Official Grist source was inspected at:

- current `main`: `72345cbe06cad2ddeee4a9db1e133d82f1fd2294`;
- release `v1.7.20`: `b4ccc892202a3aefd6e565f0bc0c01081433a53c`;
- previously qualified `v1.7.19`: `298d4661ce3513a6a459c5441f9c5baea4356cc8`.

The complete files for ACL rule collection, rule reader, permissions, predicate compiler, Access Rules UI, document filtering, credential-preserving copy download, home API and ACL schema/predicate parser are identical across these three revisions. Relevant sections of the changing DocApi, HomeDBManager, GranularAccess and useractions files were inspected separately. This supports continuity of the identified primitives; it does not establish behavior on every release or replace focused implementation verification.

### C1: native rule semantics

**Documented facts:** Only Owners edit access rules. Resolution prioritizes column rules, table rules, then defaults, and walks an ordered group separately for each permission until a definitive result. Structure/formula permission is powerful enough to bypass data restrictions. [U1]

**Source observations:**

- `_grist_ACLResources` stores `tableId` and comma-separated `colIds`; `_grist_ACLRules` stores a resource ref, native predicate text, derived parsed predicate, permissions, `rulePos`, optional user-attribute definition and memo. Legacy empty resources and deprecated fields still exist. [U2]
- Table groups use `R/U/C/D`; column groups use `R/U`. Permissions have **allow / deny / unspecified** semantics. Native `all`/`none` aliases contain `S` too, while ordinary table/column groups trim inapplicable bits. A bridge must not interpret “unspecified” as deny. [U3, U4]
- Custom document defaults precede built-in role defaults. A terminal empty predicate is the always-matching fallback; later ordinary rules are invalid. User-attribute definitions are processed separately and must be attached to the document-default resource. [U3]
- `*SPECIAL` contains AccessRules, DocCopies, FullCopies and SeedRule. The UI's SchemaEdit resource is synthetic: its `S` rules are persisted on the document-default resource, not as `*SPECIAL:SchemaEdit`. [U3, U5]
- The UI's “Enable Access Rules” command installs recommended special/default policy. This is distinct from merely writing an ordinary table rule; copying the entire UI save routine would also synchronize unrelated resources. [U5]
- Grist's engine derives `aclFormulaParsed` when rules are added/updated. The predicate compiler is a restricted evaluator; it is not ordinary unrestricted column Python. It distinguishes `rec` from `newRec`, supports a finite function subset and treats string `in` as substring membership. [U6, U7]
- Rule loading can record `ruleError` and substitute emergency Owner-only rules. Therefore matching stored text is not proof that the intended effective policy loaded. Native formula checking is an internal DocComm method; a stable public REST validation endpoint was not established by this study. [U3, U8]
- `GranularAccess.canApplyBundle` requires an Owner for deliberate rule changes and checks before database commit. Metadata may be censored for restricted callers. Published form shares generate virtual negative-ID resources/rules; helper-column policies are expanded for effective enforcement. These are not persisted definitions. [U4, U9]
- The public `/apply` handler accepts an action bundle with `noparse` handling, but exposes no expected-policy-revision/CAS option in the inspected path. Grist UI explicitly applies diffs relative to its current state, allowing its changes to win. [U5, U10]

**Inference:** The smallest safe C1 is a typed adapter over persisted policy groups, with native enforcement left upstream. A generic ACL mirror, permission evaluator or full-document policy replacement would import much more risk than the selected capability requires.

### C8: native creation and template copying

**Documented facts:** The API supports empty creation in a workspace and same-installation copy with explicit destination and optional template mode. Template mode removes data/history while retaining structure. [U11, U12]

**Source observations:**

- Empty creation through `/api/workspaces/:wid/docs` calls HomeDBManager; it checks native workspace `ADD` permission, creates a home record, inherits workspace role groups and explicitly makes the creator an Owner. Physical document initialization can occur later. [U13]
- `/api/docs/:docId/copy` downloads through the current caller's transitive credentials and imports server-side into the destination. No Gia-side binary download/upload round trip is necessary. Omitted destination can lead to unsaved-copy behavior, so Gia must require a destination. [U10, U14]
- Copy/download authorization is not ordinary `doc:read`. Native `canCopyEverything` considers full data access, access-rule visibility and copy restrictions, with the `FullCopies` template exception as a separate path. [U9]
- Native export filtering removes `FullCopies` rules/resources and disables triggers in copies. Template mode additionally deletes user-table rows, attachment records/file blobs and action history. Other metadata is retained by this filter; it is not a general secret sanitizer. [U15]
- User-attribute definitions may survive while their lookup-table rows do not. The source's application policy is not the source's home-level collaborator grants: the destination's groups and creator identity determine the latter. [U2, U13, U15]

**Inference:** Native template copy is the smaller and safer R6 interpretation than full-data clone. If a future Controller chooses full-data copy, it must separately justify the payload/authority boundary against R6.2; the name “copy-as-template” must not mask unrestricted cloning.

## 4. Risk and invariant analysis

### Compact R6.3 map

The order below is the committed Roadmap order, not a new dependency graph or reprioritization.

| Slice | Main semantic risk | Constraint for Controllers |
| --- | --- | --- |
| C2 fields | Stable column IDs versus private field refs; hiding destroys field-owned configuration | Preserve retained metadata; distinguish hiding from deleting columns; accept supported empty/no-op states. #202 is pending, not integrated on this base. |
| C4 filters | A native saved view filter differs from a query predicate and from security | Translate the selected native filter subset; preserve untargeted filters/pinning; never present filtering as ACL enforcement. |
| C3 summaries | Native generated tables, grouping and aggregate formulas | Use the native constructor; normalize returned source/group identities; do not promise source-table ACL inheritance for a distinct generated table without evidence. |
| C5 card layout | Card leaves can refer to fields removed/recreated by C2 | Resolve against current fields; preserve unrelated layout; reject unresolved leaves. No generic layout JSON. |
| C10 page order | Navigation order can interact with existing indentation/nesting | Preserve existing hierarchy or refuse an unsupported shape; a flat permutation must not silently reparent pages. |
| C1 policy | Visibility, rule ordering/defaults, structure access, censored/virtual state, concurrent edits | Owner-authorized private adapter; exact persisted-policy preservation and explicit limits on enforcement/concurrency proof. |
| C8 bootstrap | Workspace authority, inherited sharing, copy privilege and non-idempotent effects | Explicit destination grant, native caller credentials, fixed template boundary, known-ID retention and no automatic replay. |

### C1 invariants

1. **Authority:** `doc.schema:write` plus the existing document ceiling is necessary local authority; upstream Owner authority remains mandatory. `doc:write` must not authorize ACL edits. An upstream denial must never trigger a master credential, View As identity, LinkKey or share-based retry.
2. **Selection:** Resolve groups by document plus stable table/column identity. Private resource/rule refs and virtual IDs stay internal. Reject duplicate/overlapping column resources, dangling references and ambiguous order instead of guessing a canonical group.
3. **Preservation:** Mutate only explicitly selected persisted rules/fields. Keep defaults, `S` bits, seed/special rules, user attributes, memos and unrecognized untargeted fields. Never serialize the expanded effective-policy view as a replacement policy. When editing a row that mixes supported permissions with `S`, preserve the original row/condition coupling or refuse it; splitting can change precedence.
4. **Completeness:** Read limits, missing tables and censored ACL responses are distinguishable from a complete empty policy. A restricted inspection must return an unavailable/incomplete result; it must not permit a replacement based on “no rules found.”
5. **Confidentiality:** Treat condition text, comments and memos as untrusted. LinkKey comparisons can contain secret literals. Preserve them internally without returning them; expose an unsupported/redacted marker and refuse editing that group if secret-safe normalization is unavailable. Do not load user-attribute business rows for inspection.
6. **Structure interaction:** A bounded policy may allow/deny collaborator data permissions without changing roles. If Editors retain `S`, report the bypass risk and do not describe row restrictions as confidentiality protection. A narrowly typed **deny/unchanged `schemaEdit` on document defaults**, with native Owner recovery preserved, is a reasonable option to review; allowing structure or copy exceptions is not a routine C1 convenience.
7. **Validation:** Bound condition length/shape and validate table/column references before writing. Do not assume a parseable expression is meaningful or that HTTP success excludes emergency-rule fallback. A postcondition should distinguish stored-definition verification from effective-enforcement verification.
8. **Concurrency:** Re-read before applying a minimal diff, then verify targeted and untargeted policy state. A fingerprint can detect some stale plans; it cannot close the external-writer window without an upstream conditional primitive. Do not advertise atomic compare-and-set, and do not silently overwrite a changed whole policy. A race after a committed write is an uncertain/verification failure, never an invitation to replay or restore an old snapshot automatically.

### C8 authorization matrix

| Intention | Required local resource authority | Native authority / effect |
| --- | --- | --- |
| Inspect allowed destinations | Explicit deployment workspace ceiling and principal workspace grant for the requested purpose | Same principal's discovery credential; return only destination identity/name/access needed for selection |
| Create empty document | Deployment allows **destination workspace ID**, and one principal grant names that workspace with `doc.schema:write` | Grist workspace `ADD`; inherited destination collaborators plus creator ownership |
| Copy as template | Above destination grant **and separately** authorized source `doc:read` | Native source copy/download permission plus destination `ADD`; data/history removal and copy filtering |
| Create from a document-only allowlist | **Not authorized** by knowing an existing document's workspace | No implicit parent grant and no automatic allowlist modification |
| Continue editing the new document | Re-resolve actual current workspace membership against deployment/principal grants and required capability | Current native permissions; returned ID does not become a permanent bridge grant |

The workspace and capability must match in the same destination grant. Having `doc.schema:write` for one document and an unrelated workspace grant must not be combined into creation authority.

For the first copy subset, a fresh upstream Owner check on the allowed source is a defensible additional bridge restriction: it avoids relying on `FullCopies` as a bypass of restricted visibility. Native endpoint enforcement is still mandatory. If broader non-Owner template copying is retained, the implementation must explicitly distinguish the native full-read route from the template exception rather than treating visible discovery membership as full-copy authority.

Creation is an external state change in the already-authorized installation/workspace; it is not new sharing administration. Native creator ownership is an automatic consequence that the contract should disclose. If this consequence is incompatible with a deployment's credential authority, reject that request; do not remove the creator, rewrite inheritance or provision grants afterward.

## 5. Options considered

| Option | Assessment |
| --- | --- |
| Expose ACL tables, arbitrary predicates/parsed trees and generic UserActions | **REJECT.** Leaks private representations, mixes special/share policy and permits semantic escape hatches. |
| Reuse the entire Grist Access Rules UI save/synchronization routine | **REJECT for Gia.** It edits the full policy and follows a UI “my edits win” model; a bounded targeted adapter needs less machinery. |
| Bounded persisted groups with a small native-condition subset | **Preferred C1 direction.** Typed per-permission states and stable column IDs; bounded native comparisons/boolean combinations, no local enforcement evaluator. Preserve unsupported existing policy without rewriting it. |
| Free-form native condition text relying only on engine parse-on-save | **Insufficient alone.** The public validation primitive was not established, and stored-text equality does not detect every semantic/compile error. If selected, prove validation/secret safety instead of claiming native parsing settles it. |
| General user-attribute provisioning to make C1 comprehensive | **Do not import automatically.** Preserve and safely inspect existing definitions; support references to existing attributes only when resolvable. New attribute creation needs an explicit bounded interpretation of selected C1, not identity administration or domain fixtures. |
| Empty creation plus native template endpoint with explicit workspace checks | **Preferred C8 direction.** Smallest bootstrap surface; same installation, no new OAuth scope, no file import. |
| Full-data copy, arbitrary upload, fork, destination auto-selection or automatic grants | **REJECT from the recommended initial subset.** Extra data/authority/lifecycle semantics are unnecessary to deliver selected bootstrap value. This advice does not reclassify Roadmap items. |
| Name-based deduplication, guessed recovery ID, automatic delete on verification failure | **REJECT.** Document names are not identities; recovery can mistake another writer's resource for this request's effect. |
| Durable orchestration journal or general lock service for these two features | **REJECT without a concrete unsatisfied invariant.** Keep uncertainty explicit; do not revive retired J1 machinery as the default. |

## 6. Expert recommendation

**Proceed with the current finite sequence.** Keep C1 and C8 isolated from lower-risk UI work and from each other. Read this report again when those slices become current; it does not block #202 or any other otherwise eligible Controller action.

For **C1**, prefer normalized inspection and targeted persisted-group create/update/delete. Table rules expose `R/U/C/D`, column rules `R/U`, each as allow/deny/unspecified; ordered conditions and fallback are explicit. Treat ordinary document defaults and structure restrictions separately enough to preserve `S` coupling. Do not offer a global “enable/disable policy” shortcut, special copy bypass, public private-ID model or effective-policy evaluator.

A small condition serializer for a finite native subset is preferable to porting the whole Python parser/compiler or creating a local query language. The initial subset can cover comparisons using validated `rec`/`newRec` column IDs, selected native user properties and finite literal sets, with bounded boolean composition. Do not silently convert substring membership to set membership, chained reference traversal to record lookup, or absent permissions to deny. More complex existing formulas stay preserved/unsupported. Existing user-attribute references are a separate, explicitly validated subset.

For **C8**, prefer two closed intentions: create one empty saved document; copy one explicitly allowed source as a native template into one explicitly allowed workspace. A coherent extension of `grist_add_structure` is plausible, but the Controller must verify its descriptions, annotations, progressive help and OAuth requirements rather than forcing it into a document-only authorization wrapper. No new public scope is needed for the stated matrix. If the existing ceiling cannot authorize a destination, the operation is unavailable for that deployment.

Successful creation returns a minimal verified identity/destination, not document contents. If the ID is known but read-back fails, preserve the ID as a confirmed effect and forbid full replay. If the ID is unknown after response loss, expose uncertainty; refreshed bounded discovery can assist the agent but a matching name is not proof. Do not automatically delete the new document or mutate grants to repair verification.

## 7. Controller guidance

### Likely seams, without patches

- **C1:** private ACL normalization/planning next to current UI metadata adapters; guarded entry in `AuthorizedGristService`; closed inspect/schema action variants and operation metadata. Keep public `_grist_` rejection intact. Use one bounded native action bundle for a single group intention and only allowlisted fields/actions.
- **C8:** a small workspace discovery/authorization seam in `accessPolicy`/`authorizationService`; fixed routes in `GristClient`; principal-bound semantic service methods; compact created-resource projection. No persistent resource-grant database. Invalidate discovery after creation and re-resolve the actual destination.
- **Shared contract:** audit only resolved resource identifiers/counts/status, not conditions, values, raw mapping contents or upstream response bodies. A new target type must not weaken current audit sanitization. Update operation help/security metadata alongside the selected runtime change; G7 applies.
- **Preservation:** reuse the existing read/resolve/diff/write/re-read pattern, but make each operation's verification claim honest. Separate known applied identity, uncertain effect and known postcondition failure.

### Focused implementation checks worth keeping small

| Area | Necessary focused checks |
| --- | --- |
| C1 authority | Reader/Editor or `doc:write` cannot edit; mapped Owner plus local schema grant can; native denial never swaps credentials. |
| C1 semantics | Independent permission fallthrough; terminal fallback/order; allowed column bits; empty/no-op behavior where native semantics permit; legacy/default/`S` and user-attribute preservation. |
| C1 failure | Truncated/censored/duplicate/dangling state refuses; invalid/unsupported predicate refuses; secret-bearing rule is not returned; response loss and changed post-state never trigger replay. |
| C1 boundaries | No share/virtual rule write-back, generic metadata access, identity administration or arbitrary `/apply`; no claim of enforcement merely from stored-text equality. |
| C8 grants | Empty authorized workspace succeeds; doc-only parent inference, cross-grant capability borrowing and foreign destinations fail before mutation; native workspace rejection is honored. |
| C8 copy | Separate source-read authorization; native copy denial; mandatory destination; fixed template flag; no credential/source URL forwarding or generic upload. |
| C8 recovery | Lost response remains uncertain; known created ID survives read-back failure; same-name documents and concurrent creation cannot be adopted/deleted as recovery guesses. |
| C8 isolation | Destination cache/results remain principal-bound; new-document rediscovery uses actual membership and cannot widen allowlists. |

These are focused verification ideas for future selected slices, not a new R4 campaign, browser matrix or domain acceptance harness. Existing baseline CI remains the normal integration requirement.

## 8. Questions / decision points

No new human product-priority decision is requested by this report. C1/C8 are already selected; routine implementation choices remain autonomous.

Before claiming C1 complete, the Controller must resolve three bounded technical points: the exact supported condition/attribute subset; how an explicit document-default structure restriction fits the selected policy action while preserving existing `S`; and which native validation evidence distinguishes a correct stored group from emergency/invalid effective rules. If those cannot be achieved proportionately, record the precise limitation and smallest viable subset/prerequisite in a reviewed change, rather than expand to a generic policy engine.

Before claiming C8 complete, the Controller must settle fixed template versus any proposed full-data behavior, the source copy restriction, the per-action dual capability description and native destination inheritance/creator-ownership semantics. These do not require a new OAuth scope. An actual need for new external authority must return to the existing reviewed selection rules; this advisory does not authorize it.

Unsupported simultaneous policy-writer guarantees are a real contract limit, not a solved implementation detail. A local preflight fingerprint must not be marketed as upstream CAS.

## 9. Staleness triggers

Re-evaluate affected findings if:

- Roadmap selection/order, G9/G10/G12, capability semantics or the workspace/resource ceiling changes;
- C1/C8 implementation or another PR introduces ACL normalization, workspace authorization, create/copy, new action variants or new tool security requirements;
- upstream ACL parser/permissions/defaults, rule ordering, owner checks, virtual shares, template filtering or creation inheritance changes;
- a stable native conditional-write or REST predicate-validation primitive becomes available;
- service-account creation/copy behavior or supported Community versions differ from the inspected source;
- policy conditions/attributes need new sensitive inputs, LinkKeys, share contexts or arbitrary code;
- real usage exposes a gap outside the seven ADOPT items, which still needs explicit promotion before becoming work.

A merge of ordinary C2/C4/C5 work can obsolete the PR snapshot or module seam descriptions without invalidating the core C1/C8 findings. Recheck the actual diff; do not mechanically rebase stale conclusions. A report's absence or staleness never blocks otherwise eligible Controllers.

## 10. Provenance

### Gia evidence

All base-code links below are pinned to `f0da0c8fdbbf7c62dddb18283686ed6c2110da4a`.

| ID | Evidence |
| --- | --- |
| G1 | [AGENTS](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/AGENTS.md), [Roadmap](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/docs/ROADMAP.md), [finite selection](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/docs/R6-PARETO-GAP-SELECTION.md), [Expert Protocol](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/docs/EXPERT-PROTOCOL.md) |
| G2 | [accessPolicy](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/src/grist/accessPolicy.ts) — ceiling, discovery and invalidation |
| G3 | [authorizationService](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/src/auth/authorizationService.ts), [principal](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/src/auth/principal.ts) — resource/capability matching |
| G4 | [contextFactory](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/src/grist/contextFactory.ts) — principal-derived graph |
| G5 | [authorizedService](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/src/grist/authorizedService.ts), [uiActionsAdapter](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/src/grist/uiActionsAdapter.ts) — private metadata boundary and verification |
| G6 | [leanRegistry](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/src/mcp/leanRegistry.ts), [OAuth tool metadata](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/src/mcp/oauthToolSecurity.ts), [challenges](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/src/mcp/oauthToolChallenge.ts) |
| G7 | [client](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/src/grist/client.ts), [MCP results](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/src/mcp/results.ts), [audit](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/src/audit/auditLogger.ts) |
| G8 | [R4 compatibility](https://github.com/djibian/gia/blob/f0da0c8fdbbf7c62dddb18283686ed6c2110da4a/docs/R4-COMPATIBILITY.md) — exact previous qualification limit |

### Official upstream evidence

Observed 2026-10-04. Source links use current `grist-core` revision `72345cbe06cad2ddeee4a9db1e133d82f1fd2294`; the release cross-checks are recorded in section 3. Grist source is **Apache-2.0**, verified in [LICENSE.txt](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/LICENSE.txt).

| ID | Source / exact behavior inspected | Disposition / licensing implication |
| --- | --- | --- |
| U1 | [Official access-rule documentation](https://support.getgrist.com/access-rules/) — Owner editing, precedence, defaults, structure and copy restrictions | **REIMPLEMENT** selected semantic behavior; documentation is a functional oracle, no text/code copied |
| U2 | [sandbox schema](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/sandbox/grist/schema.py) — ACLRules/ACLResources fields and legacy/user attributes | **ADAPT** metadata interpretation behind a private bounded adapter; no source copied |
| U3 | [ACLRuleCollection](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/common/ACLRuleCollection.ts) — default/special/`S` semantics, load errors, attribute checks | **ADAPT** native semantics; **REJECT** importing a bridge enforcement engine |
| U4 | [ACLRulesReader](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/common/ACLRulesReader.ts), [ACLPermissions](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/common/ACLPermissions.ts) — persisted versus virtual resources, ordering, tri-state bits | **ADAPT** selected interpretation; no full reader/evaluator copied |
| U5 | [AccessRules UI](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/client/aclui/AccessRules.ts) — save, negative resource refs, rule positions, recommended enable settings | **REJECT** full UI synchronization/import; **ADAPT** preservation/bundle pattern only |
| U6 | [acl.py](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/sandbox/grist/acl.py), [useractions.py](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/sandbox/grist/useractions.py) — derived parse tree and negative-ID mapping | **ADAPT** server-owned parsing/ref resolution; no engine code copied |
| U7 | [predicate parser](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/sandbox/grist/predicate_formula.py), [PredicateFormula](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/common/PredicateFormula.ts) — restricted grammar/compiler, membership and `rec`/`newRec` | **REIMPLEMENT** only a small selected serializer; **REJECT** whole-grammar port by default |
| U8 | [ActiveDoc](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/server/lib/ActiveDoc.ts) — checkAclFormula, getAclResources, native copy checks, apply dispatch | **REFERENCE / ADAPT** contract boundaries; internal methods are not assumed stable public REST |
| U9 | [GranularAccess](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/server/lib/GranularAccess.ts) — Owner enforcement, censoring, canCopyEverything and special permissions | **ADAPT** upstream enforcement; **REJECT** bypasses, exceptional sessions or copied authorization logic |
| U10 | [DocApi](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/server/lib/DocApi.ts) — fixed copy route, server-side download/import, `/apply` handler | **REUSE** native REST endpoints; **REJECT** generic forwarding or an invented CAS guarantee |
| U11 | [Official API reference](https://support.getgrist.com/api/) — workspace empty creation and explicit copy/template inputs | **REUSE** documented routes through Gia's existing credential-bound client; no API implementation copied |
| U12 | [Official copying documentation](https://support.getgrist.com/copying-docs/) — copy and template user semantics | **ADAPT** selected user semantics; no UI/framework imported |
| U13 | [ApiServer](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/gen-server/ApiServer.ts), [HomeDBManager](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/gen-server/lib/homedb/HomeDBManager.ts), [GroupsManager](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/gen-server/lib/homedb/GroupsManager.ts) — workspace ADD, new document groups and creator ownership | **REUSE** native behavior; **REJECT** bridge user/group/share administration |
| U14 | [uploads.fetchDoc](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/server/lib/uploads.ts) — same-caller credentials and internal source download | **REUSE** native copy endpoint; no bridge binary transport introduced |
| U15 | [filterUtils](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/server/lib/filterUtils.ts), [DocWorker download](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/server/lib/DocWorker.ts) — template deletion, FullCopies removal, disabled triggers | **ADAPT** exact native copy contract; no SQLite editing/filter code copied into Gia |

No external implementation code is copied by this report. Reuse of source later would require the applicable Apache notices/licensing review; endpoint reuse and independently implemented behavior do not import the Grist server architecture. The official Full-edition MCP implementation was not accessed or treated as available source. Existing community comparisons remain in the integrated R6 reviews; no community implementation was needed for these two native authority questions.

This execution performed static repository/source/documentation analysis only. It changed one advisory file, did not contact or mutate a real Grist application, did not run a new product validation campaign, and did not modify runtime, tests, dependencies, configuration, deployment, release, normative documents or roadmap eligibility.
