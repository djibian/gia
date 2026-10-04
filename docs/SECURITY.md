# Security model

## Status

This document defines the security boundary for the MCP v2 product after completion of R5 production hardening and during the bounded R6 targeted-adoption work. Public-directory distribution is optional and currently deferred; retained R5-F submission material is historical preparation, not active security work.

The objective is a small set of enforceable invariants. Historical J0/J1/J2 mechanisms remain relevant only where their direct safety semantics survive in the active runtime.

## Trust boundary

```text
untrusted user/business content
        |
        v
MCP-capable LLM
        |
        v
Gia
  authenticated principal
  resource/capability restriction
  bounded semantic validation
  secret/output minimization
        |
        v
Grist
  authoritative permissions + state
```

The LLM is not trusted with credentials or arbitrary low-level Grist control. Grist is authoritative for the permissions attached to the selected upstream credential. The bridge can reduce that authority but never elevate it.

## Candidate authentication

The HTTP MCP endpoint supports two configured modes:

- **static bearer** — the minimum controlled-deployment mode; one configured MCP principal is created from the deployment resource ceiling and `MCP_CAPABILITIES`;
- **OAuth JWT/JWKS** — provider-neutral request authentication that creates a fresh principal-bound context per request.

Upstream Grist credentials are configured independently:

- **static** — one server-side `GRIST_API_KEY` through `StaticApiKeyCredentialProvider`, only for controlled single-principal/development deployments;
- **principal-map** — `FilePrincipalApiKeyCredentialProvider` reads an operator-mounted read-only mapping from opaque OAuth principal IDs to Grist Community service-account API keys.

Principal-map mode forbids a configured `GRIST_API_KEY`. Missing or invalid mappings fail closed with no shared-key fallback. The mapping is loaded once at startup, never written by the bridge and never model-visible. See `docs/CREDENTIALS.md`.

The historical GPT Actions bearer and OpenAI challenge routes are not part of the candidate runtime.

## Required invariants

### S1 — credentials are never model data

Never expose in MCP inputs/outputs, model-visible errors, audit payloads or committed files:

- Grist API keys or principal credential mapping contents;
- OAuth/bearer/refresh tokens;
- encryption/key-management material;
- session secrets;
- LinkKeys or secret webhook material.

Normalize or scrub secret-bearing URLs before logging or returning errors.

### S2 — principal isolation

A principal-derived Grist client, credential, context object, discovery result or cache entry must never be reused across principals without a key that proves the same principal/resource boundary.

Principal-map credential selection uses the bridge's opaque non-reversible OAuth principal ID, not the raw provider subject.

Static mode is explicitly a single controlled deployment principal and must not be described as multi-user upstream credential isolation.

### S3 — upstream authority is authoritative

The bridge never turns a read-only upstream Grist credential into a writer, never changes the acting principal's Grist role/grants, and never bypasses native Grist enforcement. A local capability check is an additional restriction, not a grant of upstream permission.

A supported **application-level policy** operation may deliberately change a document's native access-rule state when the Roadmap explicitly selects that capability, the principal has the required local capability, and Grist itself authorizes the upstream credential to make that policy change. Such a mutation changes application state; it does not elevate Gia's principal, create users/groups/shares, substitute a stronger credential, or bypass Grist's Owner checks.

In multi-principal production mode, each mapped service account keeps its own Grist-native grants, expiry and revocation boundary.

### S4 — no generic escape hatches

Do not expose model-controlled:

- generic HTTP forwarding;
- raw SQL merely for convenience;
- arbitrary Grist `/apply`;
- arbitrary UserAction payloads;
- arbitrary browser commands/JavaScript;
- arbitrary file/system commands.

When a low-level Grist action is unavoidable internally, hide it behind one versioned bounded semantic operation with fixed translation and validation.

### S5 — bounded mutation intentions

Every public mutation targets explicit resources and a finite supported action schema. Relevant counts, metadata fields and layout/configuration inputs are bounded.

Manager tools are acceptable only because their action variants are closed and individually understandable; they must not become generic dispatchers.

### S6 — stable semantic inputs

Prefer stable document/table/column/page/widget identifiers over private numeric metadata refs. Resolve private refs server-side and fail closed when exact resolution is unavailable.

### S7 — preserve untargeted state

For supported read-modify-write operations:

- read current state;
- identify the targeted sub-state exactly;
- preserve unrelated fields/options;
- write only the bounded semantic change;
- re-read when exact post-state verification is cheap and material.

Reject malformed or incomplete state when proceeding could overwrite unrelated human configuration.

### S8 — partial results survive

For non-atomic batches, retain/report confirmed completed targets. Do not collapse a partial write into a generic failure that invites whole-request replay.

### S9 — ambiguity is not failure

If an upstream effect may have happened but the response is lost or uncertain, do not classify it as definitely not applied and do not blindly replay non-idempotent work.

Re-read/reconcile when a capability-specific check can establish a safe outcome; otherwise return an explicit uncertain result. The generalized durable J1 execution journal is not required for this invariant.

### S10 — output minimization

Return what is required for the agent's next decision, not arbitrary upstream bodies or private Grist metadata. Discovery/inspection favors structure; business rows are read only through bounded queries.

All cell/formula/comment/external content is untrusted data and cannot alter authorization or tool policy.

## Authorization vocabulary

The candidate uses three capability classes:

```text
doc:read
doc:write
doc.schema:write
```

The effective ceiling is the intersection of selected upstream Grist authority, deployment document/workspace policy, principal resource grants and the operation capability.

For the R6 document-bootstrap capability, creation/copy into a workspace requires an explicit deployment workspace ceiling and one matching workspace grant on the same principal with `doc.schema:write`. Template copy additionally requires separately authorized source `doc:read`, while Grist's native source-copy and destination `ADD` checks remain authoritative. A document-only grant never authorizes creation in its parent workspace, and capabilities from unrelated grants must not be combined to manufacture destination authority. Creation/copy is non-idempotent: uncertain effects are never blindly replayed by name, and a known created ID is retained when postcondition verification fails.

For the integrated R6 application-policy capability, `doc.schema:write` is the local bridge requirement; upstream Grist Owner enforcement remains mandatory. `doc:write` alone does not authorize policy changes.

Any future production/public OAuth-scope expansion requires a new explicit product decision. Deferred publication work does not authorize weakening or broadening current authorization.

## Application policy versus identity administration

Stage-tracking ACLs, LinkKeys and other application-specific **policy choices** are not product security architecture. Gia must not infer domain rules or embed one application's access model.

A bounded generic capability for **application-level Grist access rules** is nevertheless distinct from identity/share administration and is integrated through R6 C1. Its security boundary is:

- inspect/modify only the supported document-policy semantics through stable table/column identities and a private bounded adapter;
- preserve untargeted persisted rules and refuse incomplete, censored, ambiguous or unsupported policy state;
- never expose arbitrary `_grist_` metadata, arbitrary `/apply`, raw UserActions, generic permission evaluation, LinkKey provisioning, or user/group/org/share/service-account administration;
- keep Grist authoritative for native Owner checks and effective enforcement;
- never claim that persisted-rule re-read alone proves effective confidentiality when native structure/formula permissions can alter what collaborators can derive.

R4 proved preservation of existing ACL effects. R6 C1 subsequently integrated the separately reviewed authoring capability under these stronger boundaries.

## Browser security

No generic browser control is part of the candidate. If later evidence requires browser-only validation, use bounded validation infrastructure; do not promote it to a model-facing capability without a new product decision.

## Testing policy

### R0-R3 construction

Preserve active security regressions plus focused tests around touched authorization, secret, stable-ID and ambiguous-write boundaries, alongside type/build/dependency checks.

Do not create a comprehensive application-security proof platform during construction.

### R4 validation

Exercise the integrated candidate against:

- principal isolation;
- read/write/schema authorization;
- secret/error/log leakage;
- destructive targeting;
- partial/ambiguous failure;
- permission-sensitive applications;
- browser-dependent behavior only where required;
- declared Grist Community compatibility.

Critical defects are repaired generically and affected validation rerun.

## Production security

R5-C replaced shared upstream authority for multi-principal production with Grist Community service-account credential selection from a protected read-only operator mapping. Its live completion evidence is recorded in `docs/R5-C-LIVE-EVIDENCE.md`: two real service accounts and two OAuth principals demonstrated distinct authority, native grant separation and unmapped-principal fail-closed behavior without a shared `GRIST_API_KEY` fallback.

R5-D completed rate limiting, secret-safe operational alert inputs, OAuth/JWKS outage and recovery, and exercised service-account credential rotation/revocation; its evidence is recorded in `docs/R5-D-LIVE-EVIDENCE.md`. R5-E completed the isolated reviewer/package qualification without adding model-facing credential, account or ACL administration. Secret-manager implementation, alert transport and log backend remain deployment infrastructure. R5-F public-directory publication is deferred and creates no active security requirement unless explicitly reactivated by a future product decision.