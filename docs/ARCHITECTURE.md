# Architecture

## Status

This document describes the **MCP v2 product** after R4 validation and completion of R5 production hardening. Public-directory distribution is optional and currently deferred; retained R5-F material is historical preparation unless explicitly reactivated by a future human product decision.

`docs/ROADMAP.md` remains authoritative for tranche eligibility. Historical architecture and milestone documents remain evidence only.

## Architectural objective

Keep the product thin:

```text
MCP-capable LLM
  reason / plan / orchestrate
        |
        v
grist-chatgpt
  MCP v2 semantic tools
  compact Grist context
  bounded generic mutations
  authorization + safety normalization
        |
        v
Grist Community REST / bounded internal adapters
```

The product does not contain a general reasoning planner, business workflow engine or hidden application lifecycle state machine.

## Responsibility split

### MCP client / LLM

Owns:

- understanding user intent;
- deciding which Grist information is relevant;
- multi-step reasoning and sequencing;
- deciding what result satisfies the user's request;
- adapting after tool results.

### `grist-chatgpt`

Owns:

- discovery of allowed Grist resources;
- compact semantic context;
- stable semantic inputs/outputs;
- bounded data/schema/UI intentions;
- translation between public identifiers and private Grist references;
- input/output bounds;
- principal/resource/capability enforcement;
- server-side selection of the current principal's upstream credential;
- partial/ambiguous-write classification;
- preservation of unrelated state during supported read-modify-write operations;
- targeted post-write verification where material;
- data and secret minimization.

### Grist

Owns application state: records, formulas, native schema behavior, pages/widgets and native permissions. In multi-principal production mode, Grist Community service accounts are the upstream least-privilege identity primitive.

## Runtime composition

```text
HTTP /mcp
   |
   +-- static bearer -> one configured MCP Principal
   |
   `-- OAuth JWT/JWKS -> request Principal
            |
            v
    GristContextFactory
      |      |       |
      |      |       `-- deployment resource policy
      |      `---------- authorization + audit
      `----------------- credential-derived Grist client
            |
            v
   AuthorizedGristService
            |
            +-- semantic data/schema operations
            +-- DocumentUiService
            `-- bounded UI action adapter
            |
            v
       Grist Community
```

`GristContextFactory` creates a fresh credential-derived client, discovery cache, access policy and authorization/service graph for every principal context; principal-derived state is not reused across principals.

`StaticApiKeyCredentialProvider` remains for controlled single-principal/development use. R5-C adds `FilePrincipalApiKeyCredentialProvider`: it reads an operator-mounted mapping once at startup and resolves the exact opaque OAuth principal to a Grist Community service-account key. `principal-map` configuration forbids a shared `GRIST_API_KEY` fallback.

## Public MCP contract

MCP v2 exposes ten tools:

```text
grist_discover
grist_inspect
grist_query
grist_add_records
grist_change_records
grist_add_structure
grist_change_structure
grist_add_ui
grist_change_ui
grist_help
```

These map to the conceptual responsibilities:

```text
discover
inspect
query
change_data
change_structure
change_ui
help
```

Manager tools use closed action variants. One invocation is still one bounded semantic intention; there is no arbitrary multi-action dispatcher.

The historical MCP v1 registrars were removed in R3. GPT Actions/OpenAPI is also retired from the active candidate instead of being maintained as a second public contract.

## Context architecture

The agent needs an application map, not a copy of all data.

Compact inspection preferentially includes:

- tables and stable column IDs;
- types and formulas;
- Ref/RefList relationships;
- safe reverse-relation information when exactly resolvable;
- pages and stable widget IDs;
- supported normalized layout/configuration;
- explicit incompleteness/truncation markers.

Business rows are read only through bounded query operations. Unresolvable private Grist metadata is reported as incomplete rather than guessed.

## Mutation architecture

Mutations are ordinary bounded semantic operations, not persisted Builder plans.

A typical agent sequence is:

```text
grist_inspect
  -> grist_change_structure
  -> grist_change_ui
  -> grist_query
```

One semantic mutation may internally perform the small read/translate/write/re-read sequence needed for safety. Cross-operation orchestration remains with the MCP client.

### Stable identifiers

Public inputs prefer document IDs, table IDs, column IDs and stable current page/widget IDs. Private numeric metadata refs stay server-side.

The R5-C credential mapping likewise uses the bridge's non-reversible stable `oauth:<sha256>` principal ID rather than a raw provider subject.

### Preservation

For a supported composite update, the bridge resolves current state, preserves untargeted state and refuses the write if exact preservation cannot be established.

### Partial and ambiguous effects

The retained J0/J1 semantic rules are direct operation invariants:

- preserve confirmed completed targets/results;
- distinguish proven no-effect from uncertain effect;
- never blindly replay an uncertain non-idempotent write;
- expose compact information for the agent's next safe decision.

The retired generalized J1 journal/coordinator is not part of the active candidate.

## Authorization architecture

The capability vocabulary is intentionally small:

```text
doc:read
doc:write
doc.schema:write
```

Effective bridge authority is bounded by the selected upstream Grist credential, deployment document/workspace ceiling, principal grants and required capability. The bridge may reduce upstream authority but cannot elevate it.

Static bearer mode plus static Grist credential mode is the minimum controlled deployment. Provider-neutral OAuth/JWKS plus `principal-map` credentials is the production multi-principal path. Service-account creation/grants/expiry/rotation/revocation remain operator-side Grist administration, not model-facing product operations.

## Deliberate exclusions

The R3 candidate excludes:

- business-specific stage/CCF/CRM logic;
- internal application planner/contract engine;
- generalized ImpactGraph/ManagedScope machinery;
- generic browser automation;
- wizard or sub-agent frameworks;
- generated custom-widget platform;
- lifecycle scheduler/monitor;
- generic webhooks/integrations;
- generic ACL/user/org/service-account administration;
- raw SQL model surface;
- arbitrary `/apply`, UserAction or HTTP escape hatches;
- GPT Actions/OpenAPI duplicate public transport;
- an internal credential database or secret-manager implementation.

Historical code/documents for later production or distribution work may remain outside the runtime path.

## External reference position

- Grist official behavior is the functional oracle.
- Grist Community service accounts are **ADAPTED** for R5-C as the upstream identity/least-privilege primitive; no Grist server code is copied.
- `gwhthompson/grist-mcp-server` informed compact manager-style tools/help.
- `nic01asFr/GristCoder` informed semantic application context.
- `Xe138/grist-mcp-server` informed the small capability/resource vocabulary without code reuse where licensing was unclear.
- `nic01asFr/mcp-server-grist` served as broad API/formula reference.

See `docs/RECOMPOSITION-REVIEW.md`, `docs/R3-DEPENDENCY-PROVENANCE.md`, `docs/R5-PRODUCTION-DISTRIBUTION-AUDIT.md` and `docs/CREDENTIALS.md` for provenance/licensing decisions.

## Construction versus validation

R0-R3 kept only baseline CI and focused unit/contract regressions needed to maintain the candidate. R4 performed broad product validation. R5 added production-specific identity, credential, operational-hardening and reviewer-package evidence without broadening the lean MCP v2 runtime.

R5-C production evidence is recorded in `docs/R5-C-LIVE-EVIDENCE.md`; R5-D operational-hardening evidence is recorded in `docs/R5-D-LIVE-EVIDENCE.md`; R5-E reviewer/package qualification is recorded in `docs/R5-E-LIVE-EVIDENCE.md`. Those technical hardening tranches are complete. R5-F public-directory publication is deferred optional future work and is not an active architectural dependency.