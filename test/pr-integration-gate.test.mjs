import assert from "node:assert/strict";
import test from "node:test";
import { integrationGateErrors } from "../tools/check-pr-integration.mjs";

const head = "a".repeat(40);
const base = "b".repeat(40);
const pass = (sha = head, result = "PASS", stamp = "2026-11-18T10:00:00Z") => ({
  id: 1, body: "Independent execution: author-independent\nHead: " + sha + "\nResult: " + result,
  created_at: stamp
});
function inputs(overrides = {}) {
  return {
    pr: { state: "open", draft: false, head: { sha: head }, base: { sha: base },
      body: "Scope: bounded governance fix\nDependencies: none\nNet complexity: bounded\nValidation: tests\nReview gate: REQUIRED — governance update" },
    comments: [pass()], files: [{ filename: "AGENTS.md" }], runs: [], baseSha: base,
    eventHeadSha: head, ...overrides
  };
}

test("green current PASS and complete PR metadata permits integration", () => {
  assert.deepEqual(integrationGateErrors(inputs()), []);
});

test("missing PASS, stale head, or later CHANGES REQUIRED refuses integration", () => {
  assert.match(integrationGateErrors(inputs({ comments: [] })).join(" "), /No current/);
  assert.match(integrationGateErrors(inputs({ comments: [pass("c".repeat(40))] })).join(" "), /No current/);
  assert.match(integrationGateErrors(inputs({ comments: [pass(), {...pass(head,"CHANGES REQUIRED","2026-11-18T11:00:00Z"),id:2}] })).join(" "), /No current/);
});

test("missing declaration/reason or unreviewed risky change fails closed", () => {
  const original = inputs();
  const withoutGate = { ...original.pr, body: "Dependencies: none\nComplexity: small\nValidation: done" };
  assert.match(integrationGateErrors(inputs({ pr: withoutGate })).join(" "), /Review gate/);
  const wrongGate = { ...original.pr, body: original.pr.body.replace("REQUIRED — governance update", "NOT REQUIRED — docs only") };
  assert.match(integrationGateErrors(inputs({ pr: wrongGate })).join(" "), /Risk-sensitive/);
  assert.match(integrationGateErrors(inputs({ pr: {...original.pr, body: original.pr.body.replace("governance update", "ok")} })).join(" "), /substantive/);
});

test("branch/head moves and draft state refuse integration", () => {
  assert.match(integrationGateErrors(inputs({ baseSha: "c".repeat(40) })).join(" "), /Target branch moved/);
  assert.match(integrationGateErrors(inputs({ eventHeadSha: "c".repeat(40) })).join(" "), /head moved/);
  assert.match(integrationGateErrors(inputs({ pr: {...inputs().pr, draft: true} })).join(" "), /ready/);
});

test("native-sensitive changes need both exact-head compatibility and preservation runs", () => {
  const changed = [{ filename: "src/grist/accessRules.ts" }];
  const validRuns = ["Grist compatibility", "Application preservation"].map(name => ({
    name, head_sha: head, status: "completed", conclusion: "success"
  }));
  assert.deepEqual(integrationGateErrors(inputs({ files: changed, runs: validRuns })), []);
  assert.match(integrationGateErrors(inputs({ files: changed, runs: validRuns.slice(0, 1) })).join(" "), /Application preservation/);
  assert.match(integrationGateErrors(inputs({ files: changed, runs: validRuns.map(run => ({...run, head_sha: base})) })).join(" "), /Grist compatibility/);
  const staleGreen = [...validRuns.map(run => ({...run, run_number: 1})),
    {...validRuns[0], run_number: 2, conclusion: "failure"}];
  assert.match(integrationGateErrors(inputs({ files: changed, runs: staleGreen })).join(" "), /Grist compatibility/);
});

test("small factual docs change may omit independent PASS if reasoned", () => {
  const original = inputs();
  const pr = {...original.pr, body: original.pr.body.replace("REQUIRED — governance update", "NOT REQUIRED — factual documentation link fix")};
  assert.deepEqual(integrationGateErrors(inputs({ pr, files: [{filename:"README.md"}], comments: [] })), []);
});

test("test-only native ACL fixture cannot quietly declare NOT REQUIRED", () => {
  const original = inputs();
  const pr = {...original.pr, body: original.pr.body.replace("REQUIRED — governance update", "NOT REQUIRED — a test only")};
  const files = [{ filename: "test/access-rules.test.ts" }];
  assert.match(integrationGateErrors(inputs({ pr, files })).join(" "), /Risk-sensitive/);
});
