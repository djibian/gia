# R0 preliminary runtime inventory

Observed exact `main`: `daa7d13c9fa44c10ec90f659661ce7d762f24050` on 2026-09-27.

Purpose: establish enough code reality to make the Pareto pivot concrete before R1-A performs the complete module/import inventory.

This is preliminary evidence, not the final R1-A deliverable.

## 1. Server entry path

`src/server.ts` imports the active server from these areas:

- `src/actions/*` — GPT Actions/OpenAPI compatibility;
- `src/audit/*`;
- `src/auth/*`;
- `src/config.ts`;
- `src/grist/*`;
- `src/mcp/*`;
- `src/operations/registry.ts`;
- `src/openaiAppsChallenge.ts`;
- versioning.

It does **not** import `src/j2/*` or `src/execution/*` in its top-level product path.

Immediate interpretation:

- J2 is not a runtime dependency of the MCP server;
- J0/J1 execution machinery is not the direct server orchestration layer;
- the active lean core already exists largely in `auth + grist + mcp + operations`;
- GPT Actions/OpenAPI is clearly separable compatibility code.

## 2. J2 directory

`src/j2` currently contains five files:

| File | Approx bytes | Preliminary classification |
|---|---:|---|
| `fixtureAccessObservation.ts` | 3,426 | DORMANT / R4-only candidate |
| `modelFacingIsolationProbe.ts` | 6,114 | DORMANT / R4-only candidate |
| `stageTrackingBrowserVerifier.ts` | 21,572 | DELETE from product path; optional R4 reference |
| `stageTrackingFixture.ts` | 10,670 | R4 validation material only |
| `stageTrackingSyntheticAccess.ts` | 21,370 | R4 validation material only |

Search results show stage-tracking imports remain inside `src/j2`, J2 tools and J2 tests/docs rather than the server path.

`package.json` exposes:

```text
j2:observe-fixture
j2:provision-synthetic-access
```

These are operator/test-development scripts, not server features.

R1-A should therefore test the smallest mechanical quarantine/removal:

- remove J2 npm scripts from the product package surface;
- move/delete J2 source from normal product compilation when no retained generic dependency is found;
- move any genuinely useful fixtures to R4 validation material rather than core `src`;
- retain historical docs in Git history or clearly historical docs only when useful.

## 3. Execution directory

`src/execution` currently contains:

| File | Approx bytes | Preliminary classification |
|---|---:|---|
| `concurrencyGuard.ts` | 2,028 | ADAPT / inspect for direct safety reuse |
| `deterministicUpdateRecordsRecovery.ts` | 11,047 | DORMANT unless direct operation needs it |
| `executionAuthority.ts` | 5,129 | DORMANT / extract small useful checks only |
| `executionJournal.ts` | 29,500 | DORMANT candidate |
| `executionLifecycle.ts` | 13,342 | DORMANT candidate |
| `syntheticUpdateRecordsEffectBoundary.ts` | 8,495 | TEST/PROOF infrastructure, not product core |
| `verificationCompletion.ts` | 15,421 | DORMANT candidate |
| `verificationEvidenceLifecycle.ts` | 8,573 | DORMANT candidate |

Repository search for `ExecutionJournal` shows usage concentrated within `src/execution`, J1 documentation and tests rather than the main server entry path.

Repository search for the concurrency guard likewise shows its direct use in J0 tests/documentation, not the active server path.

Preliminary conclusion:

> J0/J1 produced useful safety knowledge and standalone proof machinery, but the generalized execution subsystem appears largely **adjacent to**, not underneath, the current MCP server.

R1 should therefore preserve semantic guarantees rather than assume these modules must remain active architecture.

## 4. Build coupling

`tsconfig.json` currently includes:

```json
{"include":["src/**/*.ts"]}
```

Therefore dormant `src/j2` and `src/execution` code is still compiled even though it is not imported by `src/server.ts`.

This distinction matters:

```text
compiled != runtime dependency
```

A likely early R1 simplification is to make the production build graph reflect the actual product graph, while keeping any later validation-only code outside the main runtime source tree.

Do not perform that move until R1-A verifies every import/test/tool dependency.

## 5. Likely active core

The current server structure strongly suggests the following existing code is the starting component bank:

```text
src/auth
src/audit
src/grist
src/mcp
src/operations
src/config.ts
src/server.ts
```

`src/actions` is a separable historical compatibility surface to classify in R1-A/R3.

`src/openaiAppsChallenge.ts` is distribution-related and likely R5-only unless keeping it is effectively free.

## 6. Immediate Pareto implication

The repository does **not** require a rewrite to enact the new direction.

A plausible subtractive path is:

```text
current server core
- J2 product coupling
- generalized proof/orchestration code from active build
- duplicate compatibility surface where unjustified
+ compact MCP manager surface
+ selectively better context/semantics from external references
```

This is substantially smaller than continuing J2 -> J6.

## 7. R1-A exact next checks

After the recomposition PR is integrated, R1-A should:

1. enumerate every import reachable from `src/server.ts`;
2. enumerate build-only/test-only/tool-only modules;
3. inspect `src/grist`, `src/mcp`, `src/operations`, `src/actions` and `src/auth` file by file;
4. map every public v1 tool to the target conceptual responsibilities;
5. identify the first safe code deletion/quarantine PR;
6. compare overlapping modules against `gwhthompson/grist-mcp-server` and GristCoder before refactoring;
7. avoid architecture renames/moves unless they actually reduce code or contract complexity.
