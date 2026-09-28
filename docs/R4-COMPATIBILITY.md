# R4 — Grist Community compatibility

This document records the bounded compatibility protocol for R4 validation class 9.

## Reference review

Observed 2026-09-28:

- Grist's official self-managed documentation recommends the official container images and identifies `gristlabs/grist-oss` as the open-source-only Community image.
- Current `gristlabs/grist-core` revision inspected for the test bootstrap: `34542eab62f0decb309a7e0476c3009fc6567f29`.
- `app/server/lib/TestLogin.ts` / `FlexServer.ts` expose the development-only `/test/login` endpoint when `GRIST_TEST_LOGIN=1` is set.
- Grist's own tests demonstrate creating an ephemeral API key by logging in through `/test/login`, retaining the returned session cookie, then `POST`ing `/api/profile/apikey` with `{ "force": true }`.
- `app/common/UserAPI.ts` confirms the public home-API routes used to create a workspace/document.
- `LICENSE.txt` at the inspected Grist revision is Apache License 2.0.

Classification: **ADAPT** the officially exercised test bootstrap and public REST behavior. The compatibility probe is implemented independently in this repository; no Grist implementation code is copied and no Grist test framework is imported.

Deliberately not imported:

- Grist's internal test harness;
- browser/nbrowser infrastructure;
- Grist's Full-edition MCP implementation;
- test users/fixtures from grist-core;
- any production authentication shortcut.

`GRIST_TEST_LOGIN=1` exists only inside the ephemeral CI container and must never be used as deployment guidance.

## Candidate matrix

R4 exercises these exact Community releases:

- `gristlabs/grist-oss:1.7.16`;
- `gristlabs/grist-oss:1.7.17`;
- `gristlabs/grist-oss:1.7.18`;
- `gristlabs/grist-oss:1.7.19`.

These are a finite validation set, not an assertion about untested future releases. Compatibility is declared only for versions whose matrix jobs pass on the exact candidate head.

## Semantic slice

For each version, `.github/workflows/r4-grist-compatibility.yml` starts a fresh Community container and `tools/r4-grist-compatibility-probe.ts` performs the following end-to-end sequence:

1. wait for the real Grist server;
2. use Grist's development-only test login to create a fresh user/session;
3. create an ephemeral Grist API key through the normal profile API;
4. create a fresh Grist document through the home API;
5. start the actual `grist-chatgpt` server in static-bearer MCP v2 mode against that Grist instance;
6. verify the ten-tool v2 surface;
7. discover the created document through MCP;
8. create a typed table through `grist_add_structure`;
9. add records through `grist_add_records`;
10. create a native page through `grist_add_ui`;
11. read the records through `grist_query`;
12. re-inspect the document and verify the table/page postconditions.

This slice intentionally crosses the public REST APIs plus the private/stable-ID UI adaptation layer most likely to reveal Grist-version drift. It does not claim that every Grist feature is compatible.

## Security / isolation of the harness

- no repository or GitHub secret is required;
- the Grist API key is generated inside one ephemeral CI job and held only in that process environment;
- the MCP bearer is a fixed non-production test sentinel used only on localhost;
- each matrix job receives a fresh Grist container and document;
- the job does not contact a user's Grist deployment;
- no compatibility fixture is persisted after the runner exits.

## Result

**PENDING until the compatibility workflow has executed on the exact candidate head.**

A green baseline CI alone does not satisfy this class. The four real-Grist matrix jobs must complete successfully. Any failure is investigated as either a probe/setup defect, an explicit unsupported-version boundary, or the smallest generic candidate compatibility defect.
