# Pareto recomposition review

Date: 2026-09-27

Purpose: identify the smallest coherent `grist-chatgpt` product by taking the best proven parts of the existing Grist/MCP ecosystem and of this repository, instead of continuing the retired J0-J6 architecture by inertia.

This document is design provenance for R0. `docs/ROADMAP.md` controls current eligibility.

## 1. Decision

Stop building a domain-driven generalized Builder before the core product exists.

The product becomes a compact MCP layer for Grist Community:

```text
LLM client
  reason / plan / orchestrate
        |
        v
grist-chatgpt
  semantic context
  bounded data/schema/UI actions
  safety normalization
        |
        v
Grist Community
```

The following earlier assumptions are explicitly retired from the product critical path:

- stage tracking as the first Builder proof;
- J2/J3/J4/J5/J6 as the mandatory product sequence;
- application-specific behavioral contracts as core architecture prerequisites;
- browser/LinkKey verification infrastructure before a generic product candidate exists;
- a generalized internal planner/orchestrator as the mechanism by which the LLM works;
- production identity/distribution work as a prerequisite to deciding whether the core product is good.

Comprehensive product proof moves to R4, after construction.

## 2. External references reviewed

### 2.1 Grist official MCP / `gristlabs/grist-core`

Observed on 2026-09-27 from current `gristlabs/grist-core` default-branch code indexed around commit `34542eab62f0decb309a7e0476c3009fc6567f29` and official support links referenced by that tree.

Relevant evidence:

- Grist core contains MCP integration hooks and an MCP enable flag (`GRIST_MCP_ENABLED`);
- current edition UI describes the full edition as including the MCP server;
- current Grist code/support treats MCP as a first-class AI-assistant integration;
- MCP work runs against the same document/application substrate as the native product.

Decision: **REIMPLEMENT / CONVERGE ON BEHAVIOR**.

Why:

- official semantics should be the primary functional oracle;
- raw breadth is not a sustainable differentiator for `grist-chatgpt`;
- the relevant full MCP implementation is not assumed to be freely reusable merely because adjacent `grist-core` code is public;
- Grist Community remains the target where an independently deployable MCP layer has value.

Adopt:

- naming/behavioral semantics where visible and stable;
- native Grist concepts rather than parallel abstractions;
- compatibility/convergence as the default direction.

Do not import:

- edition-specific/private implementation without a confirmed reusable license;
- server-internal architecture not needed by an external Community bridge.

### 2.2 `gwhthompson/grist-mcp-server`

Observed on 2026-09-27. Current package metadata reports version `2.0.38`, TypeScript/ESM and an 11-tool MCP surface.

Current high-level tools include:

- workspace/document discovery;
- tables/schema inspection;
- records manager;
- schema manager;
- pages manager;
- document creation;
- webhooks;
- help.

The README claims Apache-2.0 licensing, but a root license file was not resolved through the connector during this review. Treat code copying as conditional on confirming the actual repository license file before reuse.

Decision: **ADAPT; REUSE only after license confirmation**.

High-value ideas:

- compact manager-style tools instead of many narrowly duplicated public tools;
- one `help` surface for progressive disclosure;
- TypeScript implementation makes selective reuse technically plausible;
- pages/schema/records organized around LLM intentions rather than REST endpoints.

Do not import blindly:

- raw SQL query capability;
- webhook scope;
- any manager action whose destructive/partial semantics are less precise than the current `grist-chatgpt` safety boundary;
- Cloudflare/deployment choices unless they simplify the actual target.

### 2.3 `nic01asFr/GristCoder`

Observed on 2026-09-27. README describes GristCoder as an MCP server plus custom widget capable of turning a Grist document into a business application. It currently advertises 35 tools, contextual resources and a four-layer view of data/UI/logic/integrations. Repository README declares MIT licensing.

Especially relevant concepts:

- live document context with full schema and relationship graph;
- page/section layout awareness;
- quality observations;
- a `_delta` between plan and reality;
- a build/verify loop;
- artefacts/widgets kept with the Grist application.

Decision: **ADAPT SELECTIVELY**.

Adopt or study closely:

- compact application context;
- schema relationship graph;
- page/section/widget context;
- simple state/delta representation if it can remain observational and stateless;
- concrete Grist-native construction patterns.

Explicitly do not import into R1:

- wizard/human confirmation flow;
- session phase state machine (`qualifying -> assessing -> designing -> building -> verifying -> done`) unless the MCP client demonstrably needs it;
- sub-agent delegation;
- embedded chat;
- custom-widget IDE;
- generated React/HTML artefact system;
- SSE orchestration as a product prerequisite.

These solve broader GristCoder goals, not the lean Community MCP core.

### 2.4 `Xe138/grist-mcp-server`

Observed on 2026-09-27.

Relevant design:

- document-scoped tokens;
- three simple permission classes: read, write, schema;
- clear separation of discovery/read/write/schema operations;
- multi-document configuration.

No reusable root license was confirmed during this review.

Decision: **REIMPLEMENT DESIGN IDEAS; DO NOT COPY CODE without license confirmation**.

Adopt:

- evidence that a small capability vocabulary is sufficient for most Grist MCP work;
- simple resource-bound authorization as a design pressure against over-engineered policy layers.

Do not import:

- raw SELECT SQL model surface;
- multi-instance routing for the initial product;
- per-document static-key configuration as the final multi-user credential architecture.

### 2.5 `nic01asFr/mcp-server-grist`

Observed on 2026-09-27 on branch `official`. README declares MIT licensing and broad Grist API coverage.

Relevant breadth:

- organization/workspace/document discovery;
- records CRUD;
- schema/table/column operations;
- formula helpers and validation;
- SQL;
- access administration;
- export/download;
- attachments;
- webhooks.

Decision: **REFERENCE / SELECTIVE REUSE**.

High-value areas to inspect during R2 if needed:

- formula-helper behavior;
- safe column/formula construction patterns;
- broad API endpoint coverage when a specific missing Grist semantic is demonstrated.

Reject from initial surface:

- organization/workspace deletion/administration;
- generic user/access administration;
- unrestricted SQL model input;
- export/download as a core Builder capability;
- attachments and webhooks before a generic use case requires them.

Breadth is evidence of what Grist can expose, not a backlog.

## 3. Current `grist-chatgpt` classification

The existing repository has valuable production/safety work. The recomposition is not a rewrite-from-zero decision.

### KEEP candidates

#### Grist client and bounded domain services

Keep where they are already simpler and safer than external alternatives.

Reasons:

- current behavior is integrated with stable IDs, limits and output minimization;
- replacing good code solely for architectural purity would violate Pareto.

#### Stable-ID normalization

Keep.

Strong current examples include page/widget IDs, column IDs, Ref/RefList translations and fail-closed incomplete normalization. Private Grist numeric refs should stay server-side.

#### `inspect_document` / semantic context

Keep as the starting point for R1-C, then compress and enrich only where external references demonstrate clear value.

#### Bounded data/schema/UI mutations

Keep underlying implementations that already:

- target explicit resources;
- bound input sizes;
- preserve unrelated options on read-modify-write;
- post-read important resulting state;
- project compact semantic results.

#### Partial/ambiguous-write semantics

Keep the semantic guarantee.

Do not blindly replay a write merely because the response was lost. Preserve confirmed partial results.

#### Principal isolation and secret minimization

Keep.

These are high-value safety properties independent of the discarded Builder architecture.

### ADAPT candidates

#### Public operation registry

Adapt from the current 23 narrow operations toward a smaller intent surface inspired by `gwhthompson/grist-mcp-server` while preserving precise per-intention risk metadata.

Do not create one generic super-tool. A compact manager may expose an explicit `action` discriminated union when each action remains individually bounded and annotatable.

#### `grist_help`

Keep and adapt as the progressive discovery point for the compact contract.

#### Formula inspection

Keep only the parts that improve generic Grist application work cheaply. Compare against Grist official behavior and `mcp-server-grist` helpers before adding any more parser logic.

#### J0/J1 safety primitives

Extract/retain only what direct operations need:

- ambiguity classification;
- partial-result retention;
- authority re-check where relevant;
- no-blind-replay recovery semantics;
- secret-safe audit targets.

The generalized execution lifecycle/journal is not automatically part of the lean runtime.

### DORMANT / REMOVE FROM ACTIVE PATH

#### J2 stage-tracking code

Includes AccessModel observer/provisioner/isolation/browser verifier and scenario scaffolding built only to prove the stage application.

Decision: **DORMANT then DELETE when import/runtime inventory proves safe**.

Reason: the business scenario belongs in R4. Keeping its proof platform active distorts product design.

PR #158 is closed unmerged; its custom Chromium transport is not adopted.

#### J2/J3/J4/J5/J6 roadmap architecture

Decision: **RETIRED**.

Historical documents may stay, but do not select work from them.

#### Generalized Builder abstractions not required by the compact surface

ApplicationContract, ManagedScope, ImpactGraph, broad behavioral-evidence machinery and lifecycle concepts are **DEFERRED** unless a post-candidate need proves them necessary.

Do not implement them in anticipation of future complexity.

#### GPT Actions/OpenAPI compatibility

Decision: **DEFER disposition to R1/R3**.

It may remain temporarily if cheap, but MCP is the product contract. Do not maintain duplicate behavior that materially increases implementation cost without a current consumer.

#### C4/C5/C6/S0/S1/C7/C8 continuation

Decision: **DEFER TO R5**.

Preserve completed evidence; stop spending product-construction effort on productionization/submission until R4 says the product is worth shipping.

## 4. Target R1 shape

A minimal implementation should trend toward:

```text
src/
  mcp/                 compact public contract
  context/             discover + inspect semantic view
  grist/               Grist REST adapters
  operations/          bounded generic intentions
  auth/                smallest principal/capability boundary
  safety/              limits, normalization, ambiguity/partial semantics
```

This is a direction, not a forced directory rewrite. Existing modules should be reused in place unless moving them materially improves simplicity.

The LLM remains responsible for multi-step reasoning:

```text
inspect -> decide -> change_structure -> change_ui -> query/verify
```

The MCP server does not need to persist a general plan merely to support this sequence.

## 5. Testing decision

The previous J2 path spent large effort proving a specific application before the generic product path existed. That order is reversed.

### During R1-R3

Keep:

- current CI;
- current regression tests that still exercise active code;
- focused tests for newly written code and dangerous semantic boundaries;
- type/build/dependency checks.

Do not add merely for proof:

- stage fixtures;
- ACL synthetic applications;
- LinkKey lifecycle matrices;
- custom browser transports;
- broad crash matrices for every capability;
- manual human acceptance checkpoints.

### During R4

Build the full campaign once, around the actual candidate. Reuse standard test infrastructure where possible.

This is not a rejection of testing. It is a sequencing decision: **construct first, certify the resulting product second**.

## 6. Human-intervention decision

There are no implementation human gates in R1-R3.

If two technical paths are reasonable, the Controller chooses using simplicity/reuse/safety rules and records the choice.

If a feature requires an unresolved production key-management, public-scope, institutional or publication decision, that feature is deferred to R5 instead of pausing product construction.

Independent review remains required for substantive code/contract changes, but it is an autonomous execution boundary rather than a human approval checkpoint.

## 7. Immediate repository consequences

1. close PR #158 — done, superseded;
2. close PR #160 — done, superseded by this broader pivot;
3. replace the Product Vision — part of R0;
4. replace the Roadmap with R0-R5 — part of R0;
5. replace governance rules that forced human gates/test-first proof — part of R0;
6. mark stage-specific documents historical/non-authoritative — roadmap-level decision, physical cleanup waits for R1-A/R3;
7. begin R1-A with an import/runtime inventory after this reviewed pivot merges.

## 8. R0 conclusion

The fastest credible path is not another application proof. It is **subtractive composition**:

```text
best official semantics
+ best compact MCP patterns
+ best application-context ideas
+ current proven safety primitives
- duplicated planner architecture
- domain coupling
- pre-product certification infrastructure
= lean Grist Community MCP candidate
```

That is now the product-development basis.
