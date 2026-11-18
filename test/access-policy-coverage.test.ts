import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAccessRulesSnapshot,
  projectAccessPolicyCoverage,
  resolveUserAttributeMutation,
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

function snapshot({
  rules = [...ordinaryRules, attribute], aclResources = resources
} = {}) {
  return normalizeAccessRulesSnapshot(
    { records: aclResources }, { records: rules },
    { records: [{ id: 1, fields: { tableId: "Projects" } }] },
    { records: ["OwnerEmail", "Title", "gristHelper_Display"].map((colId, index) => ({
      id: 10 + index, fields: { parentId: 1, colId, type: "Text" }
    })) }
  );
}

function coverage(request: AccessPolicyCoverageRequest, fixture?: Parameters<typeof snapshot>[0]) {
  return projectAccessPolicyCoverage(snapshot(fixture), request) as any;
}

test("coverage limits column groups and supported attribute references to the requested operation", () => {
  const read = coverage({ target: column, operation: "read" });
  assert.equal(read.persistedStatus, "SUPPORTED");
  assert.deepEqual(read.ordinaryGroups, [
    { target: { tableId: "Projects", columnIds: [] }, status: "SUPPORTED" },
    { target: { tableId: "Projects", columnIds: ["OwnerEmail"] }, status: "SUPPORTED" }
  ]);
  assert.deepEqual(read.userAttributes, { supportedReferences: ["Mentor"], protectedDefinitionCount: 0 });
  assert.deepEqual(read.defaultPolicy, { persisted: "ABSENT", builtInFallback: "SUPPORTED" });
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

test("native ACL user fields and methods cannot be mistaken for supported attributes", () => {
  for (const name of ["ShareRef", "Type", "toJSON", "hasOwnProperty"]) {
    const colliding = { ...attribute, fields: {
      ...attribute.fields,
      userAttributes: JSON.stringify({
        name, tableId: "Projects", lookupColId: "OwnerEmail", charId: "Email"
      })
    } };
    const result = coverage({ target: table, operation: "read" }, {
      rules: [...ordinaryRules, colliding]
    });
    assert.equal(result.persistedStatus, "UNKNOWN");
    assert.deepEqual(result.userAttributes, { supportedReferences: [], protectedDefinitionCount: 1 });
    assert.throws(() => resolveUserAttributeMutation(snapshot(), { userAttributeName: name }, "create", {
      tableId: "Projects", lookupColId: "OwnerEmail", source: { kind: "user_property", property: "Email" }
    }), /non-reserved/);
  }
});

test("coverage excludes helper columns with native inherited rules", () => {
  assert.equal(coverage({
    target: { ...column, columnId: "gristHelper_Display" }, operation: "read"
  }).persistedStatus, "UNSUPPORTED");
});

test("expected decisions follow column then table and distinguish mixed columns", () => {
  const fixture = { aclResources: resources.filter(({ id }) => id !== 4),
    rules: [rule(2, "", "-U"), rule(3, "", "+U")] };
  const context = { role: "editor" } as const;
  const columnResult = coverage({ target: column, operation: "update", context }, fixture);
  assert.deepEqual(columnResult.expectedDecision, {
    decision: "allow",
    trace: [{ source: "column", target: { tableId: "Projects", columnIds: ["OwnerEmail"] },
      decision: "allow", ruleIndex: 1 }]
  });
  assert.equal(columnResult.nativeQualification, "NOT_TESTED");
  const tableResult = coverage({ target: table, operation: "update", context }, fixture);
  assert.equal(tableResult.expectedDecision.decision, "UNKNOWN");
  assert.equal(tableResult.expectedDecision.reason, "mixed_columns");
  assert.deepEqual(tableResult.expectedDecision.trace.map(({ source }: { source: string }) => source),
    ["table", "column"]);

  const noRules = { aclResources: [], rules: [] };
  assert.deepEqual(coverage({ target: table, operation: "read", context }, noRules).expectedDecision,
    { decision: "allow", trace: [{ source: "built_in_default", decision: "allow" }] });
  assert.deepEqual(coverage({ target: table, operation: "update", context: { role: "viewer" } }, noRules).expectedDecision,
    { decision: "deny", trace: [{ source: "nominal_document_role" }] });
});

test("expected row decisions use the proposed record for creation and prior record for deletion", () => {
  const fixture = { aclResources: resources.slice(0, 1), rules: [
    rule(2, "rec.OwnerEmail == ''", "+CD"),
    { id: 22, fields: { ...rule(2, "", "-CD").fields, rulePos: 2 } }
  ] };
  const emptyEmail = { name: "OwnerEmail", value: { kind: "empty_text" } } as const;
  const filledEmail = { name: "OwnerEmail", value: { kind: "symbol", symbol: "B" } } as const;
  const create = coverage({ target: table, operation: "create",
    context: { role: "editor", newRec: [emptyEmail] } }, fixture);
  const remove = coverage({ target: table, operation: "delete",
    context: { role: "editor", rec: [filledEmail] } }, fixture);
  assert.equal(create.expectedDecision.decision, "allow");
  assert.equal(create.expectedDecision.trace[0].ruleIndex, 1);
  assert.equal(remove.expectedDecision.decision, "deny");
  assert.equal(remove.expectedDecision.trace[0].ruleIndex, 2);
  assert.doesNotMatch(JSON.stringify([create.expectedDecision, remove.expectedDecision]), /empty_text|symbol|OwnerEmail/);
  assert.equal(coverage({ target: table, operation: "create",
    context: { role: "editor", rec: [filledEmail], newRec: [emptyEmail] } }, fixture).expectedDecision.decision,
  "UNKNOWN");
});

test("expected decisions do not fall through opaque rules or unknown operands", () => {
  const incomplete = coverage({ target: table, operation: "read", context: { role: "editor" } });
  assert.deepEqual(incomplete.expectedDecision, { decision: "UNKNOWN", reason: "protected_policy" });
  const unknown = coverage({ target: column, operation: "read", context: { role: "editor" } });
  assert.equal(unknown.expectedDecision.decision, "UNKNOWN");
  assert.equal(unknown.expectedDecision.reason, "missing_synthetic_operand");
  assert.equal(unknown.expectedDecision.trace[0].ruleIndex, 1);
  assert.equal(coverage({ target: column, operation: "create", context: { role: "editor" } }).expectedDecision.decision,
    "UNSUPPORTED");
});

test("native legacy blank resource does not obscure the ordinary built-in fallback", () => {
  const legacy = { id: 90, fields: { tableId: "", colIds: "" } };
  const result = coverage({ target: table, operation: "read", context: { role: "viewer" } },
    { aclResources: [legacy], rules: [] });
  assert.equal(result.ignoredLegacyResourceCount, 1);
  assert.equal(result.otherProtectedResourceCount, 0);
  assert.equal(result.persistedStatus, "SUPPORTED");
  assert.equal(result.expectedDecision.decision, "allow");
});
