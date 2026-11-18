## Change

Describe the current problem, resulting behavior and finite scope.

Dependencies: none, or explicit PRs and exact heads.

Review gate: REQUIRED — <why independent exact-head review is needed>\n\nFor bounded factual documentation-only changes, replace the line with\n`Review gate: NOT REQUIRED — <specific reason>`; never omit the reason.

## Convergence

State the net complexity reduction or justified cost. Identify temporary artifacts
absorbed/deleted, the normative home of durable constraints, and any compatibility
retained by the current MCP contract. Remove integrated Roadmap tasks and stale links.
Keep analysis, provenance, review and validation evidence in this PR.

## Validation

Record the exact tested head, type/test/build/audit/convergence results and relevant
native Grist checks. Record an independent exact-head verdict when required, in a PR comment:\n`Head: <full 40-character SHA>` and `Result: PASS` or `Result: CHANGES REQUIRED`.\nThe independent reviewer must attest in prose that they did not materially author\nthat exact head. Re-run failed `verify` after evidence is complete.
