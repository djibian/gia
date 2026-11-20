import assert from "node:assert/strict";
import test from "node:test";
import { nativeAclFixture } from "./fixtures/native-acl.js";

import {
  normalizeAccessRulesSnapshot,
  projectAccessRules,
  projectAccessRuleSchemaImpact,
  projectAccessRuleSimulation,
  resolveAccessRuleMutation,
  resolveUserAttributeMutation,
  verifyAccessRuleMutation,
  verifyUserAttributeMutation
} from "../src/grist/accessRules.js";

function baseMetadata() {
  return {
    tables: {
      records: [{ id: 1, fields: { tableId: "Projects" } }]
    },
    columns: {
      records: [
        { id: 11, fields: { parentId: 1, colId: "OwnerEmail", type: "Text" } },
        { id: 12, fields: { parentId: 1, colId: "Title", type: "Text" } },
        { id: 13, fields: { parentId: 1, colId: "UserId", type: "Int" } },
        { id: 14, fields: { parentId: 1, colId: "ShareToken", type: "Text" } },
        { id: 15, fields: { parentId: 1, colId: "Enabled", type: "Bool" } }
      ]
    }
  };
}

function snapshot(
  resources: Array<{ id: number; fields: Record<string, unknown> }>,
  rules: Array<{ id: number; fields: Record<string, unknown> }>
) {
  const meta = baseMetadata();
  return normalizeAccessRulesSnapshot(
    { records: resources },
    { records: rules },
    meta.tables,
    meta.columns
  );
}

test("native Bool and RefList user attributes support typed ACL predicates and track dependencies", () => {
  const target = { tableId: "Projects" };
  const resources = [
    { id: 1, fields: { tableId: "*", colIds: "*" } },
    { id: 2, fields: { ...target, colIds: "*" } }
  ];
  const definition = { id: 10, fields: {
    resource: 1, rulePos: 1, aclFormula: "", aclFormulaParsed: "", permissionsText: "",
    userAttributes: JSON.stringify({
      name: "Mentor", tableId: "Projects", lookupColId: "ShareToken", charId: "Email"
    })
  } };
  const meta = baseMetadata();
  meta.columns.records.push(
    { id: 16, fields: { parentId: 1, colId: "Related", type: "Ref:Projects" } },
    { id: 17, fields: { parentId: 1, colId: "AllowedProjects", type: "RefList:Projects" } }
  );
  const condition = { kind: "user_attribute_flag", attributeName: "Mentor", attributeColumnId: "Enabled" } as const;
  const rules = [{ condition: { kind: "not", condition },
    permissions: { read: "deny", update: "unspecified" } }] as const;
  const plan = resolveAccessRuleMutation(snapshot(resources.slice(0, 1), [definition]), target, "create", rules);
  assert.equal(plan.rules[0]?.aclFormula, "not (user.Mentor.Enabled)");
  const withPersistedRule = (attributeField: string) => normalizeAccessRulesSnapshot(
    { records: resources }, { records: [definition, { id: 20, fields: {
    resource: 2, rulePos: 1, aclFormula: "not user.Mentor.Enabled", permissionsText: "-R",
    aclFormulaParsed: JSON.stringify(["Not", ["Attr", ["Attr", ["Name", "user"], "Mentor"], attributeField]])
  } }] }, meta.tables, meta.columns);
  const roundtrip = withPersistedRule("Enabled");
  assert.equal((projectAccessRules(roundtrip) as any).groups[0].editable, true);
  assert.equal(resolveAccessRuleMutation(roundtrip, target, "replace", rules).mode, "noop");
  const simulate = (state: typeof roundtrip, context: Parameters<typeof projectAccessRuleSimulation>[1]["context"]) =>
    projectAccessRuleSimulation(state, { target, context }) as { ruleMatches: Array<{ match: string }> };
  assert.equal(simulate(roundtrip, {}).ruleMatches[0]?.match, "unknown");
  assert.equal(simulate(roundtrip, { userAttributes: [{
    name: "Mentor", fields: [{ name: "Enabled", value: { kind: "boolean", value: false } }]
  }] }).ruleMatches[0]?.match, "true");
  assert.equal((projectAccessRules(withPersistedRule("Title")) as any).groups[0].editable, false);
  assert.throws(() => resolveUserAttributeMutation(roundtrip, { userAttributeName: "Mentor" }, "delete"),
    /references this attribute/);
  assert.throws(() => resolveAccessRuleMutation(roundtrip, target, "replace", [{
    ...rules[0], condition: { ...condition, attributeColumnId: "Title" }
  }]), /native Bool/);

  const membership = {
    kind: "record_in_user_attribute_ref_list", operator: "not_in", columnId: "id",
    attributeName: "Mentor", attributeColumnId: "AllowedProjects"
  } as const;
  const membershipRule = { condition: membership, permissions: rules[0].permissions };
  const planFor = (columnId: string) => resolveAccessRuleMutation(roundtrip, target, "replace", [
    { ...membershipRule, condition: { ...membership, columnId } }
  ]);
  assert.equal(planFor("id").rules[0]?.aclFormula, "rec.id not in user.Mentor.AllowedProjects");
  assert.equal(planFor("Related").rules[0]?.aclFormula, "rec.Related not in user.Mentor.AllowedProjects");
  assert.throws(() => planFor("UserId"), /RefList targeting the same table/);
  const parsedMembership = normalizeAccessRulesSnapshot({ records: resources }, { records: [definition, { id: 20, fields: {
    resource: 2, rulePos: 1, aclFormula: "rec.id not in user.Mentor.AllowedProjects", permissionsText: "-R",
    aclFormulaParsed: '["NotIn",["Attr",["Name","rec"],"id"],["Attr",["Attr",["Name","user"],"Mentor"],"AllowedProjects"]]'
  } }] }, meta.tables, meta.columns);
  assert.equal(resolveAccessRuleMutation(parsedMembership, target, "replace", [membershipRule]).mode, "noop");
  assert.equal(simulate(parsedMembership, {}).ruleMatches[0]?.match, "unknown");
});

test("native predicate metadata must agree before projecting, comparing or verifying a rule", () => {
  const target = { tableId: "Projects" };
  const resources = [{ id: 2, fields: { ...target, colIds: "*" } }];
  const aclFormula = "rec.OwnerEmail == user.Email";
  const parsed = nativeAclFixture(aclFormula);
  const before = snapshot([], []);
  const inputs = [{
    condition: { kind: "match_user", operator: "equals", columnId: "OwnerEmail", userProperty: "Email" },
    permissions: { read: "allow", update: "unspecified" }
  }] as const;
  const plan = resolveAccessRuleMutation(before, target, "create", inputs);
  const persisted = (aclFormulaParsed: string) => snapshot(resources, [{
    id: 20, fields: { resource: 2, rulePos: 1, aclFormula, aclFormulaParsed, permissionsText: "+R" }
  }]);
  const matching = persisted(parsed);
  assert.equal((projectAccessRules(matching) as any).groups[0].editable, true);
  assert.equal(resolveAccessRuleMutation(matching, target, "replace", inputs).mode, "noop");
  assert.equal(verifyAccessRuleMutation(before, matching, plan).persistedDefinitionVerified, true);

  const malformed = [
    "", "null", "true", "42", '["Eq"]', '["Const",true]',
    parsed.replace('"Eq"', '"NotEq"'),
    parsed.replace('"OwnerEmail"', '"Title"'),
    parsed.replace('"Email"', '"Name"'),
    parsed.replace('"Email"', '"Email\\n"'),
    parsed.replace('["Name","user"]', '["Name","user",false]'),
    parsed.replace('["Attr",["Name","user"],"Email"]', '["Const","synthetic-private"]'),
    `["Or",${parsed},["Eq"]]`,
    '["Not",'.repeat(5000) + parsed + ']'.repeat(5000),
    parsed + " ".repeat(65536)
  ];
  for (const value of malformed) {
    const state = persisted(value);
    const projection = projectAccessRules(state) as any;
    const group = projection.groups[0];
    assert.equal(group.editable, false);
    assert.deepEqual(group.dependencies, { coverage: "unknown" });
    assert.equal(group.diagnostics, null);
    assert.equal(group.rules, undefined);
    assert.doesNotMatch(JSON.stringify(projection), /synthetic-private|aclFormula/);
    const simulation = projectAccessRuleSimulation(state, { target, context: {} }) as any;
    assert.equal(simulation.status, "protected_group");
    assert.equal(simulation.permissionDecisions, null);
    assert.throws(() => resolveAccessRuleMutation(state, target, "replace", inputs), /cannot be modified/);
    assert.throws(() => verifyAccessRuleMutation(before, state, plan), /verification failed/);
  }
});

test("ACL resolution refuses duplicate row identities and stable table/column targets", () => {
  const meta = baseMetadata();
  const table = meta.tables.records[0]!;
  const column = meta.columns.records[0]!;
  const resource = { id: 1, fields: { tableId: "*", colIds: "*" } };
  const rule = { id: 1, fields: { resource: 1, aclFormula: "", aclFormulaParsed: "", permissionsText: "+R", rulePos: 1 } };
  for (const [resources, rules, tables, columns] of [
    [{ records: [resource, resource] }, { records: [] }, meta.tables, meta.columns],
    [{ records: [resource] }, { records: [rule, rule] }, meta.tables, meta.columns],
    [{ records: [] }, { records: [] }, { records: [table, table] }, meta.columns],
    [{ records: [] }, { records: [] }, { records: [table, { ...table, id: 2 }] }, meta.columns],
    [{ records: [] }, { records: [] }, meta.tables, { records: [column, column] }],
    [{ records: [] }, { records: [] }, meta.tables, { records: [column, { ...column, id: 99 }] }]
  ]) assert.throws(() => normalizeAccessRulesSnapshot(resources, rules, tables, columns), /malformed|ambiguous/);
});

test("normalizes only bounded secret-safe ordinary ACL groups", () => {
  const state = snapshot(
    [
      { id: 1, fields: { tableId: "*", colIds: "*" } },
      { id: 4, fields: { tableId: "*SPECIAL", colIds: "AccessRules" } },
      { id: 2, fields: { tableId: "Projects", colIds: "*" } },
      { id: 3, fields: { tableId: "Projects", colIds: "OwnerEmail" } }
    ],
    [
      {
        id: 10,
        fields: {
          resource: 1,
          aclFormula: "user.LinkKey.token == 'secret'",
          aclFormulaParsed: nativeAclFixture("user.LinkKey.token == 'secret'"),
          permissionsText: "-R",
          rulePos: 1,
          memo: "private memo"
        }
      },
      {
        id: 11,
        fields: {
          resource: 4,
          aclFormula: "True",
          aclFormulaParsed: '["Const", true]',
          permissionsText: "+R",
          rulePos: 1
        }
      },
      {
        id: 20,
        fields: {
          resource: 2,
          aclFormula: "user.Access == EDITOR",
          aclFormulaParsed: nativeAclFixture("user.Access == EDITOR"),
          permissionsText: "+RU",
          rulePos: 1
        }
      },
      {
        id: 21,
        fields: {
          resource: 2,
          aclFormula: "",
          aclFormulaParsed: "",
          permissionsText: "-RU",
          rulePos: 2
        }
      },
      {
        id: 30,
        fields: {
          resource: 3,
          aclFormula: "rec.OwnerEmail == user.Email",
          aclFormulaParsed: nativeAclFixture("rec.OwnerEmail == user.Email"),
          permissionsText: "+R-U",
          rulePos: 1
        }
      }
    ]
  );

  const projected = projectAccessRules(state) as any;
  assert.equal(projected.protectedPersistedGroupCount, 2);
  assert.equal(projected.effectiveEnforcementVerified, false);
  assert.deepEqual(projected.groups.map(({ dependencies, diagnostics, ...group }: any) => group), [
    {
      target: { tableId: "Projects" },
      editable: true,
      rules: [
        {
          condition: {
            kind: "user_access",
            operator: "equals",
            role: "editor"
          },
          permissions: {
            read: "allow",
            update: "allow",
            create: "unspecified",
            delete: "unspecified"
          }
        },
        {
          condition: { kind: "everyone" },
          permissions: {
            read: "deny",
            update: "deny",
            create: "unspecified",
            delete: "unspecified"
          }
        }
      ]
    },
    {
      target: { tableId: "Projects", columnIds: ["OwnerEmail"] },
      editable: true,
      rules: [
        {
          condition: {
            kind: "match_user",
            operator: "equals",
            columnId: "OwnerEmail",
            userProperty: "Email"
          },
          permissions: {
            read: "allow",
            update: "deny",
            create: "unspecified",
            delete: "unspecified"
          }
        }
      ]
    }
  ]);
  assert.doesNotMatch(JSON.stringify(projected), /do-not-expose|private memo|LinkKey/);
});

test("opaque literal conditions are redacted and not editable", () => {
  const state = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [
      {
        id: 20,
        fields: {
          resource: 2,
          aclFormula: 'rec.Title == "sensitive-literal"',
          aclFormulaParsed: nativeAclFixture('rec.Title == "sensitive-literal"'),
          permissionsText: "-R",
          rulePos: 1
        }
      }
    ]
  );
  const projected = projectAccessRules(state) as any;
  assert.equal(projected.groups[0].editable, false);
  assert.match(projected.groups[0].unsupportedReason, /outside Gia/i);
  assert.doesNotMatch(JSON.stringify(projected), /sensitive-literal|rec\.Title/);
  assert.throws(
    () =>
      resolveAccessRuleMutation(
        state,
        { tableId: "Projects" },
        "replace",
        [
          {
            condition: { kind: "everyone" },
            permissions: { read: "deny", update: "unspecified" }
          }
        ]
      ),
    /unsupported or sensitive/
  );
});

test("rejects duplicate or overlapping persisted column resources", () => {
  assert.throws(
    () =>
      snapshot(
        [
          { id: 2, fields: { tableId: "Projects", colIds: "OwnerEmail,Title" } },
          { id: 3, fields: { tableId: "Projects", colIds: "Title" } }
        ],
        []
      ),
    /overlapping ACL column resources/i
  );
});

test("creates bounded canonical ACL writes and verifies preservation", () => {
  const before = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [
      {
        id: 20,
        fields: {
          resource: 2,
          aclFormula: "",
          aclFormulaParsed: "",
          permissionsText: "+R",
          rulePos: 1
        }
      }
    ]
  );
  const plan = resolveAccessRuleMutation(
    before,
    { tableId: "Projects", columnIds: ["OwnerEmail"] },
    "create",
    [
      {
        condition: {
          kind: "match_user",
          operator: "equals",
          columnId: "OwnerEmail",
          userProperty: "Email"
        },
        permissions: {
          read: "allow",
          update: "allow"
        }
      },
      {
        condition: { kind: "everyone" },
        permissions: {
          read: "deny",
          update: "deny"
        }
      }
    ]
  );

  assert.deepEqual(plan.rules, [
    {
      aclFormula: "rec.OwnerEmail == user.Email",
      permissionsText: "+RU",
      rulePos: 1
    },
    {
      aclFormula: "",
      permissionsText: "-RU",
      rulePos: 2
    }
  ]);

  const after = snapshot(
    [
      { id: 2, fields: { tableId: "Projects", colIds: "*" } },
      { id: 3, fields: { tableId: "Projects", colIds: "OwnerEmail" } }
    ],
    [
      {
        id: 20,
        fields: {
          resource: 2,
          aclFormula: "",
          aclFormulaParsed: "",
          permissionsText: "+R",
          rulePos: 1
        }
      },
      {
        id: 30,
        fields: {
          resource: 3,
          aclFormula: "rec.OwnerEmail == user.Email",
          aclFormulaParsed: nativeAclFixture("rec.OwnerEmail == user.Email"),
          permissionsText: "+RU",
          rulePos: 1
        }
      },
      {
        id: 31,
        fields: {
          resource: 3,
          aclFormula: "",
          aclFormulaParsed: "",
          permissionsText: "-RU",
          rulePos: 2
        }
      }
    ]
  );

  assert.deepEqual(verifyAccessRuleMutation(before, after, plan), {
    changed: true,
    ruleCount: 2,
    persistedDefinitionVerified: true,
    effectiveEnforcementVerified: false
  });
});

test("rejects unsafe permission aliases, non-terminal everyone and target overlaps", () => {
  const aliasState = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [
      {
        id: 20,
        fields: {
          resource: 2,
          aclFormula: "",
          aclFormulaParsed: "",
          permissionsText: "none",
          rulePos: 1
        }
      }
    ]
  );
  assert.equal((projectAccessRules(aliasState) as any).groups[0].editable, false);

  const before = snapshot(
    [{ id: 3, fields: { tableId: "Projects", colIds: "OwnerEmail" } }],
    [
      {
        id: 30,
        fields: {
          resource: 3,
          aclFormula: "",
          aclFormulaParsed: "",
          permissionsText: "-R",
          rulePos: 1
        }
      }
    ]
  );
  assert.throws(
    () =>
      resolveAccessRuleMutation(
        before,
        { tableId: "Projects", columnIds: ["OwnerEmail", "Title"] },
        "create",
        [
          {
            condition: { kind: "everyone" },
            permissions: { read: "deny", update: "unspecified" }
          }
        ]
      ),
    /overlaps existing resource/i
  );

  const clean = snapshot([], []);
  assert.throws(
    () =>
      resolveAccessRuleMutation(
        clean,
        { tableId: "Projects" },
        "create",
        [
          {
            condition: { kind: "everyone" },
            permissions: { read: "deny", update: "unspecified" }
          },
          {
            condition: {
              kind: "user_access",
              operator: "equals",
              role: "owner"
            },
            permissions: { read: "allow", update: "unspecified" }
          }
        ]
      ),
    /everyone access rule must be the final/i
  );
});


test("normalizes and writes typed LinkKey ACL conditions without exposing values", () => {
  const existing = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [
      {
        id: 20,
        fields: {
          resource: 2,
          aclFormula: "user.LinkKey.StageToken == rec.ShareToken",
          aclFormulaParsed: nativeAclFixture("user.LinkKey.StageToken == rec.ShareToken"),
          permissionsText: "+R",
          rulePos: 1
        }
      },
      {
        id: 21,
        fields: {
          resource: 2,
          aclFormula: "",
          aclFormulaParsed: "",
          permissionsText: "-R",
          rulePos: 2
        }
      }
    ]
  );

  const projected = projectAccessRules(existing) as any;
  assert.deepEqual(projected.groups[0].rules[0].condition, {
    kind: "match_link_key",
    operator: "equals",
    columnId: "ShareToken",
    linkKeyName: "StageToken"
  });
  assert.doesNotMatch(JSON.stringify(projected), /aclFormula|StageToken_/);

  const clean = snapshot([], []);
  const plan = resolveAccessRuleMutation(
    clean,
    { tableId: "Projects" },
    "create",
    [
      {
        condition: {
          kind: "match_link_key",
          operator: "not_equals",
          columnId: "ShareToken",
          linkKeyName: "StageToken"
        },
        permissions: {
          read: "deny",
          update: "unspecified",
          create: "unspecified",
          delete: "unspecified"
        }
      },
      {
        condition: { kind: "everyone" },
        permissions: {
          read: "allow",
          update: "unspecified",
          create: "unspecified",
          delete: "unspecified"
        }
      }
    ]
  );
  assert.equal(plan.rules[0]?.aclFormula, "rec.ShareToken != user.LinkKey.StageToken");
});

test("LinkKey ACL conditions reject unsafe names, literals and incompatible columns", () => {
  const clean = snapshot([], []);

  assert.throws(
    () =>
      resolveAccessRuleMutation(
        clean,
        { tableId: "Projects" },
        "create",
        [
          {
            condition: {
              kind: "match_link_key",
              operator: "equals",
              columnId: "ShareToken",
              linkKeyName: "bad-name"
            },
            permissions: { read: "allow", update: "unspecified" }
          }
        ]
      ),
    /LinkKey name/i
  );

  assert.throws(
    () =>
      resolveAccessRuleMutation(
        clean,
        { tableId: "Projects" },
        "create",
        [
          {
            condition: {
              kind: "match_link_key",
              operator: "equals",
              columnId: "UserId",
              linkKeyName: "StageToken"
            },
            permissions: { read: "allow", update: "unspecified" }
          }
        ]
      ),
    /not compatible with a LinkKey comparison/i
  );

  const literal = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [
      {
        id: 20,
        fields: {
          resource: 2,
          aclFormula: "user.LinkKey.StageToken == 'sensitive-value'",
          aclFormulaParsed: nativeAclFixture("user.LinkKey.StageToken == 'sensitive-value'"),
          permissionsText: "+R",
          rulePos: 1
        }
      }
    ]
  );
  const projected = projectAccessRules(literal) as any;
  assert.equal(projected.groups[0].editable, false);
  assert.doesNotMatch(JSON.stringify(projected), /sensitive-value|StageToken/);
});


test("composite ACL conditions round-trip with native boolean precedence and LinkKey operands", () => {
  const clean = snapshot([], []);
  const input = {
    kind: "all" as const,
    conditions: [
      { kind: "user_access" as const, operator: "not_equals" as const, role: "viewer" as const },
      {
        kind: "not" as const,
        condition: {
          kind: "match_link_key" as const,
          operator: "not_equals" as const,
          columnId: "ShareToken",
          linkKeyName: "StageToken"
        }
      }
    ]
  };
  const plan = resolveAccessRuleMutation(
    clean, { tableId: "Projects" }, "create",
    [{ condition: input, permissions: { read: "allow", update: "unspecified" } }]
  );
  assert.equal(
    plan.rules[0]?.aclFormula,
    "(user.Access != VIEWER) and (not (rec.ShareToken != user.LinkKey.StageToken))"
  );
  assert.deepEqual(plan.normalizedRules[0]?.condition, input);

  const existing = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [{
      id: 20,
      fields: {
        resource: 2,
        aclFormula: "user.LinkKey.StageToken == rec.ShareToken or user.Access == OWNER and rec.OwnerEmail == user.Email",
        aclFormulaParsed: nativeAclFixture("user.LinkKey.StageToken == rec.ShareToken or user.Access == OWNER and rec.OwnerEmail == user.Email"),
        permissionsText: "+R",
        rulePos: 1
      }
    }]
  );
  const projected = projectAccessRules(existing) as any;
  assert.deepEqual(projected.groups[0].rules[0].condition, {
    kind: "any",
    conditions: [
      { kind: "match_link_key", operator: "equals", columnId: "ShareToken", linkKeyName: "StageToken" },
      {
        kind: "all",
        conditions: [
          { kind: "user_access", operator: "equals", role: "owner" },
          { kind: "match_user", operator: "equals", columnId: "OwnerEmail", userProperty: "Email" }
        ]
      }
    ]
  });
  assert.doesNotMatch(JSON.stringify(projected), /aclFormula|StageToken_/);
});

test("non-empty parenthesized void ACL formulas never normalize into everyone", () => {
  const invalid = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [{
      id: 20,
      fields: {
        resource: 2,
        aclFormula: "(( ))",
        aclFormulaParsed: '["Tuple",[]]',
        permissionsText: "+R",
        rulePos: 1
      }
    }]
  );
  const projected = projectAccessRules(invalid) as any;
  assert.equal(projected.groups[0].editable, false);
  assert.equal(projected.groups[0].rules, undefined);
});

test("composite ACL conditions fail closed on ambiguity, depth, size and sensitive literals", () => {
  const clean = snapshot([], []);
  const rule = (condition: any) => [{
    condition, permissions: { read: "allow" as const, update: "unspecified" as const }
  }];
  const permitted = { kind: "user_access", operator: "equals", role: "owner" };
  assert.throws(
    () => resolveAccessRuleMutation(clean, { tableId: "Projects" }, "create", rule({
      kind: "all", conditions: [permitted, { kind: "everyone" }]
    })),
    /Everyone is not/i
  );
  let tooDeep: any = permitted;
  for (let i = 0; i < 5; i++) tooDeep = { kind: "not", condition: tooDeep };
  assert.throws(
    () => resolveAccessRuleMutation(clean, { tableId: "Projects" }, "create", rule(tooDeep)),
    /depth bound/i
  );
  assert.throws(
    () => resolveAccessRuleMutation(clean, { tableId: "Projects" }, "create", rule({
      kind: "all", conditions: Array.from({ length: 7 }, () => permitted)
    })),
    /2-6 bounded children/i
  );
  const opaque = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [{
      id: 20,
      fields: {
        resource: 2,
        aclFormula: "user.LinkKey.StageToken == 'private-value' and user.Access == OWNER",
        aclFormulaParsed: nativeAclFixture("user.LinkKey.StageToken == 'private-value' and user.Access == OWNER"),
        permissionsText: "+R",
        rulePos: 1
      }
    }]
  );
  const projected = projectAccessRules(opaque) as any;
  assert.equal(projected.groups[0].editable, false);
  assert.doesNotMatch(JSON.stringify(projected), /private-value|StageToken|aclFormula/);
});


test("newRec typed matches round-trip with original rec shapes and protected LinkKey values", () => {
  const clean = snapshot([], []);
  const condition = {
    kind: "all" as const,
    conditions: [
      {
        kind: "match_user" as const, record: "newRec" as const,
        operator: "equals" as const, columnId: "OwnerEmail", userProperty: "Email" as const
      },
      {
        kind: "not" as const,
        condition: {
          kind: "match_link_key" as const, record: "newRec" as const,
          operator: "not_equals" as const, columnId: "ShareToken", linkKeyName: "StageToken"
        }
      }
    ]
  };
  const plan = resolveAccessRuleMutation(
    clean, { tableId: "Projects" }, "create",
    [{ condition, permissions: { read: "unspecified", update: "allow", create: "allow" } }]
  );
  assert.equal(
    plan.rules[0]?.aclFormula,
    "(newRec.OwnerEmail == user.Email) and (not (newRec.ShareToken != user.LinkKey.StageToken))"
  );
  assert.deepEqual(plan.normalizedRules[0]?.condition, condition);

  const persisted = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [{ id: 20, fields: {
      resource: 2,
      aclFormula: "user.LinkKey.StageToken == newRec.ShareToken and rec.OwnerEmail == user.Email",
      aclFormulaParsed: nativeAclFixture("user.LinkKey.StageToken == newRec.ShareToken and rec.OwnerEmail == user.Email"),
      permissionsText: "+U",
      rulePos: 1
    } }]
  );
  const projection = projectAccessRules(persisted) as any;
  assert.deepEqual(projection.groups[0].rules[0].condition, {
    kind: "all",
    conditions: [
      {
        kind: "match_link_key", record: "newRec", operator: "equals",
        columnId: "ShareToken", linkKeyName: "StageToken"
      },
      { kind: "match_user", operator: "equals", columnId: "OwnerEmail", userProperty: "Email" }
    ]
  });
  assert.doesNotMatch(JSON.stringify(projection), /aclFormula|StageToken_|sensitive-value/);
});

test("newRec matches reject read/delete decisions, arbitrary record contexts and opaque literals", () => {
  const clean = snapshot([], []);
  const condition = {
    kind: "match_user" as const, record: "newRec" as const,
    operator: "equals" as const, columnId: "OwnerEmail", userProperty: "Email" as const
  };
  for (const permissions of [
    { read: "allow" as const, update: "unspecified" as const },
    { read: "unspecified" as const, update: "allow" as const, delete: "deny" as const }
  ]) {
    assert.throws(() => resolveAccessRuleMutation(
      clean, { tableId: "Projects" }, "create", [{ condition, permissions }]
    ), /newRec.*create\/update/i);
  }
  assert.throws(() => resolveAccessRuleMutation(
    clean, { tableId: "Projects" }, "create", [{
      condition: { ...condition, record: "rec" as any },
      permissions: { read: "unspecified", update: "allow" }
    }]
  ), /Unsupported ACL record context/i);

  const persisted = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [{ id: 20, fields: {
      resource: 2, aclFormula: "newRec.OwnerEmail == user.Email",
      aclFormulaParsed: nativeAclFixture("newRec.OwnerEmail == user.Email"), permissionsText: "+R", rulePos: 1
    } }]
  );
  const projection = projectAccessRules(persisted) as any;
  assert.equal(projection.groups[0].editable, false);
  assert.equal(projection.groups[0].rules, undefined);
  assert.match(projection.groups[0].unsupportedReason, /newRec/);

  const literal = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [{ id: 20, fields: {
      resource: 2, aclFormula: "newRec.ShareToken == 'sensitive-value'",
      aclFormulaParsed: nativeAclFixture("newRec.ShareToken == 'sensitive-value'"), permissionsText: "+U", rulePos: 1
    } }]
  );
  const protectedProjection = projectAccessRules(literal);
  assert.equal((protectedProjection as any).groups[0].editable, false);
  assert.doesNotMatch(JSON.stringify(protectedProjection), /sensitive-value|aclFormula/);
});


test("column_change preserves typed old/new intent and canonicalizes native operand order", () => {
  const clean = snapshot([], []);
  const condition = {
    kind: "column_change" as const, operator: "not_equals" as const, columnId: "OwnerEmail"
  };
  const plan = resolveAccessRuleMutation(
    clean, { tableId: "Projects", columnIds: ["OwnerEmail"] }, "create",
    [{ condition, permissions: { read: "unspecified", update: "deny" } }]
  );
  assert.equal(plan.rules[0]?.aclFormula, "rec.OwnerEmail != newRec.OwnerEmail");
  assert.deepEqual(plan.normalizedRules[0]?.condition, condition);

  const persisted = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "OwnerEmail" } }],
    [{ id: 20, fields: {
      resource: 2, aclFormula: "newRec.OwnerEmail != rec.OwnerEmail",
      aclFormulaParsed: nativeAclFixture("newRec.OwnerEmail != rec.OwnerEmail"), permissionsText: "-U", rulePos: 1
    } }]
  );
  const projection = projectAccessRules(persisted) as any;
  assert.equal(projection.groups[0].editable, true);
  assert.deepEqual(projection.groups[0].rules[0].condition, condition);
  assert.equal(projection.effectiveEnforcementVerified, false);

  const replace = resolveAccessRuleMutation(
    persisted, { tableId: "Projects", columnIds: ["OwnerEmail"] }, "replace",
    [{ condition, permissions: { read: "unspecified", update: "deny" } }]
  );
  assert.equal(replace.mode, "noop");
});

test("column_change is update-only even within composite conditions and rejects unsafe/native unsupported forms", () => {
  const clean = snapshot([], []);
  const condition = {
    kind: "all" as const,
    conditions: [
      { kind: "user_access" as const, operator: "equals" as const, role: "editor" as const },
      { kind: "column_change" as const, operator: "equals" as const, columnId: "UserId" }
    ]
  };
  const plan = resolveAccessRuleMutation(
    clean, { tableId: "Projects" }, "create",
    [{ condition, permissions: { read: "unspecified", update: "allow" } }]
  );
  assert.equal(plan.rules[0]?.aclFormula,
    "(user.Access == EDITOR) and (rec.UserId == newRec.UserId)");

  for (const permissions of [
    { read: "allow" as const, update: "allow" as const },
    { read: "unspecified" as const, update: "allow" as const, create: "allow" as const },
    { read: "unspecified" as const, update: "allow" as const, delete: "deny" as const }
  ]) {
    assert.throws(() => resolveAccessRuleMutation(
      clean, { tableId: "Projects" }, "create", [{ condition, permissions }]
    ), /newRec|Column-change/i);
  }
  assert.throws(() => resolveAccessRuleMutation(
    clean, { tableId: "Projects" }, "create", [{
      condition: { kind: "column_change", operator: "equals", columnId: "Missing" },
      permissions: { read: "unspecified", update: "allow" }
    }]
  ), /existing Text|Choice/i);

  assert.throws(() => resolveAccessRuleMutation(
    clean, { tableId: "Projects" }, "create", [{
      condition: { kind: "column_change", operator: "equals", columnId: "OwnerEmail.Bad" },
      permissions: { read: "unspecified", update: "allow" }
    }]
  ), /safe stable column ID/i);

  const invalidNative = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [{ id: 20, fields: {
      resource: 2, aclFormula: "rec.OwnerEmail == rec.OwnerEmail",
      aclFormulaParsed: nativeAclFixture("rec.OwnerEmail == rec.OwnerEmail"), permissionsText: "+U", rulePos: 1
    } }]
  );
  const invalidProjection = projectAccessRules(invalidNative) as any;
  assert.equal(invalidProjection.groups[0].editable, false);
  assert.equal(invalidProjection.groups[0].rules, undefined);
  const creationNative = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [{ id: 20, fields: {
      resource: 2, aclFormula: "rec.OwnerEmail == newRec.OwnerEmail",
      aclFormulaParsed: nativeAclFixture("rec.OwnerEmail == newRec.OwnerEmail"), permissionsText: "+C", rulePos: 1
    } }]
  );
  assert.equal((projectAccessRules(creationNative) as any).groups[0].editable, false);
  assert.doesNotMatch(JSON.stringify(projectAccessRules(creationNative)), /aclFormula/);
});

test("bounded boolean literals round-trip and canonicalize reversed native operands", () => {
  const condition = {
    kind: "match_boolean" as const, columnId: "Enabled",
    operator: "equals" as const, value: true
  };
  const plan = resolveAccessRuleMutation(
    snapshot([], []), { tableId: "Projects" }, "create",
    [{ condition, permissions: { read: "deny", update: "unspecified" } }]
  );
  assert.equal(plan.rules[0]?.aclFormula, "rec.Enabled == True");
  assert.deepEqual(plan.normalizedRules[0]?.condition, condition);

  const persisted = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [{ id: 20, fields: {
      resource: 2, aclFormula: "True == rec.Enabled",
      aclFormulaParsed: nativeAclFixture("True == rec.Enabled"), permissionsText: "-R", rulePos: 1
    } }]
  );
  const view = projectAccessRules(persisted) as any;
  assert.equal(view.groups[0].editable, true);
  assert.deepEqual(view.groups[0].rules[0].condition, condition);
  assert.equal(view.effectiveEnforcementVerified, false);
  assert.equal(resolveAccessRuleMutation(
    persisted, { tableId: "Projects" }, "replace",
    [{ condition, permissions: { read: "deny", update: "unspecified" } }]
  ).mode, "noop");
});

test("bounded boolean literals admit proposed values but reject unsafe inputs and permissions", () => {
  const condition = {
    kind: "match_boolean" as const, columnId: "Enabled",
    operator: "not_equals" as const, value: false, record: "newRec" as const
  };
  const compound = {
    kind: "all" as const, conditions: [
      { kind: "user_access" as const, role: "editor" as const, operator: "equals" as const },
      condition
    ]
  };
  const clean = snapshot([], []);
  assert.equal(resolveAccessRuleMutation(
    clean, { tableId: "Projects" }, "create",
    [{ condition: compound, permissions: { read: "unspecified", update: "deny" } }]
  ).rules[0]?.aclFormula,
  "(user.Access == EDITOR) and (newRec.Enabled != False)");

  for (const permissions of [
    { read: "deny" as const, update: "unspecified" as const },
    { read: "unspecified" as const, update: "allow" as const, delete: "deny" as const }
  ]) {
    assert.throws(() => resolveAccessRuleMutation(
      clean, { tableId: "Projects" }, "create",
      [{ condition: compound, permissions }]
    ), /newRec/);
  }
  for (const rejected of [
    { ...condition, value: "True" as any },
    { ...condition, value: 1 as any },
    { ...condition, record: "rec" as any },
    { ...condition, columnId: "OwnerEmail" },
    { ...condition, columnId: "NotPresent" }
  ]) {
    assert.throws(() => resolveAccessRuleMutation(
      clean, { tableId: "Projects" }, "create",
      [{ condition: rejected, permissions: { read: "unspecified", update: "allow" } }]
    ), /Bool|boolean|record context/);
  }
  for (const native of [
    "rec.OwnerEmail == True",
    "rec.Enabled == 'sensitive-value'",
    "rec.Enabled in [True, False]"
  ]) {
    const persisted = snapshot(
      [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
      [{ id: 20, fields: {
        resource: 2, aclFormula: native, aclFormulaParsed: nativeAclFixture(native),
        permissionsText: "+R", rulePos: 1
      } }]
    );
    const view = projectAccessRules(persisted) as any;
    assert.equal(view.groups[0].editable, false);
    assert.equal(view.groups[0].rules, undefined);
    assert.doesNotMatch(JSON.stringify(view), /sensitive-value|aclFormula/);
  }
});


test("bounded role membership round-trips, normalizes order and is replace-noop", () => {
  const condition = {
    kind: "user_access_membership" as const, operator: "in" as const,
    roles: ["viewer", "editor"] as ("viewer" | "editor")[]
  };
  const plan = resolveAccessRuleMutation(
    snapshot([], []), { tableId: "Projects" }, "create",
    [{ condition, permissions: { read: "deny", update: "unspecified" } }]
  );
  assert.equal(plan.rules[0]?.aclFormula, "user.Access in [EDITOR, VIEWER]");
  assert.deepEqual(plan.normalizedRules[0]?.condition, {
    kind: "user_access_membership", operator: "in", roles: ["editor", "viewer"]
  });

  const persisted = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [{ id: 20, fields: { resource: 2, aclFormula: "user.Access in [VIEWER, EDITOR]",
      aclFormulaParsed: nativeAclFixture("user.Access in [VIEWER, EDITOR]"), permissionsText: "-R", rulePos: 1 } }]
  );
  const view = projectAccessRules(persisted) as any;
  assert.equal(view.groups[0].editable, true);
  assert.deepEqual(view.groups[0].rules[0].condition, plan.normalizedRules[0]?.condition);
  assert.equal(resolveAccessRuleMutation(persisted, { tableId: "Projects" }, "replace",
    [{ condition, permissions: { read: "deny", update: "unspecified" } }]).mode, "noop");
  assert.equal(view.effectiveEnforcementVerified, false);
});

test("native not-in membership and bounded combinations protect unknown operands", () => {
  const roleSet = {
    kind: "user_access_membership" as const, operator: "not_in" as const,
    roles: ["viewer", "owner"] as ("viewer" | "owner")[]
  };
  const compound = { kind: "all" as const, conditions: [
    roleSet, { kind: "match_boolean" as const, operator: "equals" as const,
      columnId: "Enabled", value: true }
  ] };
  assert.equal(resolveAccessRuleMutation(snapshot([], []), { tableId: "Projects" },
    "create", [{ condition: compound, permissions: { read: "deny", update: "unspecified" } }]
  ).rules[0]?.aclFormula, "(user.Access not in [OWNER, VIEWER]) and (rec.Enabled == True)");

  const native = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [{ id: 20, fields: { resource: 2, aclFormula: "user.Access not in [VIEWER, OWNER]",
      aclFormulaParsed: nativeAclFixture("user.Access not in [VIEWER, OWNER]"), permissionsText: "-R", rulePos: 1 } }]
  );
  assert.deepEqual((projectAccessRules(native) as any).groups[0].rules[0].condition, {
    kind: "user_access_membership", operator: "not_in", roles: ["owner", "viewer"]
  });

  for (const invalid of [
    { ...roleSet, roles: ["owner"] as any },
    { ...roleSet, roles: ["owner", "owner"] as any },
    { ...roleSet, roles: ["owner", "admin"] as any },
    { ...roleSet, roles: ["owner", "editor", "viewer", "admin"] as any },
    { ...roleSet, operator: "is" as any },
    { ...roleSet, roles: "owner, editor" as any }
  ]) assert.throws(() => resolveAccessRuleMutation(
    snapshot([], []), { tableId: "Projects" }, "create",
    [{ condition: invalid, permissions: { read: "deny", update: "unspecified" } }]
  ), /membership|Role|normalize/i);

  for (const formula of [
    "user.Access in [OWNER]",
    "user.Access in [OWNER, OWNER]",
    "user.Access in [OWNER, ADMIN]",
    "user.Email in ['private@example.com', 'other@example.com']"
  ]) {
    const persisted = snapshot(
      [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
      [{ id: 20, fields: { resource: 2, aclFormula: formula,
        aclFormulaParsed: nativeAclFixture(formula), permissionsText: "-R", rulePos: 1 } }]
    );
    const projection = projectAccessRules(persisted) as any;
    assert.equal(projection.groups[0].editable, false);
    assert.equal(projection.groups[0].rules, undefined);
    assert.doesNotMatch(JSON.stringify(projection), /private@example.com|aclFormula/);
  }
});


test("native login-status boolean predicates normalize both operand orders and avoid extra writes", () => {
  const condition = { kind: "user_login_status" as const, operator: "equals" as const, value: true };
  const plan = resolveAccessRuleMutation(snapshot([], []), { tableId: "Projects" }, "create",
    [{ condition, permissions: { read: "deny", update: "unspecified" } }]);
  assert.equal(plan.rules[0]?.aclFormula, "user.IsLoggedIn == True");

  const persisted = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [{ id: 20, fields: { resource: 2, aclFormula: "True == user.IsLoggedIn",
      aclFormulaParsed: nativeAclFixture("True == user.IsLoggedIn"), permissionsText: "-R", rulePos: 1 } }]
  );
  const view = projectAccessRules(persisted) as any;
  assert.equal(view.groups[0].editable, true);
  assert.deepEqual(view.groups[0].rules[0].condition, condition);
  assert.equal(resolveAccessRuleMutation(persisted, { tableId: "Projects" }, "replace",
    [{ condition, permissions: { read: "deny", update: "unspecified" } }]).mode, "noop");
  assert.equal(view.effectiveEnforcementVerified, false);

  const composed = { kind: "all" as const, conditions: [
    { kind: "user_access_membership" as const, operator: "not_in" as const,
      roles: ["viewer", "editor"] as ("viewer" | "editor")[] },
    { kind: "not" as const, condition: {
      kind: "user_login_status" as const, operator: "not_equals" as const, value: false
    } }
  ] };
  assert.equal(resolveAccessRuleMutation(snapshot([], []), { tableId: "Projects" }, "create",
    [{ condition: composed, permissions: { read: "deny", update: "unspecified" } }]
  ).rules[0]?.aclFormula,
  "(user.Access not in [EDITOR, VIEWER]) and (not (user.IsLoggedIn != False))");
});

test("login status only accepts boolean constants, protects unsupported and secret-bearing formulas", () => {
  const valid = { kind: "user_login_status" as const, operator: "not_equals" as const, value: false };
  assert.equal(resolveAccessRuleMutation(snapshot([], []), { tableId: "Projects" }, "create",
    [{ condition: valid, permissions: { read: "deny", update: "unspecified" } }]
  ).rules[0]?.aclFormula, "user.IsLoggedIn != False");
  for (const invalid of [
    { ...valid, value: "False" as any },
    { ...valid, value: "private-token" as any },
    { ...valid, value: 0 as any },
    { ...valid, operator: "in" as any }
  ]) {
    assert.throws(() => resolveAccessRuleMutation(snapshot([], []), { tableId: "Projects" },
      "create", [{ condition: invalid, permissions: { read: "deny", update: "unspecified" } }]
    ), /login|boolean|operator/i);
  }
  for (const native of [
    "user.IsLoggedIn == 1",
    "user.IsLoggedIn in [True, False]",
    "user.SessionID == 'private-token'",
    "user.Email == True"
  ]) {
    const persisted = snapshot(
      [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
      [{ id: 20, fields: { resource: 2, aclFormula: native,
        aclFormulaParsed: nativeAclFixture(native), permissionsText: "-R", rulePos: 1 } }]
    );
    const view = projectAccessRules(persisted) as any;
    assert.equal(view.groups[0].editable, false);
    assert.equal(view.groups[0].rules, undefined);
    assert.doesNotMatch(JSON.stringify(view), /private-token|aclFormula/);
  }
});

test("bounded Int 0/1 ACL flags round-trip in either order without extra writes", () => {
  const condition = { kind: "match_integer_flag" as const, columnId: "UserId",
    operator: "equals" as const, value: 1 as const };
  const plan = resolveAccessRuleMutation(snapshot([], []), { tableId: "Projects" }, "create",
    [{ condition, permissions: { read: "deny", update: "unspecified" } }]);
  assert.equal(plan.rules[0]?.aclFormula, "rec.UserId == 1");
  const persisted = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [{ id: 20, fields: { resource: 2, aclFormula: "1 == rec.UserId",
      aclFormulaParsed: nativeAclFixture("1 == rec.UserId"), permissionsText: "-R", rulePos: 1 } }]
  );
  const view = projectAccessRules(persisted) as any;
  assert.equal(view.groups[0].editable, true);
  assert.deepEqual(view.groups[0].rules[0].condition, condition);
  assert.equal(resolveAccessRuleMutation(persisted, { tableId: "Projects" }, "replace",
    [{ condition, permissions: { read: "deny", update: "unspecified" } }]).mode, "noop");
  assert.equal(view.effectiveEnforcementVerified, false);
});

test("Int 0/1 proposed-value conditions compose but cannot affect read or delete", () => {
  const flag = { kind: "match_integer_flag" as const, columnId: "UserId",
    operator: "not_equals" as const, value: 0 as const, record: "newRec" as const };
  const composed = { kind: "any" as const, conditions: [
    { kind: "user_login_status" as const, operator: "equals" as const, value: false },
    flag
  ] };
  assert.equal(resolveAccessRuleMutation(snapshot([], []), { tableId: "Projects" }, "create",
    [{ condition: composed, permissions: { read: "unspecified", update: "deny" } }]
  ).rules[0]?.aclFormula, "(user.IsLoggedIn == False) or (newRec.UserId != 0)");
  for (const permissions of [
    { read: "deny" as const, update: "unspecified" as const },
    { read: "unspecified" as const, update: "allow" as const, delete: "deny" as const }
  ]) assert.throws(() => resolveAccessRuleMutation(snapshot([], []), { tableId: "Projects" },
    "create", [{ condition: composed, permissions }]), /newRec/);
});

test("Int flags refuse arbitrary numbers, other column types and opaque secrets", () => {
  const valid = { kind: "match_integer_flag" as const, columnId: "UserId",
    operator: "equals" as const, value: 0 as const };
  for (const condition of [
    { ...valid, value: -1 as any },
    { ...valid, value: 2 as any },
    { ...valid, value: 0.5 as any },
    { ...valid, value: "0" as any },
    { ...valid, value: "secret-value" as any },
    { ...valid, value: true as any },
    { ...valid, columnId: "Enabled" },
    { ...valid, columnId: "OwnerEmail" },
    { ...valid, columnId: "Absent" },
    { ...valid, operator: "in" as any },
    { ...valid, record: "rec" as any }
  ]) assert.throws(() => resolveAccessRuleMutation(snapshot([], []), { tableId: "Projects" },
    "create", [{ condition, permissions: { read: "deny", update: "unspecified" } }]
  ), /Int|flag|record context/i);
  for (const formula of [
    "rec.UserId == 2",
    "1.0 == rec.UserId",
    "rec.UserId == -1",
    "rec.Enabled == 1",
    "rec.OwnerEmail == 'private-token'",
    "rec.UserId in [0, 1]"
  ]) {
    const persisted = snapshot(
      [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
      [{ id: 20, fields: { resource: 2, aclFormula: formula,
        aclFormulaParsed: nativeAclFixture(formula), permissionsText: "-R", rulePos: 1 } }]
    );
    const view = projectAccessRules(persisted) as any;
    assert.equal(view.groups[0].editable, false);
    assert.equal(view.groups[0].rules, undefined);
    assert.doesNotMatch(JSON.stringify(view), /private-token|aclFormula/);
  }
});

test("empty-text ACL predicates round-trip with both literal orders and exact no-op", () => {
  const condition = { kind: "match_empty_text" as const, operator: "equals" as const,
    columnId: "OwnerEmail" };
  const plan = resolveAccessRuleMutation(snapshot([], []), { tableId: "Projects" }, "create",
    [{ condition, permissions: { read: "deny", update: "unspecified" } }]);
  assert.equal(plan.rules[0]?.aclFormula, "rec.OwnerEmail == ''");
  for (const formula of ["'' == rec.OwnerEmail", '"" == rec.OwnerEmail', "rec.OwnerEmail == ''"]) {
    const persisted = snapshot(
      [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
      [{ id: 20, fields: { resource: 2, aclFormula: formula,
        aclFormulaParsed: nativeAclFixture(formula), permissionsText: "-R", rulePos: 1 } }]
    );
    const view = projectAccessRules(persisted) as any;
    assert.equal(view.groups[0].editable, true);
    assert.deepEqual(view.groups[0].rules[0].condition, condition);
    assert.equal(resolveAccessRuleMutation(persisted, { tableId: "Projects" }, "replace",
      [{ condition, permissions: { read: "deny", update: "unspecified" } }]).mode, "noop");
  }
});

test("empty-text proposed-row conditions compose but cannot control read/delete", () => {
  const condition = { kind: "any" as const, conditions: [
    { kind: "user_login_status" as const, operator: "equals" as const, value: false },
    { kind: "match_empty_text" as const, operator: "not_equals" as const,
      columnId: "OwnerEmail", record: "newRec" as const }
  ] };
  const plan = resolveAccessRuleMutation(snapshot([], []), { tableId: "Projects" }, "create",
    [{ condition, permissions: { read: "unspecified", update: "deny" } }]);
  assert.equal(plan.rules[0]?.aclFormula,
    "(user.IsLoggedIn == False) or (newRec.OwnerEmail != '')");
  for (const permissions of [
    { read: "deny" as const, update: "unspecified" as const },
    { read: "unspecified" as const, update: "allow" as const, delete: "deny" as const }
  ]) assert.throws(() => resolveAccessRuleMutation(snapshot([], []), { tableId: "Projects" },
    "create", [{ condition, permissions }]), /newRec/);
});

test("empty-text ACL subset protects literal-bearing, unsupported and malformed conditions", () => {
  const valid = { kind: "match_empty_text" as const, operator: "equals" as const,
    columnId: "OwnerEmail" };
  for (const condition of [
    { ...valid, columnId: "Enabled" }, { ...valid, columnId: "UserId" },
    { ...valid, columnId: "Missing" }, { ...valid, operator: "in" as any },
    { ...valid, record: "rec" as any }
  ]) assert.throws(() => resolveAccessRuleMutation(snapshot([], []), { tableId: "Projects" },
    "create", [{ condition, permissions: { read: "deny", update: "unspecified" } }]
  ), /empty-text|record context/i);
  for (const formula of [
    "rec.OwnerEmail == 'private-token'", "rec.OwnerEmail == ' '",
    "rec.UserId == ''", "rec.Enabled != ''",
    "rec.OwnerEmail in ['']", "rec.OwnerEmail == None"
  ]) {
    const persisted = snapshot(
      [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
      [{ id: 20, fields: { resource: 2, aclFormula: formula,
        aclFormulaParsed: nativeAclFixture(formula), permissionsText: "-R", rulePos: 1 } }]
    );
    const view = projectAccessRules(persisted) as any;
    assert.equal(view.groups[0].editable, false);
    assert.equal(view.groups[0].rules, undefined);
    assert.doesNotMatch(JSON.stringify(view), /private-token|aclFormula/);
  }
});

test("native user attributes inspect only safe structural identifiers without LinkKey values", () => {
  const rawOwner = JSON.stringify({
    name: "Teacher", tableId: "Projects", lookupColId: "OwnerEmail", charId: "Email"
  });
  const rawLinkKey = JSON.stringify({
    name: "StageAccess", tableId: "Projects", lookupColId: "ShareToken",
    charId: "LinkKey.AccessCode"
  });
  const state = snapshot(
    [
      { id: 1, fields: { tableId: "*", colIds: "*" } },
      { id: 2, fields: { tableId: "Projects", colIds: "*" } }
    ],
    [
      { id: 10, fields: { resource: 1, aclFormula: "", aclFormulaParsed: "",
        permissionsText: "", rulePos: 1, userAttributes: rawOwner } },
      { id: 11, fields: { resource: 1, aclFormula: "", aclFormulaParsed: "",
        permissionsText: "", rulePos: 2, userAttributes: rawLinkKey } },
      { id: 12, fields: { resource: 1, aclFormula: "", aclFormulaParsed: "",
        permissionsText: "", rulePos: 3, userAttributes: JSON.stringify({
          name: "Secret", tableId: "Projects", lookupColId: "OwnerEmail",
          charId: "LinkKey.Token", value: "private-token"
        }) } },
      { id: 13, fields: { resource: 1, aclFormula: "", aclFormulaParsed: "",
        permissionsText: "", rulePos: 4, userAttributes: "private-token" } },
      { id: 20, fields: { resource: 2, aclFormula: "rec.OwnerEmail == user.Email",
        aclFormulaParsed: nativeAclFixture("rec.OwnerEmail == user.Email"), permissionsText: "+R", rulePos: 1 } }
    ]
  );
  const view = projectAccessRules(state) as any;
  assert.deepEqual(view.userAttributes, {
    definitions: [
      { name: "Teacher", tableId: "Projects", lookupColId: "OwnerEmail",
        source: { kind: "user_property", property: "Email" }, editable: false },
      { name: "StageAccess", tableId: "Projects", lookupColId: "ShareToken",
        source: { kind: "link_key", name: "AccessCode" }, editable: false }
    ],
    protectedDefinitionCount: 2
  });
  assert.equal(view.protectedPersistedGroupCount, 1);
  assert.equal(view.groups.length, 1);
  assert.equal(view.groups[0].editable, true);
  assert.doesNotMatch(JSON.stringify(view), /private-token|aclFormula|LinkKey\.Token/);
});

test("native default-resource NULL user-attribute fields remain inspectable and preserved", () => {
  // Reproduces the native metadata shape of the data-free suivi des stages dev2.grist:
  // ordinary permission rows use strings, while the Personnel attribute row uses SQL NULLs.
  const resources = [
    { id: 1, fields: { tableId: "*", colIds: "*" } },
    { id: 2, fields: { tableId: "Projects", colIds: "*" } }
  ];
  const nativeDefinition = {
    id: 9, fields: {
      resource: 1, rulePos: 9, aclFormula: null, aclFormulaParsed: "",
      permissionsText: null,
      userAttributes: JSON.stringify({
        name: "Personnel", tableId: "Projects", lookupColId: "ShareToken",
        charId: "LinkKey.Token"
      })
    }
  };
  const defaultRule = {
    id: 8, fields: { resource: 1, rulePos: 8, aclFormula: "",
      aclFormulaParsed: "", permissionsText: "+R" }
  };
  const ordinaryRule = {
    id: 20, fields: { resource: 2, rulePos: 1,
      aclFormula: "user.Access == OWNER", aclFormulaParsed: nativeAclFixture("user.Access == OWNER"),
      permissionsText: "+RU" }
  };
  const before = snapshot(resources, [defaultRule, nativeDefinition, ordinaryRule]);
  const view = projectAccessRules(before) as any;
  assert.equal(view.protectedPersistedGroupCount, 1);
  assert.equal(view.groups.length, 1);
  assert.equal(view.groups[0].editable, true);
  assert.deepEqual(view.userAttributes, {
    definitions: [{
      name: "Personnel", tableId: "Projects", lookupColId: "ShareToken",
      source: { kind: "link_key", name: "Token" }, editable: true
    }],
    protectedDefinitionCount: 0
  });
  // Semantic inspection may see empty strings, but the original SQL NULLs
  // must stay untouched for the preservation fingerprint used by writes.
  assert.equal(before.rules.find((rule) => rule.id === 9)?.aclFormula, "");
  assert.equal(before.rules.find((rule) => rule.id === 9)?.fields.aclFormula, null);
  assert.equal(before.rules.find((rule) => rule.id === 9)?.fields.permissionsText, null);
  assert.doesNotMatch(JSON.stringify(view), /aclFormula|permissionsText|LinkKey\\.Token/);

  const plan = resolveAccessRuleMutation(before, { tableId: "Projects" }, "replace", [
    { condition: { kind: "user_access", operator: "equals", role: "owner" },
      permissions: { read: "allow", update: "allow" } }
  ]);
  assert.equal(verifyAccessRuleMutation(before, before, plan).persistedDefinitionVerified, true);

  // Never silently rewrite native NULL metadata to empty text during an unrelated ACL write.
  const changed = snapshot(resources, [
    defaultRule, { ...nativeDefinition, fields: {
      ...nativeDefinition.fields, aclFormula: "", permissionsText: ""
    } }, ordinaryRule
  ]);
  assert.throws(() => verifyAccessRuleMutation(before, changed, plan),
    /Untargeted persisted access-rule state changed/);
});

test("SQL NULL permission fields remain rejected outside native user-attribute definitions", () => {
  const resource = { id: 1, fields: { tableId: "*", colIds: "*" } };
  const ordinary = { id: 2, fields: { tableId: "Projects", colIds: "*" } };
  const definition = JSON.stringify({
    name: "Personnel", tableId: "Projects", lookupColId: "ShareToken",
    charId: "LinkKey.Token"
  });
  const nativeFields = {
    resource: 1, rulePos: 9, aclFormula: null,
    aclFormulaParsed: "", permissionsText: null, userAttributes: definition
  };
  const cases = [
    { resources: [resource, ordinary], fields: { ...nativeFields, resource: 2 } },
    { resources: [resource], fields: { ...nativeFields, permissionsText: "" } },
    { resources: [resource], fields: { ...nativeFields, aclFormula: "" } },
    { resources: [resource], fields: { ...nativeFields, userAttributes: "" } },
    { resources: [resource], fields: { ...nativeFields, userAttributes: "invalid-json" } },
    { resources: [resource], fields: { ...nativeFields,
      userAttributes: JSON.stringify({ name: "Personnel", extra: "unsupported" }) } },
    { resources: [resource], fields: { ...nativeFields, aclFormulaParsed: '["Eq"]' } },
    { resources: [resource], fields: { ...nativeFields, rulePos: null } },
    { resources: [resource, { ...resource, id: 3 }], fields: nativeFields },
    { resources: [resource], fields: { resource: 1, rulePos: 9,
      aclFormulaParsed: "", userAttributes: definition } }
  ];
  for (const item of cases) {
    assert.throws(() => snapshot(item.resources, [{ id: 9, fields: item.fields }]),
      /ACL rule metadata is incomplete or censored: aclFormula is unavailable|permissionsText is unavailable/);
  }
});

test("ambiguous or misplaced user attributes stay protected; unrelated ACL writes preserve them", () => {
  const common = {
    name: "Teacher", tableId: "Projects", lookupColId: "OwnerEmail", charId: "Email"
  };
  const state = snapshot(
    [
      { id: 1, fields: { tableId: "*", colIds: "*" } },
      { id: 2, fields: { tableId: "Projects", colIds: "*" } }
    ],
    [
      { id: 10, fields: { resource: 1, aclFormula: "", aclFormulaParsed: "",
        permissionsText: "", rulePos: 1, userAttributes: JSON.stringify(common) } },
      { id: 11, fields: { resource: 1, aclFormula: "", aclFormulaParsed: "",
        permissionsText: "", rulePos: 2, userAttributes: JSON.stringify(common) } },
      { id: 12, fields: { resource: 2, aclFormula: "rec.OwnerEmail == user.Email",
        aclFormulaParsed: nativeAclFixture("rec.OwnerEmail == user.Email"), permissionsText: "+R", rulePos: 3,
        userAttributes: JSON.stringify({ ...common, name: "Misplaced" }) } }
    ]
  );
  const view = projectAccessRules(state) as any;
  assert.deepEqual(view.userAttributes, { definitions: [], protectedDefinitionCount: 3 });
  assert.equal(view.groups[0].editable, false);
  assert.throws(() => resolveAccessRuleMutation(state, { tableId: "Projects" }, "replace",
    [{ condition: { kind: "everyone" }, permissions: { read: "allow", update: "unspecified" } }]),
  /unsupported or sensitive/);
});


test("native user-attribute create plans a single default resource and verifies only target rows", () => {
  const before = snapshot([], []);
  const target = { userAttributeName: "Mentor" };
  const definition = { tableId: "Projects", lookupColId: "OwnerEmail",
    source: { kind: "user_property" as const, property: "Email" as const } };
  const plan = resolveUserAttributeMutation(before, target, "create", definition);
  assert.equal(plan.mode, "create");
  assert.equal(plan.createDefaultResource, true);
  assert.equal(plan.defaultResourceId, undefined);
  assert.equal(plan.rulePos, 1);
  assert.equal(plan.nativeDefinition,
    JSON.stringify({ name: "Mentor", tableId: "Projects", lookupColId: "OwnerEmail", charId: "Email" }));
  const after = snapshot([{ id: 1, fields: { tableId: "*", colIds: "*" } }], [
    { id: 10, fields: { resource: 1, rulePos: 1, userAttributes: plan.nativeDefinition,
      aclFormula: "", aclFormulaParsed: "", permissionsText: "" } }
  ]);
  assert.deepEqual(verifyUserAttributeMutation(before, after, plan), {
    changed: true, persistedDefinitionVerified: true, effectiveEnforcementVerified: false
  });
  assert.equal((projectAccessRules(after) as any).userAttributes.definitions[0].editable, true);
  assert.throws(() => resolveUserAttributeMutation(after, target, "create", definition),
    /already exists/);
  const altered = snapshot([{ id: 1, fields: { tableId: "*", colIds: "*" } }], [
    { id: 10, fields: { resource: 1, rulePos: 1, userAttributes: plan.nativeDefinition,
      aclFormula: "", aclFormulaParsed: "", permissionsText: "" } },
    { id: 11, fields: { resource: 1, rulePos: 2,
      aclFormula: "", aclFormulaParsed: "", permissionsText: "+R" } }
  ]);
  assert.throws(() => verifyUserAttributeMutation(before, altered, plan), /uniquely verified/);
});

test("native user-attribute replacement preserves identity and unrelated policy rows", () => {
  const existingRaw = JSON.stringify({
    name: "Mentor", tableId: "Projects", lookupColId: "OwnerEmail", charId: "Email"
  });
  const resource = [
    { id: 1, fields: { tableId: "*", colIds: "*" } },
    { id: 2, fields: { tableId: "Projects", colIds: "*" } }
  ];
  const original = [
    { id: 10, fields: { resource: 1, rulePos: 1,
      aclFormula: "", aclFormulaParsed: "", permissionsText: "", userAttributes: existingRaw } },
    { id: 20, fields: { resource: 2, rulePos: 1,
      aclFormula: "rec.OwnerEmail == user.Email",
      aclFormulaParsed: '["Eq",["Attr",["Name","rec"],"OwnerEmail"],["Attr",["Name","user"],"Email"]]', permissionsText: "+R" } }
  ];
  const before = snapshot(resource, original);
  const target = { userAttributeName: "Mentor" };
  const definition = { tableId: "Projects", lookupColId: "ShareToken",
    source: { kind: "link_key" as const, name: "StageToken" } };
  const plan = resolveUserAttributeMutation(before, target, "replace", definition);
  assert.equal(plan.targetRuleId, 10);
  assert.equal(plan.mode, "replace");
  const after = snapshot(resource, [
    { ...original[0]!, fields: { ...original[0]!.fields,
      userAttributes: plan.nativeDefinition } }, original[1]!
  ]);
  assert.equal(verifyUserAttributeMutation(before, after, plan).persistedDefinitionVerified, true);
  assert.equal(resolveUserAttributeMutation(after, target, "replace", definition).mode, "noop");
  const modifiedPolicy = snapshot(resource, [
    { ...original[0]!, fields: { ...original[0]!.fields,
      userAttributes: plan.nativeDefinition } },
    { ...original[1]!, fields: { ...original[1]!.fields, permissionsText: "-R" } }
  ]);
  assert.throws(() => verifyUserAttributeMutation(before, modifiedPolicy, plan),
    /Untargeted persisted ACL rules changed/);
});

test("native user-attribute deletion refuses referenced or opaque definitions", () => {
  const native = JSON.stringify({
    name: "Mentor", tableId: "Projects", lookupColId: "OwnerEmail", charId: "Email"
  });
  const resources = [{ id: 1, fields: { tableId: "*", colIds: "*" } }];
  const rule = { id: 10, fields: {
    resource: 1, rulePos: 1, userAttributes: native,
    aclFormula: "", aclFormulaParsed: "", permissionsText: "" } };
  const before = snapshot(resources, [rule]);
  const plan = resolveUserAttributeMutation(before, { userAttributeName: "Mentor" }, "delete");
  assert.equal(plan.mode, "delete");
  assert.equal(verifyUserAttributeMutation(before, snapshot(resources, []), plan)
    .persistedDefinitionVerified, true);
  assert.throws(() => resolveUserAttributeMutation(before,
    { userAttributeName: "Mentor" }, "delete",
    { tableId: "Projects", lookupColId: "OwnerEmail",
      source: { kind: "user_property", property: "Email" } }), /do not accept/);
  const referenced = snapshot([
    ...resources, { id: 2, fields: { tableId: "Projects", colIds: "*" } }
  ], [rule, { id: 20, fields: { resource: 2, rulePos: 1,
    aclFormula: "user.Mentor == rec.OwnerEmail",
    aclFormulaParsed: '["Eq",["Attr",["Name","user"],"Mentor"],["Attr",["Name","rec"],"OwnerEmail"]]',
    permissionsText: "+R" } }]);
  assert.throws(() => resolveUserAttributeMutation(referenced,
    { userAttributeName: "Mentor" }, "delete"), /references this attribute/);
  const aclResource = { id: 2, fields: { tableId: "Projects", colIds: "*" } };
  for (const [formula, parsed] of [
    ["user . Mentor == rec.OwnerEmail",
      '["Eq",["Attr",["Name","user"],"Mentor"],["Attr",["Name","rec"],"OwnerEmail"]]'],
    ["user . Mentor.OwnerEmail == rec.OwnerEmail",
      '["Eq",["Attr",["Attr",["Name","user"],"Mentor"],"OwnerEmail"],["Attr",["Name","rec"],"OwnerEmail"]]']
  ]) {
    const dependent = snapshot([...resources, aclResource], [rule, {
      id: 20, fields: { resource: 2, rulePos: 1, aclFormula: formula,
        aclFormulaParsed: parsed, permissionsText: "+R" }
    }]);
    assert.throws(() => resolveUserAttributeMutation(dependent,
      { userAttributeName: "Mentor" }, "delete"), /references this attribute/);
  }
  for (const parsed of ["", "not JSON", '["Eq"]',
    '["Call",["Name","getattr"],["Name","user"],["Const","Mentor"]]']) {
    const uncertain = snapshot([...resources, aclResource], [rule, {
      id: 20, fields: { resource: 2, rulePos: 1,
        aclFormula: "user . Mentor == rec.OwnerEmail",
        aclFormulaParsed: parsed, permissionsText: "+R" }
    }]);
    assert.throws(() => resolveUserAttributeMutation(uncertain,
      { userAttributeName: "Mentor" }, "delete"), /refusing|ambiguous|outside/);
  }
  const independent = snapshot([...resources, aclResource], [rule, {
    id: 20, fields: { resource: 2, rulePos: 1,
      aclFormula: "user.Email == rec.OwnerEmail",
      aclFormulaParsed: '["Eq",["Attr",["Name","user"],"Email"],["Attr",["Name","rec"],"OwnerEmail"]]',
      permissionsText: "+R" }
  }]);
  assert.equal(resolveUserAttributeMutation(independent,
    { userAttributeName: "Mentor" }, "delete").mode, "delete");
  const opaque = snapshot(resources, [rule, { id: 11, fields: {
    resource: 1, rulePos: 2, aclFormula: "", aclFormulaParsed: "",
    permissionsText: "", userAttributes: "PRIVATE" } }]);
  assert.throws(() => resolveUserAttributeMutation(opaque,
    { userAttributeName: "Other" }, "create", { tableId: "Projects",
      lookupColId: "OwnerEmail", source: { kind: "user_property", property: "Email" } }),
    /unsupported or ambiguous/);
  assert.throws(() => resolveUserAttributeMutation(before,
    { userAttributeName: "Email" }, "create", { tableId: "Projects",
      lookupColId: "OwnerEmail", source: { kind: "user_property", property: "Email" } }),
    /non-reserved/);
});


test("typed user-attribute row matches normalize native operands and protect dependencies", () => {
  const definition = JSON.stringify({
    name: "Mentor", tableId: "Projects", lookupColId: "OwnerEmail", charId: "Email"
  });
  const resources = [
    { id: 1, fields: { tableId: "*", colIds: "*" } },
    { id: 2, fields: { tableId: "Projects", colIds: "*" } }
  ];
  const before = snapshot(resources, [
    { id: 10, fields: { resource: 1, rulePos: 1, userAttributes: definition,
      aclFormula: "", aclFormulaParsed: "", permissionsText: "" } },
    { id: 20, fields: { resource: 2, rulePos: 1,
      aclFormula: "user.Mentor.OwnerEmail == rec.OwnerEmail",
      aclFormulaParsed: '["Eq",["Attr",["Attr",["Name","user"],"Mentor"],"OwnerEmail"],["Attr",["Name","rec"],"OwnerEmail"]]',
      permissionsText: "+R" } }
  ]);
  const view = projectAccessRules(before) as any;
  const condition = { kind: "match_user_attribute" as const,
    operator: "equals" as const, columnId: "OwnerEmail",
    attributeName: "Mentor", attributeColumnId: "OwnerEmail" };
  assert.equal(view.groups[0].editable, true);
  assert.deepEqual(view.groups[0].rules[0].condition, condition);
  const noop = resolveAccessRuleMutation(before, { tableId: "Projects" }, "replace",
    [{ condition, permissions: { read: "allow", update: "unspecified" } }]);
  assert.equal(noop.mode, "noop");
  assert.equal(noop.rules[0]?.aclFormula, "rec.OwnerEmail == user.Mentor.OwnerEmail");
  assert.throws(() => resolveUserAttributeMutation(before,
    { userAttributeName: "Mentor" }, "delete"), /references this attribute/);
  assert.throws(() => resolveUserAttributeMutation(before,
    { userAttributeName: "Mentor" }, "replace",
    { tableId: "Projects", lookupColId: "ShareToken",
      source: { kind: "link_key", name: "StageToken" } }), /reference this user attribute/);

  const requested = resolveAccessRuleMutation(before,
    { tableId: "Projects", columnIds: ["OwnerEmail"] }, "create",
    [{ condition: { ...condition, record: "newRec" },
      permissions: { read: "unspecified", update: "allow" } }]);
  assert.equal(requested.rules[0]?.aclFormula,
    "newRec.OwnerEmail == user.Mentor.OwnerEmail");
  assert.throws(() => resolveAccessRuleMutation(before,
    { tableId: "Projects", columnIds: ["OwnerEmail"] }, "create",
    [{ condition: { ...condition, record: "newRec" },
      permissions: { read: "allow", update: "unspecified" } }]), /newRec/);
  assert.throws(() => resolveAccessRuleMutation(before,
    { tableId: "Projects", columnIds: ["OwnerEmail"] }, "create",
    [{ condition: { ...condition, attributeColumnId: "Missing" },
      permissions: { read: "allow", update: "unspecified" } }]), /verified definition/);
  assert.throws(() => resolveAccessRuleMutation(before,
    { tableId: "Projects", columnIds: ["OwnerEmail"] }, "create",
    [{ condition: { ...condition, attributeName: "Unknown" },
      permissions: { read: "allow", update: "unspecified" } }]), /verified definition/);
  assert.throws(() => resolveAccessRuleMutation(before,
    { tableId: "Projects", columnIds: ["OwnerEmail"] }, "create",
    [{ condition: { ...condition, columnId: "Enabled" },
      permissions: { read: "allow", update: "unspecified" } }]), /comparable stable fields/);
});

test("user-attribute ACL references require compatible Ref IDs and unambiguous definitions", () => {
  const meta = baseMetadata();
  meta.columns.records.push({
    id: 17, fields: { parentId: 1, colId: "MentorRef", type: "Ref:Projects" }
  });
  const definition = JSON.stringify({
    name: "Mentor", tableId: "Projects", lookupColId: "OwnerEmail", charId: "Email"
  });
  const resources = [
    { id: 1, fields: { tableId: "*", colIds: "*" } },
    { id: 2, fields: { tableId: "Projects", colIds: "*" } }
  ];
  const rules = [
    { id: 10, fields: { resource: 1, rulePos: 1, userAttributes: definition,
      aclFormula: "", aclFormulaParsed: "", permissionsText: "" } },
    { id: 20, fields: { resource: 2, rulePos: 1,
      aclFormula: "rec.MentorRef == user.Mentor.id",
      aclFormulaParsed: '["Eq",["Attr",["Name","rec"],"MentorRef"],["Attr",["Attr",["Name","user"],"Mentor"],"id"]]',
      permissionsText: "+R" } }
  ];
  const state = normalizeAccessRulesSnapshot(
    { records: resources }, { records: rules }, meta.tables, meta.columns
  );
  const group = (projectAccessRules(state) as any).groups[0];
  assert.equal(group.editable, true);
  assert.equal(group.rules[0].condition.attributeColumnId, "id");
  const requested = resolveAccessRuleMutation(state,
    { tableId: "Projects", columnIds: ["MentorRef"] }, "create",
    [{ condition: { kind: "match_user_attribute", operator: "equals",
      columnId: "MentorRef", attributeName: "Mentor", attributeColumnId: "id" },
      permissions: { read: "allow", update: "unspecified" } }]);
  assert.equal(requested.rules[0]?.aclFormula, "rec.MentorRef == user.Mentor.id");

  const protectedState = snapshot(resources, [
    ...rules, { id: 11, fields: { resource: 1, rulePos: 2,
      aclFormula: "", aclFormulaParsed: "", permissionsText: "",
      userAttributes: "private-sensitive-opaque-definition" } }
  ]);
  const projected = projectAccessRules(protectedState) as any;
  assert.equal(projected.groups[0].editable, false);
  assert.doesNotMatch(JSON.stringify(projected), /private-sensitive-opaque-definition|aclFormula/);
  assert.throws(() => resolveAccessRuleMutation(protectedState,
    { tableId: "Projects" }, "replace",
    [{ condition: { kind: "match_user_attribute", operator: "equals",
      columnId: "OwnerEmail", attributeName: "Mentor", attributeColumnId: "OwnerEmail" },
      permissions: { read: "allow", update: "unspecified" } }]), /unsupported or sensitive/);
});

test("E1-D1 projects only verified typed ACL dependencies, including nested and proposed-row conditions", () => {
  const resources = [
    { id: 1, fields: { tableId: "*", colIds: "*" } },
    { id: 2, fields: { tableId: "Projects", colIds: "*" } }
  ];
  const userAttribute = JSON.stringify({
    name: "Mentor", tableId: "Projects", lookupColId: "OwnerEmail", charId: "Email"
  });
  const state = snapshot(resources, [
    { id: 10, fields: { resource: 1, rulePos: 1,
      userAttributes: userAttribute, aclFormula: "", aclFormulaParsed: "", permissionsText: "" } },
    { id: 20, fields: { resource: 2, rulePos: 1,
      aclFormula: "rec.ShareToken == user.LinkKey.StageToken and (newRec.OwnerEmail == user.Mentor.OwnerEmail or user.IsLoggedIn == True)",
      aclFormulaParsed: nativeAclFixture("rec.ShareToken == user.LinkKey.StageToken and (newRec.OwnerEmail == user.Mentor.OwnerEmail or user.IsLoggedIn == True)"), permissionsText: "+U" } },
    { id: 21, fields: { resource: 2, rulePos: 2,
      aclFormula: "user.Access in [EDITOR, VIEWER]",
      aclFormulaParsed: nativeAclFixture("user.Access in [EDITOR, VIEWER]"), permissionsText: "+R" } },
    { id: 22, fields: { resource: 2, rulePos: 3,
      aclFormula: "rec.UserId != newRec.UserId",
      aclFormulaParsed: nativeAclFixture("rec.UserId != newRec.UserId"), permissionsText: "-U" } }
  ]);
  const view = projectAccessRules(state) as any;
  const group = view.groups[0];
  assert.equal(group.editable, true);
  assert.deepEqual(group.dependencies, {
    coverage: "supported_rules",
    recordColumnIds: ["ShareToken", "UserId"],
    newRecordColumnIds: ["OwnerEmail", "UserId"],
    userProperties: ["Access", "IsLoggedIn"],
    linkKeyNames: ["StageToken"],
    userAttributeFields: [{ attributeName: "Mentor", attributeColumnId: "OwnerEmail" }]
  });
  assert.deepEqual(group.rules.map((rule: any) => rule.permissions), [
    { read: "unspecified", update: "allow", create: "unspecified", delete: "unspecified" },
    { read: "allow", update: "unspecified", create: "unspecified", delete: "unspecified" },
    { read: "unspecified", update: "deny", create: "unspecified", delete: "unspecified" }
  ]);
  assert.equal(view.effectiveEnforcementVerified, false);
  assert.deepEqual(group.diagnostics, [
    { code: "link_key_web_acceptance_unverified", certainty: "warning" }
  ]);
  assert.doesNotMatch(JSON.stringify(view), /userAttributes.*charId|aclFormula|private-secret/);
});

test("E1-D1 refuses to infer names from protected formulas or secret literals", () => {
  const state = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "Title" } }],
    [{ id: 20, fields: { resource: 2, rulePos: 1,
      aclFormula: "rec.Title == 'private-secret'",
      aclFormulaParsed: nativeAclFixture("rec.Title == 'private-secret'"), permissionsText: "-R" } }]
  );
  const view = projectAccessRules(state) as any;
  assert.deepEqual(view.groups[0].dependencies, { coverage: "unknown" });
  assert.equal(view.groups[0].diagnostics, null);
  assert.equal(view.groups[0].editable, false);
  assert.equal(view.groups[0].rules, undefined);
  assert.doesNotMatch(JSON.stringify(view), /private-secret|aclFormula|recordColumnIds/);
});

test("E1-D2 flags only provable identical-condition shadowing, per permission and rule order", () => {
  const resources = [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }];
  const makeRule = (id: number, rulePos: number, aclFormula: string, permissionsText: string) => ({
    id, fields: { resource: 2, rulePos, aclFormula, aclFormulaParsed: nativeAclFixture(aclFormula), permissionsText }
  });
  const formula = "rec.OwnerEmail == user.Email";
  const state = snapshot(resources, [
    makeRule(20, 1, formula, "+RU"),
    makeRule(21, 2, "rec.Enabled == True", "-R"),
    makeRule(22, 3, formula, "-R+U"),
    makeRule(23, 4, "newRec.OwnerEmail == user.Email", "+U"),
    makeRule(24, 5, formula, "+C"),
    makeRule(25, 6, formula, "-C"),
    makeRule(26, 7, "user.Access == EDITOR", "-R")
  ]);
  const group = (projectAccessRules(state) as any).groups[0];
  assert.equal(group.editable, true);
  assert.deepEqual(group.diagnostics, [
    { code: "shadowed_same_condition_permission", certainty: "proven",
      ruleIndex: 3, earlierRuleIndex: 1, permission: "read" },
    { code: "shadowed_same_condition_permission", certainty: "proven",
      ruleIndex: 3, earlierRuleIndex: 1, permission: "update" },
    { code: "shadowed_same_condition_permission", certainty: "proven",
      ruleIndex: 6, earlierRuleIndex: 5, permission: "create" }
  ]);
  assert.equal(group.rules.length, 7);
  assert.equal(group.dependencies.coverage, "supported_rules");
  assert.deepEqual((projectAccessRules(snapshot(resources, [
    makeRule(30, 1, formula, "+R")
  ])) as any).groups[0].diagnostics, []);
});

test("E1-D2 does not partially lint an opaque group or leak its literals", () => {
  const state = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "Title" } }],
    [
      { id: 20, fields: { resource: 2, rulePos: 1,
        aclFormula: "rec.Title == user.Email",
        aclFormulaParsed: nativeAclFixture("rec.Title == user.Email"), permissionsText: "+R" } },
      { id: 21, fields: { resource: 2, rulePos: 2,
        aclFormula: "rec.Title == 'opaque-private'",
        aclFormulaParsed: nativeAclFixture("rec.Title == 'opaque-private'"), permissionsText: "-R" } },
      { id: 22, fields: { resource: 2, rulePos: 3,
        aclFormula: "rec.Title == user.Email",
        aclFormulaParsed: nativeAclFixture("rec.Title == user.Email"), permissionsText: "-R" } }
    ]
  );
  const group = (projectAccessRules(state) as any).groups[0];
  assert.deepEqual(group.dependencies, { coverage: "unknown" });
  assert.equal(group.diagnostics, null);
  assert.equal(group.rules, undefined);
  assert.doesNotMatch(JSON.stringify(group), /opaque-private|aclFormula|shadowed_same_condition_permission/);
});

test("E1-D2 warns about indirect web-only LinkKey via a verified user attribute", () => {
  const resources = [
    { id: 1, fields: { tableId: "*", colIds: "*" } },
    { id: 2, fields: { tableId: "Projects", colIds: "*" } }
  ];
  const userAttribute = JSON.stringify({
    name: "Mentor", tableId: "Projects", lookupColId: "OwnerEmail",
    charId: "LinkKey.StageToken"
  });
  const group = (projectAccessRules(snapshot(resources, [
    { id: 10, fields: { resource: 1, rulePos: 1, userAttributes: userAttribute,
      aclFormula: "", aclFormulaParsed: "", permissionsText: "" } },
    { id: 20, fields: { resource: 2, rulePos: 1,
      aclFormula: "rec.OwnerEmail == user.Mentor.OwnerEmail",
      aclFormulaParsed: nativeAclFixture("rec.OwnerEmail == user.Mentor.OwnerEmail"), permissionsText: "+R" } }
  ])) as any).groups[0];
  assert.equal(group.editable, true);
  assert.deepEqual(group.dependencies.linkKeyNames, []);
  assert.deepEqual(group.diagnostics, [
    { code: "link_key_web_acceptance_unverified", certainty: "warning" }
  ]);
  assert.doesNotMatch(JSON.stringify(group), /LinkKey\.StageToken|charId|aclFormula/);
});

test("E1-D3 reports typed record and user-attribute schema dependencies", () => {
  const meta = baseMetadata();
  meta.tables.records.push({ id: 2, fields: { tableId: "Tasks" } });
  meta.columns.records.push({ id: 21, fields: { parentId: 2, colId: "OwnerEmail", type: "Text" } });
  const attribute = JSON.stringify({
    name: "Mentor", tableId: "Projects", lookupColId: "ShareToken", charId: "LinkKey.StageToken"
  });
  const state = normalizeAccessRulesSnapshot(
    { records: [
      { id: 1, fields: { tableId: "*", colIds: "*" } },
      { id: 2, fields: { tableId: "Tasks", colIds: "*" } },
      { id: 3, fields: { tableId: "Projects", colIds: "OwnerEmail" } }
    ] },
    { records: [
      { id: 10, fields: { resource: 1, rulePos: 1, userAttributes: attribute,
        aclFormula: "", aclFormulaParsed: "", permissionsText: "" } },
      { id: 20, fields: { resource: 2, rulePos: 1,
        aclFormula: "rec.OwnerEmail == user.Mentor.OwnerEmail",
        aclFormulaParsed: nativeAclFixture("rec.OwnerEmail == user.Mentor.OwnerEmail"), permissionsText: "+R" } },
      { id: 30, fields: { resource: 3, rulePos: 1,
        aclFormula: "newRec.OwnerEmail == user.Email",
        aclFormulaParsed: nativeAclFixture("newRec.OwnerEmail == user.Email"), permissionsText: "+U" } }
    ] }, meta.tables, meta.columns
  );
  const lookup = projectAccessRuleSchemaImpact(state,
    { kind: "column", tableId: "Projects", columnId: "ShareToken" }) as any;
  assert.deepEqual(lookup.affectedUserAttributes, [{ name: "Mentor", reason: "lookup_column" }]);
  assert.deepEqual(lookup.affectedGroups.map((g: any) => [g.target, g.reasons]), [
    [{ tableId: "Tasks" }, ["user_attribute_reference"]]
  ]);
  assert.deepEqual(lookup.unknownCoverage, {
    protectedOrdinaryGroupCount: 0, protectedOtherPolicyResourceCount: 1,
    protectedUserAttributeDefinitionCount: 0
  });
  const field = projectAccessRuleSchemaImpact(state,
    { kind: "column", tableId: "Projects", columnId: "OwnerEmail" }) as any;
  assert.deepEqual(field.affectedGroups.map((g: any) => [g.target, g.reasons]), [
    [{ tableId: "Projects", columnIds: ["OwnerEmail"] }, ["resource_target", "record_condition"]],
    [{ tableId: "Tasks" }, ["user_attribute_reference"]]
  ]);
  const table = projectAccessRuleSchemaImpact(state,
    { kind: "table", tableId: "Projects" }) as any;
  assert.deepEqual(table.affectedUserAttributes, [{ name: "Mentor", reason: "source_table" }]);
  assert.equal(table.affectedGroups.length, 2);
  assert.deepEqual((projectAccessRuleSchemaImpact(state,
    { kind: "column", tableId: "Projects", columnId: "Title" }) as any).affectedGroups, []);
  assert.throws(() => projectAccessRuleSchemaImpact(state,
    { kind: "column", tableId: "Projects", columnId: "Missing" }), /does not exist/);
  assert.throws(() => projectAccessRuleSchemaImpact(state,
    { kind: "table", tableId: "Missing" }), /existing ordinary table/);
  assert.doesNotMatch(JSON.stringify(lookup), /StageToken|charId|aclFormula/);
});

test("E1-D3 retains unknown coverage for opaque ACL conditions, without leaked literals", () => {
  const state = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "Title" } }],
    [{ id: 20, fields: { resource: 2, rulePos: 1,
      aclFormula: "rec.Title == 'private-secret'",
      aclFormulaParsed: nativeAclFixture("rec.Title == 'private-secret'"), permissionsText: "-R" } }]
  );
  const result = projectAccessRuleSchemaImpact(state,
    { kind: "column", tableId: "Projects", columnId: "Title" }) as any;
  assert.equal(result.unknownCoverage.protectedOrdinaryGroupCount, 1);
  assert.deepEqual(result.affectedGroups, [{
    target: { tableId: "Projects", columnIds: ["Title"] },
    reasons: ["resource_target"], conditionCoverage: "unknown"
  }]);
  assert.doesNotMatch(JSON.stringify(result), /private-secret|aclFormula/);
});
