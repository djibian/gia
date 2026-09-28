# Architecture

## Status

This document describes the compact MCP v2 product after R4 validation and during R5 production hardening.

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
  principal -> service-account credential selection
        |
        v
Grist Community REST / bounded internal adapters
```

The product does not contain a general reasoning planner, business workflow engine or hidden application lifecycle state machine.

## Responsibility split

### MCP client / LLM

Owns understanding user intent, deciding relevant Grist information, multi-step reasoning/sequencing, satisfaction decisions and adaptation after tool results.

### `grist-chatgpt`

Owns discovery, compact semantic context, stable semantic inputs/outputs, bounded data/schema/UI intentions, private-reference translation, input/output bounds, principal/resource/capability enforcement, server-side selection of the current principal's configured upstream service-account credential, partial/ambiguous-write classification, preservation of unrelated state, targeted post-write verification and secret minimization.

### Grist

Owns records, formulas, native schema behavior, pages/widgets and native permissions. In multi-principal production mode, Grist Community service accounts are also the authoritative upstream identity/least-privilege primitive.

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
                         +-- static key (controlled/dev), or
                         `-- principal-map -> service-account key
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

`GristContextFactory` creates a fresh credential-derived client, discovery cache, access policy and authorized service graph for every principal context. It does not retain user-derived contexts across principals.

`StaticApiKeyCredentialProvider` remains for controlled single-principal/development use. `FilePrincipalApiKeyCredentialProvider` is the R5-C production multi-principal path: it loads an operator-mounted read-only JSON mapping once at startup and resolves only the exact opaque OAuth principal ID. Principal-map mode forbids a shared `GRIST_API_KEY` fallback.

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

These map to `discover`, `inspect`, `query`, `change_data`, `change_structure`, `change_ui` and `help`. Manager tools use closed action variants; there is no arbitrary multi-action dispatcher.

The historical MCP v1 registrars and GPT Actions/OpenAPI duplicate public surface are retired from the active product.

## Context and mutation architecture

The agent needs an application map, not a copy of all data. Compact inspection preferentially includes tables/columns, types/formulas, relations, pages/widgets, supported normalized layout/configuration and explicit incompleteness markers. Business rows are read only through bounded queries.

Mutations are ordinary bounded semantic operations, not persisted Builder plans. One semantic mutation may internally perform the small read/translate/write/re-read sequence needed for safety. Cross-operation orchestration remains with the MCP client.

Public inputs prefer stable Grist identifiers; private numeric metadata refs stay server-side. OAuth credential mapping likewise uses the bridge's stable opaque `oauth:<sha256>` principal ID rather than a raw provider subject.

For supported composite updates, the bridge resolves current state, preserves untargeted state and refuses the write when exact preservation cannot be established. Confirmed partial results survive; uncertain non-idempotent effects are never blindly replayed.

## Authorization architecture

The capability vocabulary is intentionally small:

```text
doc:read
doc:write
doc.schema:write
```

Effective bridge authority is bounded by native Grist authority of the selected upstream credential, deployment document/workspace ceiling, principal grants and required capability. The bridge may reduce upstream authority but cannot elevate it.

Static bearer + static Grist credential mode is the minimum controlled deployment. Provider-neutral OAuth/JWKS plus `principal-map` credentials is the production multi-principal path. Grist service-account creation/grants/rotation/revocation remain operator-side administration and are not model-facing product operations.

## Deliberate exclusions

The product excludes business-specific stage/CCF/CRM logic, internal planners, generic browser automation, wizard/sub-agent frameworks, lifecycle schedulers, generic webhooks/integrations, generic ACL/user/org/service-account administration, raw SQL, arbitrary `/apply`/UserAction/HTTP escape hatches, GPT Actions/OpenAPI duplicate transport and an internal credential database/secret-manager implementation.

## External reference position

- Grist official behavior is the functional oracle.
- Grist Community service accounts are **ADAPTED** as the R5-C upstream identity and least-privilege primitive; no Grist server code is copied.
- `gwhthompson/grist-mcp-server` informed compact manager-style tools/help.
- `nic01asFr/GristCoder` informed semantic application context.
- `Xe138/grist-mcp-server` informed the small capability/resource vocabulary without code reuse where licensing was unclear.
- `nic01asFr/mcp-server-grist` served as broad API/formula reference.

See `docs/RECOMPOSITION-REVIEW.md`, `docs/R3-DEPENDENCY-PROVENANCE.md`, `docs/R5-PRODUCTION-DISTRIBUTION-AUDIT.md` and `docs/CREDENTIALS.md` for provenance/licensing decisions.

## Construction versus production proof

R0-R3 constructed the candidate and R4 completed broad product validation. R5 adds only production-specific identity, credential, operations and distribution work.

R5-C repository implementation remains incomplete as production evidence until at least two real Grist Community service accounts demonstrate distinct upstream authority and no cross-principal client/cache reuse.
