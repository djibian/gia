# R6.1b — Product capability review

Date: 2026-10-03

Baseline: `djibian/gia@741b35ce65963b526057fc7814104e39dbe39e9b`

Status: **static decision-support evidence only — no R6.2 selection and no runtime implementation**

## Purpose

Expose generic Grist application capabilities that the bounded ecosystem delta review may have missed, or that were previously hidden inside exclusions that were too broad.

This review is intentionally static. It does **not** create or mutate a Grist application, rerun R4, add domain fixtures, or turn ecosystem breadth into a backlog.

The decision boundary remains:

- the product owner supplies value / necessity priorities;
- Gia supplies current coverage, feasibility, safety, complexity and maintenance analysis;
- only the later R6.2 step may classify a candidate `ALREADY COVERED`, `ADOPT`, `DEFER` or `REJECT`;
- no runtime work is authorized here.

## Evidence reviewed

### Gia current state

Current MCP contract: **v2**, ten tools:

`grist_discover`, `grist_inspect`, `grist_query`, `grist_add_records`, `grist_change_records`, `grist_add_structure`, `grist_change_structure`, `grist_add_ui`, `grist_change_ui`, `grist_help`.

Relevant current implementation/documentation inspected:

- `docs/MCP-CONTRACT.md`;
- `src/mcp/leanTools.ts`;
- `src/operations/schemaMutationContract.ts`;
- `src/grist/client.ts`;
- `docs/SECURITY.md`;
- `docs/ARCHITECTURE.md`;
- `docs/R2-MISSING-GRIST-SEMANTICS-AUDIT.md`;
- `docs/R4-APPLICATION-VALIDATION.md`;
- `docs/R4-COMPLETION-CANDIDATE.md`;
- `docs/R6-ECOSYSTEM-DELTA-REVIEW.md`.

The current widget mutation surface supports title, description, chart type, saved sort, select-by, bounded custom-widget access/column mappings, basic grid options and page layout. It does not expose the widget field list, card layout, persistent per-column filters, conditional styles, native summary creation, document-level access rules, document settings, document creation/copy, attachments or snapshot history.

R4 is particularly relevant to access control: its real Grist fixture used native row access rules and proved that the candidate preserved their effects, but those rules were provisioned outside the model-facing product through controlled test infrastructure. Gia therefore demonstrated **ACL preservation**, not **ACL authoring**.

### Official Grist references

Observed on 2026-10-03:

- MCP documentation: https://support.getgrist.com/mcp/
- REST API reference: https://support.getgrist.com/api/
- access rules: https://support.getgrist.com/access-rules/
- summary tables: https://support.getgrist.com/summary-tables/
- table widget / field visibility: https://support.getgrist.com/widget-table/
- card / card-list layout: https://support.getgrist.com/widget-card/
- document settings: https://support.getgrist.com/document-settings/

The official MCP and recent Grist 1.7.x behavior remain a semantic oracle, not a parity target. The target product remains Grist Community; a capability is useful only when a stable Community primitive exists or a bounded Community implementation path is credible.

### Community references

The revisions and license observations already recorded in `docs/R6-ECOSYSTEM-DELTA-REVIEW.md` remain the provenance baseline:

- `gwhthompson/grist-mcp-server@d75706c2dec283502e2bedd1cd1feae8f709f379`;
- `nic01asFr/GristCoder@9362a58382937334afd3330e9f25bd96bdcad9c0`;
- `nic01asFr/mcp-server-grist@8958198d008223e1c9e43d4a55ac7b31cab0ca51`.

No external source code is copied by this review.

## Capability-family coverage

### Already materially covered

The following generic application semantics do not need a new candidate merely because another project exposes them differently:

- document discovery with organisation/workspace context;
- table/column discovery and compact document inspection;
- bounded one-table reads;
- add/update/delete records;
- table and column creation;
- type, formula, label, description and supported widget-option mutation on columns;
- Ref/RefList relationship discovery;
- page creation/rename/delete;
- native widget creation/delete;
- page layout;
- widget title/description/chart type;
- saved sort;
- select-by;
- custom-widget access level and column mappings;
- basic grid lines / zebra stripes / row-number mode;
- progressive contract help.

Forms are already admitted as a native widget type. A separate “form feature” is therefore not a candidate by itself; only missing generic field/presentation semantics are relevant.

## Candidate decision table

The “AI orientation” column is **not** an R6.2 verdict. It only summarizes the technical/product signal that should be presented to the product owner.

| ID | Capability / origin | Gia v0.6.0 coverage and current completion gap | Smallest bounded scope worth considering | Primitive / stability evidence | Feasibility, risk, maintenance | Provisional AI orientation | Product-owner priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **C1** | **Application-level access rules and visibility** — Grist native access rules; R4 ACL preservation evidence | Gia preserves upstream ACL effects but cannot inspect or author the application policy. Any application needing row/column visibility rules still requires manual owner work. | Normalized inspection plus targeted create/update/delete of document table/column rule groups using stable table/column IDs, bounded rule conditions and R/U/C/D/S permissions. Include only the minimum user-attribute-table binding needed for generic policies. Exclude users, groups, orgs, shares, service accounts, LinkKey secret provisioning and permission elevation. | Access-rule semantics are first-class Grist behavior and owner-only in the UI. R4 already demonstrated the underlying Community metadata/action path in controlled infrastructure. The implementation primitive is lower-level/private compared with ordinary REST endpoints, so translation must stay bridge-owned and bounded. | **Feasibility: medium-high. Security risk: high but containable. Maintenance: medium.** Main hazards are rule ordering, resource resolution, preserving untargeted rules, virtual/share-derived rules and preventing a generic `/apply` escape hatch. Grist remains authoritative and must reject insufficient upstream authority. | **STRONG CANDIDATE.** This fills a genuine “application cannot be finished” gap rather than an administration convenience. | **INDISPENSABLE** |
| **C2** | **Widget visible fields, field order and widths** — native Table/Card field lists | Gia can create a widget but cannot choose which table columns are shown, hide technical columns, order fields for users, or set widths. This leaves many otherwise-complete applications needing manual UI cleanup. | Read and replace one widget’s ordered visible-field list by stable column IDs, with optional bounded widths. Preserve hidden/unmentioned field metadata and unrelated widget options. | Core Grist UI semantics; official docs explicitly distinguish hiding a field from deleting a column. Recent official MCP work also exposes richer field configuration. | **Feasibility: high. Risk: medium-low. Maintenance: medium-low.** Main requirement is stable-ID translation and read-modify-write preservation. | **STRONG CANDIDATE.** High generic leverage and small semantic surface. | Not yet supplied |
| **C3** | **Native summary table/widget construction** — R6.1a D5; official MCP + native summary tables | Gia can create ordinary widgets/tables but cannot request Grist’s native grouped summary semantics. Manual Grist intervention is needed for dashboards that depend on native summaries. | Add a native summary-backed widget from one source table and a bounded ordered set of `groupByColumnIds`; return the resulting summary table/widget IDs. Do not expose arbitrary summary-table internals. | Native, mature Grist semantic; official MCP now creates summaries through widget creation. | **Feasibility: high. Risk: medium. Maintenance: low-medium.** Must verify the created summary and avoid treating generated summary tables like ordinary mutable tables. | **STRONG CANDIDATE.** Small surface, high value for dashboards/analysis. | Not yet supplied |
| **C4** | **Persistent widget filters** — R6.1a D6; recent official MCP field/view configuration | `grist_query` can filter an agent read, but Gia cannot persist a user-facing filter on a widget. An app may work logically yet open with the wrong visible subset. | Typed per-widget filters keyed by stable column IDs; bounded operators/values; merge only targeted filters and preserve the rest. | Persistent per-column view filters are normal Grist UI state and are exposed by recent official MCP behavior. | **Feasibility: high. Risk: low-medium. Maintenance: low-medium.** Need normalization across column types and exact preservation. | **CANDIDATE.** Functional presentation state, not mere cosmetics. | Not yet supplied |
| **C5** | **Card / Card List field layout** — R6.1a D7; official v1.7.20 MCP behavior | Gia supports page layout but not layout of fields inside Card/Card List widgets. | Normalized read/set of one card layout using stable field/column IDs; no raw private layout JSON. | First-class native Grist UI; official MCP exposes get/set card layout. | **Feasibility: medium-high. Risk: medium. Maintenance: medium.** Requires another normalized layout translator but fits the existing UI adapter model. | **CANDIDATE.** Especially relevant where Grist is used as an application UI rather than a spreadsheet. | Not yet supplied |
| **C6** | **Conditional styles and other bounded presentation options** — R6.1a D6 | Gia has a few grid toggles but cannot express conditional row/cell styling or several other stable presentation settings. | Select a very small typed subset only after owner priority is known; e.g. conditional style formula + bounded style fields, or row height. No arbitrary section-option JSON. | Native Grist feature; recent official AI/MCP tooling supports conditional styles. | **Feasibility: medium. Risk: medium. Maintenance: medium-high** because option shapes are broader and more version-sensitive than C2/C4. | **SECONDARY CANDIDATE.** Useful, but should not be bundled with more functional field/filter gaps. | Not yet supplied |
| **C7** | **Custom-widget catalog discovery and bounded options** — R6.1a D8 | Gia can set access and column mappings on an already selected custom widget, but cannot discover the configured catalog or configure widget-owned options. | Split the problem: read-only catalog discovery first; only typed/manifest-aware option keys later. Do not expose arbitrary widget URLs, arbitrary JSON passthrough or automatic access escalation. | Official MCP exposes catalog discovery and option operations; custom-widget options themselves are deliberately free-form JSON, which is the main safety/stability concern. | **Feasibility: medium. Risk: medium-high. Maintenance: medium-high.** Discovery is easy; safe generic option mutation is not. | **WEAK-TO-MEDIUM CANDIDATE.** Catalog discovery is much easier to justify than generic option writing. | Not yet supplied |
| **C8** | **Document creation / copy-as-template** — R6.1a D1; official MCP + REST API | Gia can only work inside documents provisioned beforehand. Starting a new generic app requires a manual workspace/document step. | Create an empty document or copy an explicitly allowed source document/template into an explicitly allowed workspace. Exclude arbitrary file upload/import at first. | Official REST API and MCP expose stable create/copy semantics. | **Feasibility: high technically. Authority risk: high. Maintenance: low-medium.** This crosses from document-scoped mutation into workspace-level creation and may require a new capability/scope/resource-policy decision. | **CANDIDATE, but authority-sensitive.** Strong usability value, not necessary if operator-provisioned documents remain acceptable. | Not yet supplied |
| **C9** | **Document timezone / locale / currency settings** — static-review blind spot | These settings affect date calculations and default formatting, but Gia neither inspects nor sets them. Users must correct them manually after construction. | Inspect and set only timezone, locale and default currency. Exclude sharing, document mode, billing/admin metadata and unrelated document metadata. | Stable first-class document settings in Grist UI. Public mutation support is less explicit than ordinary record/schema REST operations, so implementation-path stability needs confirmation before R6.2 adoption. | **Feasibility: medium. Risk: low-medium. Maintenance: low-medium.** | **CANDIDATE.** Small, generic and behaviorally meaningful, especially for date-heavy applications. | Not yet supplied |
| **C10** | **Page navigation ordering** — previously deferred in R2 | Gia can create/rename/delete pages and arrange widgets inside a page, but cannot control page order in navigation. | Reorder the existing visible page IDs only; no folder/navigation framework unless current Grist primitives require it. | Native UI behavior; not identified as a current official-MCP headline capability. | **Feasibility: high. Risk: low. Maintenance: low.** | **SECONDARY CANDIDATE.** Useful finishing operation, but usually not a blocker. | Not yet supplied |
| **C11** | **Keyed upsert / synchronization** — R6.1a D9; community implementations | Gia can compose query + add/update, but repeated external synchronization requires the client to partition records and handle duplicates/partial writes manually. | One table, explicit stable key column(s), bounded input batch, deterministic `create/update/unchanged/conflict` result and no blind replay. No generic import pipeline or arbitrary file ingestion. | Grist CRUD primitives are stable; upsert is a bridge semantic rather than an official current MCP primitive. | **Feasibility: medium. Risk: high. Maintenance: medium.** Duplicate resolution, uniqueness assumptions and partial effects are the hard parts. | **WEAK-TO-MEDIUM CANDIDATE.** Valuable for sync-heavy use, but less central to application construction than C1-C4. | Not yet supplied |
| **C12** | **Bounded cross-table aggregation/query** — R6.1a D2 | The agent must currently read tables separately and join/aggregate in reasoning. | If selected, expose only relational/aggregation constructs tied to stable table/column IDs; no SQL text. Prefer existing Grist relationships and a small aggregate vocabulary. | Official Grist exposes SQL/query breadth; Gia deliberately rejects raw SQL. A safe semantic subset would be Gia-specific. | **Feasibility: medium. Risk: medium-high. Maintenance: high.** It risks rebuilding a query language that the LLM can often emulate with bounded reads. | **WEAK CANDIDATE.** Needs strong owner evidence before adding bridge complexity. | Not yet supplied |
| **C13** | **Attachment discovery / short-lived retrieval** — R6.1a D4 | Documents that use attachments contain information Gia cannot enumerate or retrieve. | Read-only attachment inventory plus one short-lived retrieval URL for an explicitly selected attachment. Keep upload/delete and arbitrary file processing outside the first scope. | Official MCP and REST API expose this directly. | **Feasibility: high. Risk: medium** because URLs/file data cross the model boundary. **Maintenance: low.** | **SECONDARY CANDIDATE.** Important for attachment-heavy apps, otherwise outside the construction critical path. | Not yet supplied |
| **C14** | **Snapshot / history inspection** — R6.1a D3 | Gia cannot tell an agent which saved history points exist before/after a risky evolution. | List bounded snapshot metadata only. No restore, delete or download in the initial scope. | Official MCP/API exposes snapshot listing. | **Feasibility: high. Risk: low. Maintenance: low.** | **LOW-LEVERAGE CANDIDATE.** Useful safety context but does not itself finish an application. | Not yet supplied |

## Broad exclusions decomposed

The static review changes how several old exclusions should be read, without automatically promoting them:

### ACL / administration

Old shorthand such as “generic ACL administration” was too broad.

- **Candidate:** bounded application-level rule semantics inside one document (C1).
- **Still outside:** generic user/group/org/workspace/document sharing administration, service-account lifecycle, operator credential grants, LinkKey secret provisioning and any authority elevation.

### SQL / query

- **Candidate:** a bounded relational/aggregation semantic only if product evidence justifies it (C12).
- **Still outside:** raw SQL or natural-language-to-SQL as a model-facing escape hatch.

### Widget options

- **Candidates:** specific typed field/filter/layout/presentation semantics (C2-C7).
- **Still outside:** arbitrary private widget JSON, arbitrary custom-widget URL changes, generated widget code or unrestricted network destinations.

### Attachments / files

- **Candidate:** read-only discovery and short-lived retrieval (C13).
- **Still outside by default:** upload, delete, generic file processing and arbitrary file-system behavior.

### Document lifecycle

- **Candidate:** bounded empty-document creation / copy-as-template in an allowed workspace (C8).
- **Separate higher-risk problem:** arbitrary uploaded-file import.

## Capabilities that remain outside the R6 candidate set

The review found no reason to reactivate:

- generic HTTP forwarding;
- arbitrary Grist `/apply` or arbitrary UserActions;
- raw SQL;
- generic user/group/org/share/service-account administration;
- webhooks or a general integration/automation framework;
- wizard/session/sub-agent orchestration;
- generated HTML/React/custom-widget code;
- browser automation;
- multi-instance routing;
- internal credential database / secret-manager implementation;
- business-specific stage/CCF/pedagogy logic.

These remain product-boundary exclusions, not hidden backlog.

## Static-review result

The product is already coherent for bounded schema/data/UI evolution, but it is **not yet complete for several common “finish the Grist application” operations**.

The strongest technical/product signals are:

1. **C1 — bounded application-level ACL rules**: a real generic completion gap and already marked **INDISPENSABLE** by the product owner;
2. **C2 — widget field visibility/order/width**: a small missing semantic that repeatedly separates a structurally correct document from a usable application;
3. **C3 — native summary construction**: a compact native semantic with high dashboard/analysis leverage;
4. **C4 — persistent widget filters**: functional view state rather than cosmetic polish;
5. **C5/C9 — card layout and document settings**: bounded native semantics that may matter substantially depending on the intended application style.

This is **not** an R6.2 selection. In particular, C8 document creation, C11 synchronization, C12 cross-table query, C13 attachments and C14 snapshots should not become work merely because they are technically feasible or visible upstream.

## Product-direction checkpoint

**Completed: 2026-10-03.**

The product owner supplied explicit priority input after reviewing this report. Unspecified items remain deliberately **NON DÉTERMINÉ**; no priority is inferred from technical feasibility, ecosystem breadth or the AI orientation above.

| Candidate | Product-owner priority |
| --- | --- |
| C1 — bounded application-level ACL rules | **INDISPENSABLE** |
| C2 — widget field visibility/order/width | **INDISPENSABLE** |
| C3 — native summary construction | **INDISPENSABLE** |
| C4 — persistent widget filters | **INDISPENSABLE** |
| C5 — card layout | **INDISPENSABLE** |
| C6 — conditional styles / bounded presentation | **IMPORTANT** |
| C7 — custom-widget catalog / bounded options | **NON DÉTERMINÉ** |
| C8 — document creation / copy-as-template | **INDISPENSABLE** |
| C9 — timezone / locale / currency | **NON DÉTERMINÉ** |
| C10 — page navigation ordering | **INDISPENSABLE** |
| C11 — keyed upsert / synchronization | **NON DÉTERMINÉ** |
| C12 — bounded cross-table aggregation/query | **NON DÉTERMINÉ** |
| C13 — attachment discovery/retrieval | **UTILE** |
| C14 — snapshot/history inspection | **UTILE** |

This completes the R6 product-direction checkpoint. R6.2 may now evaluate every candidate against the Roadmap criteria. Product priority is a first-class input, not an automatic implementation verdict: any **INDISPENSABLE** item that is not selected `ADOPT` must have a concrete blocking reason and the smallest viable alternative or prerequisite documented.
