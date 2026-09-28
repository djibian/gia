# R4 — Existing application, domain and rerun validation

This document records the finite protocol for R4 classes 2, 3, 4, 5 and the browser-escalation decision in class 8.

## Candidate and external reference boundary

The harness runs the actual `grist-chatgpt` MCP v2 server against a real ephemeral `gristlabs/grist-oss:1.7.19` container. The broader version range is validated separately by `docs/R4-COMPATIBILITY.md`.

Reference review performed against `gristlabs/grist-core` revision `34542eab62f0decb309a7e0476c3009fc6567f29`:

- `app/server/lib/DocApi.ts` documents `POST /api/docs/:docId/apply` as the doc-worker route for applying UserActions;
- Grist's own access-control tests provision `_grist_ACLResources` and `_grist_ACLRules` through that route;
- `test/nbrowser/AccessRules4.ts` uses the bounded rule shape `user.Email == rec.User_Access` with `permissionsText: "all"`, followed by a `none` fallback;
- `app/common/UserAPI.ts` exposes workspace permission updates through `/api/workspaces/:id/access`;
- the same development-only `GRIST_TEST_LOGIN=1` / ephemeral API-key bootstrap already reviewed for R4 compatibility is reused.

Classification: **ADAPT** public/development test interfaces and a minimal ACL pattern for fixture provisioning only. No Grist implementation code, browser harness, application-specific production code, raw-action MCP tool or generic HTTP escape hatch is imported into the product.

Historical `docs/J2-SYNTHETIC-FIXTURE.md` and the retired `src/j2/stageTrackingFixture.ts` were consulted only as validation material for fictional teachers/stages and preservation expectations. The retired J2 Builder/execution/browser platform is not restored.

## Why the fixtures are ephemeral

R4 needs real Grist behavior, not production user data. Each CI run therefore creates three independent real Grist documents from scratch using fictional rows. This keeps validation reproducible and permits destructive assertions without exposing personal documents or requiring a production/VPS credential.

The fixture provisioner may use Grist's `/apply` route because it is test infrastructure outside the model-facing product. The candidate itself still receives only the ten-tool MCP v2 contract.

## R4-2 — Existing generic application

Fixture:

- `Inventory` with two pre-existing rows and a human-marker field;
- separate `HumanSettings` table with an unrelated configuration marker;
- pre-existing `Human Dashboard` page.

Bounded evolution through MCP v2:

- add `Status` column if absent;
- update the targeted inventory row only if the requested semantic state is not already satisfied;
- add a `Reorder` page if absent.

Required postconditions:

- targeted row reaches the requested state;
- second inventory row and its human note are unchanged;
- unrelated settings table is unchanged;
- pre-existing page remains;
- `Status` and `Reorder` each exist exactly once after a second semantic pass.

## R4-3 — Stage-tracking application

Fixture:

- fictional `Teachers` and `Stages` tables;
- `Stages.Suivi_par` is a real `Ref:Teachers` relationship;
- two fictional teachers and two fictional students;
- pre-existing follow-up trace on teacher A's stage;
- native Grist row access rule: owner can act; otherwise the logged-in user's email must equal the stage's `TeacherEmail`; fallback is no access.

Before candidate evolution the probe demonstrates that teacher A can see/write stage A but not stage B, while teacher B sees stage B but not stage A. Teacher A then makes a synthetic human edit that must survive the candidate change.

Bounded evolution through MCP v2:

- add `Date_du_contact` if absent;
- update only stage A's contact state when needed;
- add `Suivi enseignant` page if absent;
- repeat the same semantic intention after reinspection.

Required postconditions:

- exactly one contact-date column and one follow-up page;
- stage assignments are unchanged;
- teacher A's pre-existing human trace is preserved;
- stage B remains unchanged;
- native row-level read/write isolation still holds after the schema/data/UI evolution;
- the authorized teacher can still edit their own row and cannot edit the other teacher's row.

This validates access-sensitive application preservation without teaching the bridge any stage-specific policy.

## R4-4 — materially different CCF/pedagogy application

Fixture:

- fictional `Informations` table with a mission row;
- `Reponses` table with four pre-existing rubric rows;
- one response contains a synthetic human answer;
- pre-existing `Mission` page.

Bounded evolution through MCP v2:

- add a generic `Statut` column if absent;
- add `Restitution` page if absent;
- repeat the semantic intention after reinspection.

Required postconditions:

- exactly one new column/page;
- all four response rows remain;
- the pre-existing human answer is unchanged;
- mission content and page remain unchanged.

No pedagogical rule is placed in bridge code.

## R4-5 — rerun/idempotence

The probe deliberately performs each application intention twice. The second pass begins by reading current semantic state through `grist_discover`, `grist_inspect` and/or `grist_query` and skips already-satisfied creates/updates.

This is the product's intended idempotence model: the MCP client reasons from current state; the bridge executes a bounded intention. R4 does **not** redefine idempotence as blind replay of raw writes.

The final assertions require one copy of each intended column/page and no destructive drift of unrelated rows/configuration.

## R4-8 — browser escalation criterion

Browser automation is not part of this harness. It is escalated only if a material committed postcondition cannot be established semantically.

For these fixtures:

- native UI creation is observable through the candidate's semantic page inspection;
- schema/data preservation is observable through MCP plus the real Grist API;
- access-sensitive stage behavior is observable by making real requests with two distinct Grist user credentials before and after the candidate evolution.

Therefore a green run is sufficient to mark browser escalation **NOT TRIGGERED** for these R4 classes. This does not claim that future browser-only behaviors can never require browser testing.

## Initial successful result

**PASS** on exact candidate head `7fec60ff05da82a70ca2633f957795cb03d9b4c8`.

- baseline CI run 610: PASS;
- `R4 application validation` run 1: PASS on Grist Community 1.7.19;
- R4-2 existing generic application: PASS;
- R4-3 synthetic stage-tracking application: PASS, including native row-level read/write isolation before and after the candidate evolution;
- R4-4 materially different CCF/pedagogy application: PASS;
- R4-5 semantic rerun/idempotence: PASS;
- R4-8 browser escalation: NOT TRIGGERED because every committed material postcondition was observable through MCP/API semantics.

The successful log shows the actual MCP v2 operations on the candidate (`get_pages`, `create_page`, `list_columns`, `create_columns`, `query_records`, `update_records`) and then explicit PASS markers for each class. No runtime/product fix was needed to obtain the result.

This commit records the first successful head. Pull-request CI and the application workflow must rerun on the final documentation head before integration; a later documentation-only head does not broaden the behavioral claim without that rerun.
