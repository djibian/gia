import assert from "node:assert/strict";
import test from "node:test";
import { nativeAclFixture } from "./fixtures/native-acl.js";

import type { AuditLogger } from "../src/audit/auditLogger.js";
import type { AuthorizationService } from "../src/auth/authorizationService.js";
import type { GristCapability, Principal } from "../src/auth/principal.js";
import {
  AccessRuleWriteVerificationError,
  type AccessRuleMutationPlan,
  type AccessRulePatchPlan
} from "../src/grist/accessRules.js";
import { AuthorizedGristService } from "../src/grist/authorizedService.js";
import type { GristService } from "../src/grist/service.js";
import type { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";

const principal: Principal = {
  id: "authorized-acl-test",
  transport: "mcp",
  grants: [
    {
      documentIds: ["doc-1"],
      workspaceIds: [],
      capabilities: ["doc:read", "doc.schema:write"]
    }
  ]
};

function harness(options: { applyWrite?: boolean; persistedPredicate?: string;
  aclChangesBeforeWrite?: boolean; existingGroup?: boolean; existingAttribute?: boolean } = {}) {
  const resources: Array<{ id: number; fields: Record<string, unknown> }> = [
    { id: 1, fields: { tableId: "*", colIds: "*" } }
  ];
  const rules: Array<{ id: number; fields: Record<string, unknown> }> = [
    {
      id: 10,
      fields: {
        resource: 1,
        aclFormula: "user.LinkKey.token == 'do-not-expose'",
        aclFormulaParsed: nativeAclFixture("user.LinkKey.token == 'do-not-expose'"),
        permissionsText: "-R",
        rulePos: 1,
        memo: "sensitive memo"
      }
    }
  ];
  if (options.existingGroup) {
    resources.push({ id: 3, fields: { tableId: "Projects", colIds: "*" } });
    rules.push({ id: 12, fields: { resource: 3, aclFormula: "",
      aclFormulaParsed: "", permissionsText: "+R", rulePos: 3 } });
  }
  if (options.existingAttribute) {
    rules.push({ id: 13, fields: { resource: 1, aclFormula: "",
      aclFormulaParsed: "", permissionsText: "", rulePos: 4,
      userAttributes: JSON.stringify({
        name: "Mentor", tableId: "Projects", lookupColId: "OwnerEmail", charId: "Email"
      }) } });
  }
  let nextResourceId = 2;
  let nextRuleId = 20;
  let ruleReads = 0;
  const capabilities: Array<GristCapability | null> = [];
  const ownerChecks: string[] = [];
  const writes: AccessRuleMutationPlan[] = [];
  const patches: AccessRulePatchPlan[] = [];

  const inner = {
    maxReadRecords: 5000,
    maxWriteRecords: 500,
    writeBatchRecords: 200,
    maxSchemaItems: 100,
    assertDocumentOwner: async (documentId: string) => {
      ownerChecks.push(documentId);
    },
    queryRecords: async (_documentId: string, tableId: string) => {
      if (tableId === "_grist_ACLResources") return { records: resources };
      if (tableId === "_grist_ACLRules") {
        if (options.aclChangesBeforeWrite && ++ruleReads === 2) {
          rules.push({ id: 11, fields: { resource: 1, aclFormula: "",
            aclFormulaParsed: "", permissionsText: "-U", rulePos: 2 } });
        }
        return { records: rules };
      }
      if (tableId === "_grist_Tables") {
        return { records: [{ id: 100, fields: { tableId: "Projects" } }] };
      }
      if (tableId === "_grist_Tables_column") {
        return {
          records: [
            {
              id: 101,
              fields: { parentId: 100, colId: "OwnerEmail", type: "Text" }
            },
            {
              id: 102,
              fields: { parentId: 100, colId: "Title", type: "Text" }
            },
            {
              id: 103,
              fields: { parentId: 100, colId: "ShareToken", type: "Text" }
            }
          ]
        };
      }
      return { records: [] };
    }
  } as unknown as GristService;

  const authorization = {
    assertDocumentAllowed: async (
      _principal: Principal,
      documentId: string,
      capability: GristCapability | null
    ) => {
      capabilities.push(capability);
      return documentId;
    }
  } as unknown as AuthorizationService;

  const audit = {
    nextRequestId: () => "request-acl",
    record: () => undefined
  } as unknown as AuditLogger;

  const uiActions = {
    patchAccessRule: async (_id: string, plan: AccessRulePatchPlan) => {
      patches.push(plan);
      if (options.applyWrite === false) return;
      const index = rules.findIndex(r => r.id === plan.ruleId);
      const rule = rules[index]!;
      rules[index] = {...rule, fields: {...rule.fields, ...plan.fields}};
    },
    mutateUserAttribute: async () => {
      throw new Error("Unexpected user-attribute write");
    },
    mutateAccessRuleGroup: async (_documentId: string, plan: AccessRuleMutationPlan) => {
      writes.push(plan);
      if (options.applyWrite === false || plan.mode === "noop") return;

      if (plan.mode === "create") {
        const resourceId = nextResourceId++;
        resources.push({
          id: resourceId,
          fields: {
            tableId: plan.target.tableId,
            colIds:
              plan.target.columnIds.length === 0
                ? "*"
                : plan.target.columnIds.join(",")
          }
        });
        for (const write of plan.rules) {
          rules.push({
            id: nextRuleId++,
            fields: {
              resource: resourceId,
              aclFormula: write.aclFormula,
              aclFormulaParsed: options.persistedPredicate ?? nativeAclFixture(write.aclFormula),
              permissionsText: write.permissionsText,
              rulePos: write.rulePos
            }
          });
        }
      }
    }
  } as unknown as GristUiActionsAdapter;

  return {
    service: new AuthorizedGristService(
      inner,
      authorization,
      audit,
      principal,
      uiActions
    ),
    capabilities,
    ownerChecks,
    writes,
    patches
  };
}

test("ACL inspection uses doc:read and redacts protected persisted content", async () => {
  const { service, capabilities, ownerChecks } = harness();
  const result = await service.inspectAccessRules("doc-1") as any;

  assert.equal(capabilities.at(-1), "doc:read");
  assert.deepEqual(ownerChecks, ["doc-1"]);
  assert.equal(result.documentId, "doc-1");
  assert.equal(result.protectedPersistedGroupCount, 1);
  assert.deepEqual(result.groups, []);
  assert.equal(result.effectiveEnforcementVerified, false);
  assert.doesNotMatch(JSON.stringify(result), /do-not-expose|sensitive memo|LinkKey/);
});

test("ACL policy coverage uses the same read and Owner boundary without writing", async () => {
  const { service, capabilities, ownerChecks, writes } = harness();
  const result = await service.inspectAccessRules("doc-1", undefined, undefined, {
    target: { kind: "table", tableId: "Projects" }, operation: "read"
  }) as any;
  assert.deepEqual(capabilities, ["doc:read"]);
  assert.deepEqual(ownerChecks, ["doc-1"]);
  assert.deepEqual(writes, []);
  assert.equal(result.policyCoverage.persistedStatus, "UNKNOWN");
  assert.equal(result.policyCoverage.defaultPolicy.persisted, "PROTECTED");
  assert.doesNotMatch(JSON.stringify(result), /do-not-expose|sensitive memo|LinkKey/);
});

test("Every ordinary ACL mutation detects changed native policy before writing", async () => {
  for (const mode of ["create", "ensure", "replace", "delete"] as const) {
    const { service, capabilities, ownerChecks, writes } = harness({
      aclChangesBeforeWrite: true, existingGroup: mode === "replace" || mode === "delete"
    });
    await assert.rejects(() => service.changeAccessRuleGroup("doc-1", { tableId: "Projects" }, mode,
      mode === "delete" ? undefined : [
        { condition: { kind: "everyone" }, permissions: { read: "deny", update: "unspecified" } }
      ]), /state changed before mutation/, mode);
    assert.deepEqual(capabilities, ["doc.schema:write"]);
    assert.deepEqual(ownerChecks, ["doc-1"]);
    assert.deepEqual(writes, []);
  }
});

test("Every user-attribute mutation detects changed native policy before writing", async () => {
  for (const mode of ["create", "ensure", "replace", "delete"] as const) {
    const { service, capabilities, ownerChecks } = harness({
      aclChangesBeforeWrite: true, existingAttribute: mode === "replace" || mode === "delete"
    });
    await assert.rejects(() => service.changeAccessRuleGroup("doc-1", { userAttributeName: "Mentor" },
      mode, undefined, mode === "delete" ? undefined : {
        tableId: "Projects", lookupColId: "ShareToken",
        source: { kind: "user_property", property: "Email" }
      }), /state changed before mutation/, mode);
    assert.deepEqual(capabilities, ["doc.schema:write"]);
    assert.deepEqual(ownerChecks, ["doc-1"]);
  }
});

test("Identical ACL ensure and replace remain read-only no-ops", async () => {
  for (const mode of ["ensure", "replace"] as const) {
    const { service, writes } = harness({ existingGroup: true, aclChangesBeforeWrite: true });
    const result = await service.changeAccessRuleGroup("doc-1", { tableId: "Projects" }, mode, [
      { condition: { kind: "everyone" }, permissions: { read: "allow", update: "unspecified" } }
    ]) as { changed: boolean };
    assert.equal(result.changed, false);
    assert.deepEqual(writes, []);
  }
});

test("ACL mutation requires doc.schema:write and verifies exact persisted target state", async () => {
  const { service, capabilities, ownerChecks, writes } = harness();
  const result = await service.changeAccessRuleGroup(
    "doc-1",
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
        permissions: { read: "allow", update: "allow" }
      },
      {
        condition: { kind: "everyone" },
        permissions: { read: "deny", update: "deny" }
      }
    ]
  ) as any;

  assert.equal(capabilities.at(-1), "doc.schema:write");
  assert.deepEqual(ownerChecks, ["doc-1"]);
  assert.equal(writes.length, 1);
  assert.deepEqual(result, {
    documentId: "doc-1",
    target: { tableId: "Projects", columnIds: ["OwnerEmail"] },
    mode: "create",
    changed: true,
    ruleCount: 2,
    persistedDefinitionVerified: true,
    effectiveEnforcementVerified: false
  });
});

test("ACL post-write divergence becomes explicit non-blind-retry uncertainty", async () => {
  const { service, writes } = harness({ applyWrite: false });

  await assert.rejects(
    () =>
      service.changeAccessRuleGroup(
        "doc-1",
        { tableId: "Projects" },
        "create",
        [
          {
            condition: { kind: "everyone" },
            permissions: {
              read: "deny",
              update: "deny",
              create: "deny",
              delete: "deny"
            }
          }
        ]
      ),
    (error: unknown) => {
      assert.ok(error instanceof AccessRuleWriteVerificationError);
      assert.match(error.message, /could not be normalized|differs|verification failed/i);
      assert.match(error.message, /do not retry the whole operation blindly/i);
      return true;
    }
  );
  assert.equal(writes.length, 1);
});


test("ACL metadata disagreement makes the first write uncertain and refuses replacement before writing", async () => {
  const { service, writes } = harness({ persistedPredicate: '["Const",true]' });
  const rules = [{
    condition: { kind: "match_user", operator: "equals", columnId: "OwnerEmail", userProperty: "Email" },
    permissions: { read: "allow", update: "unspecified" }
  }] as const;
  const target = { tableId: "Projects" };
  await assert.rejects(() => service.changeAccessRuleGroup("doc-1", target, "create", [...rules]),
    AccessRuleWriteVerificationError);
  assert.equal(writes.length, 1);
  await assert.rejects(() => service.changeAccessRuleGroup("doc-1", target, "replace", [...rules]),
    /cannot be modified/);
  assert.equal(writes.length, 1);
});

test("ACL inspection fails before metadata reads when native owner proof is absent", async () => {
  let metadataReads = 0;
  const inner = {
    maxReadRecords: 5000,
    maxWriteRecords: 500,
    writeBatchRecords: 200,
    maxSchemaItems: 100,
    assertDocumentOwner: async () => {
      throw new Error("Grist document owner access is required");
    },
    queryRecords: async () => {
      metadataReads += 1;
      return { records: [] };
    }
  } as unknown as GristService;
  const authorization = {
    assertDocumentAllowed: async (_principal: Principal, documentId: string) => documentId
  } as unknown as AuthorizationService;
  const audit = {
    nextRequestId: () => "request-acl-owner-denied",
    record: () => undefined
  } as unknown as AuditLogger;
  const service = new AuthorizedGristService(
    inner,
    authorization,
    audit,
    principal,
    {} as GristUiActionsAdapter
  );

  await assert.rejects(
    () => service.inspectAccessRules("doc-1"),
    /owner access is required/i
  );
  assert.equal(metadataReads, 0);
});


test("ACL mutation accepts a typed LinkKey name without accepting a secret value", async () => {
  const { service, writes } = harness();
  const result = await service.changeAccessRuleGroup(
    "doc-1",
    { tableId: "Projects", columnIds: ["ShareToken"] },
    "create",
    [
      {
        condition: {
          kind: "match_link_key",
          operator: "equals",
          columnId: "ShareToken",
          linkKeyName: "StageToken"
        },
        permissions: { read: "allow", update: "unspecified" }
      },
      {
        condition: { kind: "everyone" },
        permissions: { read: "deny", update: "unspecified" }
      }
    ]
  ) as any;

  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.rules[0]?.aclFormula, "rec.ShareToken == user.LinkKey.StageToken");
  assert.deepEqual(result, {
    documentId: "doc-1",
    target: { tableId: "Projects", columnIds: ["ShareToken"] },
    mode: "create",
    changed: true,
    ruleCount: 2,
    persistedDefinitionVerified: true,
    effectiveEnforcementVerified: false
  });
});

test("local ACL permission patch uses Owner/schema authorization and shared stale-state guard", async () => {
  const target = {tableId: "Projects"};
  const expected = {condition: {kind: "everyone"},
    permissions: {read: "allow", update: "unspecified"}} as const;
  const replacement = {read: "deny", update: "unspecified"} as const;
  const stale = harness({existingGroup: true, aclChangesBeforeWrite: true});
  await assert.rejects(() => stale.service.patchAccessRule("doc-1", target, expected, {permissions: replacement}),
    /state changed before mutation/);
  assert.deepEqual(stale.capabilities, ["doc.schema:write"]);
  assert.deepEqual(stale.ownerChecks, ["doc-1"]);
  assert.deepEqual(stale.patches, []);
  const noOp = await stale.service.patchAccessRule("doc-1", target, expected, {permissions: expected.permissions}) as any;
  assert.equal(noOp.changed, false);
  assert.deepEqual(stale.patches, []);

  const good = harness({existingGroup: true});
  const result = await good.service.patchAccessRule("doc-1", target, expected, {permissions: replacement}) as any;
  assert.equal(result.changed, true);
  assert.equal(result.persistedDefinitionVerified, true);
  assert.equal(result.effectiveEnforcementVerified, false);
  assert.equal(good.patches.length, 1);
  const lost = harness({existingGroup: true, applyWrite: false});
  await assert.rejects(() => lost.service.patchAccessRule("doc-1", target, expected, {permissions: replacement}),
    AccessRuleWriteVerificationError);
  assert.equal(lost.patches.length, 1);
});
