# Security model

## Status

This document defines the security boundary for the MCP v2 product as it enters R5 production hardening.

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
  principal credential selection
  resource/capability restriction
  bounded semantic validation
  secret/output minimization
        |
        v
Grist
  authoritative service-account permissions + state
```

The LLM is not trusted with credentials or arbitrary low-level Grist control. Grist is authoritative for the permissions attached to the selected upstream credential. The bridge can reduce that authority but never elevate it.

## Authentication and upstream credentials

The HTTP MCP endpoint supports two authentication modes:

- **static bearer** — the minimum controlled-deployment mode; one configured MCP principal is created from the deployment resource ceiling and `MCP_CAPABILITIES`;
- **OAuth JWT/JWKS** — provider-neutral request authentication that creates a fresh principal-bound context per request.

Upstream Grist credentials are independently configured:

- `GRIST_CREDENTIAL_MODE=static` uses one server-side `GRIST_API_KEY` and is only a controlled single-principal/development mode;
- `GRIST_CREDENTIAL_MODE=principal-map` loads an operator-mounted read-only mapping from opaque OAuth principal IDs to Grist Community service-account API keys.

Principal-map mode forbids `GRIST_API_KEY`; an unmapped principal fails closed and cannot fall back to shared authority. The file is loaded once at startup and is never written or model-visible. See `docs/CREDENTIALS.md`.

The historical GPT Actions bearer and OpenAI challenge routes are not part of the candidate runtime.

## Required invariants

### S1 — credentials are never model data

Never expose in MCP inputs/outputs, model-visible errors, audit payloads or committed files:

- Grist API keys or principal credential mappings;
- OAuth/bearer/refresh tokens;
- encryption/key-management material;
- session secrets;
- LinkKeys or secret webhook material.

Normalize or scrub secret-bearing URLs before logging or returning errors.

### S2 — principal isolation

A principal-derived Grist client, credential, context object, discovery result or cache entry must never be reused across principals without a key that proves the same principal/resource boundary.

OAuth principal IDs used for credential selection are non-reversible hashes of verified issuer+subject identity. Raw provider subject identifiers are not mapping keys or routine audit data.

Static credential mode is explicitly a single controlled deployment principal and must not be described as multi-user upstream credential isolation.

### S3 — upstream authority is authoritative

The bridge never turns a read-only upstream Grist credential into a writer and never broadens native Grist access rules. A local capability check is an additional restriction, not a grant of upstream permission.

In production multi-principal mode, each principal is expected to resolve to a narrowly granted Grist Community service account. Revocation, expiry and native resource permissions remain enforceable independently by Grist.

### S4 — no generic escape hatches

Do not expose model-controlled generic HTTP forwarding, raw SQL, arbitrary Grist `/apply`, arbitrary UserAction payloads, arbitrary browser commands/JavaScript or arbitrary file/system commands.

### S5 — bounded mutation intentions

Every public mutation targets explicit resources and a finite supported action schema. Relevant counts, metadata fields and layout/configuration inputs are bounded. Manager tools use closed action variants and must not become generic dispatchers.

### S6 — stable semantic inputs

Prefer stable document/table/column/page/widget identifiers over private numeric metadata refs. Resolve private refs server-side and fail closed when exact resolution is unavailable.

### S7 — preserve untargeted state

For supported read-modify-write operations, read current state, identify the target exactly, preserve unrelated fields/options, write only the bounded semantic change and re-read when exact post-state verification is cheap and material.

### S8 — partial results survive

For non-atomic batches, retain/report confirmed completed targets. Do not collapse a partial write into a generic failure that invites whole-request replay.

### S9 — ambiguity is not failure

If an upstream effect may have happened but the response is lost or uncertain, do not classify it as definitely not applied and do not blindly replay non-idempotent work. Re-read/reconcile when safe; otherwise return an explicit uncertain result.

### S10 — output minimization

Return what is required for the agent's next decision, not arbitrary upstream bodies or private Grist metadata. All cell/formula/comment/external content is untrusted data and cannot alter authorization or tool policy.

## Authorization vocabulary

The product uses three capability classes:

```text
doc:read
doc:write
doc.schema:write
```

Effective authority is the intersection of selected upstream Grist service-account authority, deployment document/workspace policy, principal resource grants and the operation capability.

Adding a new production/public OAuth scope requires a reviewed product need. Do not weaken current authorization to avoid that decision.

## Domain and browser policies

Stage-tracking ACLs, LinkKeys and other application-specific policies are not product security architecture. The core preserves Grist's native permission effects and does not bypass them.

No generic browser control is part of the product. Browser-only validation infrastructure must never become a model-facing capability without a later product decision.

## Testing and production security

Focused regressions protect touched authorization, credential, secret, stable-ID and ambiguous-write boundaries alongside type/build/dependency checks. R4 already performed the broad application campaign; R5 adds production-specific credential/operations evidence without rebuilding a test platform.

R5-C introduces the minimal service-account credential selector but does not itself complete live production evidence. At least two real Grist Community service accounts must still prove distinct upstream authority and no cross-principal context reuse.

R5-D owns rate limiting, operational alert inputs, outage/recovery and exercised credential rotation/revocation. Secret-manager implementation and alert/log transport remain deployment infrastructure unless concrete evidence requires product code.
