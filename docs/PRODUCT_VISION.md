# Product vision

## Mission

**Gia** is a **compact open-source MCP adaptation layer for Grist Community**.

It gives an MCP-capable agent enough stable semantic access to understand and modify a Grist application without recreating the agent's reasoning inside the server.

The LLM client understands the user's intent, plans and orchestrates. Grist remains the application platform and source of truth. Gia supplies the missing bridge between them: compact discovery/context, bounded semantic mutations, normalization where Grist exposes unstable/private identifiers, and safe failure semantics.

The first product objective is not a universal autonomous application lifecycle system. It is a small coherent tool that an existing strong LLM can use to build and evolve Grist applications on Grist Community.

## Pareto product principle

Prefer the 20% of product surface that enables 80% of useful application work.

Before implementing anything new:

- use Grist's official MCP behavior as the functional reference where applicable;
- reuse or adapt mature community implementations where licensing and fit allow;
- preserve valuable safety work already present in this repository;
- remove or defer local abstractions that duplicate the reasoning, planning or workflow abilities of the MCP client.

Gia should be smaller than the ecosystem it composes, not another implementation of all of it.

## Product boundary

```text
User
  |
  v
MCP-capable LLM client
  understand intent
  reason
  plan
  orchestrate
  |
  v
Gia
  discover / normalize context
  expose bounded semantic operations
  enforce local safety boundaries
  translate to Grist Community APIs
  return compact resulting state
  |
  v
Grist Community
  data
  formulas
  schema
  pages / widgets
  native permissions
```

Primary public contract: **MCP**.

Initial target: **Grist Community**, especially deployments where the full Grist MCP is unavailable or where a compact independently deployable bridge is useful.

Grist remains authoritative for application data and native access control. GitHub is relevant only for this product's source code and for later code/integration capabilities if they are ever promoted.

## What the product is not

The core product is not:

- a stage-tracking system;
- a CCF/pedagogy system;
- a CRM or inventory product;
- an internal LLM planner;
- a business-rule inference engine;
- an interactive wizard requiring human checkpoints;
- a generic browser automation framework;
- a generic ACL administration framework;
- a durable lifecycle scheduler;
- a generic HTTP proxy;
- an arbitrary Grist `/apply` or UserAction endpoint;
- a reason to duplicate the official Grist MCP feature-for-feature.

Business applications are consumers and later validation cases. They do not determine core architecture.

## Conceptual surface

The target user-facing capability model is intentionally small:

```text
discover
inspect
query
change_data
change_structure
change_ui
help
```

These names describe product responsibilities. The final MCP schema may expose a slightly different number of tools when that produces clearer bounded intentions.

### discover

Find the Grist resources available to the current principal and return only identifiers, names and permission information needed for later work.

### inspect

Return compact semantic application context: tables, columns, formulas, relationships, pages, widgets and other supported Grist-native configuration without indiscriminately loading business rows.

### query

Read the data actually needed for the current task using bounded filters/sorts/limits and stable identifiers.

### change_data

Perform bounded record creation/update/deletion/upsert-like intentions where semantics are safe and explicit. Preserve known partial results and never blindly replay an ambiguous write.

### change_structure

Create or alter tables/columns/formulas through stable semantic inputs. Prefer Grist-native identifiers and types; keep private engine references server-side.

### change_ui

Create or alter the supported subset of Grist pages/widgets/layout/configuration needed for useful application construction, again using stable semantic inputs instead of arbitrary private metadata payloads.

### help

Progressively disclose the actual supported contract so the LLM does not need the whole implementation in context.

## Existing-project composition strategy

The product is intentionally built from lessons and, where appropriate, licensed components from existing projects.

### Grist official MCP / Grist full edition

Role: **functional oracle and semantic reference**.

Use official Grist behavior and documentation to avoid inventing alternate semantics. Converge selectively on useful Grist semantics, not on tool count or feature parity. Official availability is evidence to inspect, never a backlog by itself. Where the official implementation lives outside clearly reusable open-source code, reproduce selected behavior independently rather than copying unavailable/proprietary implementation.

### `gwhthompson/grist-mcp-server`

Role: **compact semantic surface reference**.

Its small manager-style tool set demonstrates that documents, records, schema and pages can be presented to an LLM without dozens of public primitives. Prefer this pattern over tool proliferation when safety metadata can remain precise.

### `nic01asFr/GristCoder`

Role: **application-context and build-loop reference**.

Useful ideas include a live semantic context, relationship graph, page/section awareness and comparison between intended and actual state. Its wizard, sub-agent framework, session phases and generated-artefact system are not core requirements for the initial product.

### `Xe138/grist-mcp-server`

Role: **simple capability/resource authorization reference**.

Its read/write/schema separation is useful evidence that a small authorization vocabulary can be sufficient. Do not copy code unless licensing is confirmed.

### `nic01asFr/mcp-server-grist`

Role: **breadth/reference implementation**.

Its formula helpers and broad Grist API coverage are useful reference points. Broad organization administration, unrestricted SQL, exports, attachments, webhooks and destructive administration are not initial-product requirements.

The detailed initial classification is maintained in `docs/RECOMPOSITION-REVIEW.md`.

## What is retained from the current repository

The current codebase is a **component bank**, not a sacred architecture.

Strong candidates to retain include:

- the Grist REST client and bounded semantic business layer where simpler external code is not better;
- stable-ID translation that hides private Grist references;
- compact document inspection/normalization;
- bounded record/schema operations;
- bounded page/widget operations that preserve unrelated configuration;
- explicit partial/ambiguous-write semantics;
- output minimization;
- credential/principal isolation seams;
- secret-safe audit normalization;
- exact post-write verification where cheap and directly useful.

Candidates to remove from the active product path or leave dormant include:

- stage-tracking-specific code, fixtures and browser verification;
- generic AccessModel/LinkKey proof infrastructure created only for J2;
- an internal generalized Builder planner;
- generalized ApplicationContract/ImpactGraph/ManagedScope machinery not required by the compact MCP surface;
- J1 orchestration machinery beyond the safety primitives actually needed by the resulting operations;
- production/distribution work that does not help construct the product candidate;
- GPT Actions/OpenAPI compatibility work if it materially complicates the MCP-first product and has no current user need.

Deletion happens only after confirming a component is not required by the lean core. Historical design/evidence documents may remain as history without controlling the roadmap.

## Safety envelope

Simplification must preserve a small set of high-value safety properties:

- Grist permissions remain authoritative;
- the bridge never elevates upstream authority;
- credentials and secret-bearing values are never model-visible;
- principal-derived clients/context/caches do not cross principals;
- public inputs use stable semantic identifiers wherever practical;
- destructive intentions remain explicit and bounded;
- no generic HTTP, raw SQL, arbitrary `/apply` or arbitrary UserAction escape hatch is exposed merely for convenience;
- partial/non-atomic writes report completed work;
- ambiguous post-write state is not treated as proven failure and is not blindly replayed;
- mutations that read-modify-write shared metadata preserve unrelated state and refuse when the current state cannot be resolved safely;
- outputs contain only information needed by the agent.

Anything more elaborate must justify its maintenance cost against a concrete product need.

## Construction model

### R0-R3 — build before certifying

During product construction, optimize for coherence and speed:

- integrate/reuse existing work;
- keep the code compiling and existing regression suite green;
- add only focused unit/contract tests necessary to maintain newly written code or protect a dangerous boundary;
- do not grow domain fixtures, browser test platforms or broad end-to-end proof systems.

No human implementation checkpoints are part of the development loop. When a capability needs an unresolved production/external decision, defer that capability and continue the core.

### R4 — final validation campaign

Once the product candidate is coherent, validate it aggressively against multiple independent applications and failure modes.

This is where stage tracking, CCF/pedagogy, a fresh application, an existing application with human modifications, permission-sensitive scenarios, reruns, failure/recovery and compatibility testing belong.

A validation case may reveal a missing generic capability. The response is the smallest generic repair, not adoption of the case's business model into the core.

### R5 — production hardening; distribution is optional

After successful product validation, production identity, secure credential custody and operational hardening may be completed when they improve real deployments.

Public distribution through OpenAI or another MCP ecosystem is a **possible future product outcome, not a product-completion criterion and not a permanent critical-path dependency**. Reviewer environments, publisher-specific metadata, directory submission and institutional hosting become active only after an explicit product decision to pursue them.

Gia may evolve through any number of functional, architectural or operational iterations before a public submission is reconsidered. Those evolutions do not need to preserve compatibility with an earlier submission package. If publication is resumed later, its requirements, reviewer material, deployment assumptions and metadata must be revalidated against the then-current product and platform rules.

## Evolution rule

Generalize only after evidence.

After a stable production baseline, ecosystem convergence is also evidence-driven. A bounded delta review may compare Gia with the current official Grist MCP and relevant community references. Each meaningful difference is classified `ALREADY COVERED`, `ADOPT`, `DEFER` or `REJECT`; only `ADOPT` items become committed implementation work. The existence of a capability upstream is never sufficient reason to add it.

A capability becomes part of the product because:

1. the current lean surface cannot perform an important generic Grist task;
2. an existing implementation cannot already supply it cleanly;
3. the gap is demonstrated by product construction, validation, the bounded R6 convergence review or later real-use evidence;
4. the smallest bounded implementation is clear.

After a convergence tranche is exhausted, further evolution is usage-driven: real use may reveal a generic gap, but no future feature set is pre-committed merely because it is plausible.

Do not implement a lifecycle agent, generated-code platform, integration framework or broad permission system merely because those are plausible future features.

The durable differentiator is **not maximum architecture**. It is a coherent, compact, safe Grist Community MCP that lets strong agents do useful application work with minimal friction.
