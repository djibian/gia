# Product vision

Gia is a compact open-source MCP adaptation layer for Grist Community.
An MCP-capable client understands intent, reasons, plans and sequences actions.
Gia provides stable semantic access, authorization, normalization and safe
execution. Grist remains authoritative for data, formulas and native permissions.

## Current product

Gia 0.8.0 implements [MCP contract major 2](MCP-CONTRACT.md) with exactly ten tools.
The product supports resource discovery, compact structural inspection, bounded
record/schema/document-metadata changes, stable human-facing Ref/RefList display
selection, native pages/widgets, visible fields, saved filters and sorts, Card
layouts, configured calendars, native summaries, hierarchy-preserving page
ordering, bounded application access-rule groups, and empty-document/template
bootstrap.
The supported subset and its limits are defined by the contract and executable tests.

Business applications such as teaching, stage tracking, CRM or inventory are
consumers and test cases. Their schemas and policy choices never drive core architecture.

## Design policy

Prefer the small portion of Grist semantics that enables useful application work.
Use official Grist behavior as the functional oracle, reuse clearly licensed
components when they fit, and independently implement only the necessary translation.
Do not pursue feature parity merely because another project exposes a capability.

Keep the product independently deployable and compact. Do not add an internal
LLM, planner, business workflow engine, wizard, sub-agent framework, lifecycle
scheduler, hidden orchestration database or generated-widget platform.
Do not add generic HTTP forwarding, raw SQL, arbitrary Grist actions or generic
identity/share/service-account administration.

Application-level access-rule editing is a separately bounded capability;
it does not administer Gia's identity or replace native Grist enforcement.
Document bootstrap never implies workspace grants or secret sanitization.

## Evolution policy

A new capability needs a concrete important generic task that the current
contract cannot perform, explicit product authorization, a bounded implementation,
and a justified maintenance cost. Evidence from real use and relevant ecosystem
comparison supports selection; it never creates an implicit backlog.

Public-directory distribution is optional and inactive unless explicitly
requested. When resumed, revalidate the current product and platform requirements.
Do not preserve stale submission packages as compatibility obligations.

Every evolution must satisfy the [Convergence Invariant](../AGENTS.md):
the integrated tree contains current behavior and current constraints only.
GitHub discussions, PRs, commits, CI, tags and releases preserve decisions and history.
