# Gia v0.7.0 — post-R6 release notes

Gia 0.7.0 is the first release line containing the completed R6 Pareto
convergence work. The implementation version moves from 0.6.0 to 0.7.0 while
the public MCP contract remains **major version 2 with exactly ten tools**.

## Added in R6

The seven selected generic Grist capabilities are integrated:

- C2 — visible widget fields, order and width through stable column IDs;
- C4 — persistent per-widget filters with targeted preservation;
- C3 — Grist-native summary construction and verified generated-table identity;
- C5 — Card/Card List field layout through stable column IDs;
- C10 — hierarchy-preserving page navigation ordering with exact
  `navigationPageIds`;
- C1 — bounded application-level table/column access-rule groups with fresh
  native Owner proof and preservation of untargeted policy;
- C8 — empty document creation and same-installation native copy-as-template
  into explicitly authorized workspaces.

No new public tool, OAuth scope, planner, workflow engine, raw SQL surface,
arbitrary `/apply` input or generic identity/share administration is added.

## Release hardening

The post-R6 Expert findings were used as a finite release-stabilization set.
0.7.0 corrects or hardens:

- native `CreateViewSection` summary return handling;
- native stale Card leaves after field hide/re-show, while preserving clean unary groups through write/re-read;
- machine-readable no-blind-retry effect state for C1/C8 post-write failures;
- JWT optional `nbf`, JOSE critical extensions, algorithm/key-family/curve
  compatibility and minimum 2048-bit RSA signing keys;
- C8 copy's action-specific source `doc:read` OAuth requirement/challenge;
- the final 200-filter bound before write;
- Card completeness in compact document inspection;
- actual native resulting column ID after rename;
- unknown native page-layout keys before replacement;
- exact inspectable page-navigation target sets, with explicit incompleteness rather than discarded context when C10 cannot resolve them;
- safe shared page/widget result projections that retain numeric layout compatibility while omitting arbitrary URL/plugin/configuration metadata;
- retirement of the obsolete current v1 OAuth probe path and current Gia probe
  identity.

Current documentation and progressive tool descriptions also state the
remaining policy limits explicitly.

## Security and authority limits

Grist remains authoritative. Gia's effective authority is the intersection of
the selected upstream credential, deployment ceiling, principal resource grant
and required capability.

Persisting a C1 access-rule group is **not** proof of effective confidentiality:
native default/special/schema-edit policy, structure permission and formulas
remain relevant. Hidden fields and saved filters are presentation state.

A native summary is backed by its own generated/reused table; Gia does not claim
source-table ACL inheritance.

A C8 template copy is a bootstrap primitive, **not a privacy scrub**. Native
template semantics remove user data/attachments/history as defined by Grist but
retain substantial document metadata, formulas/configuration and policy
metadata. A failed postcondition after a known document ID never authorizes a
blind replay or guessed cleanup.

## MCP v2 compatibility disposition

0.7.0 keeps the supported numeric UI layout/sort/identity compatibility detail
of MCP v2. Public options are limited to display flags and custom-widget
access/identity. Arbitrary URLs, plugin settings, unsupported layout attributes
and invalid raw sort tokens are omitted with `compatibilityMetadataOmitted: true`.
Complete internal snapshots remain unchanged for read-modify-write preservation
and exact verification. This security correction introduces no exception to the
secret boundary and preserves the promised supported numeric layout shape.

New integrations should use normalized stable-ID fields. Removing the remaining
non-secret compatibility fields requires a separately reviewed future MCP
major-version decision.

## Grist Community compatibility evidence

On exact Gia head
`3ba9267258d7df74e10d3efb729bec69fd905612`, GitHub Actions compatibility run
**37242250026** passed the bounded release probe on:

- Grist Community 1.7.16;
- 1.7.17;
- 1.7.18;
- 1.7.19;
- 1.7.20.

The same exact head also passed baseline CI run **37242250022** and the retained
existing-application validation run **37242250036**. See
`docs/R4-COMPATIBILITY.md` for the exact bounded native scenarios and the
limits of this compatibility claim.

## Deferred work

R7 remains usage-driven and deferred. R5-F public-directory distribution also
remains deferred. Neither is part of this release.

The optional code-cleanup items identified by the post-R6 Expert report are not
release requirements and do not justify delaying 0.7.0 or broadening its
contract.
