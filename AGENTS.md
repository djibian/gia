# Development contract

Gia is a compact MCP adaptation layer for Grist Community. The client reasons
and orchestrates; Gia executes bounded generic operations; Grist owns state and
permissions. Business applications are consumers, never core dependencies.

## Authority and startup

- Resolve the exact GitHub `main` SHA and read this file,
  [Product Vision](docs/PRODUCT_VISION.md) and [Roadmap](docs/ROADMAP.md) at that SHA.
- Reconstruct relevant open PRs, exact heads, CI, reviews and dependencies.
  Conversation history and another execution's progress are not project state.
- Implement only an explicit user-authorized scope or current committed Roadmap
  work. Advice, issues, upstream features and deferred publication are not
  implicit implementation authority. Stop when the authorized finite scope is exhausted.
- Use official Grist behavior as the semantic oracle. Prefer a proven licensed
  implementation or the smallest compatible adaptation. Confirm licensing
  before copying code; retain required attribution and record provenance in the PR.
- Make routine technical choices autonomously within the authorized scope.
  New product scope, authority expansion, production secrets or irreversible
  external actions require authorization; continue independent eligible work.

## Changes and integration

- Work on a short-lived branch with one purpose, never directly on `main`.
  Finish or explicitly supersede overlapping work before replacing it.
- Preserve the current [MCP contract](docs/MCP-CONTRACT.md),
  [security invariants](docs/SECURITY.md) and untargeted user state.
  Do not delete a current constraint before moving it into code, tests or the
  appropriate normative document.
- Remove obsolete complexity before adding a replacement. Refactor only when
  the result has less net complexity; no aesthetic splitting or speculative abstraction.
- Add focused regressions for meaningful semantic or safety boundaries. Keep
  useful existing tests; remove tests whose sole subject is a removed artifact.
- A PR states scope, dependencies, net complexity reduction, validation and
  `Review gate: REQUIRED` or `Review gate: NOT REQUIRED` with a reason.
- Independent exact-head review is required for runtime semantics, MCP contract,
  authorization/security, stable IDs, partial/uncertain writes, non-trivial
  architecture, and governance or product-selection changes. Bounded factual
  documentation/link fixes normally do not require it.
- An author must not independently PASS or merge a review-required head they
  materially authored. Delegate review to an isolated reviewer who did not author
  it, or leave it for a fresh independent execution. Review challenges correctness,
  scope, security, preservation, licensing, contract coherence and convergence.
- Record the verdict on the PR as `Head: <full SHA>` and `Result: PASS` or
  `Result: CHANGES REQUIRED`. A verdict is valid only for that exact head.
- Require green exact-head CI and an applicable independent PASS before merging
  review-required work. Recheck `main`, PR head and dependencies before push,
  review, readiness or merge. If they moved, reconstruct state and adapt;
  never blind-force over concurrent work. Resolve review findings, merge through
  GitHub and verify the resulting `main`.

## Convergence Invariant

**An evolution is complete only when its temporary artifacts have been absorbed
into the current product or removed from `main`.**

`main` describes only the current product; Git/GitHub preserves history.

- Keep only the current normative documents listed in [Development](docs/DEVELOPMENT.md).
  Update existing documentation rather than adding reports or parallel specifications.
- Put analysis, decisions, review evidence and test results in PRs/issues;
  use commits, tags, releases and CI artifacts for history. No committed reports,
  evidence archives, POCs, dated release notes, milestone documents, completed
  Roadmap slices, obsolete contracts or dormant implementation banks.
- Before merge, remove superseded code, tests, tools and compatibility that have
  no current consumer; absorb durable constraints; repair references; remove
  integrated Roadmap tasks. Keep compatibility promised by the current contract.
- Run `npm run check:convergence`, type checks, tests, production dependency audit
  and build. Use the retained native Grist checks when relevant.
- CI enforces the document inventory, forbidden artifacts, unfinished-only
  Roadmap and local documentation links. Changing that policy requires a
  justified governance review, not an exception to preserve temporary material.
