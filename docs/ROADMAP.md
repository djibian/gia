# Roadmap

Gia 0.10.1 is the current product, implementing Gia MCP contract major 2.
Public-directory publication remains inactive. No new product capability is selected.

## Selected integration corrections

The user-authorized adversarial audit is tracked in
[#261](https://github.com/djibian/gia/issues/261). The finite scope below repairs
confirmed implementation, contract, discoverability and deployment inconsistencies.
Re-resolve current main and PR heads before selecting a slice; issue evidence is
anchored to its audited SHA, not an assumption that main has stayed unchanged.

| Work | Bounded result | Dependencies |
| --- | --- | --- |
| [#234](https://github.com/djibian/gia/issues/234) Operational isolation | Finish the scoped current authenticated authorization evidence | Never widen production grants for a test |

[#235](https://github.com/djibian/gia/issues/235) remains an evidence-first
JWKS cost/reliability investigation. It does not authorize a speculative cache
or OAuth semantic change. Public distribution
[#58](https://github.com/djibian/gia/issues/58) remains deferred.

Controllers use short-lived branches and the review/CI requirements in
[AGENTS.md](../AGENTS.md). Runtime, MCP contract, authorization and governance
changes require an independent PASS on the exact proposed head before merge;
an author cannot independently PASS or merge their material changes.
Keep exactly ten tools, current authority, secret exclusions, stable IDs,
untargeted state and explicit partial/uncertain effects. Native mutating
qualification runs only on disposable Grist. Production qualification is
read-only and remains explicitly unqualified where the required authorized
principal is unavailable.

Remove each integrated slice from this file; preserve analysis and evidence in
its issue/PR. Update existing normative documentation, without adding reports,
parallel contracts, a generic evaluator or an orchestration framework.
New capabilities still require the selection criteria in
[Product Vision](PRODUCT_VISION.md); implementation and safety limits remain in
[MCP Contract](MCP-CONTRACT.md), [Security](SECURITY.md) and
[Development](DEVELOPMENT.md).
