# MCP contract

Current contract: **`grist-chatgpt` MCP v2**

The contract version describes the model-facing MCP tool surface. It is intentionally independent from the package/server implementation version.

## v2 surface

A v2 server exposes exactly these ten tools:

| Tool | Intent |
| --- | --- |
| `grist_discover` | discover documents, tables or columns |
| `grist_inspect` | inspect compact semantic document/page/widget context |
| `grist_query` | query a bounded set of records |
| `grist_add_records` | create a bounded record batch |
| `grist_change_records` | update or delete explicitly targeted records |
| `grist_add_structure` | create bounded tables or columns |
| `grist_change_structure` | update, rename or delete targeted tables/columns |
| `grist_add_ui` | create one page or add one widget |
| `grist_change_ui` | mutate/delete explicitly targeted supported UI |
| `grist_help` | progressive disclosure of the current contract |

`grist_help` returns `contractVersion: "2"` so a client can identify the contract without relying on implementation version strings.

One invocation still represents one bounded semantic intention. Manager-style tools use an `action` discriminator; they do not accept an arbitrary operation list or a generic Grist `/apply` payload.

## Compatibility and migration

### Historical MCP v1

The historical MCP v1 exposed 23 granular tools. It stopped being registered by the server when the lean R1-B surface became active. R3 removes the dormant v1 registration modules and their contract-only regression test rather than shipping two MCP contracts in parallel.

There is deliberately:

- no environment switch that re-enables MCP v1;
- no dual v1/v2 tool registration;
- no hidden alias layer that preserves old tool names.

A v1 MCP client must migrate to the v2 manager tools. The semantic Grist service underneath is reused, but the public tool names/schemas are not compatibility-promised across that boundary.

### GPT Actions/OpenAPI

GPT Actions/OpenAPI is a separate HTTP compatibility surface, not MCP v1. Its presence or removal does not change the MCP v2 contract version. R3 decides that compatibility surface independently as part of candidate deployment simplification.

## Versioning rule

Increment the MCP contract major version when a model-facing change is incompatible, including removal/rename of a tool or action, incompatible input/output schema changes, or a materially changed semantic/safety meaning.

Compatible clarifications, descriptions, implementation fixes and additional result detail that existing clients may safely ignore do not require a major contract increment. New capabilities should first be justified by the roadmap; versioning is not permission to grow the surface speculatively.

## Safety invariants

MCP v2 does not expose generic HTTP forwarding, raw SQL, arbitrary Grist `/apply`, arbitrary UserActions or heterogeneous multi-action transactions. Grist remains authoritative for upstream permissions; the bridge may only reduce authority. Partial/ambiguous writes are not blindly replayed, private Grist references remain server-side where practical, and principal-derived state must not cross principal boundaries.
