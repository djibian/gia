# R5-E reviewer qualification

**Purpose:** exercise the final MCP v2 reviewer chain without storing reviewer credentials or inventing portal evidence.

This procedure is the remaining live qualification for R5-E after the repository package is integrated. It is deliberately bounded to one synthetic identity/document/service-account path.

## Required isolated chain

```text
reviewer login
  -> OAuth principal
  -> grist-chatgpt MCP v2
  -> protected principal mapping
  -> dedicated Grist Community service account
  -> one synthetic reviewer document
```

The login must work without operator-only MFA, SMS/email confirmation, private networking or manual setup after credentials are supplied to the reviewer. The dedicated Community service account must have only the native Grist authority needed for the synthetic document.

Do not record passwords, API keys, bearer/refresh/ID tokens, authorization codes, PKCE verifiers, raw OAuth subjects, principal-map contents or portal challenge tokens in repository evidence.

## Fixture

Use exactly the synthetic contract in `docs/OPENAI-REVIEWER-TESTS.md`:

- `ReviewTasks(Title, Status)` with at least three distinct `Open` rows;
- no `NoSuchSyntheticTask` row;
- at least one Ref/RefList relationship;
- at least one existing page and widget;
- clean reset state for `Review Alpha`, `Review Beta`, `ReviewMetrics` and `Review dashboard` before their mutating cases.

The fixture reset is operator-side. Never blindly replay an ambiguous MCP write in order to reset a case.

## Qualification sequence

1. Confirm the deployed Git SHA is the independently reviewed R5-E candidate and run the normal OAuth deployment preflight/smoke.
2. Authenticate with the dedicated reviewer identity and confirm the principal resolves to the dedicated reviewer service-account mapping; do not print either credential or raw subject.
3. Run MCP `tools/list` / ChatGPT Tool Scan and record only that exactly the ten v2 tool names are present with the expected read/write risk classes and OAuth scopes.
4. Run P1 through P5 from `docs/OPENAI-REVIEWER-TESTS.md`, resetting only the synthetic fixture between mutating cases. Record sanitized semantic outcomes and stable created IDs where needed.
5. Run N1 through N3 and record that no Grist tool is invoked for those unsupported intents.
6. Directly verify the dedicated Community service account cannot access an unrelated control document. Retain only ALLOW/DENY status evidence.
7. Confirm the bridge log/evidence contains no token, key, password, raw subject or principal-map content.
8. Record the candidate SHA, Grist Community version, MCP contract version, exact 5+3 PASS/FAIL results and any concrete Tool Scan finding in a sanitized R5-E evidence document.

## PASS boundary

R5-E may move to `DONE` only when all are true on the same final candidate path:

- repository CI is green;
- exact ten-tool Tool Scan succeeds;
- all five positive reviewer cases satisfy their postconditions;
- all three negative cases are non-invocations;
- the reviewer OAuth principal uses the intended dedicated service-account authority;
- unrelated Grist authority remains denied;
- no secret-bearing evidence is retained;
- any final-host portal/domain proof remains correctly classified as R5-F external evidence rather than fabricated repository state.

If any step fails, keep R5-E active and fix only the smallest demonstrated product/package defect. Do not broaden the MCP surface or weaken the security boundary merely to satisfy a reviewer workflow.
