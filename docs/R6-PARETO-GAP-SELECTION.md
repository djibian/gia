# R6.2 — Pareto gap selection

Date: 2026-10-04

Baseline: `Gia v0.6.0` plus integrated R6.1a/R6.1b evidence on `main@2d95739ae074410c3ded96dfeac4f34f405584cd`.

Status: **R6.2 finite selection — no runtime behavior changes in this document**

## Decision rule

This selection applies the Roadmap criteria to the finite C1-C14 candidate set after the product-direction checkpoint.

Product-owner priority is a first-class value signal, but not an automatic implementation verdict. Technical feasibility, authority risk, preservation guarantees and maintenance cost remain separate. Official Grist availability is evidence, not a parity backlog.

The existing R6.1a semantics already marked covered remain **ALREADY COVERED** and are not new work. The C1-C14 set consists of genuine deltas by construction, so none is relabelled `ALREADY COVERED` merely to reduce the implementation count.

## Reference/provenance basis

No new external source code is copied by R6.2.

The selection relies on the bounded current reference review already integrated in:

- `docs/R6-ECOSYSTEM-DELTA-REVIEW.md` — official Grist MCP/docs and Grist 1.7.20 observed 2026-10-03, plus the finite community-reference review;
- `docs/R6-PRODUCT-CAPABILITY-REVIEW.md` — static product-capability review and explicit product-owner priorities.

Disposition remains:

- official Grist behavior/documentation: **REIMPLEMENT selected behavior only** as the functional oracle;
- `gwhthompson/grist-mcp-server@d75706c2dec283502e2bedd1cd1feae8f709f379`: **REFERENCE / ADAPT pattern only**, no source copy because license-file certainty was not established by the review;
- `nic01asFr/GristCoder@9362a58382937334afd3330e9f25bd96bdcad9c0`: **REFERENCE / ADAPT selectively**, MIT; wizard/session/sub-agent/generated-app architecture remains excluded;
- `nic01asFr/mcp-server-grist@8958198d008223e1c9e43d4a55ac7b31cab0ca51`: **REFERENCE / selective reuse if later needed**, MIT; broad SQL/admin surface remains excluded.

Each R6.3 implementation slice must re-inspect the exact relevant official/current primitive before writing code and record any additional provenance.

## Candidate classification

| ID | Product-owner priority | R6.2 classification | Decision and minimum selected/deferred boundary |
| --- | --- | --- | --- |
| **C1** bounded application-level ACL rules | **INDISPENSABLE** | **ADOPT** | Generic applications that require row/column visibility cannot currently be finished through Gia. Implement only normalized inspection plus targeted create/update/delete of document rule groups using stable table/column identities and bounded permissions/conditions. Exclude users, groups, orgs, shares, service accounts, LinkKey provisioning and generic administration. The acting Gia principal must already possess the required upstream Grist authority; the operation must never elevate Gia's own principal or bypass Grist enforcement. Preserve untargeted rules and fail closed on ambiguous/private rule state. |
| **C2** widget visible fields/order/width | **INDISPENSABLE** | **ADOPT** | High-leverage finishing semantic with a small stable surface. Read/set one widget's ordered visible-field list by stable column IDs, plus bounded widths, while preserving unrelated field/widget metadata. |
| **C3** native summary construction | **INDISPENSABLE** | **ADOPT** | Native summary semantics materially improve generic dashboards/analysis and should not be emulated with ordinary tables. Select only source table + ordered `groupByColumnIds` and return normalized created summary/widget identity. Generated summary internals remain non-generic. |
| **C4** persistent widget filters | **INDISPENSABLE** | **ADOPT** | Persistent view state is functionally different from transient agent query filtering. Add typed per-widget filters keyed by stable column IDs with bounded operators/values and preservation of untargeted filters/options. |
| **C5** card/card-list field layout | **INDISPENSABLE** | **ADOPT** | Native Card/Card List applications remain manually unfinished without field layout. Add normalized get/set of one card layout using stable field identities; do not expose private layout JSON. |
| **C6** bounded conditional/presentation styling | **IMPORTANT** | **DEFER** | Useful but broader and more version-sensitive than the selected functional UI gaps. C2/C4/C5 provide the disproportionate value first. Revisit only from concrete R7 usage evidence identifying a small stable styling subset. |
| **C7** custom-widget catalog/options | **NON DÉTERMINÉ** | **DEFER** | Read-only catalog discovery is technically easy, but generic option mutation is free-form and risks recreating arbitrary JSON control. Existing access/column-mapping support remains. No current product priority justifies another surface. |
| **C8** document creation/copy-as-template | **INDISPENSABLE** | **ADOPT** | Manual document bootstrap is a recurring generic completion step. Implement only empty-document creation or same-installation copy from an explicitly allowed source into an explicitly allowed workspace. Gia already models deployment/principal `workspaceIds`; R6.3 must reuse that ceiling and the existing compact capability vocabulary rather than invent a new public OAuth scope. Exclude arbitrary upload/import. If safe implementation proves impossible without scope/authority expansion, this slice must stop and return to reviewed roadmap selection rather than widen authority implicitly. |
| **C9** timezone/locale/currency | **NON DÉTERMINÉ** | **DEFER** | Small and meaningful, but product priority is absent and the stable mutation path is less established than the selected set. Revisit only with concrete usage evidence or a stronger stable primitive. |
| **C10** page navigation ordering | **INDISPENSABLE** | **ADOPT** | Low-risk, low-maintenance finishing operation and explicitly indispensable. Reorder only the existing visible page IDs; do not create a folder/navigation framework. |
| **C11** keyed upsert/synchronization | **NON DÉTERMINÉ** | **DEFER** | Current query + explicit add/update already composes the semantic with the agent. A one-shot upsert adds duplicate-key and partial-write complexity without current priority. Revisit from real sync-heavy usage evidence. |
| **C12** bounded cross-table aggregation/query | **NON DÉTERMINÉ** | **REJECT** | A new bridge-side relational/aggregation vocabulary would duplicate reasoning the MCP client can already perform from bounded reads, add substantial maintenance, and trend toward a local query language. Raw SQL remains forbidden. Future concrete evidence may propose a narrower R7 semantic, but R6 will not build one. |
| **C13** attachment discovery/retrieval | **UTILE** | **DEFER** | Useful for attachment-heavy documents, but not required to construct/evolve the core application model and it introduces file/URL data-boundary concerns. Keep read-only inventory/retrieval as a future evidence-driven option. |
| **C14** snapshot/history inspection | **UTILE** | **DEFER** | Low-risk safety context, but it does not itself finish an application. Current R6 value is lower than the selected construction/UI gaps. Revisit from real recovery/history usage evidence. |

## Finite R6.3 implementation set

Only these seven candidates become committed R6.3 work:

1. **C2 — widget fields/order/width**
2. **C4 — persistent widget filters**
3. **C3 — native summaries**
4. **C5 — card layout**
5. **C10 — page navigation ordering**
6. **C1 — bounded application-level ACL rules**
7. **C8 — document creation/copy-as-template**

The sequence is an implementation-risk order, not a product-priority ranking. It starts with the smallest stable UI/native semantics, then takes the two authority-sensitive slices separately. Each item should be an independently reviewable short-lived PR unless a shared translator makes two changes inseparable without increasing scope.

R6.3 must prefer compatible extensions to the existing ten MCP v2 manager tools. A new public tool is allowed only if an adopted intention cannot be represented coherently as a bounded existing-tool action without semantic distortion. No selected item authorizes a generic dispatcher, raw private JSON, raw SQL, arbitrary `/apply`, identity administration or new OAuth scope.

## Explicit non-work

R6 does **not** commit:

- C6, C7, C9, C11, C13 or C14;
- C12 or any substitute raw-SQL/query-language surface;
- generic user/group/org/share/service-account administration;
- arbitrary file import/upload;
- generic widget-option JSON;
- generated widgets/code, webhooks, browser automation, planners, wizards or sub-agents;
- public-directory/distribution work.

These remain deferred/rejected exactly as classified. They do not become work because implementation of an adjacent ADOPT item exposes related primitives.

## Exit from R6.2

R6.2 is complete when this selection and the corresponding Roadmap transition are integrated with required independent exact-head review and green CI.

After integration, R6.3 is eligible only for the seven ADOPT items above.
