# R6.1 — Ecosystem delta review

Date: 2026-10-03

Status: **R6.1 evidence only — no implementation selection**

## Purpose

Compare the released **Gia v0.6.0** semantic surface with the current official Grist MCP and the relevant ecosystem references named by the Product Vision.

This review is deliberately about **useful Grist semantics**, not tool-name or tool-count parity. A capability appearing upstream is not implementation work. R6.2 must separately classify every meaningful delta as `ALREADY COVERED`, `ADOPT`, `DEFER` or `REJECT`.

## Baselines and provenance

### Gia

Functional baseline: **Gia v0.6.0**, release commit `22cc202c717786d4d8a94f992ccb7aeaae9f8c13`.

The current ten-tool MCP v2 surface remains:

`grist_discover`, `grist_inspect`, `grist_query`, `grist_add_records`, `grist_change_records`, `grist_add_structure`, `grist_change_structure`, `grist_add_ui`, `grist_change_ui`, `grist_help`.

The current R6 governance commit does not change runtime behavior.

### Official Grist MCP

Observed 2026-10-03:

- current Grist MCP documentation: https://support.getgrist.com/mcp/
- latest public Grist release: **v1.7.20**, released 2026-09-28, release commit shown as `b4ccc89`: https://github.com/gristlabs/grist-core/releases/tag/v1.7.20
- current public `gristlabs/grist-core` default-branch commit observed through GitHub: `6e4b1c917440e08ea8d49ffcf9aa37018aa676a9`.

The official documentation currently exposes discovery, document/schema/data/page/widget operations, snapshots and attachments. Release notes through v1.7.20 additionally record recent MCP semantics for summary-table widgets, richer widget/field configuration, custom-widget settings/options, page layout, card layout and generic widget options.

**Disposition for this review: REIMPLEMENT behavior only when later selected.** The official MCP is the functional oracle. No Full-edition MCP implementation code is copied or assumed reusable merely because adjacent `grist-core` code is public.

### Community references

Observed exact revisions:

| Reference | Revision | Relevant current behavior | R6.1 disposition / licensing |
| --- | --- | --- | --- |
| `gwhthompson/grist-mcp-server` | `d75706c2dec283502e2bedd1cd1feae8f709f379` | 11 compact tools; records manager with upsert, schema/pages managers, document create/copy, SQL and webhooks | **REFERENCE / ADAPT pattern only.** README/package metadata advertise Apache-2.0, but a root license file was not resolved at this revision; no source code is copied. |
| `nic01asFr/GristCoder` | `9362a58382937334afd3330e9f25bd96bdcad9c0` | rich application context, relationship graph, page/section layout plus a much broader wizard/session/generated-widget architecture | **REFERENCE / ADAPT selectively.** Root `LICENSE` is MIT. The wizard, session phases, sub-agents and generated application framework are deliberately not imported. |
| `nic01asFr/mcp-server-grist` | `8958198d008223e1c9e43d4a55ac7b31cab0ca51` | broad Grist API coverage useful for checking candidate semantics | **REFERENCE / selective reuse only if later needed.** Root `LICENSE` is MIT. Broad SQL, access administration and unrelated API breadth are not imported. |

No external source code is copied by R6.1.

## Method

A difference enters the finite delta set only when it changes what an MCP agent can materially do while constructing or evolving a **generic** Grist application.

Differences are excluded when they are merely:

- a different tool decomposition;
- a convenience already expressible through Gia's bounded semantics without a recurring material gap;
- identity/account metadata rather than application construction semantics;
- a broad integration/administration surface already outside the product boundary.

This step records **coverage and deltas only**. It does not perform the R6.2 value/safety selection.

## Semantic comparison

### Already covered under Gia's compact surface

| Official/ecosystem semantic | Gia v0.6.0 coverage | R6.1 finding |
| --- | --- | --- |
| Document discovery plus organisation/workspace context | `grist_discover(action="documents")` returns the allowed document set with its resource context; separate org/workspace tools are not required to select a document | **Covered** |
| Document information and schema inspection | `grist_inspect(action="document")`, `grist_discover(actions="tables"/"columns")` provide normalized tables, columns, formulas and relationships | **Covered** |
| Bounded table record reads | `grist_query` provides one-table filtered/sorted/limited reads | **Covered**; cross-table query remains a separate delta below |
| Add/update/delete records | `grist_add_records` and `grist_change_records`, with bounded batches and explicit partial/ambiguous-write semantics | **Covered** |
| Create tables with columns | `grist_add_structure(action="create_tables")` accepts tables with bounded column specs | **Covered** |
| Column type/formula/label changes and table/column rename/delete | `grist_add_structure` / `grist_change_structure` already expose the generic schema lifecycle | **Covered** |
| Page/widget inspection, creation, update and deletion | `grist_inspect`, `grist_add_ui`, `grist_change_ui` cover the generic page/widget lifecycle using stable semantic IDs | **Covered** |
| Page layout | Gia already normalizes and updates a bounded page layout with `grist_change_ui(action="update_layout")` | **Covered**, including the semantic area newly split into official get/set page-layout tools in v1.7.20 |
| Widget saved sort | Gia exposes stable-column saved sort through one bounded widget update | **Covered** |
| Widget select-by discovery/configuration | Gia inspection exposes normalized supported select-by candidates and `grist_change_ui` applies one explicit stable-ID link | **Covered** despite different tool decomposition |
| Custom-widget access level and column mappings | Gia reads/writes the bounded access + column-mapping subset while hiding private widget identity/URL fields | **Covered** for these settings |
| Basic grid display options | Gia supports gridlines, zebra stripes and row-number mode while preserving untargeted widget options | **Covered** |
| Progressive capability help | `grist_help` discloses the compact contract and contract version | **Covered** |

Two official differences are intentionally not promoted into the finite delta set:

- `get_user_profile` is useful connection identity metadata, but it does not add generic Grist application construction semantics.
- `get_grist_access_rules_reference` is documentation/reference material rather than an application-state capability; generic ACL authoring remains outside Gia's current product surface.

## Finite meaningful delta set

### D1 — Document creation / copy lifecycle

**Observed upstream:** official `create_doc` creates a document in a workspace. The community compact server also exposes document creation/copy, and Grist v1.7.20 exposes same-installation Grist-document copy/import behavior at REST level.

**Gia today:** operates on documents already available to the configured principal; it cannot create or copy a document.

**Why this is a real semantic delta:** starting a generic application from nothing requires an operator/user to provision the document first. This is not merely a different MCP decomposition.

**R6.1 boundary:** no conclusion yet on whether workspace-level authority and copy semantics justify adoption.

### D2 — Cross-table query / aggregation

**Observed upstream:** official `query_document` accepts natural-language or SQL-style queries across document tables. `gwhthompson/grist-mcp-server` exposes SQL with joins/aggregations.

**Gia today:** `grist_query` deliberately reads one table with bounded filters, sort and limit.

**Why this is a real semantic delta:** multi-table aggregation currently requires the agent to compose multiple bounded reads and perform the join/aggregation itself. That can become a recurring completion cost for analysis-heavy applications.

**R6.1 boundary:** this finding does **not** endorse a raw SQL surface. R6.2 must distinguish useful cross-table semantics from generic SQL/escape-hatch authority.

### D3 — Document snapshots / version-history inspection

**Observed upstream:** official `list_snapshots` lists older saved versions of a document.

**Gia today:** has no model-facing snapshot/version-history semantic.

**Why this is a real semantic delta:** an agent cannot currently inspect available recovery/history points before a risky evolution or answer a version-history question through Gia.

**R6.1 boundary:** snapshot restore/download is not inferred from the list capability and is not committed here.

### D4 — Attachment discovery / retrieval

**Observed upstream:** official `list_attachments` lists document files and `get_attachment_url` returns a short-lived download URL.

**Gia today:** attachment columns may appear in schema/data, but Gia has no attachment inventory/retrieval capability.

**Why this is a real semantic delta:** documents that use files contain application information the agent cannot currently enumerate or retrieve semantically.

**R6.1 boundary:** upload, mutation, arbitrary file handling and model-visible long-lived URLs are not implied.

### D5 — Native summary-table construction through UI semantics

**Observed upstream:** since Grist v1.7.19, `add_page_widget` with `group_by_column_ids` constructs/uses a Grist summary table and returns its summary-table id; the official agent is directed to use native summaries.

**Gia today:** can create widgets and tables but does not expose `group_by_column_ids` or a bounded native summary-table creation intention.

**Why this is a real semantic delta:** summary tables are a native Grist semantic for grouped application views; emulating them with ordinary tables changes meaning and maintenance behavior.

### D6 — Richer native view/field presentation configuration

**Observed upstream:** Grist v1.7.16 added MCP semantics for widget field configuration such as column width, table conditional styles, and widget per-column filters; official tools also support saved sorting.

**Gia today:** saved sort is covered, as are a small set of grid display options. Column width, per-column filter state and table conditional styles are not exposed.

**Why this is a real semantic delta:** these settings affect persistent native Grist views and can be necessary to finish a usable generic application without manual UI cleanup.

**R6.1 boundary:** cosmetic breadth is not automatically valuable; R6.2 must select only settings with disproportionate utility.

### D7 — Card layout

**Observed upstream:** Grist v1.7.20 adds `get_card_layout` / `set_card_layout`.

**Gia today:** page layout is supported, but card field layout is not exposed as a stable bounded semantic input/output.

**Why this is a real semantic delta:** Card/Card List widgets are native application UI; arranging their fields is distinct from arranging widgets on a page.

### D8 — General widget options and custom-widget discovery/options

**Observed upstream:** v1.7.18 added dedicated custom-widget settings/options semantics; v1.7.20 adds generic `get_widget_options` / `set_widget_options`. Current MCP documentation also lists `get_available_custom_widgets`.

**Gia today:** deliberately exposes only selected stable settings: title/description, chart type, saved sort, select-by, custom-widget access/column mappings, and a few grid options. It does not expose arbitrary widget-owned options, custom-widget catalog discovery, or custom-widget URL/identity changes.

**Why this is a real semantic delta:** some existing Grist-native widgets cannot be fully configured through Gia, and an agent cannot discover the available custom-widget catalog through Gia.

**R6.1 boundary:** an arbitrary JSON options passthrough would conflict with Gia's stable semantic boundary; any later adoption must remain typed and bounded.

### D9 — Keyed upsert / import synchronization

**Observed ecosystem:** `gwhthompson/grist-mcp-server` exposes record upsert through its record manager. The broad community implementations likewise demonstrate import/synchronization use cases.

**Official-current evidence:** the current official tool list exposes add/update/remove rather than a generic upsert tool.

**Gia today:** the agent can query, then add/update explicit records; there is no single keyed upsert/import intention.

**Why this is a real semantic delta:** repeated synchronization from a keyed external dataset may require a recurring read/partition/write sequence and careful duplicate handling.

**R6.1 boundary:** this remains an ecosystem delta, not an official-parity requirement. R6.2 must decide whether the gain justifies target-resolution and partial-write complexity.

## Differences deliberately not treated as R6 gaps

The following visible ecosystem capabilities do not enter the finite R6.1 delta set:

- raw SQL as an unrestricted model surface;
- arbitrary Grist `/apply` or UserActions;
- generic ACL/user/org administration;
- webhooks or a general integration framework;
- wizard/session/sub-agent orchestration;
- generated HTML/React application framework;
- multi-instance routing;
- browser automation.

They either conflict with the current product boundary or belong to a different product layer. Their existence upstream is not evidence that Gia should implement them.

## R6.1 result

The comparison produces **nine meaningful semantic deltas** and no implementation decision:

1. document creation/copy lifecycle;
2. cross-table query/aggregation;
3. snapshot/history inspection;
4. attachment discovery/retrieval;
5. native summary-table construction;
6. richer view/field presentation configuration;
7. card layout;
8. bounded expansion of widget/custom-widget configuration and discovery;
9. keyed upsert/import synchronization.

Everything else reviewed is either already covered under Gia's compact ten-tool shape, not material to generic application construction, or outside the product boundary.

R6.2 must now evaluate these nine deltas independently against the roadmap's seven Pareto criteria. It may select **zero** `ADOPT` items. R6.1 itself authorizes no runtime change.
