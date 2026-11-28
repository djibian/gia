# Roadmap

Gia implements [MCP contract major 2](MCP-CONTRACT.md) with ten tools.

## Selected unfinished work

### Native ACL vertical evolution — understand, transform, qualify

This is the only selected evolution. Establish the three capabilities together
on native application ACLs before generalizing to other domains. No horizontal
rewrite or universal application model is selected.

- **Understand:** project native resources, ordered rules, user attributes,
  general/special permissions and parsed conditions independently of edit
  support. Preserve partial knowledge and report unavailable/ambiguous
  metadata, implicit or dynamically generated policy separately. Use a
  secret-safe structural projection and on-demand dependency extraction;
  verify against the native stage-tracking policy and independent synthetic
  policy shapes, not one application's grammar alone.
- **Transform:** replace predicate-by-predicate growth with bounded compositional
  native expressions; reconcile and patch explicit rules, order and supported
  resource/attribute fields without rewriting opaque siblings. Use native
  validation and re-read effects, protect existing authority boundaries,
  distinguish atomic guarantees from stale-state detection and postconditions,
  and reject ambiguity. Verify preservation, no-op/replay, concurrency and
  uncertain-write behavior. Changes to general/special permissions require
  effect-appropriate safeguards, never implicit publication or privilege
  expansion.
- **Qualify:** develop native probes alongside inspection and mutation; provide
  an AI-accessible bounded scenario execution path with explicit target and
  operation authority. Reuse the existing disposable Grist/native API and web
  harnesses where applicable; test positive and negative R/C/U/D/S, user
  attributes, LinkKeys (including absent/invalid contexts) and relevant
  indirect access surfaces. Qualify only exercised contexts/channels; keep
  credentials and sensitive observations private. No production test login,
  arbitrary impersonation, implicit sharing, generic action forwarding or
  unrestricted mutating probes. Retire the internal ACL simulator with an
  explicit contract migration.

Completion requires independently reviewed native evidence for each capability,
including a complex policy change with preservation of opaque neighbors and
directly client-accessible qualification, plus retained compatibility and
application-preservation regressions. Validate the native stage-tracking
structure using synthetic data; never publish its source document, personal
rows, tokens or secret-bearing links. Remove obsolete ACL machinery and tests
whose sole subject is removed behavior as the replacement becomes available.
Preserve the current MCP contract unless a justified, reviewed migration
changes it; no mandatory major bump or fixed tool-count target.

Subsequent cross-domain generalization requires separately selected concrete
work under the Product Vision.

## Deferred work

[#234](https://github.com/djibian/gia/issues/234) tracks the deferred authenticated
principal-isolation qualification. Its remaining NOT QUALIFIED cases are recorded
in the issue.

[#235](https://github.com/djibian/gia/issues/235) remains an evidence-first JWKS
cost/reliability investigation. Public distribution
[#58](https://github.com/djibian/gia/issues/58) remains deferred.

New work follows the selection criteria in [Product Vision](PRODUCT_VISION.md)
and the integration requirements in [AGENTS.md](../AGENTS.md).
