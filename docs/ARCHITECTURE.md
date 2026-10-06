# Architecture

Gia is a thin semantic execution layer. The MCP client owns reasoning and
multi-step orchestration; Grist owns application state and native authorization.
The [MCP contract](MCP-CONTRACT.md) and [Security](SECURITY.md) define the public
and trust boundaries.

## Runtime composition

| Area | Responsibility |
| --- | --- |
| `src/server.ts`, `src/config.ts` | localhost HTTP application, validated deployment configuration, authentication and request limits |
| `src/auth/` | bearer/JWT verification, opaque principal identity, capability and resource-grant checks |
| `src/grist/credentials.ts`, `contextFactory.ts` | server-side credential selection and principal-bound service graph |
| `src/grist/accessPolicy.ts` | deployment ceiling and principal-local resource discovery/cache |
| `src/mcp/leanRegistry.ts`, `leanTools.ts` | ten-tool metadata, closed action schemas, bounded dispatch and progressive help |
| `src/operations/` | internal operation/capability mapping and supported schema-field validation |
| `src/grist/authorizedService.ts`, `service.ts`, `client.ts` | authorization/audit boundary, bounded semantic operations, fixed Grist REST calls |
| `src/grist/documentContext.ts`, `documentUi.ts`, `calendarConfig.ts`, `referenceDisplay.ts`, normalization modules | compact context, stable-ID resolution and completeness reporting |
| `src/grist/uiActionsAdapter.ts`, `accessRules.ts` | fixed private native actions, preservation and postcondition verification |
| `src/mcp/results.ts`, `publicMetadata.ts` | typed effect reporting and minimized public projections |
| `src/audit/`, `src/ops/` | protected audit events and low-cardinality operational signals |

Static bearer mode has one controlled deployment principal and one service graph.
OAuth mode validates each request before constructing a fresh principal-bound
client, discovery cache, access policy and authorized service graph.
The JWKS verifier is shared cryptographic infrastructure, not a principal credential cache.

Upstream credentials are selected independently of transport authentication:
`static` uses one operator-provided key for controlled single-principal use;
`principal-map` selects the exact opaque OAuth principal's Grist service-account
key from a protected, read-only startup mapping. There is no shared-key fallback.

## Inspection and mutation

Inspection returns an application map rather than a copy of business data.
Rows are read through bounded queries; private or unsupported metadata is
reported as incomplete instead of guessed. Public projections retain only the
numeric compatibility detail promised by the current contract. Complete internal
snapshots remain available for preservation and verification.

A mutation validates one closed semantic intention, authorizes explicit targets,
reads material current state, resolves native references privately, preserves
untargeted state, performs fixed REST/native actions and verifies material postconditions.
Record batches execute sequentially and are non-atomic as a group.
Confirmed partial effects and uncertain outcomes remain machine-readable;
there is no automatic whole-operation replay or durable workflow journal.

Access-rule inspection/editing additionally requires fresh native Owner proof
before reading ACL metadata. Writes verify the requested persisted group and an
internal fingerprint of untargeted policy; they do not prove confidentiality.

Document creation requires an explicitly allowed destination workspace and one
matching schema-write grant. Template copy separately authorizes source read,
uses native `asTemplate=true`, retains known created IDs, invalidates discovery
after every attempt and verifies destination membership under the same principal.
A returned ID never expands deployment policy.

## Dependencies and reference boundary

The production dependencies are the official MCP Express/Node/server packages,
Express and Zod. TypeScript and tsx are development/build tools.
`package-lock.json` defines the reproducible versions and dependency licensing;
CI keeps the existing high-severity production vulnerability gate.

Grist's public REST API and documented native metadata/actions are the behavior
oracle. The adapter uses fixed private native actions where REST lacks the required
semantic primitive; it does not depend on unavailable proprietary MCP internals.
Community manager-tool and semantic-context patterns informed the design;
no external project source is incorporated beyond declared dependencies.
Required licensing/attribution for any future copied code belongs with that code.
