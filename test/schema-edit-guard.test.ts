import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAccessRulesSnapshot } from "../src/grist/accessRules.js";
import {
  OWNER_SCHEMA_FORMULA, planOwnerSchemaGuard, verifyOwnerSchemaGuard
} from "../src/grist/schemaEditGuard.js";

const metadata = {
  tables: { records: [{ id: 1, fields: { tableId: "People" } }] },
  columns: { records: [{ id: 3, fields: { parentId: 1, colId: "Email", type: "Text" } }] }
};
const resource = { id: 2, fields: { tableId: "*", colIds: "*" } };
const attribute = { id: 10, fields: {
  resource: 2, rulePos: 1, userAttributes: JSON.stringify({
    name: "Account", tableId: "People", lookupColId: "Email", charId: "Email"
  }), aclFormula: "", aclFormulaParsed: "", permissionsText: ""
} };
const guard = (id = 11, formula = OWNER_SCHEMA_FORMULA) => ({
  id, fields: {
    resource: 2, rulePos: 2, aclFormula: formula, permissionsText: "-S",
    aclFormulaParsed: JSON.stringify([
      "NotEq", ["Attr", ["Name", "user"], "Access"], ["Name", "OWNER"]
    ])
  }
});
type RecordRow = { id: number; fields: Record<string, unknown> };
function snapshot(resources: RecordRow[], rules: RecordRow[]) {
  return normalizeAccessRulesSnapshot({ records: resources }, { records: rules },
    metadata.tables, metadata.columns);
}

test("Owner-only schema guard creates on a clean native default and preserves user attributes", () => {
  const before = snapshot([resource], [attribute]);
  const plan = planOwnerSchemaGuard(before);
  assert.deepEqual(plan, { mode: "create", defaultResourceId: 2,
    createDefaultResource: false, rulePos: 2 });
  const after = snapshot([resource], [attribute, guard()]);
  assert.deepEqual(verifyOwnerSchemaGuard(before, after, plan), {
    changed: true, persistedDefinitionVerified: true, effectiveEnforcementVerified: false
  });
  const repeated = planOwnerSchemaGuard(after);
  assert.equal(repeated.mode, "noop");
  assert.equal(verifyOwnerSchemaGuard(after, after, repeated).changed, false);
  const nativeWhitespace = { ...guard(), fields: { ...guard().fields,
    aclFormulaParsed: JSON.stringify(JSON.parse(guard().fields.aclFormulaParsed as string), null, 2)
  } };
  assert.equal(planOwnerSchemaGuard(snapshot([resource], [attribute, nativeWhitespace])).mode, "noop");
});

test("Owner-only guard creates a single default resource from empty native ACL metadata", () => {
  const before = snapshot([], []);
  const plan = planOwnerSchemaGuard(before);
  assert.equal(plan.createDefaultResource, true);
  const after = snapshot([resource], [{ ...guard(), fields: {
    ...guard().fields, rulePos: 1
  } }]);
  assert.equal(verifyOwnerSchemaGuard(before, after, plan).persistedDefinitionVerified, true);
});

test("Owner-only schema guard refuses conflicting, duplicate, malformed and alternative special policies", () => {
  const before = snapshot([resource], [attribute]);
  for (const rule of [
    { ...guard(), fields: { ...guard().fields, permissionsText: "+S" } },
    { ...guard(), fields: { ...guard().fields, aclFormula: "user.Access == OWNER" } },
    { ...guard(), fields: { ...guard().fields, aclFormulaParsed: "[]" } },
    { ...guard(), fields: { ...guard().fields, rulePos: 1 } },
    { ...guard(), fields: { ...guard().fields, permissionsText: "-R" } }
  ]) {
    assert.throws(() => planOwnerSchemaGuard(snapshot([resource], [attribute, rule])));
  }
  assert.throws(() => planOwnerSchemaGuard(snapshot([resource, {
    id: 4, fields: { tableId: "*", colIds: "*" }
  }], [attribute])));
  assert.throws(() => verifyOwnerSchemaGuard(before,
    snapshot([resource], [attribute, guard(), { id: 12, fields: {
      resource: 2, rulePos: 3, aclFormula: OWNER_SCHEMA_FORMULA,
      permissionsText: "-S", aclFormulaParsed: guard().fields.aclFormulaParsed
    } }]), planOwnerSchemaGuard(before)));
  const changedAttribute = { ...attribute, fields: { ...attribute.fields, rulePos: 3 } };
  assert.throws(() => verifyOwnerSchemaGuard(before,
    snapshot([resource], [changedAttribute, guard()]), planOwnerSchemaGuard(before)));
});

test("Owner-only guard avoids native rulePos collisions across resources", () => {
  const ordinaryResource = { id: 3, fields: { tableId: "People", colIds: "*" } };
  const ordinary = { id: 12, fields: {
    resource: 3, rulePos: 2, aclFormula: "", aclFormulaParsed: "",
    permissionsText: "+R"
  } };
  const fractional = { ...ordinary, id: 13, fields: { ...ordinary.fields, rulePos: 6.5 } };
  const before = snapshot([resource, ordinaryResource], [attribute, ordinary, fractional]);
  const plan = planOwnerSchemaGuard(before);
  assert.equal(plan.rulePos, 7);
  const added = { ...guard(), fields: { ...guard().fields, rulePos: 7 } };
  const after = snapshot([resource, ordinaryResource], [attribute, ordinary, fractional, added]);
  assert.equal(verifyOwnerSchemaGuard(before, after, plan).changed, true);
  const changedOrdinary = { ...ordinary, fields: { ...ordinary.fields, rulePos: 2.5 } };
  assert.throws(() => verifyOwnerSchemaGuard(before,
    snapshot([resource, ordinaryResource], [attribute, changedOrdinary, fractional, added]), plan));
});

test("Owner-only guard reconciles an exact native guard at a fractional position", () => {
  const nativeGuard = { ...guard(), fields: { ...guard().fields, rulePos: 1.5 } };
  const before = snapshot([resource], [attribute, nativeGuard]);
  const plan = planOwnerSchemaGuard(before);
  assert.equal(plan.mode, "noop");
  assert.equal(plan.rulePos, 1.5);
  assert.equal(verifyOwnerSchemaGuard(before, before, plan).changed, false);
});
