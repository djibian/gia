EXPERT ADVISORY
Date: 2026-10-04
Base main: 04f6cde3e07903ce1f4143ad1068356daf612365
Scope: Post-R6 integrated product and release-readiness review; reassessment of the prior C1/C8 advisory
Status: ADVISORY — NOT ROADMAP AUTHORITY

## 1. Executive findings

**R6 has a coherent product shape, but this exact main is not ready to be presented as a working seven-capability release candidate.** Three concrete integration defects need correction before release. Green baseline CI and the recorded exact-head reviews did not detect them. This is an advisory product assessment, not a G7 verdict, a release authorization or a new roadmap.

| ID | Classification | Finding | Smallest sufficient Controller response |
| --- | --- | --- | --- |
| B1 | **BLOCKING BEFORE RELEASE** | C3 expects the generated summary table in `CreateViewSection.retValues.tableRef`; native Grist returns the source table reference. A successful native summary creation is rejected after the effect. | Resolve the actual table from the returned section's fresh metadata, then retain the existing source/group/widget verification. Correct the native-response fixture and verify grouped and grand-total creation. |
| B2 | **BLOCKING BEFORE RELEASE** | C2 can hide a field referenced by a persisted Card layout; C5 then refuses that layout as incomplete, blocking the documented C2-then-C5 sequence. | Handle the supported native stale-leaf case without accepting arbitrary malformed layouts or changing two public intentions into one. Verify hide, rearrange and hide/re-show on the same Card. |
| B3 | **BLOCKING BEFORE RELEASE** | New C1/C8 post-write exception types fall through the MCP error projector as generic `operation_failed`; typed effect/retry information and C8's known created ID property are lost. | Project these two exceptions into explicit post-write errors with `retryWholeOperation: false`, appropriate effect knowledge and a separate known-created-ID field for C8. Verify through the registered MCP handlers. |
| S1 | **SHOULD FIX BEFORE RELEASE** | C8 copy needs source `doc:read` plus destination `doc.schema:write`, but tool OAuth metadata/challenges still model only the latter. | Make the existing action's missing-source-read challenge accurate without requiring source-read for empty creation or treating a resource denial as a scope deficit. |
| S2 | **SHOULD FIX BEFORE RELEASE** | Current documentation mixes R6 DONE with ACTIVE/ELIGIBLE, implementation-candidate labels, a broad ACL exclusion and an obsolete next-tranche statement. | Reconcile the specific projections listed below; preserve R6's exhausted set and deferred R7/distribution. |
| S3 | **SHOULD FIX BEFORE RELEASE** | R4/R5 live evidence predates R6; R6 CI primarily proves local contracts against mocks. It does not qualify the newly assembled primitives on native Grist. | Retain a small native verification record for the repaired seams and C1/C8 authority cases on the declared release target. Do not restart the nine-class campaign. |
| S4 | **SHOULD FIX BEFORE RELEASE** | The agent-facing safety description is too terse for C1's unmanaged structure permission and C3/C8 policy interactions. | State the precise confidentiality/template/summary limitations in progressive help and release-facing documentation; no new ACL feature is required. |

The ten MCP v2 tool names, three capabilities, principal-derived credential graph and closed semantic actions remain intact. No generic HTTP, SQL, UserAction, identity/share administration, planner, lifecycle journal or new dependency was added by R6. The response to the findings can remain small. Release readiness does not require adding document-default ACL editing, richer predicates, full-data copy, attachments, styling or any deferred candidate.

## 2. Current-state facts

### Exact GitHub reconstruction

- Base main above is the squash integration of [#212](https://github.com/djibian/gia/pull/212), C8. There were **zero open PRs** at startup. Relevant branch inventory contained no pending R6 implementation branch. Historical branches were left alone.
- The only open issue was [#58](https://github.com/djibian/gia/issues/58), explicitly deferred optional public distribution; it supplies no release-blocking or implementation work.
- All required startup documents and `prompts/ASTRA-EXPERT.md` were read from this exact base. The sole prior Expert report is [the C1/C8 advisory](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/docs/expert/2026-10-04-r6-acl-document-boundaries-f0da0c8.md).
- Main's [CI run 37220647594](https://github.com/djibian/gia/actions/runs/37220647594/job/111490116062) passed installation, production dependency audit, TypeScript checks, **318 tests**, and build on the exact base.
- All seven implementation PRs have a durable `AUTONOMOUS REVIEW … Result: PASS` for their final integrated head plus green `verify`. This report does not reinterpret those historical review results as integrated release proof.

| Slice | Integrated PR | Final reviewed/CI head | Merge on main |
| --- | --- | --- | --- |
| C2 fields/order/width | [#202](https://github.com/djibian/gia/pull/202) | `9133384e34c48da995ee7cc2201b5b12f659fe14` | `e5d7d7f3f4146aa5ec7893be1b3e37594fd1eb33` |
| C4 persistent filters | [#206](https://github.com/djibian/gia/pull/206) | `b10c6ee267d287902d46781f063878d18451323a` | `01517d731c738a0eabd64370b5e46bb84b2bfec7` |
| C3 native summaries | [#207](https://github.com/djibian/gia/pull/207) | `ba78b230d84931b1184c889f50e9c8dc04bf9258` | `4383a6b0f4ad3995c4bb77c0327169860674ca58` |
| C5 Card layout | [#209](https://github.com/djibian/gia/pull/209) | `3cd04d7db1247a4019758d87a5b0612d4d172574` | `ec513d14b077925e700c25840e10bdff82587cef` |
| C10 page order | [#210](https://github.com/djibian/gia/pull/210) | `27d4c69a0cdd9d98fd1fe73eeabdb7f31eb0286a` | `bcdc13722acbef0e82a8b0f60843d3f05f29cdb2` |
| C1 application ACL groups | [#211](https://github.com/djibian/gia/pull/211) | `f8a6544814ec6925a8280e0679a53e2d35681934` | `cef0d0d03512837ce5d57afca9485d83153857eb` |
| C8 document bootstrap | [#212](https://github.com/djibian/gia/pull/212) | `a8f72174966abfdf0301ac90036a24f89db24154` | `04f6cde3e07903ce1f4143ad1068356daf612365` |

Review comments, PR descriptions and check runs were fetched again, rather than inferred from conversation history. The earlier C2 rejections apply to older heads and were followed by final-head PASS. Mutable GitHub facts must be fetched again by the next Controller.

### Delta from released v0.6.0

**OBSERVATION O1 — main is unreleased product evolution, not the v0.6.0 runtime.** The existing [v0.6.0 release](https://github.com/djibian/gia/releases/tag/v0.6.0), published 2026-10-01, resolves to `22cc202c717786d4d8a94f992ccb7aeaae9f8c13`. Base main is 17 subsequent integrated commits: R6 observation/selection, governance/advisory documentation and the seven capabilities. The diff is 59 files, 9,230 additions and 120 deletions; 18 runtime files have a net increase of 3,877 lines. This is a material functional delta, not a documentation-only release refresh.

`package.json`, `package-lock.json` and `src/version.ts` still identify **0.6.0**. Keeping the old version during development is not itself a runtime defect. A later authorized release operation must assign its own implementation version, immutable tag and truthful notes; do not reuse or move v0.6.0. MCP contract version **2** is separately defined and can remain 2 for these additive intentions and bounded corrections. No release action is taken here.

**OBSERVATION O2 — compactness survives at the architectural boundary.** Dependency manifests, server/configuration, principal/OAuth conversion, credential providers and context factory are unchanged from v0.6.0. The safety error projector and tool OAuth wrappers are also unchanged, which explains B3/S1. R6 expands selected action variants and normalization modules rather than adding transports, tools or an orchestration system. Line count warrants maintenance attention but does not, by itself, disprove the Pareto product principle.

### Evidence limits of this execution

This was a repository/source review with local, synthetic, in-memory boundary probes. The existing seven-file focused test selection passed **39/39**. The probes demonstrated B1, B2, B3 and S1 using current Gia functions; no test file was added or modified. B1 additionally rests on the actual upstream implementation, not on an invented response. No real Grist application was contacted or mutated, no production credential was used, and no native release qualification is claimed.

## 3. Upstream/reference findings

### Current oracle and version relevance

Observed 2026-10-04: `gristlabs/grist-core/main` remains `72345cbe06cad2ddeee4a9db1e133d82f1fd2294`, exactly the revision inspected by the previous Expert and the R6 slices. The latest observed release remains **v1.7.20**, published 2026-09-28. There is **no intervening upstream main change** that makes the previous ACL/copy source study obsolete.

Pinned release cross-checks:

| Grist ref | Exact commit | Relevance |
| --- | --- | --- |
| v1.7.16 | `0408b156e7e2ea30a84f49392d1984bcd2748e25` | Lower end of the historical R4 tested range; B1's native return behavior is already present. |
| v1.7.19 | `298d4661ce3513a6a459c5441f9c5baea4356cc8` | R4/R5 native validation target; same B1 behavior. |
| v1.7.20 | `b4ccc892202a3aefd6e565f0bc0c01081433a53c` | Latest release inspected; same B1 behavior; source review is not runtime qualification. |

The source comparison between 1.7.19 and 1.7.20 shows changes in table-column hidden-metadata handling, recursive ACL action scanning, home-API filtering and copy/read helper plumbing. It does not change `CreateViewSection` into a generated-table return contract. No selected R6 primitive was found to have been replaced or deprecated. These private adapters remain version-sensitive; extrapolation from source or from an older R4 run is insufficient compatibility evidence.

### Exact native observations

- **Summary construction:** `sandbox/grist/useractions.py::CreateViewSection` invokes the summary constructor when `groupby_colrefs` is a list, but returns `tableRef: table_ref`, the input source reference. The generated section points to a different summary table. This is identical in the inspected 1.7.16, 1.7.19, 1.7.20 and current main implementations. `test_summary.py` confirms the resulting section/generated-table relationship. [U1]
- **Card field changes:** `_removeViewSectionFieldRecords` removes field rows without rewriting `_grist_Views_section.layoutSpec`. `RecordLayout.updateLayoutSpecWithFields` prunes stale leaves and supplies missing leaves in the browser's derived layout. That derivation is not an API promise that the persisted layout is rewritten. Gia need not port default placement to recognize this native stale-reference state. [U2]
- **ACL authority and semantics:** Owner editing, ordered tri-state fallthrough, persisted/effective separation and the power of `S` remain current. Official documentation explicitly explains that formula calculations can bypass data restrictions when the user retains structure permission. The finite serializer reduces parser risk; it does not prove confidentiality. [U3, U4]
- **Creation/copy:** the workspace empty-create route and same-installation native copy remain available. `POST /api/docs` accepts the explicit source/destination/name/template parameters used by C8. Native download/copy enforcement is more than bridge `doc:read`; non-Owner template copying is a legitimate native possibility, not an automatic authorization defect. [U5]
- **Template effects:** native filtering removes user-table rows, attachments and history, removes the `FullCopies` special right and disables triggers while retaining other metadata. Source collaborator sharing is not transplanted as destination home-level grants. The destination inherits its workspace and creator ownership. [U5, U6]

Current official API, access-rule and copying documentation was consulted. Public Community source is Apache-2.0. No upstream code was copied and no Full-edition MCP implementation was treated as available source. Community projects from the admitted reference set were not re-surveyed: the decisive issues are native return/metadata semantics and Gia boundary projections, for which those projects would not improve the oracle.

## 4. Risk and invariant analysis

### B1 — BLOCKING BEFORE RELEASE: C3 rejects the real native response

**Evidence:** `GristUiActionsAdapter.addPageWidget` defines the expected summary result as a returned table reference different from the source. Native `CreateViewSection` returns the source reference. Therefore every successful summary request using that native response reaches `UiWriteVerificationError("add_page_widget", "…inconsistent identifiers", widgetId)` before `AuthorizedGristService` can verify the generated summary. Both grouped and `groupByColumnIds: []` grand-total requests are affected. [G2, U1]

The local adapter probe supplied the native-shaped response `{tableRef: 2, viewRef: 7, sectionRef: 12}` for source 2 and observed `write_verification_failed`, `createdId: 12`, `retryWholeOperation: false`. The probe did not create a real widget. The source establishes that a real successful action produces this shape. Existing summary adapter tests instead return tableRef 4, and the authorized-summary harness bypasses the native adapter with a summary-table result. Their green status cannot settle this mismatch.

**Impact:** C3's advertised success path is unusable against the inspected native primitive; the widget/summary may already exist. The current no-blind-retry classification is correct and must survive the repair.

**Smallest correction/verification:** obtain the returned section by its stable current widget identity, derive its actual `tableRef` from fresh metadata, then verify distinct summary, source, exact grouping and page/widget membership as today. Do not infer a generated table name or require the returned source ref to identify the summary. Correct one native-response fixture; verify one grouped summary, one grand total and reuse of the grouping. A real Grist round trip is sufficient to establish the corrected primitive; a new summary engine is unnecessary.

### B2 — BLOCKING BEFORE RELEASE: C2 can make C5 unreachable

**Evidence:** take a Card with visible Name/Email fields and a valid persisted layout referencing their private field rows. C2 removes Email's field row while preserving section metadata, including that layout. Native Grist does not rewrite it on field removal. `normalizeCardLayout` treats the absent leaf as incomplete; `AuthorizedGristService.updatePageWidget` rejects any later `cardLayout` write on that flag before applying the requested complete layout. [G3, U2]

The in-memory service/real-adapter probe observed: C2 hide Email succeeds; subsequent C5 layout containing only current Name fails with “incomplete or unsupported current card-layout metadata”; only the first native-adapter invocation occurs. Hiding then re-showing recreates a field with a new private ID and has the same stale-leaf risk. This contradicts the explicit C2-then-C5 sequence in `MCP-CONTRACT.md` and the C5 guide. It is not merely an unusual pre-existing malformed document.

**Smallest correction/verification:** distinguish a syntactically supported native Card BoxSpec with obsolete field leaves from genuinely unknown/malformed/censored state. Permit a safe complete replacement over the exact current field set, retaining rejection of unknown nodes, duplicate live fields, invalid sizes and incomplete field discovery. Native stale-leaf pruning may inform normalization; do not import its default placement engine or allow arbitrary JSON. A more restrictive alternative is to refuse the problematic C2 hide before its effect and explicitly narrow the contract, but silently leaving the advertised sequence stuck is unacceptable. Verify the same-widget hide→layout and hide→re-show→layout sequences while preserving unrelated section/retained-field settings.

### B3 — BLOCKING BEFORE RELEASE: C1/C8 effect knowledge is lost at MCP

**Evidence:** `AccessRuleWriteVerificationError` and `DocumentBootstrapVerificationError` extend `Error`. `mcp/results.ts::errorResult` recognizes neither. They are not `UiWriteVerificationError` and carry no recognized `GristEffectKnowledge`; both reach the generic branch. [G1, G4]

The boundary probes produced `code: "operation_failed"` with only prose. C1 still says the write may have succeeded; C8 still mentions the known ID and forbids name-based retry/guessed deletion. Thus the warnings are **not absent**, and no automatic server replay or observed data loss is alleged. The defect is the loss of the existing machine-readable post-write/retry contract: no `retryWholeOperation: false`, no explicit effect classification, and no separate `createdDocumentId`/confirmed-effect property for the known C8 resource. Current tests assert the service exception, not its registered-tool result.

**Smallest correction/verification:** explicitly project the two exception types. C1 should report post-write verification uncertainty rather than ordinary operation failure. C8 should retain the known created identity as an applied creation with unverified destination postcondition; do not conflate it with response-loss/unknown-ID uncertainty. Both forbid whole-operation retry. Keep the existing text-content error convention to avoid success-output-schema validation problems. Verify one failed ACL re-read and one known-created-ID membership failure through the MCP handlers, plus the existing unknown-ID `UNCERTAIN` path. No journal, retry scheduler, cleanup or new tool is needed.

### S1 — SHOULD FIX BEFORE RELEASE: copy's OAuth requirement is under-described

The runtime correctly rejects a copy without source `doc:read`; there is **no authority bypass**. However `oauthSecuritySchemesForTool("grist_add_structure")` advertises only `doc.schema:write`. `installOAuthToolAuthChallenges` likewise tests only that capability by tool name. A principal holding schema scope but no read scope receives the source-read denial without an insufficient-read-scope challenge. This was reproduced with an in-memory handler. The current OAuth runbook's assertion that one registry capability fully describes each tool is no longer sufficient for this action. [G5]

**Smallest response:** use the existing closed action discriminator to identify copy's additional read requirement in the challenge path, while retaining resource-specific enforcement in the authorized service. Document the tool-level baseline versus action-specific requirement. Do not globally demand `doc:read` for all structure creation, add a scope, infer read from schema or challenge a user to obtain more scope when the source simply lies outside their grant. Verify schema-only empty creation, schema-only copy denial with the appropriate challenge, and read+schema copy with disallowed source still failing without manufactured authority.

### S2 — SHOULD FIX BEFORE RELEASE: reconcile the current projections

| Current file/fact | Drift | Smallest sufficient reconciliation |
| --- | --- | --- |
| `ROADMAP.md` overview | R6 ACTIVE/R6.3 ELIGIBLE and “only active … tranche” contradict the detailed DONE/exhausted statements. | Align overview/prose with exhausted R6; preserve R7 and distribution as DEFERRED. |
| `R6-C1-ACCESS-RULES.md`, `R6-C5-CARD-LAYOUT.md`, `R6-C8-DOCUMENT-BOOTSTRAP.md` | Still labelled implementation candidates despite integration. | Identify integrated slices and their evidence; do not silently turn integration into release qualification. |
| README product exclusion | “ACL administration layer” is broader than the implemented ordinary-group authoring subset. | Say generic identity/share administration is excluded; state the bounded application-policy exception. |
| `OAUTH-OPERATIONS.md` | Calls R5-D “next eligible” although R5/R6 are finished; single-capability prose misses S1. | Correct current status and explain copy's dual prerequisite. |
| `SECURITY.md` S3 versus C8 | Absolute “never changes the acting principal's … grants” needs the already-documented native creator-ownership effect interpreted precisely. | Distinguish forbidden bridge grant/role escalation on existing resources from native ownership of a newly created, authorized document. |
| C3 guide / Roadmap completion claims | Describe a verified generated-table success despite B1. | Reconcile with the corrected actual response and its evidence after repair. |

Product Vision, Architecture and Security otherwise correctly distinguish C1 application policy from generic identity administration and describe explicit C8 workspace authority. Historical R4/R5 evidence, retired domain documents and deferred submission material should remain dated evidence. Rewriting their history or restarting old tranches would add no release confidence. This report changes none of these files.

### S3 — SHOULD FIX BEFORE RELEASE: bounded native evidence, not a new campaign

`R4-COMPATIBILITY.md` proves a specific older candidate slice on Community **1.7.16–1.7.19**. Its workflow path filter and probe are unchanged; the probe does not exercise the new summary, Card, ACL or copy paths. No R6 native qualification record was found in the inspected docs, PR discussions or current-main runs. [G6]

**Smallest sufficient verification:** on the intended Community release target, record B1/B2's native sequence plus one Owner ACL group round trip preserving an existing protected/default group, non-Owner denial before ACL exposure, empty allowed-workspace creation, native template copy and native source/destination denial. Include known-ID and unknown-effect MCP projection checks from B3. This can use generic disposable data and an existing maintained harness; it needs no domain application, browser matrix or new platform. If release support is claimed for the historical version range, either verify affected seams at the claimed boundaries or state precisely which new capabilities/versions remain unqualified. Source review alone does not extend the support claim to 1.7.20.

This is a release-confidence recommendation. It does not reactivate R4 or manufacture a new roadmap dependency. The known B1/B2/B3 defects already block this exact candidate independently of this evidence recommendation.

### S4 — SHOULD FIX BEFORE RELEASE: make policy limits actionable for the agent

C1 intentionally preserves document-default/`S`/special policy and reports `effectiveEnforcementVerified: false`. The consequence is concrete: an Owner can install a row/column deny while an Editor retaining structure permission can derive restricted data through formulas. C1 does not reproduce “Enable Access Rules,” revoke that structure permission or validate every effective policy. Merely saying Grist is authoritative does not explain the manual completion boundary to an agent. [G1, U3, U4]

Similarly, C3 creates/reuses a distinct generated table without claiming source-ACL inheritance; C4 filters and C2 hidden fields are presentation, not confidentiality. C8 removes user rows but retains metadata/policy, loses lookup-table contents used by user attributes and creates a document with destination sharing/creator ownership. Copy success verifies destination membership, not the application's policy equivalence. [G2, G3, G7, U5, U6]

**Smallest response:** add concise help/release guidance saying these facts explicitly and direct the client to inspect the actual resulting table/document and use Grist's native Owner configuration for unsupported default/structure policy. Preserve the existing false enforcement flag. Do not add `S` editing, custom attributes, policy evaluation or automatic ACL propagation merely to eliminate a documented limit.

### NON-BLOCKING findings and OBSERVATION

| ID / classification | Finding and implication | Minimal Controller response |
| --- | --- | --- |
| N1 — **NON-BLOCKING** | C1 is deliberately narrower than the previous report's possible predicate/default-policy designs: no literals, boolean composition, `newRec`, custom attributes or `S` edits. This is a safe documented authoring subset, not full native ACL parity. | Retain the subset and S4's accurate description. No feature expansion is needed for a release of this bounded contract. |
| N2 — **NON-BLOCKING** | ACL fingerprints/post-reads and UI postconditions do not provide native compare-and-set or simultaneous-writer isolation. C1 detects untargeted divergence after the effect; it does not perform an additional last-moment full ACL re-read before applying the plan. No CAS claim was found. | Keep race limitations explicit and return no-blind-retry uncertainty. Do not add locks, snapshots or automatic restoration absent a demonstrated need. |
| N3 — **NON-BLOCKING** | Raw compatibility output remains: table refs, page metadata refs, `layoutSpec`, sort refs and select-by refs. These predate R6; C5 explicitly documents retaining raw layout output. New R6 mutation inputs do not accept those arbitrary representations. | Use normalized stable fields in guidance; avoid an unprompted breaking v2 output removal or an absolute claim that every private ref is absent from outputs. |
| O3 — **OBSERVATION** | C8's workspace grant authorizes new resources inside that pre-existing ceiling; the returned ID is not added as a permanent grant. Native creator ownership is an explicit creation effect. | Preserve actual-membership re-resolution and cache invalidation; do not provision grants or remove the creator automatically. |

No accidental global authority expansion was found in the inspected C1/C8 execution path. This is a source-level finding, not a proof about every deployed credential or effective Grist policy.

## 5. Options considered

| Option | Assessment |
| --- | --- |
| Release exact Base main because seven PRs and baseline CI passed | **REJECT.** The native C3 contract mismatch and the self-created C2/C5 blocked state are concrete counterexamples. |
| Correct the three integration seams, clarify OAuth/docs, collect bounded native evidence | **Preferred.** Repairs the assembled product while preserving its selected scope and ten-tool v2 shape. |
| Solve these issues by adding tools, richer ACLs, full-copy mode, a planner or a durable recovery journal | **REJECT.** None addresses the actual minimal cause. |
| Treat current upstream 1.7.20 as already qualified because R6 source review used main | **REJECT.** Source observations and native runtime qualification are different evidence. |
| Declare every intentional C1 limitation a release blocker | **REJECT.** Release the accurately described finite subset; unsupported policy does not authorize speculative work. |
| Rewrite the old Expert report and historical evidence | **REJECT.** Preserve their exact-base history and use the applicability mapping below. |

## 6. Expert recommendation

**Do not release this exact Base main as the working Post-R6 candidate.** Address B1–B3 with the smallest corrections and focused boundary/native evidence. S1–S4 should be settled or explicitly characterized before the later release decision. No new product roadmap, tool, scope or feature is recommended.

The conceptual assembly is good: C8 supplies bounded document bootstrap; schema/data intentions remain existing primitives; C3 adds native derived tables; C2/C4/C5 configure their widgets; C10 arranges existing navigation; C1 authors a selected ordinary policy subset. Planning, business meaning and multi-step sequencing remain with the client. Fixing the integration does not require abandoning that split.

### Reassessment of the previous Expert report

Overall applicability of `docs/expert/2026-10-04-r6-acl-document-boundaries-f0da0c8.md`: **PARTIALLY STALE**. Implementation is an explicit staleness trigger. Its authority, preservation and native-semantics constraints remain useful; its startup/work-remaining/seam-selection statements no longer describe main.

| Previous conclusion/recommendation | Current classification | Evidence and consequence |
| --- | --- | --- |
| C1 is a private document-policy adapter requiring native Owner, not ordinary metadata CRUD or identity administration. | **Still valid; concretized.** | Fresh Owner proof before ACL reads; local read/schema checks; closed targets and fixed private actions. |
| Tri-state bits, rule order/fallback, default/`S` coupling and unsupported policy must survive. | **Still valid; concretized in a narrower subset.** | Table CRUD/column RU; terminal everyone rule; protected defaults/special/memo/attribute/opaque state preserved; mixed `S`/aliases refused. |
| Sensitive predicates must not be echoed or accepted as generic text. | **Still valid; concretized.** | Finite typed serializer with no arbitrary literals; unsupported groups expose generic reasons rather than formulas/memos. |
| Persisted verification is weaker than effective enforcement; Editor `S` can bypass visibility. | **Still valid; partly operationalized.** | Successful C1 explicitly returns false effective verification. It preserves rather than edits `S`; S4's agent guidance remains needed. |
| A bounded document-default schemaEdit operation might be useful; resolve broader condition/custom-attribute design. | **Obsolete as instructions for the completed slice; historical options only.** | Final C1 deliberately excludes them. They are not pending selected work or release prerequisites for the declared subset. |
| ACL divergence must be uncertain/no-blind-retry, with no native CAS claim. | **Still valid; service-level implementation incomplete at MCP boundary.** | B3 loses typed projection; the prose warning survives. The suggested extra pre-write re-read was not adopted; N2 records the race limitation. |
| C8 needs a workspace authorization seam and empty-workspace discovery, not a new scope. | **Concretized.** | `AllowedWorkspace`, principal-local workspace discovery and same-grant capability assertion are implemented. The earlier “missing abstraction” finding is resolved. |
| Explicit destination ceiling/grant plus separate source read; returned ID must not widen authority. | **Still valid; concretized.** | C8 uses the same credential/context, re-discovers actual destination and never appends a grant. |
| Prefer fixed native template mode; no upload/full clone/name replay/guessed cleanup. | **Still valid; concretized.** | Two finite creation actions, fixed `asTemplate: true`, cache invalidation on attempted mutation, unknown-response uncertainty and known-ID exception. B3 concerns the final error projection. |
| Optional extra source-Owner restriction for copy. | **Resolved option, not a missed requirement.** | Final C8 deliberately retains native non-Owner template copying and records its departure. Local readability does not substitute for native copy authorization. |
| Per-action copy capability metadata needs attention. | **Still valid; not fully concretized.** | Descriptions/runtime state both requirements, but root schemes/challenges remain single-capability; S1. |
| Architecture/Security had broad ACL exclusion wording requiring reconciliation. | **Largely concretized; old blanket drift obsolete.** | #205/#211/#212 refine normative application-policy/workspace boundaries. Specific README/S3/status projection issues remain S2. |
| Reject unresolved Card leaves; C2 can remove/recreate field refs. | **Needs refinement after integrated evidence.** | B2 shows that blanket stale-leaf refusal blocks Gia's own supported sequence. Unknown/malformed state should still refuse; native obsolete leaves need separate treatment. |
| C1/C8 pending, #202 open, no integrated report; continue the finite implementation order. | **Obsolete.** | Seven slices and prior report are integrated; no pending implementation PR exists. Stop after this advisory. |

## 7. Controller guidance

These are bounded repair/verification pointers, **not eligibility declarations**. The next Controller must independently reconstruct main and follow G7 for any material correction. This Expert does not implement or review a repair head.

| Finding | Likely seam | Sufficient acceptance evidence |
| --- | --- | --- |
| B1 | `uiActionsAdapter.addPageWidget`, `authorizedService.addPageWidget`, summary response fixtures | Native-shaped source-ref response accepted; actual section table verified against source/grouping; grouped/grand-total/reused summary round trips; inconsistent post-read still retains widget ID/no replay. |
| B2 | Card normalization and `updatePageWidget` preflight; C2/C5 interaction coverage | Existing layout→hide→new complete layout works; hide/re-show with new field row works; malformed/duplicate/unknown layouts and incomplete discovery still refuse. |
| B3 | `mcp/results.ts` projection of the two R6 exception types | Registered-tool text JSON carries explicit post-write state/no-retry; known C8 ID survives as a field; uncertain unknown-ID case remains distinct; no success schema is used for errors. |
| S1 | Existing OAuth action/challenge wrapper and runbook | Correct copy-only missing-read challenge; empty create unaffected; no challenge manufactures resource/native authority. |
| S2/S4 | Current-state projections, progressive help and later release notes | Exhausted R6 visible consistently; exact ACL/template/summary limits disclosed; historical validation does not certify new primitives. |
| S3 | Existing isolated native verification facilities | Small sanitized record with exact Gia commit, Grist version/revision, scenario and observed postconditions; no real business fixture or secrets. |

Minimum invariant checklist for any correction: retain explicit stable targets; preserve retained/untargeted human state; fail closed on incomplete metadata; never change credential after denial; do not infer workspace authority from a document; never replay a creation or restore old ACL state automatically; retain known effects separately from uncertain postconditions. Baseline CI and independent exact-head review remain necessary.

## 8. Questions / decision points

No new human product-direction decision is needed for this review. The genuine later release choices are the implementation version/tag, the declared Community support target/range, and whether S1–S4 have been repaired or precisely disclosed with sufficient evidence. None authorizes deferred distribution.

The technical choice for B2 is whether to support native stale-leaf normalization/replacement or narrow field hiding before the effect; choose the smallest coherent contract and verify it. C1 effective confidentiality remains dependent on native/default/structure policy outside Gia's initial writable subset. Accepting that documented limit does not require a new ACL capability.

## 9. Staleness triggers

Revalidate affected findings if main changes summary return handling, Card/field normalization, C1/C8 exception projection, OAuth action requirements, grants/discovery/caches or release/support claims. B1/B2/B3 become resolved only with the corresponding corrected behavior and evidence; an unrelated merge or a newer green baseline run does not resolve them.

Refresh native observations if Grist changes `CreateViewSection` return semantics, Card stale-leaf handling, metadata schemas, ACL parser/default/Owner enforcement, hidden-column API handling, template filtering, copy privileges or destination inheritance. A stable conditional-write/validation API would change some design constraints, not automatically authorize adopting it.

The PR/open-branch/CI snapshot is mutable. Earlier applicability labels are not permanent facts. This report does not revive R6, R7, R4 or optional public distribution.

## 10. Provenance

### Gia evidence at exact Base main

All code/document links below are pinned to `04f6cde3e07903ce1f4143ad1068356daf612365`.

| ID | Inspected evidence |
| --- | --- |
| G1 | [accessRules](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/grist/accessRules.ts), [authorizedService](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/grist/authorizedService.ts), [C1 guide](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/docs/R6-C1-ACCESS-RULES.md) — policy subset/Owner/preservation/exception paths |
| G2 | [UI adapter](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/grist/uiActionsAdapter.ts), [summaryTables](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/grist/summaryTables.ts), [adapter tests](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/test/ui-actions-adapter.test.ts), [authorized-summary tests](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/test/authorized-summary-widget.test.ts) — actual bridge expectation and mock discrepancy |
| G3 | [widgetFields](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/grist/widgetFields.ts), [cardLayout](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/grist/cardLayout.ts), [C5 guide](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/docs/R6-C5-CARD-LAYOUT.md) — current-field/layout interaction |
| G4 | [MCP results](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/mcp/results.ts), [lean tools](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/mcp/leanTools.ts), [client](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/grist/client.ts) — exception projection, handlers and unknown-effect classification |
| G5 | [tool registry](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/mcp/leanRegistry.ts), [OAuth security metadata](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/mcp/oauthToolSecurity.ts), [OAuth challenges](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/mcp/oauthToolChallenge.ts) — retained single-capability projection |
| G6 | [R4 compatibility](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/docs/R4-COMPATIBILITY.md), [compatibility workflow](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/.github/workflows/r4-grist-compatibility.yml), [probe](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/tools/r4-grist-compatibility-probe.ts) — historical qualification boundaries |
| G7 | [authorizationService](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/auth/authorizationService.ts), [accessPolicy](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/grist/accessPolicy.ts), [contextFactory](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/grist/contextFactory.ts), [C8 guide](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/docs/R6-C8-DOCUMENT-BOOTSTRAP.md) — workspace/source/principal/resource effects |
| G8 | [widgetFilters](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/grist/widgetFilters.ts), [pageOrder](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/grist/pageOrder.ts), [documentUi](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/grist/documentUi.ts), [documentContext](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/src/grist/documentContext.ts) — filters, navigation, normalized context and residual compatibility output |

Normative/current documentation inspected: [AGENTS](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/AGENTS.md), [Product Vision](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/docs/PRODUCT_VISION.md), [Roadmap](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/docs/ROADMAP.md), [Architecture](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/docs/ARCHITECTURE.md), [Security](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/docs/SECURITY.md), [Expert Protocol](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/docs/EXPERT-PROTOCOL.md), [MCP Contract](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/docs/MCP-CONTRACT.md), [OAuth runbook](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/docs/OAUTH-OPERATIONS.md), [README](https://github.com/djibian/gia/blob/04f6cde3e07903ce1f4143ad1068356daf612365/README.md). The seven R6 slice guides, selection, prior Expert report and pertinent R4/R5 evidence were also consulted. Release delta was computed from the actual v0.6.0 Git ref, not from a version string.

### External provenance and dispositions

Unless otherwise stated, source links use observed current Grist revision `72345cbe06cad2ddeee4a9db1e133d82f1fd2294`. Grist source license was checked in [LICENSE.txt](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/LICENSE.txt): Apache-2.0.

| ID | Exact source / behavior inspected | Disposition and licensing consequence |
| --- | --- | --- |
| U1 | [useractions.py](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/sandbox/grist/useractions.py), [test_summary.py](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/sandbox/grist/test_summary.py), [1.7.16 native source](https://github.com/gristlabs/grist-core/blob/0408b156e7e2ea30a84f49392d1984bcd2748e25/sandbox/grist/useractions.py) — source-ref return versus generated section table | **ADAPT** the observed return contract; **REUSE** native summary creation. No engine/test framework or source code copied. |
| U2 | [RecordLayout.js](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/client/components/RecordLayout.js), [ViewSectionRec](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/client/models/entities/ViewSectionRec.ts), U1 field-removal hook — persisted versus derived stale-leaf state | **ADAPT** the exact metadata interpretation; **REJECT** importing browser layout/default-placement architecture. |
| U3 | [Official access rules](https://support.getgrist.com/access-rules/), observed 2026-10-04 — Owner editing, precedence, structure/formula bypass, template exception | **ADAPT** selected semantics and user guidance; no documentation text copied. |
| U4 | [ACLPermissions](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/common/ACLPermissions.ts), [ACLRuleCollection](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/common/ACLRuleCollection.ts), [GranularAccess](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/server/lib/GranularAccess.ts), [predicate_formula.py](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/sandbox/grist/predicate_formula.py) — native enforcement/parser/default boundaries | **REUSE** upstream enforcement; **REIMPLEMENT** only the selected serializer behavior; **REJECT** a Gia policy-evaluation engine. |
| U5 | [Official API](https://support.getgrist.com/api/), [copying docs](https://support.getgrist.com/copying-docs/), [ApiServer](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/gen-server/ApiServer.ts), [DocApi](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/server/lib/DocApi.ts), [uploads](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/server/lib/uploads.ts) — bounded native create/copy and caller authority | **REUSE** native endpoints; **REJECT** a bridge upload/full-copy/general forwarding surface. Documentation observed 2026-10-04; no text/code copied. |
| U6 | [filterUtils](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/server/lib/filterUtils.ts), [HomeDBManager](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/gen-server/lib/homedb/HomeDBManager.ts) — template deletion/filtering and native inheritance/creator ownership | **ADAPT** exact disclosed effects; no SQLite filter implementation or grant-management code imported. |
| U7 | [v1.7.20 release](https://github.com/gristlabs/grist-core/releases/tag/v1.7.20), [ActiveDoc](https://github.com/gristlabs/grist-core/blob/72345cbe06cad2ddeee4a9db1e133d82f1fd2294/app/server/lib/ActiveDoc.ts), pinned 1.7.19→1.7.20 source comparison | **ADAPT** compatibility assessment; **REJECT** extrapolating qualification or treating Full-edition additions as a backlog. |

Only this new advisory report is written to the repository. Runtime, tests, dependencies, configuration, deployment, public contract, Roadmap, normative files and releases are unchanged by this execution. After advisory integration, stop.
