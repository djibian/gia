# R3 — Candidate cleanup

Date: 2026-09-27

Baseline: `151dfc5068db14dab115eadc1b8b779fb73cde6f` after R2 integration.

## Purpose

R3 turns the lean R1/R2 runtime into a candidate worth validating. This cleanup removes executable residue that the current product no longer reaches, while preserving historical design/evidence documents and retaining compatibility code that still has a concrete later purpose.

## Current reachability result

The current product entry point is `src/server.ts`. Its active runtime imports the MCP/auth/audit/Grist semantic path plus the still-exposed GPT Actions/OpenAPI compatibility path. It does not import:

- `src/execution/*`;
- `src/j2/*`;
- `src/grist/accessModelObserver.ts`;
- `src/compat/*`.

Repository-reference checks show that `src/execution/*`, `src/j2/*` and `src/grist/accessModelObserver.ts` are referenced only by their historical J0/J1/J2 tests/tools and historical documentation. They are therefore removable from the candidate together with those executable tests/tools.

Historical J0/J1/J2 documents remain in `docs/` as evidence and future R4 reference material; they are not compiled or runtime dependencies.

## Removed from the candidate

### Retired J1 execution subsystem

Remove all of `src/execution/*` and the tests whose only purpose is to exercise that dormant subsystem. The active mutation path remains direct:

`transport -> AuthorizedGristService -> GristService -> GristClient -> Grist`

This does not remove the safety properties already implemented in that active path: authority checks, bounded inputs, partial-result reporting, uncertain-write/no-blind-replay semantics, stable-ID translation, targeted UI preservation/verification, principal isolation and secret minimization.

### Retired J2 application/proof machinery

Remove all of `src/j2/*`, the two remaining J2 operator tools, their J2-only tests, and `src/grist/accessModelObserver.ts` plus its dedicated tests. Stage tracking remains an R4 validation case, not candidate architecture. R4 will prepare the smallest current validation fixture/instrumentation needed against the frozen candidate rather than carrying the retired construction-time J2 framework forward.

## Deliberately retained

### `src/compat/*` and production/OAuth probes

Retained for now with an explicit reason: the Logto/ProConnect compatibility modules are used by existing production-identity probes, and production identity is explicitly deferred to R5. They are not imported by `src/server.ts` and do not shape the MCP contract. Removing them now would destroy potentially reusable R5 evidence without simplifying the active candidate runtime.

### GPT Actions/OpenAPI compatibility

`src/actions/*` and `src/openaiAppsChallenge.ts` are **not** dead code: `src/server.ts` still imports and registers them. Their final migration/retention position is therefore R3 contract work, not mechanical dead-code cleanup. They are intentionally untouched in this slice.

## What this cleanup does not do

- no MCP tool or semantic operation changes;
- no Grist read/write behavior changes;
- no authorization/capability changes;
- no credential or principal-boundary changes;
- no new validation harness;
- no deletion of historical documentation;
- no premature R5 production/distribution work.

## Validation expectation

Because the deleted modules are unreachable from the candidate entry point, baseline construction CI is sufficient: TypeScript/check, retained unit/contract regressions, dependency audit and build. The retained active tests remain the proof that candidate behavior still compiles and passes after the residue is removed.
