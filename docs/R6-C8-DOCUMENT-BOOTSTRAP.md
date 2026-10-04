# R6 C8 — bounded document bootstrap

## Status

Implementation candidate for the final selected R6.3 slice.

C8 adds the smallest document-lifecycle surface selected by
`docs/R6-PARETO-GAP-SELECTION.md`: empty document creation plus same-installation
copy-as-template into an explicitly authorized workspace. It does not add generic
import, full-data clone, upload, fork, sharing administration or a new capability.

## Public semantic surface

The existing ten-tool MCP v2 shape is retained:

- `grist_discover(action="workspaces")` lists explicitly deployment-allowed
  workspaces for which the current principal has a workspace `doc:read` grant,
  including workspaces with zero documents. This is selection context, not
  creation authority.
- `grist_add_structure(action="create_document", workspaceId, name)` creates
  one empty document.
- `grist_add_structure(action="copy_document_as_template", sourceDocumentId,
  workspaceId, name)` creates one native template copy and always fixes
  `asTemplate: true`.

No arbitrary import payload, file upload, full-data-copy toggle, workspace
auto-selection or permission mutation is model-visible.

## Authorization boundary

Destination authority is deliberately workspace-native and does not derive from
document membership.

For either creation action:

1. the deployment policy must explicitly allow the destination workspace ID;
2. one principal grant must name that same workspace and contain
   `doc.schema:write`;
3. the current principal-derived Grist credential performs the native request;
4. Grist's native workspace `ADD` check remains authoritative.

A document-only allowlist never authorizes its parent workspace. Capabilities
from unrelated grants are not combined into destination authority.

Template copy has one additional independent prerequisite: the source document
must pass Gia's ordinary `doc:read` document authorization. That local read
check is not treated as proof of native copy authority. The current upstream
credential still has to pass Grist's native template copy/download logic. Gia
does not add an extra source-Owner requirement in this initial implementation:
this deliberately preserves Grist's native `asTemplate` authorization
semantics rather than claiming every locally readable source can be copied.

Workspace discovery itself remains a read-only `grist_discover` action and
therefore uses a workspace `doc:read` grant. A create-capable workspace that
has no read grant is not disclosed by that action, although a caller already
holding its ID can still request creation and must then pass the independent
`doc.schema:write` destination check.

## Native Grist provenance

Rechecked immediately before implementation:

- repository: `gristlabs/grist-core`;
- observed `main`: `72345cbe06cad2ddeee4a9db1e133d82f1fd2294`;
- license: Apache-2.0;
- `app/gen-server/ApiServer.ts`: `POST /api/workspaces/:wid/docs` creates a
  document owned by the specified workspace through `HomeDBManager.addDocument`;
- `app/common/UserAPI.ts`: official `newDoc` uses that workspace endpoint,
  while official `copyDoc` posts `sourceDocumentId`, `workspaceId`,
  `documentName` and optional `asTemplate` to `POST /api/docs`;
- `app/server/lib/DocApi.ts`: same-installation copy resolves the source under
  the current caller, fetches/filters the source, then imports it into the
  explicit destination workspace; native permission failures remain server
  errors;
- native template filtering removes user-table data, attachments and history
  while retaining substantial metadata and disabling/filtering copy-sensitive
  state. It is not a general secret scrub.

Decision: **REIMPLEMENT the narrow official HTTP behavior** behind Gia's
existing semantic bridge. No Grist source code is copied. The Apache-2.0
upstream is used as the behavior oracle only.

The existing Expert advisory
`docs/expert/2026-10-04-r6-acl-document-boundaries-f0da0c8.md` was reread for
this slice. Applicability is **PARTIALLY STALE** as a repository snapshot because
C1 and the earlier R6 slices have since landed, but its C8 workspace-authority,
native-template and uncertainty findings remain current. The only deliberate
choice within its stated option space is to retain native non-Owner template
copy when Grist itself permits it, rather than adding the advisory's optional
extra Owner restriction. The implementation therefore explicitly separates
local source `doc:read` from native copy authorization.

## Creation and verification semantics

Document creation is non-idempotent.

If Grist returns a usable created document ID, Gia:

1. retains that exact ID;
2. invalidates the principal-local discovery cache;
3. re-discovers documents under the same principal-derived credential;
4. requires the new ID to resolve under the exact requested destination
   workspace and the principal's destination `doc.schema:write` grant;
5. returns `destinationMembershipVerified: true` only after that check.

A verification failure after a known ID raises
`DocumentBootstrapVerificationError` containing the known created ID and an
explicit no-blind-retry/no-guessed-cleanup instruction.

If a mutating request loses its response, receives a non-JSON success response,
or otherwise cannot yield a trustworthy created ID, the existing client safety
model classifies the effect as `UNCERTAIN`. Discovery is invalidated even on
that path so a later explicit reconciliation can observe fresh state. Gia does
not retry by document name, adopt a same-name document, guess the created ID,
or delete anything automatically.

Native creator ownership and destination workspace inheritance are disclosed
effects of Grist document creation. Gia does not rewrite those grants after the
fact.

## Explicit non-goals

C8 does not add:

- arbitrary `.grist`/CSV/file upload or import;
- full-data copy or clone mode;
- cross-installation copy;
- generic org/workspace/user/group/share/service-account administration;
- automatic workspace grants or creator-removal cleanup;
- name-based idempotency/deduplication;
- a durable workflow journal, planner or recovery state machine;
- a new OAuth/public capability or additional MCP tool;
- any claim that template copy sanitizes all metadata or preserves effective
  application ACL behavior.

These remain outside the finite R6 selection unless a future usage-driven
roadmap explicitly promotes them.
