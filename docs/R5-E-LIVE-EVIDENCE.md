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

## Positive reviewer package — PASS

The earlier live qualification already exercised the exact ten-tool MCP v2 surface through the reviewer principal and recorded PASS for all five canonical positive cases:

- P1 — compact structure inspection without loading user-table rows;
- P2 — bounded filter/sort/no-match query behavior;
- P3 — two bounded synthetic record creations followed by verification by returned IDs;
- P4 — bounded `ReviewMetrics` schema creation and semantic re-read;
- P5 — bounded page/widget creation plus direct select-by reconfiguration and semantic re-read.

The same run also recorded an unrelated-resource DENY through the reviewer bridge path. See `docs/R5-E-PARTIAL-LIVE-EVIDENCE.md` for the bounded functional details.

## Operator-side fixture reset / repeatability — PASS

After the positive reviewer run, the authorized operator reset the synthetic fixture outside the MCP model-facing path.

A subsequent reviewer read-only inspection confirmed the clean baseline:

- only `Table1` and `ReviewTasks` remained;
- `ReviewMetrics` was absent;
- `Review dashboard` was absent;
- `ReviewTasks` retained exactly the three baseline rows `Seed Alpha`, `Seed Beta`, and `Seed Gamma`, all with `Status = Open`;
- the `Related -> ReviewTasks` self-reference remained present;
- no P3 record (`Review Alpha` / `Review Beta`) remained.

This demonstrates that the documented reviewer fixture can be restored through the authorized operator path without blind replay of MCP mutations.

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

All three canonical negative cases therefore satisfy the required non-invocation boundary.

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

All R5-E repository/technical and final operator/live evidence conditions are now satisfied:

1. the exact independently reviewed R5-E package candidate was built, preflighted, restarted and smoke-tested;
2. the ten-tool reviewer path had already passed P1-P5 plus unrelated-resource DENY;
3. canonical N1-N3 each produced a Grist non-invocation;
4. the synthetic fixture was restored through the authorized operator path and verified read-only;
5. current Grist Community version and non-secret deployment facts were recorded;
6. deployment logs passed the credential/secret-safe inspection.

No product defect or additional R5-E implementation gap was exposed. R5-E is therefore complete subject to integration of this evidence/roadmap transition with the repository's required exact-head review gate.

Final-host domain verification, final portal Tool Scan, publisher/business verification, public policy/support URLs, reviewer credential handoff, demo recording, OpenAI review and the explicit publish decision remain R5-F external actions. They must not be inferred or fabricated from this R5-E qualification.