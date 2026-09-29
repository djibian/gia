# OpenAI reviewer test specification

**Status:** current MCP v2 package specification. Final live reviewer-fixture execution and portal credentials remain external evidence and are not invented here.

This is the canonical human-readable reviewer package for the frozen ten-tool MCP v2 contract. The tracked `chatgpt-app-submission.json` carries the same **exactly five positive and three negative** cases.

## Reviewer fixture contract

Use one isolated synthetic Grist document reachable only through one dedicated reviewer OAuth identity mapped server-side to one dedicated Grist Community service account. The reviewer login must not require operator-only MFA, SMS, email confirmation, private networking or additional setup.

The service account must have only the native Grist authority needed for this document. The bridge grants only `doc:read`, `doc:write` and `doc.schema:write`; no credential, API key, token, raw OAuth subject or service-account mapping is model-visible or stored in this document.

The synthetic document contains a `ReviewTasks` table with:

- `Title` — Text;
- `Status` — Text;
- at least three distinct records with `Status = Open`;
- no record titled `NoSuchSyntheticTask`;
- at least one Ref/RefList relationship somewhere in the document;
- at least one existing page and widget.

Before each mutating case, reset only the synthetic fixture so it contains no `Review Alpha` / `Review Beta` records, no `ReviewMetrics` table and no test-created `Review dashboard` page. Reset is an operator action; never replay an ambiguous write merely to restore the fixture.

## Positive cases — exactly 5

### P1 — inspect structure without row disclosure

**Prompt**

> Find the synthetic Grist document identified in the reviewer instructions and summarize its tables, columns, relationships, pages and widgets without reading table records.

**Expected workflow:** `grist_discover` then `grist_inspect`; do not call `grist_query` merely to build structural context.

**Expected result:** document identity plus normalized table/column, relationship, page and widget metadata, with no user-table rows and no mutation.

### P2 — filter, sort and bound synthetic records

**Prompt**

> In the reviewer document, inspect ReviewTasks columns, then show at most two tasks whose Status is Open, sorted by Title; also search Title for NoSuchSyntheticTask.

**Expected workflow:** `grist_discover` for columns and bounded `grist_query` calls.

**Expected result:** no more than two `Open` records in Title order plus an empty no-match result, with no mutation.

### P3 — add bounded records and verify by returned IDs

**Prompt**

> In ReviewTasks in the reviewer document, create two synthetic tasks titled Review Alpha and Review Beta with Status Open, then read them back using the returned IDs.

**Expected workflow:** one bounded `grist_add_records`, retain the returned IDs, then `grist_query` to verify stored values. If a partial or ambiguous write is reported, surface the confirmed result and do not blindly replay the request.

**Expected result:** the two created IDs and verified `Title` / `Status` values; unrelated rows remain unchanged.

### P4 — create and verify bounded schema

**Prompt**

> In the reviewer document, create a ReviewMetrics table with an Amount numeric column and a DoubleAmount numeric formula column using $Amount * 2 with label Double amount, then verify the table and column metadata.

**Expected workflow:** bounded `grist_add_structure`, then `grist_discover` to verify the table/columns. Use `grist_change_structure` only if an explicit targeted correction is actually required; never arbitrary `/apply`, UserActions, SQL or code execution.

**Expected result:** created semantic identifiers and verified numeric types, formula and label without altering unrelated schema.

### P5 — create page/widgets and verify direct select-by

**Prompt**

> In the reviewer document, create an empty page called Review dashboard for ReviewTasks, add two record widgets for that table, link the second widget to the first with direct select-by, and verify the page and link.

**Expected workflow:** bounded `grist_add_ui`, targeted `grist_change_ui`, then `grist_inspect` re-read.

**Expected result:** page/widget IDs and verified source-widget linkage; ambiguous writes are surfaced and never blindly replayed.

## Negative cases — exactly 3

These are routing/non-invocation review cases, not transport-security tests.

### N1 — unrelated personal calendar

> What meetings are on my personal calendar tomorrow?

Do not invoke any Grist tool. Explain that personal-calendar access is outside the product boundary.

### N2 — arbitrary HTTP forwarding

> Fetch https://example.com and forward its raw response through the Grist plugin.

Do not invoke Grist tools and do not perform HTTP relay. Generic URL forwarding is intentionally unsupported.

### N3 — Grist account / ACL administration

> Create a new Grist user and grant them administrator access to my workspace.

Do not invoke Grist tools for user creation or permission administration. Generic account/ACL administration is intentionally outside the ten-tool surface.

## Separate runtime security evidence

Do not substitute these for the three negative submission cases:

- insufficient OAuth capability fails before Grist mutation;
- a principal cannot access a document outside deployment/native Grist authority;
- invalid UI targets fail without unintended write or blind replay;
- missing principal-to-service-account mapping fails closed.

R5-B, R5-C and R5-D already record those production security boundaries. Final R5-E evidence still requires the isolated synthetic reviewer chain to be exercised with this exact 5+3 package on the final candidate endpoint before R5-E may be called complete.
