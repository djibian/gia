# Roadmap

Gia 0.9.1 is the current product, implementing MCP contract major 2.
Public-directory publication remains inactive.

## E1 — Application-policy completeness

**Status: ACTIVE**

Real-use evidence shows that simple LinkKey-to-record comparisons are not enough
to inspect and safely modify important native composite Grist application policies.
The authorized finite evolution is tracked in
[issue #238](https://github.com/djibian/gia/issues/238).

### Goal

Make application policy a coherent fourth semantic layer beside data, schema and
UI for Grist Community, while preserving the compact ten-tool MCP v2 surface,
native Grist authority and Gia's closed safety boundary.

The evolution must not add raw ACL formula input, arbitrary UserActions, generic
identity/share/service-account administration, model-visible LinkKey values or a
claim that persisted policy proves effective confidentiality.

### Finite work

#### E1-D — policy inspection and deterministic lint

**Status: ACTIVE**

Add bounded deterministic diagnostics to the existing structural ACL dependency
view, distinguishing provable findings from explicitly classified warnings.
Cover supported target and condition references, ordered decisions and
schema-change impact without a second authorization engine. Protected or
opaque policy remains unknown; never infer effective authorization or expose
raw formulas or secret values.

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

Remaining work proceeds sequentially E1-D through E1-F. Each slice must be independently
bounded and reviewed on its exact head when required by [AGENTS.md](../AGENTS.md).
Completed slice history belongs in issues, PRs, commits and CI; remove completed
work from this Roadmap as it is absorbed into current normative docs and tests.

The intended work remains MCP contract major 2 while changes are additive. Any
incompatible model-facing schema or semantic change requires a separate explicit
MCP-major decision.

No other functional expansion is currently selected.
