import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAccessRulesSnapshot,
  projectAccessRuleSimulation,
  type AccessRuleSyntheticContext
} from "../src/grist/accessRules.js";

const tables = { records: [{ id: 1, fields: { tableId: "Projects" } }] };
const columns = { records: [
  { id: 11, fields: { parentId: 1, colId: "OwnerEmail", type: "Text" } },
  { id: 12, fields: { parentId: 1, colId: "Enabled", type: "Bool" } },
  { id: 13, fields: { parentId: 1, colId: "Flag", type: "Int" } },
  { id: 14, fields: { parentId: 1, colId: "Title", type: "Text" } }
] };
const resources = { records: [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }] };

function state(formulas: Array<[string, string]>) {
  return normalizeAccessRulesSnapshot(resources, {
    records: formulas.map(([aclFormula, permissionsText], i) => ({
      id: i + 20, fields: {
        resource: 2, rulePos: i + 1, aclFormula, aclFormulaParsed: aclFormula ? '["Eq"]' : "", permissionsText
      }
    }))
  }, tables, columns);
}

function simulate(formulas: Array<[string, string]>, context: AccessRuleSyntheticContext) {
  return projectAccessRuleSimulation(state(formulas), {
    target: { tableId: "Projects" }, context
  }) as any;
}

test("E1-E uses invented LinkKey symbols and first known permission decision", () => {
  const formulas: Array<[string, string]> = [
    ["rec.OwnerEmail == user.LinkKey.StageToken", "+R"],
    ["rec.Enabled == True", "+U"],
    ["user.Access == EDITOR", "+R"],
    ["", "-RU"]
  ];
  const output = simulate(formulas, {
    role: "editor",
    rec: [
      { name: "OwnerEmail", value: { kind: "symbol", symbol: "A" } },
      { name: "Enabled", value: { kind: "boolean", value: true } }
    ],
    linkKeys: [{ name: "StageToken", value: { kind: "symbol", symbol: "A" } }]
  });
  assert.equal(output.status, "supported_group");
  assert.deepEqual(output.ruleMatches.map((r: any) => r.match), ["true", "true", "true", "true"]);
  assert.deepEqual(output.permissionDecisions, {
    read: { decision: "allow", ruleIndex: 1 },
    update: { decision: "allow", ruleIndex: 2 },
    create: { decision: "unspecified" },
    delete: { decision: "unspecified" }
  });
  assert.equal(output.nativeEnforcementVerified, false);
  assert.equal(output.confidentialityVerified, false);
  assert.doesNotMatch(JSON.stringify(output), /StageToken|secret|OwnerEmail/);
});

test("E1-E unknown earlier decision cannot be overwritten by a later matching rule", () => {
  const output = simulate([
    ["rec.OwnerEmail == user.LinkKey.Token", "+R"],
    ["user.Access == EDITOR", "-R"],
    ["", "+U"]
  ], { role: "editor", rec: [{ name: "OwnerEmail", value: { kind: "symbol", symbol: "A" } }] });
  assert.equal(output.ruleMatches[0].match, "unknown");
  assert.deepEqual(output.permissionDecisions.read, { decision: "unknown", ruleIndex: 1 });
  assert.deepEqual(output.permissionDecisions.update, { decision: "allow", ruleIndex: 3 });
});

test("E1-E three-valued boolean composition does not infer unknown as false", () => {
  const output = simulate([
    ["(rec.Enabled == True and rec.OwnerEmail == user.Email) or user.Access == OWNER", "+R"],
    ["not rec.Enabled == False", "+U"],
    ["rec.Flag == 1", "+C"],
    ["rec.Title == ''", "-D"]
  ], {
    role: "owner",
    rec: [
      { name: "Enabled", value: { kind: "boolean", value: true } },
      { name: "Flag", value: { kind: "flag", value: 1 } },
      { name: "Title", value: { kind: "empty_text" } }
    ]
  });
  assert.equal(output.ruleMatches[0].match, "true");
  assert.equal(output.permissionDecisions.read.decision, "allow");
  assert.equal(output.permissionDecisions.update.decision, "allow");
  assert.equal(output.permissionDecisions.create.decision, "allow");
  assert.equal(output.permissionDecisions.delete.decision, "deny");

  const tri = simulate([
    ["rec.Enabled == True and rec.OwnerEmail == user.Email", "+R"],
    ["", "-R"]
  ], { rec: [{ name: "Enabled", value: { kind: "boolean", value: false } }] });
  assert.equal(tri.ruleMatches[0].match, "false");
  assert.equal(tri.permissionDecisions.read.decision, "deny");
});

test("E1-E absent group or opaque group has no simulated permission decision", () => {
  const empty = projectAccessRuleSimulation(
    normalizeAccessRulesSnapshot({ records: [] }, { records: [] }, tables, columns),
    { target: { tableId: "Projects" }, context: {} }
  ) as any;
  assert.equal(empty.status, "no_explicit_group");
  assert.equal(empty.permissionDecisions, null);

  const opaque = simulate([["rec.Title == 'private-secret'", "-R"]], {});
  assert.equal(opaque.status, "protected_group");
  assert.equal(opaque.ruleMatches, null);
  assert.doesNotMatch(JSON.stringify(opaque), /private-secret|aclFormula/);
});
