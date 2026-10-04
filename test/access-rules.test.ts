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
        { id: 13, fields: { parentId: 1, colId: "UserId", type: "Int" } }
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

test("normalizes only bounded secret-safe ordinary ACL groups", () => {
  const state = snapshot(
    [
      { id: 1, fields: { tableId: "*", colIds: "*" } },
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
  assert.equal(projected.protectedPersistedGroupCount, 1);
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
  assert.doesNotMatch(JSON.stringify(projected), /secret|private memo|LinkKey/);
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
