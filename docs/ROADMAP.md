# Roadmap

Gia 0.10.1 is the current product, implementing Gia MCP contract major 2.
Public-directory publication remains inactive.

## Selected product evolution

The user-authorized effective application-policy qualification program is tracked
in [#279](https://github.com/djibian/gia/issues/279). It builds on completed E1
without reopening #238. The goal is to qualify explicit authorization properties
with a strict distinction between policy coverage, expected bounded decisions and
actual native Grist evidence. It is not authorization for an exhaustive ACL
interpreter, arbitrary formulas/UserActions, identity administration or universal
security claims.

| Work | Bounded result | Dependencies |
| --- | --- | --- |
| [#283](https://github.com/djibian/gia/issues/283) E2-D | Browser qualification for web-only authorization surfaces | Native API qualification where shared plumbing is useful |
| [#284](https://github.com/djibian/gia/issues/284) E2-E | Bounded concurrent authorization and locking qualification | Native API qualification; #283 only for browser cases |
| [#285](https://github.com/djibian/gia/issues/285) E2-F | Integrated effective-policy gap review and convergence | preceding selected E2 slices |

Controllers pull the smallest useful complete eligible slice and re-resolve current
main, PR heads and dependencies before work. Keep exactly ten MCP v2 tools unless
separately authorized. Reuse the current bounded ACL semantics, simulation,
application-validation, compatibility and LinkKey browser harness. Production
qualification remains read-only; native writes, deletes and concurrency tests run
only on disposable synthetic Grist with authorized test identities. Unknown or
opaque policy produces explicit uncertainty rather than an inferred security result.

## Deferred work

[#234](https://github.com/djibian/gia/issues/234) authenticated principal-isolation
qualification is explicitly deferred by the operator/user; its remaining
NOT QUALIFIED cases stay recorded and are not a PASS.
[#235](https://github.com/djibian/gia/issues/235) remains an evidence-first JWKS
cost/reliability investigation and does not authorize a speculative cache or OAuth
semantic change. Public distribution
[#58](https://github.com/djibian/gia/issues/58) remains deferred.

Controllers use short-lived branches and the review/CI requirements in
[AGENTS.md](../AGENTS.md). Runtime, MCP contract, authorization/security and
governance changes require independent PASS on the exact proposed head before
merge; an author cannot independently PASS or merge their material changes.
Preserve current authority, secret exclusions, stable IDs, untargeted state and
explicit partial/uncertain effects.

Remove each integrated slice from this file; preserve analysis and evidence in its
issue/PR. Update existing normative documentation rather than adding reports or
parallel contracts. New capabilities still require the selection criteria in
[Product Vision](PRODUCT_VISION.md); implementation and safety limits remain in
[MCP Contract](MCP-CONTRACT.md), [Security](SECURITY.md) and
[Development](DEVELOPMENT.md).
