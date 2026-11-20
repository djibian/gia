# Roadmap

Gia implements MCP contract major 2. The finite product evolution selected by
the owner on 2026-11-20 is [#295](https://github.com/djibian/gia/issues/295):
**construct and qualify a complete Grist Community application from a new,
empty document**, without importing or duplicating a source document. Native
full-document copying is a separate, complementary capability. Public-directory
publication remains inactive.

## Selected unfinished work

Deliver the smallest generic bounded semantics needed for the #295 acceptance
case. Work is eligible independently where dependencies allow; use native Grist
as oracle, and qualify unknown native behavior before claiming a contract.

1. **Faithful inspect/re-read:** expose enough safe normalized document, schema,
   UI/form, presentation, widget and policy state to detect supported, protected
   and incomplete components without leaking secrets.
2. **Create/configure:** fill demonstrated schema/conditional-choice/style,
   document settings, typed ACL and special schema-policy gaps, preserving
   untargeted state and native Owner enforcement.
3. **Usable UI:** configure and publish native forms with explicit authority,
   resolve stable field and inter-component references, and configure trusted,
   version-pinned custom widgets without arbitrary URLs or code execution.
4. **Document access:** qualify and, under a separately authorized document-
   scoped capability, configure existing-user shares and publication; never
   expand general account, service-account or organization administration.
5. **Reliable operation:** bound homogeneous work, report partial/uncertain
   effects, and enable an external client to reconcile/retry without duplication.
   Keep planning, application specifications and progress outside Gia.
6. **Integrated acceptance:** create the representative complex application
   from an empty document with synthetic data, then prove structural,
   functional and authenticated permission behavior (including denials).
   Native full-data copy is accepted separately, not as a substitute.

Do not add a new MCP tool or broad raw-Grists operations speculatively.
Preserve the ten-tool v2 interface where compatible; a breaking change
requires a separately justified contract-major decision. Native publication,
access changes and full widget authority require explicit user authorization.
Current acceptance evidence and the detailed design review live in #295.
Remove completed work from this Roadmap as it converges.

## Deferred work

[#234](https://github.com/djibian/gia/issues/234) tracks the deferred authenticated
principal-isolation qualification. Its remaining NOT QUALIFIED cases are recorded
in the issue.

[#235](https://github.com/djibian/gia/issues/235) remains an evidence-first JWKS
cost/reliability investigation. Public distribution
[#58](https://github.com/djibian/gia/issues/58) remains deferred.

New work follows the selection criteria in [Product Vision](PRODUCT_VISION.md)
and the integration requirements in [AGENTS.md](../AGENTS.md).
