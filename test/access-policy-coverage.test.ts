import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAccessRulesSnapshot,
  projectAccessPolicyCoverage,
  type AccessPolicyCoverageRequest
} from "../src/grist/accessRules.js";
import { nativeAclFixture } from "./fixtures/native-acl.js";

const table = { kind: "table", tableId: "Projects" } as const;
const column = { kind: "column", tableId: "Projects", columnId: "OwnerEmail" } as const;
const resources = [
  { id: 2, fields: { tableId: "Projects", colIds: "*" } },
  { id: 3, fields: { tableId: "Projects", colIds: "OwnerEmail" } },
  { id: 4, fields: { tableId: "Projects", colIds: "Title" } },
  { id: 5, fields: { tableId: "*", colIds: "*" } }
];

function rule(resource: number, aclFormula: string, permissionsText: string) {
  return { id: resource + 100, fields: {
    resource, aclFormula, permissionsText, aclFormulaParsed: nativeAclFixture(aclFormula), rulePos: 1
  } };
}

const ordinaryRules = [
  rule(2, "", "-CUD"),
  rule(3, "rec.OwnerEmail == user.Mentor.OwnerEmail", "+R"),
  rule(4, "rec.Title == 'private-secret'", "-R")
];
const attribute = { id: 40, fields: {
  resource: 5, rulePos: 2, aclFormula: "", aclFormulaParsed: "", permissionsText: "",
  userAttributes: JSON.stringify({
    name: "Mentor", tableId: "Projects", lookupColId: "OwnerEmail", charId: "Email"
  })
} };

function coverage(request: AccessPolicyCoverageRequest, {
  rules = [...ordinaryRules, attribute], aclResources = resources
} = {}) {
  return projectAccessPolicyCoverage(normalizeAccessRulesSnapshot(
    { records: aclResources }, { records: rules },
    { records: [{ id: 1, fields: { tableId: "Projects" } }] },
    { records: ["OwnerEmail", "Title"].map((colId, index) => ({
      id: 10 + index, fields: { parentId: 1, colId, type: "Text" }
    })) }
  ), request) as any;
}

test("coverage limits column groups and supported attribute references to the requested operation", () => {
  const read = coverage({ target: column, operation: "read" });
  assert.equal(read.persistedStatus, "SUPPORTED");
  assert.deepEqual(read.ordinaryGroups, [
    { target: { tableId: "Projects", columnIds: [] }, status: "SUPPORTED" },
    { target: { tableId: "Projects", columnIds: ["OwnerEmail"] }, status: "SUPPORTED" }
  ]);
  assert.deepEqual(read.userAttributes, { supportedReferences: ["Mentor"], protectedDefinitionCount: 0 });
  assert.deepEqual(read.defaultPolicy, { persisted: "ABSENT", builtInFallback: "UNSUPPORTED" });
  assert.equal(read.nativeQualification, "NOT_TESTED");
  assert.deepEqual(coverage({ target: column, operation: "update" }).userAttributes.supportedReferences, []);

  const wholeTable = coverage({ target: table, operation: "read" });
  assert.equal(wholeTable.persistedStatus, "UNKNOWN");
  assert.equal(wholeTable.ordinaryGroups.at(-1).status, "PROTECTED");
  assert.doesNotMatch(JSON.stringify(wholeTable), /private-secret|aclFormula|permissionsText|resourceId/);

  for (const operation of ["create", "delete"] as const) {
    assert.deepEqual(coverage({ target: table, operation }).ordinaryGroups, read.ordinaryGroups.slice(0, 1));
    assert.equal(coverage({ target: column, operation }).persistedStatus, "UNSUPPORTED");
  }
});

test("coverage exposes uncertainty for protected default, special and opaque attribute metadata", () => {
  const request = { target: column, operation: "read" } as const;
  const explicitDefault = coverage(request, { rules: [...ordinaryRules, attribute, rule(5, "", "-R")] });
  assert.equal(explicitDefault.persistedStatus, "UNKNOWN");
  assert.equal(explicitDefault.defaultPolicy.persisted, "PROTECTED");
  assert.equal(explicitDefault.otherProtectedResourceCount, 0);

  const secret = "opaque-definition-canary";
  const unknown = coverage(request, {
    rules: [...ordinaryRules, { ...attribute, fields: { ...attribute.fields, userAttributes: secret } }],
    aclResources: [...resources, { id: 6, fields: { tableId: "*SPECIAL", colIds: "SchemaEdit" } }]
  });
  assert.equal(unknown.persistedStatus, "UNKNOWN");
  assert.equal(unknown.otherProtectedResourceCount, 1);
  assert.deepEqual(unknown.userAttributes, { supportedReferences: [], protectedDefinitionCount: 1 });
  assert.equal(unknown.nativeQualification, "NOT_TESTED");
  assert.ok(!JSON.stringify(unknown).includes(secret));

  const onlySpecial = coverage(request, {
    aclResources: [...resources, { id: 6, fields: { tableId: "*SPECIAL", colIds: "SchemaEdit" } }]
  });
  assert.equal(onlySpecial.persistedStatus, "UNKNOWN");
  assert.equal(onlySpecial.otherProtectedResourceCount, 1);
});

test("coverage rejects nonexistent or private schema targets", () => {
  assert.throws(() => coverage({ target: { ...column, columnId: "Missing" }, operation: "read" }), /does not exist/);
  assert.throws(() => coverage({ target: { ...table, tableId: "_grist_ACLRules" }, operation: "read" }), /ordinary/);
});
