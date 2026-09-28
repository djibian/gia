# R4 — Completion candidate

This document assembles the integrated evidence for the final independent R4 product-candidate review.

## Candidate under review

Integrated candidate before the selection-changing completion commit:

- `main`: `d5f56989440f8c250663ed4339bc1bb5a5703a2a`;
- runtime/public contract: MCP v2, ten bounded tools;
- supported/tested Grist Community versions: 1.7.16, 1.7.17, 1.7.18 and 1.7.19;
- no stage/CCF/business module is active in the product runtime.

The completion PR changes only roadmap/current-state evidence. It does not alter runtime, MCP semantics, authorization, Grist operations or the tested compatibility range.

## Required class matrix

| Class | Disposition | Durable evidence |
| --- | --- | --- |
| R4-1 new generic application | PASS | `docs/R4-COMPATIBILITY.md`; real ephemeral Grist docs are created and evolved through the actual MCP v2 candidate |
| R4-2 existing generic application | PASS | `docs/R4-APPLICATION-VALIDATION.md`; target evolution preserves unrelated rows, configuration marker and existing page |
| R4-3 stage-tracking application | PASS | `docs/R4-APPLICATION-VALIDATION.md`; fictional stage schema, real Ref, real native Grist row ACL, distinct users, preservation before/after mutation |
| R4-4 materially different second application | PASS | `docs/R4-APPLICATION-VALIDATION.md`; fictional CCF/pedagogy app preserves mission/response state while adding bounded structure/UI |
| R4-5 rerun/idempotence | PASS | same application campaign; every semantic intention is rerun after reinspection, already-satisfied mutations are skipped, duplicate/drift assertions pass |
| R4-6 partial/ambiguous failure | PASS | `docs/R4-DETERMINISTIC-RESULTS.md`; active fault-injection path verifies uncertain effects, confirmed partial effects and no blind replay |
| R4-7 authorization/isolation | PASS | `docs/R4-DETERMINISTIC-RESULTS.md`; resource/capability restriction, principal-bound credential/context/cache separation and secret minimization |
| R4-8 browser-dependent behavior | NOT TRIGGERED | committed material UI/access postconditions were observable through MCP plus real Grist API/user semantics; no browser-only requirement emerged |
| R4-9 Grist Community compatibility | PASS | `docs/R4-COMPATIBILITY.md`; exact-version matrix 1.7.16–1.7.19 passed against real Community containers |

## Exit-criteria check

### Current results for all required classes

Satisfied. All nine classes have a current disposition; eight are PASS and the conditional browser class is explicitly NOT TRIGGERED because no committed browser-only postcondition emerged.

### No unresolved critical correctness/security/data-integrity defect in supported scope

No critical defect was revealed by R4. The first compatibility-matrix failure was a harness setup issue caused by Grist's first-run gate; it was corrected with the documented `GRIST_IN_SERVICE=true` test-container setting and did not require a product/runtime change.

### Supported/unsupported boundaries explicit

Supported/tested:

- Grist Community exact releases 1.7.16–1.7.19;
- static-bearer controlled deployment with a server-side Grist key and bounded resource policy;
- optional OAuth principal separation plus principal-derived credential/context/cache seam;
- bounded schema/data/UI operations in MCP contract v2.

Not claimed by R4:

- untested earlier/future Grist releases;
- transactional atomicity across multi-batch writes;
- blind retry after an uncertain write;
- production per-user Grist credential custody/onboarding when a shared server-side Grist key is configured;
- generic ACL administration, arbitrary `/apply`, raw SQL, generic HTTP forwarding or browser automation;
- business-specific stage/CCF logic in the bridge.

Production identity/credential custody and distribution remain R5 concerns.

### Reruns do not reveal systematic duplication/destructive drift

Satisfied by the application campaign. The semantic client re-inspects current state before repeating intentions; postconditions assert one copy of intended columns/pages and preservation of unrelated data/configuration.

### Integrated product-candidate review

**PENDING independent exact-head review.**

The reviewer should challenge the integrated candidate and this completion transition for:

- incorrect interpretation of any R4 class;
- test-platform growth being mistaken for product capability;
- false compatibility/security claims;
- hidden business coupling;
- unsupported scope accidentally presented as supported;
- mismatch between the final Roadmap state and durable evidence.

Required durable result on the exact completion PR head:

```text
AUTONOMOUS REVIEW
Head: <exact full SHA>
Result: PASS
```

Only that independent PASS plus green exact-head CI authorizes merge of the completion transition.
