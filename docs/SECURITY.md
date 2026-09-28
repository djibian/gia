# Security model

## Status

This document defines the security boundary for the MCP v2 product during R5 production hardening.

The objective is a small set of enforceable invariants. Historical J0/J1/J2 mechanisms remain relevant only where their direct safety semantics survive in the active runtime.

## Trust boundary

```text
untrusted user/business content
        |
        v
MCP-capable LLM
        |
        v
grist-chatgpt
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

The bridge never turns a read-only upstream Grist credential into a writer and never broadens native Grist access rules. A local capability check is an additional restriction, not a grant of upstream permission.

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

Adding a new production/public OAuth scope is an R5 decision. Do not weaken current authorization to avoid that future decision.

## Domain access policies

Stage-tracking ACLs, LinkKeys and other application-specific policies are not product security architecture.

The core must preserve Grist's native permission effects and must not bypass them. Specific application-policy behavior is exercised during R4 validation rather than by embedding a generic ACL reader/writer/browser platform into the bridge.

## Browser security

No generic browser control is part of the candidate. If R4 requires browser-only evidence, use bounded validation infrastructure; do not promote it to a model-facing capability without a later product decision.

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

R5-C replaces shared upstream authority for multi-principal production with Grist Community service-account credential selection from a protected read-only operator mapping. Live R5-C completion still requires at least two real service accounts proving distinct upstream authority and no cross-principal client/context/cache reuse.

R5-D owns rate limiting, operational alert inputs, outage/recovery and exercised service-account credential rotation/revocation. Secret-manager implementation, alert transport and log backend remain deployment infrastructure unless a concrete need proves otherwise.
