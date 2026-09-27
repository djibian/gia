# Security model

## Status

This document defines the security boundary for the Pareto-recomposed product.

The objective is **small enforceable invariants**, not a security subsystem larger than the product. Historical J0/J1/J2 mechanisms remain useful only where they directly enforce these invariants.

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

The LLM is not trusted with credentials or arbitrary low-level Grist control.

Grist is authoritative for the authority attached to the upstream credential. The bridge can reduce that authority but never elevate it.

## Required invariants

### S1 — credentials are never model data

Never expose in MCP inputs/outputs, model-visible errors, audit payloads or committed files:

- Grist API keys;
- OAuth/bearer/refresh tokens;
- encryption/key-management material;
- session secrets;
- LinkKeys or secret webhook material.

Normalize/scrub secret-bearing URLs before logging or returning errors.

### S2 — principal isolation

A principal-derived Grist client, credential, context object, discovery result or cache entry must never be reused across principals without a key that proves the same principal/resource boundary.

Development may use an explicit static credential mode, but it must not be described as multi-user isolation.

### S3 — upstream authority is authoritative

The bridge never turns a read-only Grist principal into a writer and never broadens native Grist access rules.

A local capability check is an additional restriction, not a grant of upstream permission.

### S4 — no generic escape hatches

Do not expose model-controlled:

- generic HTTP forwarding;
- raw SQL merely for convenience;
- arbitrary Grist `/apply`;
- arbitrary UserAction payloads;
- arbitrary browser commands/JavaScript;
- arbitrary file/system commands.

When an internal Grist action is unavoidable, hide it behind one versioned bounded semantic operation with fixed translation and validation.

### S5 — bounded mutation intentions

Every public mutation targets explicit resources and a finite supported action schema.

Set limits on relevant record counts, fields, payload size, metadata keys, layout complexity or other inputs that could otherwise create unbounded work/state.

A compact manager tool is acceptable only when its `action` variants remain closed and individually understandable; it must not become a generic dispatcher.

### S6 — stable semantic inputs

Prefer stable Grist document/table/column/page/widget identifiers over private numeric metadata refs.

Resolve private refs server-side and fail closed when exact resolution is unavailable.

### S7 — preserve untargeted state

For supported read-modify-write operations:

- read current state;
- validate that the targeted sub-state can be identified exactly;
- preserve unrelated fields/options;
- write only the bounded semantic change;
- re-read when exact post-state verification is cheap/material.

Reject malformed/incomplete state when proceeding could overwrite unrelated human configuration.

### S8 — partial results survive

For non-atomic batches, report/retain confirmed completed targets. Do not collapse a partially successful write into a generic failure that invites whole-request replay.

### S9 — ambiguity is not failure

If the upstream effect may have happened but the response is lost/uncertain, do not classify it as definitely not applied.

Do not blindly replay non-idempotent or conditionally idempotent work. Re-read/reconcile when a capability-specific check can establish a safe outcome; otherwise return an explicit ambiguous/unknown result.

This invariant is retained from J0/J1 without requiring every operation to run through a generalized durable workflow engine.

### S10 — output minimization

Return the information required for the next agent decision, not arbitrary upstream response bodies or private Grist metadata.

Discovery/context should prefer schema and metadata. Read business rows only when the requested task needs them and keep query bounds explicit.

Cells, attachments, comments, formulas and external data are untrusted content. They may inform the user's data task but cannot change authorization or tool policy.

## Authorization vocabulary

Keep the public capability model minimal unless evidence requires expansion.

The current useful classes are:

```text
doc:read
doc:write
doc.schema:write
```

R1 may simplify internal authorization implementation but must preserve the ability to distinguish these authorities and bind them to allowed resources/principals.

Adding a new production/public OAuth scope is an R5 decision and does not block R1-R4; capabilities needing such a scope are deferred rather than weakening current authorization.

## Domain access policies

Stage-tracking ACLs, LinkKeys and other application-specific policies are **not product security architecture**.

The core must preserve Grist's native permission effects and must not bypass them. Whether a particular application policy works as intended is tested in R4 when that application becomes a validation case.

Do not build a generic ACL reader/writer/browser test platform during R1-R3 solely to prove one application.

## Browser security

No generic browser control is part of the initial product.

If R4 needs browser-only evidence for a validated Grist behavior, use a maintained bounded test runner and secret-safe fixtures. That test adapter is validation infrastructure unless a later product decision establishes a generic user-facing browser capability.

The closed J2 custom CDP transport from PR #158 is not an R1 dependency.

## External implementation reuse

Security code copied or adapted from external projects requires:

- confirmed license compatibility;
- review of threat-model differences;
- no regression from current invariants simply because the external implementation is shorter;
- explicit provenance in the PR.

A simpler external authorization model is design evidence; it is not automatically safe for this deployment model.

## Testing policy

### R1-R3 construction

Preserve:

- existing security regression tests still covering active code;
- focused tests around newly touched authorization/secret/ambiguous-write boundaries;
- static/type/build/dependency checks.

Do not require a new comprehensive application-security proof platform before the product candidate exists.

### R4 validation

Perform the integrated security campaign against the actual candidate:

- cross-principal isolation;
- read/write/schema authorization boundaries;
- secret/error/log leakage;
- destructive targeting;
- partial/ambiguous failure;
- application permission-sensitive cases;
- browser-dependent policies only where needed;
- supported Grist Community versions.

Critical defects found in R4 are repaired generically and the affected validation is rerun.

## Production security

Production OAuth, encrypted per-user Grist credential persistence/key custody, rate limiting, operational alerting, secret rotation and deployment/reviewer hardening are R5.

Existing C4/C5/C6 work is retained as historical evidence/components. It is deliberately not a prerequisite for building or validating the lean product in controlled environments.

No R1-R4 success may be represented as proof that production credential custody or multi-user hardening is complete.
