# Product vision

Gia is a compact open-source MCP adaptation layer for Grist Community.
Gia enables an MCP-capable client to understand, transform and qualify Grist
applications with maximum useful autonomy and minimal intrinsic complexity.
Grist is the authority on data, calculations, permissions and native behavior;
Gia owns useful, economical deterministic adaptation and verification; the
client owns intent, reasoning and orchestration.

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

## Target capabilities

- **Understand:** observe, represent, identify, compare and relate native
  components. Keep projections close to Grist, portable where meaningful and
  secret-safe. Compute dependencies on demand, distinguish proven references
  from possible or unknown ones, and never silently resolve ambiguous identity.
  Inspection is independent of write support; unknown or protected parts must
  not hide unrelated intelligible parts.
- **Transform:** create, patch and locally reconcile bounded targets using
  deterministic comparisons, explicit preconditions, native operations and
  verified postconditions. Preserve untargeted state, including opaque parts.
  Distinguish native atomic guarantees from preflight/read-back checks, which
  cannot eliminate races. Report uncertain effects without blind replay.
- **Qualify:** expose bounded native observations and experiments directly to
  the MCP client, without avoidable human intervention. Grist, not an internal
  simulator, is the behavioral oracle. Bind evidence to the actual policy,
  identity/context, operation, channel and observed result; distinguish
  untested, unsupported and uncertain cases from demonstrated behavior.
  Use authorized experimental targets and synthetic identities/data where
  appropriate; no generic impersonation, production test login or implicit
  elevation. Protect secrets and restricted information in all projections,
  copies, experiments, errors and evidence.

Portability, reconstruction, diagnosis, maintenance and restart recovery emerge
from composing these three capabilities, not from separate subsystems.

## Application construction

An MCP client can build, configure and qualify a Grist Community application
from an empty document. The [native application tests](DEVELOPMENT.md#native-grist-regressions)
exercise a representative stage-tracking application with synthetic data,
including document settings, UI, policy, Forms, trusted widgets and sharing.
Full native document copying serves a separate use case.

The client retains overall application specifications, intent, dependency
ordering and orchestration. Gia performs bounded deterministic local comparison,
identity resolution, reconciliation and postcondition verification where useful.
The client reconstructs actual state before resuming interrupted work. Grist
remains the source of truth. Native observations, not persisted definitions or
symbolic predictions alone, qualify access boundaries.

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
Maximize the ratio of useful functional power to intrinsic Gia complexity,
subject to non-negotiable security, confidentiality and reliability invariants.
Prefer effective capability probes to speculative compatibility matrices.
Compose existing experimental primitives rather than building an environment
manager. Generalize only after concrete evidence of reuse across domains;
start with a complete vertical ACL evolution, not an anticipatory horizontal
framework.

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
The Roadmap selects finite vertical work, with native qualification developed
alongside inspection and transformation. Remove superseded mechanisms in each
slice. Keep the current MCP contract until a reviewed migration demonstrates
that a different organization or major version offers a material benefit;
compatibility and tool count are not ends in themselves. A breaking change
requires an explicit migration and applicable review, not a silent removal.

Public-directory distribution is optional and inactive unless explicitly
requested. When resumed, revalidate the current product and platform requirements.
Do not preserve stale submission packages as compatibility obligations.

Every evolution must satisfy the [Convergence Invariant](../AGENTS.md):
the integrated tree contains current behavior and current constraints only.
GitHub discussions, PRs, commits, CI, tags and releases preserve decisions and history.
