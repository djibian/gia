# R5-E partial live reviewer qualification evidence

Date: 2026-09-29 UTC  
Repository candidate integrated on `main`: `b514a24d0244a387debef3b43cf8d13c23cbc0c5`  
Observed MCP contract: v2, ten lean tools  
Environment: authorized R5 reviewer validation deployment

## Evidence boundary

This document records useful live R5-E evidence obtained after the technical reviewer package was integrated in #186. It is intentionally **partial evidence**, not R5-E completion evidence.

The connected reviewer endpoint exposed the ten-tool MCP v2 surface and an isolated synthetic Grist document through the reviewer principal path. The deployment did not expose a trustworthy runtime Git-SHA/version endpoint during this exercise, so this record does **not** claim that the live bridge process was already running exact repository commit `b514a24d0244a387debef3b43cf8d13c23cbc0c5`.

No password, OAuth bearer/refresh/ID token, authorization code, PKCE verifier, Grist API/service-account key, raw OAuth subject, principal-map content, portal challenge token or unrelated document identifier is retained here.

## Observed reviewer surface

`grist_help` reported MCP contract version `2` and the expected lean tool classes. The connected plugin exposed exactly these ten tools:

```text
grist_discover
grist_inspect
grist_query
grist_add_records
grist_change_records
grist_add_structure
grist_change_structure
grist_add_ui
grist_change_ui
grist_help
```

The observed read/write/destructive classes matched the frozen lean registry: discovery/inspection/query/help are read-only; add operations are bounded non-destructive writes; change operations are bounded destructive writes.

This proves the visible reviewer MCP surface, but it is not a substitute for a final portal Tool Scan on the selected publication endpoint.

## Synthetic fixture preparation

The only document exposed through the reviewer discovery path was the existing isolated qualification resource alias `R5D_ALLOWED`, with document-level editor authority.

The document initially contained one synthetic table and one page/widget. To satisfy the reviewer fixture shape, the reviewer MCP path was used to add a baseline `ReviewTasks` table with:

- `Title` — Text;
- `Status` — Text;
- `Related` — `Ref:ReviewTasks`;
- three distinct synthetic rows with `Status = Open`;
- no `NoSuchSyntheticTask` row.

A semantic re-inspection then reported a complete UI snapshot, one Ref relationship and existing page/widget context.

This baseline preparation was a bounded synthetic setup action. It does **not** replace the operator-side clean reset required by `docs/R5-E-REVIEWER-QUALIFICATION.md` for a final repeatable reviewer run.

## Positive reviewer cases

### P1 — structure inspection without row disclosure: PASS

Document discovery selected only the isolated reviewer resource. `grist_inspect` returned normalized tables, columns, the Ref relationship, pages and widgets without loading user-table rows and without mutation.

### P2 — bounded filter/sort/no-match: PASS

Column discovery confirmed the expected `ReviewTasks` schema. A bounded query for `Status = Open`, sorted by `Title`, `limit = 2`, returned exactly two ordered synthetic rows. A second query for `Title = NoSuchSyntheticTask` returned an empty result.

### P3 — add bounded records and verify by returned IDs: PASS

One `grist_add_records` invocation created exactly the two requested synthetic rows:

- `Review Alpha` / `Open`;
- `Review Beta` / `Open`.

The returned record IDs were retained and used in a subsequent bounded query. Both records were re-read with the exact stored `Title` and `Status`. The write was not replayed.

### P4 — create and verify bounded schema: PASS

One bounded structure creation added `ReviewMetrics` with:

- `Amount` — `Numeric`, non-formula;
- `DoubleAmount` — `Numeric`, formula `$Amount * 2`, label `Double amount`.

A separate column discovery re-read the exact requested types, formula flag, formula text and label.

### P5 — create page/widgets and direct select-by: PASS

The reviewer MCP path created an empty `Review dashboard` page for `ReviewTasks`, then added two native record widgets. The second widget was updated with a direct select-by reference to the first. A separate page/widget inspection re-read the link as normalized `sourceWidgetId` state, with normalization complete.

No ambiguous write was blindly replayed.

## Authority isolation check: PASS

A direct semantic inspection was attempted against a different existing Grist document outside the reviewer deployment/resource grant. The bridge rejected the request before protected document content was returned.

Retained result:

```text
reviewer synthetic document: ALLOW
unrelated control document: DENY
```

The unrelated document identifier is deliberately omitted from this evidence.

## Secret/output observation

The model-visible MCP results retained during this exercise contained bounded semantic document/table/record/page/widget state and generic authorization errors only. No password, OAuth token, Grist credential, raw provider subject, principal-map content or portal token was observed in those tool results.

This is **not** a substitute for the required operator-side inspection of bridge/deployment logs.

## Remaining R5-E completion conditions

R5-E remains active. The following evidence is still required before it may move to `DONE`:

1. **Exact deployed candidate identity:** operator/deployment evidence must show that the reviewer endpoint is running the independently reviewed R5-E candidate, rather than inferring this from the visible ten-tool contract.
2. **Canonical N1-N3 routing run:** execute the personal-calendar, arbitrary-HTTP-forwarding and Grist-account/ACL prompts through the actual reviewer ChatGPT routing path and record that no Grist tool is invoked.
3. **Operator-side fixture reset/repeatability:** restore the synthetic reviewer fixture through the authorized operator path and preserve the documented no-blind-replay boundary.
4. **Secret-safe deployment-log check:** inspect the bridge/deployment evidence and confirm that no token, key, password, raw subject or principal-map content was retained.
5. **Current environment identity:** record the actual Grist Community version and other non-secret deployment facts used for the final reviewer run.

Final-host domain verification, final portal Tool Scan, publisher/business verification, public policy/support URLs, reviewer credential handoff, demo recording, OpenAI review and publish decision remain R5-F external actions as defined by the roadmap.

## Current conclusion

The live reviewer path has now demonstrated the complete positive functional package P1-P5 and a real unrelated-resource DENY using the ten-tool MCP v2 surface. No product defect or additional R5-E implementation gap was exposed by those exercises.

The remaining R5-E blockers are deployment/reviewer evidence that cannot be truthfully inferred from the model-facing MCP interface. R5-E therefore remains **not DONE** until those external/operator facts are supplied and the final reviewer run is recorded.