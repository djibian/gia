# R4 — Grist Community compatibility

This document records the bounded compatibility protocol and result for R4 validation class 9. The same run also supplies real end-to-end evidence for R4 class 1 (new generic application).

## Reference review

Observed 2026-09-28:

- Grist's official self-managed documentation recommends the official container images and identifies `gristlabs/grist-oss` as the open-source-only Community image.
- Current `gristlabs/grist-core` revision inspected for the test bootstrap: `34542eab62f0decb309a7e0476c3009fc6567f29`.
- `app/server/lib/TestLogin.ts` / `FlexServer.ts` expose the development-only `/test/login` endpoint when `GRIST_TEST_LOGIN=1` is set.
- Grist's own tests demonstrate creating an ephemeral API key by logging in through `/test/login`, retaining the returned session cookie, then `POST`ing `/api/profile/apikey` with `{ "force": true }`.
- `app/common/UserAPI.ts` confirms the public home-API routes used to create a workspace/document.
- the current Grist README documents `GRIST_IN_SERVICE=true` as the operator-controlled way to skip the first-run Quick setup gate when the installation should be put straight into service;
- `LICENSE.txt` at the inspected Grist revision is Apache License 2.0.

Classification: **ADAPT** the officially exercised test bootstrap and public REST behavior. The compatibility probe is implemented independently in this repository; no Grist implementation code is copied and no Grist test framework is imported.

Deliberately not imported:

- Grist's internal test harness;
- browser/nbrowser infrastructure;
- Grist's Full-edition MCP implementation;
- test users/fixtures from grist-core;
- any production authentication shortcut.

`GRIST_TEST_LOGIN=1` and `GRIST_IN_SERVICE=true` exist only inside the ephemeral CI container for this validation harness and must never be read as deployment guidance for an ordinary installation.

## Candidate matrix

R4 exercises these exact Community releases:

- `gristlabs/grist-oss:1.7.16`;
- `gristlabs/grist-oss:1.7.17`;
- `gristlabs/grist-oss:1.7.18`;
- `gristlabs/grist-oss:1.7.19`.

These are a finite supported/tested validation range, not an assertion about untested earlier or future releases. A future Grist release is unsupported by this evidence until the matrix is deliberately extended and rerun.

## Semantic slice

For each version, `.github/workflows/r4-grist-compatibility.yml` starts a fresh Community container and `tools/r4-grist-compatibility-probe.ts` performs the following end-to-end sequence:

1. wait for the real Grist API to be in service;
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

## Initial successful result

**PASS** on exact candidate head `aacc718904b4e4acc2ea3b0b58e7cb7e5bdee98b`.

- baseline CI run 607: PASS;
- `R4 Grist Community compatibility` run 2: PASS;
- Grist Community 1.7.16: PASS;
- Grist Community 1.7.17: PASS;
- Grist Community 1.7.18: PASS;
- Grist Community 1.7.19: PASS.

The first matrix attempt exposed a harness/setup condition rather than a product defect: a fresh Grist installation remained behind its first-run Quick setup gate and returned HTTP 503 for API-key creation. The harness was corrected using Grist's documented `GRIST_IN_SERVICE=true` operator setting and an API readiness check. No `grist-chatgpt` runtime or MCP semantic change was required.

### R4-9 disposition

**PASS** for the explicitly declared and tested Grist Community range **1.7.16 through 1.7.19 inclusive**. This statement is intentionally exact-version evidence, not semantic-version extrapolation.

### R4-1 disposition

**PASS** for the new generic application class. Each successful matrix job creates a fresh real Grist document and, through the actual MCP v2 candidate, constructs typed schema, adds data, creates native UI, queries the data and re-inspects the resulting semantic state. The four independent fresh instances also show that the result is not tied to one pre-existing fixture.

R4-5 rerun/idempotence is not claimed by this probe: the semantic intentions are executed once per fresh instance. Existing-application/domain preservation remains covered by separate R4 classes.

## Exact-head note

The PASS above records the exact runtime/probe head that produced the first successful matrix. Documentation-only commits after that result do not broaden the compatibility claim. The pull-request workflows are nevertheless expected to rerun on the final head before integration so the integrated validation artifact remains green.
