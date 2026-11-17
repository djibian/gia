# Roadmap

Gia 0.9.1 is the current product, implementing MCP contract major 2.
Public-directory publication remains inactive.

## E1 — Application-policy completeness

**Status: ACTIVE**

Concrete real-use evidence shows that Gia's current bounded access-rule subset
cannot inspect and safely modify important native Grist application policies that
depend on LinkKeys. The authorized evolution is tracked in
[issue #238](https://github.com/djibian/gia/issues/238).

### Goal

Make application policy a coherent fourth semantic layer beside data, schema and
UI for Grist Community, while preserving the compact ten-tool MCP v2 surface,
native Grist authority and Gia's closed safety boundary.

The evolution must not add raw ACL formula input, arbitrary UserActions, generic
identity/share/service-account administration, model-visible LinkKey values or a
claim that persisted policy proves effective confidentiality.

### Finite work

#### E1-A — typed LinkKey ACL semantics

**Status: ACTIVE**

Extend the existing bounded ACL condition model so ordinary table/column rule
groups can inspect and mutate equality/inequality comparisons using a safe named
`user.LinkKey.<name>` operand and stable record-column operands.

Requirements:

- expose only bounded LinkKey names as policy structure, never LinkKey values or
  secret-bearing URLs;
- keep raw ACL formula text out of editable model inputs and outputs;
- preserve fresh native Owner proof, `doc.schema:write`, untargeted-policy
  fingerprinting and non-retryable uncertain-effect behavior;
- keep unsupported formulas protected and non-editable rather than guessing;
- add focused parser/serializer, authorization, preservation and compatibility
  regressions against supported Grist Community versions.

#### E1-B — composable bounded condition AST

**Status: BLOCKED by E1-A**

Generalize the condition model only as far as needed for important native
application policies: bounded `all`/`any`/`not`, typed comparisons,
built-in user properties, LinkKey names, stable `rec`/`newRec` columns,
bounded typed literals and justified membership forms. No free-form expression
string enters the public contract.

#### E1-C — native user attributes

**Status: BLOCKED by E1-B**

After rechecking current upstream semantics, add bounded inspection and mutation
of Grist user-attribute definitions and safe references from ACL conditions.
Account creation, sharing and identity administration remain outside Gia.

#### E1-D — policy inspection and deterministic lint

**Status: BLOCKED by E1-C**

Enrich access-rule inspection with compact dependency information for targets,
record/new-record columns, built-in user properties, LinkKey names and user
attributes. Add deterministic diagnostics only where correctness can be proven or
clearly classified as a warning; do not implement a second authorization engine.

#### E1-E — bounded explanatory simulation

**Status: BLOCKED by E1-D**

Evaluate only Gia's normalized supported subset against an explicit synthetic
context for explanation/debugging. Results must state that they are simulated and
that native enforcement/confidentiality is not verified.

#### E1-F — LinkKey web acceptance and completeness review

**Status: BLOCKED by E1-E**

Because native `user.LinkKey` context exists in the Grist web client but not the
API, add or adapt a non-MCP qualification path only if needed for end-to-end
LinkKey acceptance. Then run one bounded gap review against current official Grist
Community access-rule capabilities; no additional feature is promoted without new
concrete generic evidence.

### Execution rules

Work proceeds sequentially E1-A through E1-F. Each slice must be independently
bounded and reviewed on its exact head when required by [AGENTS.md](../AGENTS.md).
Completed slice history belongs in issues, PRs, commits and CI; remove completed
work from this Roadmap as it is absorbed into current normative docs and tests.

The intended work remains MCP contract major 2 while changes are additive. Any
incompatible model-facing schema or semantic change requires a separate explicit
MCP-major decision.

No other functional expansion is currently selected.
