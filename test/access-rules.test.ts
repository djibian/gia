import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAccessRulesSnapshot,
  projectAccessRules,
  resolveAccessRuleMutation,
  verifyAccessRuleMutation
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
          aclFormulaParsed: '["Eq"]',
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
          aclFormulaParsed: '["Eq"]',
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
          aclFormulaParsed: '["Eq"]',
          permissionsText: "+R-U",
          rulePos: 1
        }
      }
    ]
  );

  const projected = projectAccessRules(state) as any;
  assert.equal(projected.protectedPersistedGroupCount, 2);
  assert.equal(projected.effectiveEnforcementVerified, false);
  assert.deepEqual(projected.groups, [
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
          aclFormulaParsed: '["Eq"]',
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
          aclFormulaParsed: '["Eq"]',
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
          aclFormulaParsed: '["Eq"]',
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
          aclFormulaParsed: '["Eq"]',
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
        aclFormulaParsed: '["Or"]',
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
        aclFormulaParsed: '["And"]',
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
      aclFormulaParsed: '["And"]',
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
      aclFormulaParsed: '["Eq"]', permissionsText: "+R", rulePos: 1
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
      aclFormulaParsed: '["Eq"]', permissionsText: "+U", rulePos: 1
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
      aclFormulaParsed: '["NotEq"]', permissionsText: "-U", rulePos: 1
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
      aclFormulaParsed: '["Eq"]', permissionsText: "+U", rulePos: 1
    } }]
  );
  const invalidProjection = projectAccessRules(invalidNative) as any;
  assert.equal(invalidProjection.groups[0].editable, false);
  assert.equal(invalidProjection.groups[0].rules, undefined);
  const creationNative = snapshot(
    [{ id: 2, fields: { tableId: "Projects", colIds: "*" } }],
    [{ id: 20, fields: {
      resource: 2, aclFormula: "rec.OwnerEmail == newRec.OwnerEmail",
      aclFormulaParsed: '["Eq"]', permissionsText: "+C", rulePos: 1
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
      aclFormulaParsed: '["Eq"]', permissionsText: "-R", rulePos: 1
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
        resource: 2, aclFormula: native, aclFormulaParsed: '["Eq"]',
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
      aclFormulaParsed: '["In"]', permissionsText: "-R", rulePos: 1 } }]
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
      aclFormulaParsed: '["NotIn"]', permissionsText: "-R", rulePos: 1 } }]
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
        aclFormulaParsed: '["In"]', permissionsText: "-R", rulePos: 1 } }]
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
      aclFormulaParsed: '["Eq"]', permissionsText: "-R", rulePos: 1 } }]
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
        aclFormulaParsed: '["Eq"]', permissionsText: "-R", rulePos: 1 } }]
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
      aclFormulaParsed: '["Eq"]', permissionsText: "-R", rulePos: 1 } }]
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
        aclFormulaParsed: '["Eq"]', permissionsText: "-R", rulePos: 1 } }]
    );
    const view = projectAccessRules(persisted) as any;
    assert.equal(view.groups[0].editable, false);
    assert.equal(view.groups[0].rules, undefined);
    assert.doesNotMatch(JSON.stringify(view), /private-token|aclFormula/);
  }
});
