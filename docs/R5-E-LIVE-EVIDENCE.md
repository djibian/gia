# R5-E final live reviewer qualification evidence

Date: 2026-09-29 UTC  
Reviewed/integrated R5-E package candidate: `b514a24d0244a387debef3b43cf8d13c23cbc0c5`  
Observed MCP contract: v2, ten lean tools  
Environment: authorized R5 reviewer validation deployment

## Evidence boundary

This document closes the operator/live evidence conditions defined by `docs/R5-E-REVIEWER-QUALIFICATION.md`. It extends the earlier partial evidence in `docs/R5-E-PARTIAL-LIVE-EVIDENCE.md`; it does not replace the R5-F publication gate.

No password, OAuth bearer/refresh/ID token, authorization code, PKCE verifier, Grist API/service-account key, raw OAuth subject, principal-map content, portal challenge token or unrelated document identifier is retained here.

## Exact deployed candidate identity — PASS

Before activation, the deployment checkout was still on the earlier R5-D commit. The operator fetched the repository, checked out the exact R5-E package commit `b514a24d0244a387debef3b43cf8d13c23cbc0c5`, then ran the package installation, TypeScript checks, full unit/contract test suite and production build.

Observed result before restart:

- checkout SHA: `b514a24d0244a387debef3b43cf8d13c23cbc0c5`;
- `npm ci`: PASS, zero reported vulnerabilities;
- `npm run check`: PASS;
- `npm test`: PASS, 251 passed / 0 failed;
- `npm run build`: PASS.

The production OAuth preflight was then executed with the same protected systemd environment as the service and reported PASS for configuration validity, OAuth mode, canonical MCP resource, allowed public resource host, HTTPS Grist base URL, bounded operation limits, per-principal rate limit and multi-principal Grist credentials.

The service was restarted only after those checks. The replacement process started at 2026-09-29 19:41:46 UTC with working directory `/opt/grist-chatgpt/app` and command `/usr/bin/node /opt/grist-chatgpt/app/dist/server.js`; a post-restart repository check still returned the exact candidate SHA above.

Immediately before the final reviewer rerun, the operator rechecked the running service and observed the same exact checkout SHA, `MainPID=578799`, `ActiveState=active`, `SubState=running`, the same start timestamp, the same working directory and the same Node command. This binds the final Tool Scan and P1-P5 rerun below to the confirmed candidate process rather than inferring identity from its visible tool surface.

The live OAuth operational smoke against the restarted process reported PASS for:

- health endpoint;
- protected-resource metadata;
- metadata resource binding;
- authorization-server metadata;
- advertised scopes;
- unauthenticated MCP challenge.

The restart journal contained only normal systemd stop/start lines and the bounded listener startup event; no runtime error was observed.

## Current environment identity — PASS

The reviewer run used the controlled Grist Community container image:

```text
gristlabs/grist:1.7.19
```

The bridge ran as the dedicated `grist-chatgpt` system user through `grist-chatgpt.service`, with the protected environment loaded by systemd rather than copied into model-visible evidence.

## Exact final-candidate Tool Scan — PASS

After the exact running candidate identity was re-established, the connected ChatGPT reviewer namespace exposed exactly these ten MCP v2 tools:

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

`grist_help` independently reported `contractVersion: 2` and the expected bounded classes:

- discovery/inspection/query/help are read-only;
- `grist_add_records` is a non-destructive `doc:write` operation;
- `grist_change_records` is destructive `doc:write`;
- `grist_add_structure` and `grist_add_ui` are non-destructive `doc.schema:write`;
- `grist_change_structure` and `grist_change_ui` are destructive `doc.schema:write`.

This is the exact reviewer Tool Scan required by R5-E. The separate final OpenAI portal Tool Scan remains an R5-F external action.

## Exact final-candidate positive reviewer package P1-P5 — PASS

The canonical P1-P5 package from `docs/OPENAI-REVIEWER-TESTS.md` was rerun through the actual reviewer ChatGPT path after the exact candidate process above had been confirmed.

### P1 — inspect structure without row disclosure: PASS

The reviewer discovered the isolated reviewer document and then used `grist_inspect` for document structure only. The result returned normalized tables, columns, the `Related -> ReviewTasks` Ref relationship, pages and widgets without loading user-table rows and without mutation.

### P2 — bounded filter/sort/no-match: PASS

The reviewer rediscovered the `ReviewTasks` columns, then queried `Status = Open` sorted by `Title` with `limit = 2`. Exactly two ordered rows were returned. A separate bounded query for `Title = NoSuchSyntheticTask` returned an empty result. No mutation occurred.

### P3 — add bounded records and verify returned IDs: PASS

Before P3, the operator restored the clean fixture and a reviewer read-only inspection/query verified:

- only `Table1` and `ReviewTasks` existed;
- only the three `Seed Alpha`, `Seed Beta`, `Seed Gamma` rows remained in `ReviewTasks`;
- `ReviewMetrics` and `Review dashboard` were absent;
- the `Related -> ReviewTasks` Ref relationship remained intact.

One bounded `grist_add_records` call created exactly:

- `Review Alpha` / `Open`;
- `Review Beta` / `Open`.

The bridge returned record IDs `4` and `5`. A subsequent bounded query by those IDs re-read the exact stored titles/status values. No blind replay occurred.

### P4 — create and verify bounded schema: PASS

Before P4, the operator removed the P3 rows and reviewer read-only checks re-established the same clean baseline. One valid bounded `grist_add_structure` creation added `ReviewMetrics` with:

- `Amount` — `Numeric`, non-formula;
- `DoubleAmount` — `Numeric`, formula `$Amount * 2`, label `Double amount`.

A separate column discovery re-read the exact requested types, formula flag, formula text and label. No unrelated schema was altered.

### P5 — create page/widgets and verify direct select-by: PASS

Before P5, the operator removed `ReviewMetrics` and its associated page. Reviewer read-only checks confirmed only the two base pages/tables remained and no P3 rows were present.

The reviewer then:

1. created an empty `Review dashboard` page for `ReviewTasks` (page ID `3`);
2. added two `ReviewTasks` record widgets (widget IDs `7` and `8`);
3. updated widget `8` with direct select-by from widget `7`;
4. re-read the page widgets with `grist_inspect`.

The final normalized result reported `selectByNormalized.sourceWidgetId = 7` for widget `8`, with normalization complete. No ambiguous write was replayed.

## Reviewer authority isolation — PASS

After the exact-candidate P1-P5 rerun, a direct semantic inspection was attempted against an existing Grist document outside the reviewer bridge grant. The bridge rejected the request as not allowed before protected document content was returned.

Retained result only:

```text
reviewer synthetic document: ALLOW
unrelated control document: DENY
```

The unrelated document identifier is deliberately omitted from durable evidence.

## Operator-side fixture reset / repeatability — PASS

The mutating positive cases were each preceded by the required operator-side fixture reset rather than by blind MCP replay. Read-only reviewer checks were used to verify the clean state before P3, P4 and P5.

The clean baseline retained:

- `Table1` and `ReviewTasks`;
- exactly `Seed Alpha`, `Seed Beta`, and `Seed Gamma` with `Status = Open`;
- the `Related -> ReviewTasks` self-reference;
- no P3 records, `ReviewMetrics` or `Review dashboard` before the corresponding mutating case.

This demonstrates repeatable fixture restoration through the authorized operator path while preserving the no-blind-replay boundary.

## Canonical negative routing cases N1-N3 — PASS

The three canonical negative prompts were executed through the actual reviewer ChatGPT routing path after the exact candidate deployment was active.

### N1 — personal calendar

Prompt intent: request meetings from the user's personal calendar.

Observed result: ChatGPT stated that personal-calendar access is outside the Grist plugin scope. **No Grist tool was invoked.**

### N2 — arbitrary HTTP forwarding

Prompt intent: fetch `https://example.com` and forward its raw response through the Grist plugin.

Observed result: ChatGPT stated that the Grist plugin is not an arbitrary HTTP relay. **No Grist tool was invoked.**

### N3 — Grist account / ACL administration

Prompt intent: create a Grist user and grant workspace administrator access.

Observed result: ChatGPT stated that user and ACL administration is outside the plugin scope. **No Grist tool was invoked.**

All three canonical negative cases therefore satisfy the required non-invocation boundary on the same deployed final candidate path.

## Secret-safe deployment-log inspection — PASS

The operator inspected the service journal beginning immediately before the R5-E candidate restart. The check loaded the protected deployment environment and principal-map locally but printed no secret values.

The final bounded result was:

```text
service_log_lines: 11
credential_values_checked: 2
credential_value_hits: 0
suspicious_secret_label_hits: 0
opaque_principal_id_hits_informational: 5
R5E_SECRET_SAFE_LOG_CHECK: PASS
```

Only the actual credential **values** from the protected principal mapping were treated as secret material for exact-value matching. Opaque `oauth:<hash>` principal IDs were counted separately as informational audit identifiers and did not cause a failure; raw OAuth subjects were not retained.

No configured Grist service-account credential value and no suspicious token/password/secret label was found in the inspected bridge journal.

## R5-E conclusion

All R5-E repository/technical and final operator/live evidence conditions are now satisfied on the same confirmed final candidate path:

1. the exact independently reviewed R5-E package candidate was built, preflighted, restarted, smoke-tested and re-identified immediately before the final reviewer rerun;
2. the exact ten-tool MCP v2 Tool Scan passed on that connected reviewer path;
3. canonical P1-P5 were rerun on that path and all postconditions passed;
4. canonical N1-N3 each produced a Grist non-invocation after the same exact candidate deployment;
5. the synthetic fixture was repeatedly restored through the authorized operator path and verified read-only before mutating cases;
6. unrelated Grist authority was denied on the same reviewer path;
7. current Grist Community version and non-secret deployment facts were recorded;
8. deployment logs passed the credential/secret-safe inspection.

No product defect or additional R5-E implementation gap was exposed. R5-E is therefore complete subject to integration of this evidence/roadmap transition with the repository's required independent exact-head review gate.

Final-host domain verification, final portal Tool Scan, publisher/business verification, public policy/support URLs, reviewer credential handoff, demo recording, OpenAI review and the explicit publish decision remain R5-F external actions. They must not be inferred or fabricated from this R5-E qualification.
