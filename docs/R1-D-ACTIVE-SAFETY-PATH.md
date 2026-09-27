# R1-D — Minimal active safety path

Status: completed current-state audit; no runtime replacement justified  
Base: exact `main` `ee23bf172ee9d3238f98ff4af0fb67b8e052cf88`  
Date: 2026-09-27

## Decision

R1-D does **not** require a new runtime mechanism.

The current production server already executes Grist operations through the direct path:

```text
MCP / compatibility transport
  -> AuthorizedGristService
     -> GristService
        -> GristClient
           -> Grist Community API
```

UI mutations add only the targeted semantic adapters and re-read checks needed for private-reference translation and state preservation.

`src/server.ts` does not import `src/execution/*`, `src/j2/*`, `src/compat/*` or `src/grist/accessModelObserver.ts`. The generalized J1 execution journal/coordinator/recovery subsystem is therefore historical component-bank code, not an active runtime dependency.

The Pareto action for R1-D is consequently **KEEP the direct safety primitives and do not replace them with a new execution abstraction**. R3 may delete dormant residue after the lean candidate is integrated.

## Required R1-D invariants and where they already live

| Required invariant | Active implementation | R1-D disposition |
| --- | --- | --- |
| authority / capability check | `AuthorizationService` + `AuthorizedGristService.execute()` before Grist action | **KEEP** |
| principal isolation | `GristContextFactory` creates principal-bound authorized services; OAuth requests receive fresh principal-bound context | **KEEP** |
| input bounds | MCP schemas plus `GristService` read/write/schema limits and batching | **KEEP** |
| public/private boundary | `AuthorizedGristService` rejects public `_grist_*` targets and exposes normalized semantic inspection instead | **KEEP** |
| stable-ID translation | targeted UI/schema adapters resolve stable table/column/page/widget IDs to Grist private refs locally | **KEEP** |
| targeted post-write verification | page/widget writes re-read the affected semantic object and compare requested material fields | **KEEP** |
| preservation of unrelated state | UI update resolvers perform bounded read-modify-write and preserve untargeted widget options/layout state | **KEEP** |
| partial-result retention | `GristService` returns confirmed chunk progress rather than hiding partial completion | **KEEP** |
| ambiguous-write safety | client/service error semantics distinguish uncertain write effects and forbid whole-operation blind replay | **KEEP** |
| secret/output minimization | credentials remain server-side; audit records identities/operation metadata rather than secrets or arbitrary row content | **KEEP** |

## What is deliberately not promoted from J1

The following J1 mechanisms remain dormant and are not required by the lean direct-operation path:

- generalized execution journal;
- lifecycle/coordinator state machine;
- recovery orchestration;
- generalized step contracts/evidence envelopes;
- workflow-style execution planning.

Their useful lessons survive locally in the primitives above: bounded operations, explicit uncertainty, postconditions where material, and durable upstream Grist authority.

No migration layer is needed because the active server was already independent of the J1 execution subsystem before R1 began.

## Interaction with the R1-B candidate

The R1-B compact MCP candidate delegates its ten public tools directly to `AuthorizedGristService`; it does not introduce a planner, journal, transaction coordinator or internal desired-state engine. Therefore integrating R1-B preserves this R1-D path rather than creating a new one.

R1-C is also orthogonal: compacting inspection output does not alter mutation execution or authorization.

## Why no additional code change in this slice

Adding a new `SafetyExecutor`, `OperationRunner`, transaction wrapper or journal merely to make R1-D visible would recreate the architecture that the Pareto recomposition retired.

Deleting `src/execution/*` immediately would also be premature: the roadmap explicitly assigns final dead-residue cleanup to R3 after the lean candidate is coherent. Historical tests can continue to exercise that component-bank code while they remain cheap.

The smallest correct R1-D implementation is therefore a verified absence of active J1/J2 execution dependency plus preservation of the existing local safety seams.

## R3 removal boundary

Once R1-B/R1-C are integrated and the lean candidate is coherent, R3 may evaluate deletion of:

- `src/execution/*`;
- `src/j2/*`;
- `src/grist/accessModelObserver.ts`;
- obsolete v1 MCP registration/operation-contract compatibility code;
- historical J1/J2 tools/tests that no longer provide cheap regression value;
- GPT Actions/OpenAPI compatibility if it is no longer justified.

That cleanup must not remove the direct safety invariants listed above.

## Validation / review classification

No runtime, public contract, authorization rule, security boundary or retry behavior changes in this slice. It records the already-observed active import/execution path and the deliberate decision **not** to add another safety abstraction.

Review gate: **NOT REQUIRED** for this bounded current-state evidence document. Baseline CI is still required before integration.