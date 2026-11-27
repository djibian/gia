# Product vision

Gia is a compact open-source MCP adaptation layer for Grist Community.
An MCP-capable client understands intent, reasons, plans and sequences actions.
Gia provides stable semantic access, authorization, normalization and safe
execution. Grist remains authoritative for data, formulas and native permissions.

## Current product

Gia 0.12.0 implements [MCP contract major 2](MCP-CONTRACT.md) with exactly ten tools.
The product supports resource discovery, compact structural inspection, bounded
record/schema/document-metadata changes, stable human-facing Ref/RefList display
selection, native pages/widgets, visible fields, saved filters and sorts, Card
layouts, configured calendars, native summaries, hierarchy-preserving page
ordering, bounded application access-rule groups including typed LinkKey-to-record
comparisons, bounded `newRec` matches, same-column old/new comparisons, Bool-literal predicates for proposed row changes, closed role memberships, boolean user-login tests, bounded Int 0/1 flags and empty-Text comparisons, finite boolean
combinations of supported ACL leaves, read-only bounded structural inspection
and bounded create/replace/delete of native user-attribute definitions,
typed comparable user-attribute field matches in ordinary ACL conditions,
and empty-document/template bootstrap.
The application-policy inspection also provides read-only schema-impact
references, persisted policy coverage, one-group explanations and bounded
expected decisions for invented symbolic contexts. Native authorization
and confidentiality require separately scoped evidence.
The supported subset and its limits are defined by the contract and executable tests.

Business applications such as teaching, stage tracking, CRM or inventory are
consumers and test cases. Their schemas and policy choices never drive core architecture.

## Application construction

An MCP client can build, configure and qualify a Grist Community application
from an empty document. The [native application tests](DEVELOPMENT.md#native-grist-regressions)
exercise a representative stage-tracking application with synthetic data,
including document settings, UI, policy, Forms, trusted widgets and sharing.
Full native document copying serves a separate use case.

The client retains application specifications, orchestration, symbolic
cross-component references, dependency ordering and restart progress.
Gia provides safe, bounded, semantically typed operations and verified
postconditions. Grist remains authoritative for data, formulas, UI behavior,
native authorization and publication. Inspection must distinguish incomplete
or protected state from absence; synthetic authenticated tests, not merely
persisted policy simulations, qualify access boundaries.

Publication and document access changes use their own explicit authorization
and native Owner checks. The operator registry defines approved widget URLs.

Deployment operators can register trusted widgets at permanent HTTPS URLs
with evolving code. A registered direct URL supplies standing approval for the
native access the widget needs, including full access. Each grant still
requires native Grist Owner authority and the schema capability.

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
