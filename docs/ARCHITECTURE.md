# Architecture

## Status

This document defines the **target architecture after the 2026-09-27 Pareto recomposition**.

The current runtime on `main` still contains historical P0-P4/J0/J1 and some integrated J2-era components. Those are a component bank during R1; they are not all target architecture.

`docs/ROADMAP.md` controls migration order.

## Architectural objective

Keep the product thin:

```text
MCP-capable LLM
  reason / plan / orchestrate
        |
        v
grist-chatgpt
  compact MCP contract
  semantic Grist context
  bounded generic mutations
  safety normalization
        |
        v
Grist Community REST / bounded internal adapters
```

The product does not need its own general reasoning planner or business workflow engine.

## Responsibility split

### MCP client / LLM

Owns:

- understanding user intent;
- deciding which Grist information is relevant;
- multi-step reasoning;
- sequencing bounded operations;
- deciding what result satisfies the user's request;
- adapting the plan after tool results.

### `grist-chatgpt`

Owns:

- discovery of allowed Grist resources;
- compact semantic context;
- stable semantic inputs/outputs;
- bounded data/schema/UI intentions;
- translation between public stable identifiers and private Grist references;
- input/output bounds;
- principal/resource/capability enforcement;
- partial/ambiguous-write classification;
- preservation of unrelated state during supported read-modify-write operations;
- targeted post-write checks where they materially improve safety;
- data/secret minimization.

### Grist

Owns:

- data storage;
- formula execution;
- native schema behavior;
- native pages/widgets;
- native permissions and access rules;
- application state.

Do not reimplement Grist inside the bridge.

## Target conceptual MCP surface

```text
discover
inspect
query
change_data
change_structure
change_ui
help
```

This is a capability model, not a forced exact tool count.

A compact manager operation may use a closed discriminated action set, but every action must remain a clear bounded semantic intention. Do not create a generic arbitrary-action dispatcher.

## Context architecture

The agent needs an application map, not a copy of all data.

The compact context should preferentially include:

- tables and stable column IDs;
- types and formulas;
- Ref/RefList relationships;
- safe reverse-relation information when exactly resolvable;
- pages and stable widget IDs;
- supported normalized layout/configuration;
- explicit incompleteness/truncation markers;
- optionally a small observational delta useful to the current task.

Do not indiscriminately load business rows into context.

Unresolvable private Grist metadata is reported as incomplete rather than guessed.

GristCoder is the main external inspiration for context richness; existing `inspect_document` is the local starting implementation.

## Mutation architecture

Mutations should be ordinary bounded semantic operations, not a generalized internal Builder plan.

Typical LLM sequence:

```text
inspect
  -> change_structure
  -> change_ui
  -> query targeted state
```

The bridge may internally perform the small read/translate/write/re-read sequence required to make one semantic operation safe. It does not need to persist a general cross-operation workflow merely because the LLM invokes several operations.

### Stable identifiers

Public inputs prefer user-meaningful stable IDs:

- document IDs;
- table IDs;
- column IDs;
- stable current page/widget IDs where Grist exposes no better stable name.

Private numeric refs or metadata-table implementation details stay server-side.

### Preservation

When an operation changes one part of a composite Grist object, use read-modify-write only when the current state can be resolved safely and preserve untargeted fields/options.

If safe preservation cannot be established, refuse the mutation rather than overwriting unknown state.

### Partial and ambiguous effects

The useful J0/J1 semantic rules remain architectural invariants:

- preserve identities/results of already confirmed effects;
- distinguish proven no-effect from uncertain effect;
- do not blindly replay an uncertain non-idempotent write;
- return compact information that lets the LLM decide the next safe action.

A generalized durable journal is not required for every operation. R1 determines which existing J0/J1 mechanisms remain in the active path.

## Authorization architecture

Keep authorization vocabulary small unless product evidence requires more.

Current useful capability classes remain broadly equivalent to:

```text
doc:read
doc:write
doc.schema:write
```

The Grist credential determines actual upstream authority. The bridge may further restrict access but may never grant authority the credential does not have.

Per-principal Grist client/context isolation remains required.

Production OAuth and per-user credential custody are R5 concerns. They do not shape R1-R3 beyond preserving clean seams and never exposing secrets.

## External-reference architecture

### Grist official MCP

Functional oracle/convergence target. Prefer official Grist semantics where available.

### `gwhthompson/grist-mcp-server`

Reference for compact TypeScript manager-style tools and progressive help.

### `nic01asFr/GristCoder`

Reference for document/application context, relation graph, page awareness and observational plan/reality delta.

### `Xe138/grist-mcp-server`

Reference for simple resource/capability authorization.

### `nic01asFr/mcp-server-grist`

Reference for broad API/formula coverage when R2 identifies an actual missing capability.

See `docs/RECOMPOSITION-REVIEW.md` for reuse/licensing decisions.

## Components explicitly outside the R1-R3 architecture

- stage-tracking-specific schema, ACL and LinkKey behavior;
- generic browser automation;
- internal application-level behavioral-contract engine;
- generalized ImpactGraph;
- generalized ManagedScope machinery;
- wizard/UI confirmation framework;
- session phase state machine;
- sub-agent orchestration;
- generated custom-widget platform;
- lifecycle scheduler/monitor;
- generic webhooks/integrations;
- generic ACL/user/org administration;
- raw SQL model surface;
- arbitrary `/apply`/UserAction/HTTP escape hatches.

They may only return after a later evidence-based roadmap decision.

## Compatibility surfaces

MCP is authoritative.

The historical GPT Actions/OpenAPI adapter is compatibility debt. R1/R3 determines whether it can remain cheaply generated from the same core or should be retired. It must not force duplicate business logic or distort the MCP contract.

## Construction and validation

R1-R3 architecture work uses baseline CI and focused contract/unit tests only.

R4 validates the integrated candidate with business scenarios, multiple documents, failure/recovery and browser-dependent cases where actually relevant.

This sequencing prevents test/proof infrastructure from becoming architecture before the product surface is stable.
