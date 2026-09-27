# R1-A — Active runtime inventory and removal map

Status: **completed inventory for R1-A**  
Base examined: exact `main` `1139b1f13e652f1ec8ef82677700fa401596aa99`  
Date: 2026-09-27

This document classifies the current TypeScript implementation by its actual import/runtime role after the Pareto recomposition. Old J0/J1/J2 milestone labels are evidence only; the classification below follows the executable server path and the R1 product boundary.

## Method

The audit started at `src/server.ts`, followed its direct construction path, then checked adjacent source groups, package scripts, TypeScript compilation inputs and repository references for the retired J1/J2 subsystems.

The current production entry point constructs the product from:

```text
server.ts
  -> config
  -> auth/*
  -> audit/auditLogger
  -> grist/accessPolicy + credentials + contextFactory
       -> authorizationService
       -> grist/service + client
       -> authorizedService
       -> document/UI normalization and UI adapters
  -> operations/registry + progressiveHelp
  -> mcp/{core,discovery,schema,ui}Tools
  -> actions/*                    # GPT Actions/OpenAPI compatibility
  -> openaiAppsChallenge          # submission compatibility
```

`src/server.ts` does **not** import `src/execution`, `src/j2` or `src/compat`.

The normal build currently compiles every `src/**/*.ts`, so “compiled” is wider than “reachable from the product entry point”. The extra `tsconfig.poc-tools.json` also type-checks a selected set of historical deployment/submission tools.

## Classification summary

| Area | Classification | R1 disposition |
| --- | --- | --- |
| `src/server.ts` | **ADAPT** | Keep as the entry point, but simplify it around MCP-first composition. Separate compatibility registration from the core during R1-B/R1-D rather than adding another orchestration layer. |
| `src/config.ts` | **ADAPT** | Keep the small runtime limits/auth configuration needed by the MCP core. Production/submission-only knobs should stop shaping the core and may be isolated or deferred. |
| `src/auth/principal.ts`, `authorizationService.ts`, request-context and credential seams | **KEEP** | These directly enforce capability checks and principal isolation. Preserve the per-principal boundary. |
| OAuth/JWKS support under `src/auth` | **KEEP** | It is part of the current MCP transport/security path and is not redundant with J1/J2. Do not simplify by weakening authentication or principal separation. |
| `src/audit/auditLogger.ts` | **KEEP** | Small secret-safe operational audit primitive used by the active authorized service. |
| `src/grist/client.ts` | **KEEP** | Direct Grist transport primitive. It is the correct low-level boundary and already carries uncertain-effect information used by safe mutation semantics. |
| `src/grist/service.ts` | **KEEP / ADAPT narrowly** | Retain bounds, batching, partial-result reporting and uncertain-write semantics. R1-D may remove duplication around it, but not these safety properties. |
| `src/grist/accessPolicy.ts`, `credentials.ts`, `contextFactory.ts` | **KEEP** | They enforce deployment bounds, fresh principal-derived clients/context and non-cross-principal discovery state. |
| `src/grist/authorizedService.ts` | **ADAPT** | This is the active semantic business layer and contains useful authorization, output minimization and targeted UI verification. It is broad and coupled to the 23-operation registry; R1-B/R1-D should reshape, not replace, it. |
| `src/grist/documentContext.ts`, `documentUi.ts`, `publicMetadata.ts`, `formulaInspector.ts` | **KEEP / ADAPT** | Strong basis for R1-C compact application context. Consolidate overlapping inspection outputs instead of rebuilding context. |
| UI helpers (`pageLayout`, `uiActionsAdapter`, `selectBy*`, `widgetSort`, `customWidgetSettings*`, `gridOptions`, chart types) | **KEEP / ADAPT** | These hide private Grist references and preserve/re-read unrelated UI state. Keep the stable semantic translation; expose it through a smaller R1-B public contract. |
| `src/grist/accessModelObserver.ts` | **DORMANT** | J2-only access-model proof machinery. It is referenced by J2/test evidence, not by `server.ts`. Keep temporarily as historical component-bank code; no R1 product dependency. |
| `src/mcp/*Tools.ts`, `results.ts`, output schemas | **ADAPT** | Active MCP surface. Preserve bounded schemas and risk annotations, but collapse the public contract toward the lean conceptual responsibilities instead of carrying tool-per-primitive duplication indefinitely. |
| `src/operations/registry.ts`, `progressiveHelp.ts` | **ADAPT** | Useful single catalog/help idea, but today metadata is duplicated again in MCP schemas and GPT Actions/OpenAPI. R1-B should make one compact MCP contract authoritative. |
| `schemaMutationContract.ts` | **KEEP / ADAPT** | Useful bounded schema vocabulary; keep only what the lean structure mutation contract needs. |
| `submissionAnnotations.ts` | **DORMANT** | Distribution/submission evidence, deferred to R5. It must not shape the R1 public contract. |
| `src/actions/*` | **ADAPT, compatibility only** | Still reachable because `server.ts` registers GPT Actions/OpenAPI routes. MCP is now primary; isolate this compatibility surface from the core and decide its final retention in R3. Do not duplicate new R1 semantics into Actions first. |
| `src/openaiAppsChallenge.ts` | **ADAPT, compatibility only** | Currently imported by the server but serves distribution/submission compatibility rather than core Grist semantics. Keep inert compatibility for now; do not expand it in R1-R2. |
| `src/compat/*` | **DORMANT** | Logto/ProConnect compatibility/POC code is not imported by the product entry point. Production identity work is R5. |
| `src/execution/*` | **DORMANT** | J1 journal/lifecycle/coordinator/recovery proof subsystem is not imported by the current server graph. Its safety lessons remain valuable, but the generalized journal/orchestration machinery is not an R1 dependency. |
| `src/j2/*` | **DORMANT** | Stage-tracking fixture, access observation/isolation and browser-verification subsystem. Entirely outside the product runtime and retired from the construction roadmap. |
| `tools/j2-*` | **DORMANT** | Historical J2 observation/provisioning commands. Their npm exposure is removed in this slice; files remain for history until R3 dead-code cleanup. |
| OAuth/deployment/submission tools under `tools/` | **DORMANT for R1-R3** | Useful R5 evidence, but not product-construction dependencies. Keep them without extending them. |
| `test/*` generic runtime regressions | **KEEP** | Existing cheap regression feedback remains per G6. Add only focused tests for new R1 behavior. |
| `test/*` J1/J2/domain proof suites | **DORMANT evidence** | Existing tests may remain and run while cheap, but R1 must not extend them or make new domain/browser proof infrastructure a dependency. R4 owns comprehensive validation. |

## Findings by product responsibility

### Discover / inspect

The existing implementation already has a strong reusable core:

- `listDocuments`, `listTables`, `listColumns`;
- `inspectDocument` through `DocumentContextService`;
- normalized page/widget inspection through `DocumentUiService`;
- output projection that hides internal metadata tables and private references.

R1-C therefore needs consolidation, not a new context framework.

### Query / change_data

`GristService` already provides bounded reads/writes, batching, confirmed partial work and explicit uncertain-write errors. `AuthorizedGristService` adds per-operation authorization/audit and rejects public access to internal `_grist_*` tables.

These are **KEEP** semantics. The lean surface should call them directly or through a thinner authorized boundary rather than routing through the dormant J1 execution journal.

### change_structure

The active schema path is already direct:

```text
MCP schema tool -> AuthorizedGristService -> GristService -> GristClient
```

The current split into several public schema primitives is a contract-shaping issue for R1-B, not evidence that a new execution engine is needed.

### change_ui

The current UI path contains high-value Grist-specific translation that should survive simplification: stable public widget/page identifiers, conversion to private refs, complete-snapshot refusal, preservation of untargeted widget options and post-write re-read verification.

R1-B should expose these capabilities more compactly; R1-D should keep the targeted safety logic local to the operation instead of introducing a generic journal.

### help

`progressiveHelp` plus the operation registry is a useful seed. Its current weakness is that the registry, MCP registrations and GPT/OpenAPI compatibility schemas all describe overlapping contracts separately.

R1-B should establish one MCP-first source of truth and let any retained compatibility surface adapt from it rather than evolve independently.

## Retired J1/J2 dependency conclusion

The reachable product graph does not depend on `src/execution` or `src/j2`. Their current effect on normal construction is indirect only:

1. `tsconfig.json` compiles all `src/**/*.ts`, including dormant code;
2. the test suite imports historical J1/J2 modules;
3. package scripts expose two J2 utilities;
4. `tsconfig.poc-tools.json` explicitly includes `tools/j2-access-observe.ts`.

Therefore R1 does **not** need to rewrite or migrate the server away from J1/J2 before building the lean surface; it is already independent at runtime.

R1-A deliberately does not delete these source trees. R3 owns final dead/dormant residue removal after the lean candidate no longer needs comparison evidence.

## Minimal mechanical removals in this slice

Only two current-work signals are removed:

1. delete `j2:observe-fixture` and `j2:provision-synthetic-access` from `package.json`;
2. remove `tools/j2-access-observe.ts` from the POC/tool TypeScript check list.

This does not change the production server, MCP contract, authorization semantics, Grist write semantics or security boundaries. The historical files/tests stay available as component-bank evidence.

## External-reference disposition for R1-A

No external code is copied or adapted in this slice. R1-A is a local reachability/removal audit. It relies on the already-reviewed R0 reference classification in `docs/RECOMPOSITION-REVIEW.md` and records the local components that R1-B/R1-C must compare against those references before implementation.

The next reference-first comparisons are therefore:

- **R1-B:** official Grist MCP behavior + `gwhthompson/grist-mcp-server` manager/help shape versus current `mcp/*Tools` + `operations/registry` + `AuthorizedGristService`;
- **R1-C:** GristCoder context/relationship/page ideas versus current `inspect_document`/`DocumentContextService`/`DocumentUiService`;
- **R1-D:** current direct operation safety versus only the small safety primitives worth retaining from J0/J1, without reviving journal/lifecycle orchestration.

## Removal map

### Remove from active construction now

- J2 npm command exposure;
- J2 observer inclusion in the POC/tool type-check configuration.

### Keep dormant until R3 cleanup

- `src/j2/*`;
- `src/execution/*`;
- `src/grist/accessModelObserver.ts`;
- `src/compat/*`;
- J1/J2 historical tests and tools;
- R5 production/submission probes and evidence.

### Adapt during R1-B/R1-C/R1-D

- server composition;
- MCP tool registrations and operation registry;
- authorized semantic layer;
- compact document/UI context;
- GPT Actions/OpenAPI compatibility isolation;
- only the active safety seams needed by direct bounded operations.

## R1-A exit decision

R1-A is complete when this inventory and the two mechanical retirements are integrated. No runtime refactor is justified inside this slice.

The highest-value next committed work is **R1-B — compact MCP surface**, with R1-C context consolidation able to follow once the public responsibility boundaries are explicit.