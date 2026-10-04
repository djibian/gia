import assert from "node:assert/strict";
import test from "node:test";

import type { AccessRuleMutationPlan } from "../src/grist/accessRules.js";
import { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";

function plan(overrides: Partial<AccessRuleMutationPlan> = {}): AccessRuleMutationPlan {
  return {
    mode: "create",
    requestedMode: "create",
    target: { tableId: "Projects", columnIds: ["OwnerEmail"] },
    ruleRecordIds: [],
    rules: [
      {
        aclFormula: "rec.OwnerEmail == user.Email",
        permissionsText: "+RU",
        rulePos: 1
      },
      { aclFormula: "", permissionsText: "-RU", rulePos: 2 }
    ],
    normalizedRules: [],
    untargetedFingerprint: "fingerprint",
    ...overrides
  };
}

test("ACL adapter creates one bridge-owned resource and rules without public native IDs", async () => {
  const calls: unknown[] = [];
  const adapter = new GristUiActionsAdapter({
    applyUserActions: async (documentId: string, actions: unknown[]) => {
      calls.push({ documentId, actions });
      return { actionNum: 1, retValues: [] };
    }
  } as any);

  await adapter.mutateAccessRuleGroup("doc-1", plan());

  assert.deepEqual(calls, [
    {
      documentId: "doc-1",
      actions: [
        [
          "AddRecord",
          "_grist_ACLResources",
          -1,
          { tableId: "Projects", colIds: "OwnerEmail" }
        ],
        [
          "AddRecord",
          "_grist_ACLRules",
          null,
          {
            resource: -1,
            aclFormula: "rec.OwnerEmail == user.Email",
            permissionsText: "+RU",
            rulePos: 1
          }
        ],
        [
          "AddRecord",
          "_grist_ACLRules",
          null,
          {
            resource: -1,
            aclFormula: "",
            permissionsText: "-RU",
            rulePos: 2
          }
        ]
      ]
    }
  ]);
});

test("ACL adapter replaces and deletes only resolved persisted rows", async () => {
  const calls: unknown[] = [];
  const adapter = new GristUiActionsAdapter({
    applyUserActions: async (_documentId: string, actions: unknown[]) => {
      calls.push(actions);
      return {};
    }
  } as any);

  await adapter.mutateAccessRuleGroup(
    "doc-1",
    plan({
      mode: "replace",
      requestedMode: "replace",
      resourceRecordId: 9,
      ruleRecordIds: [20, 21],
      rules: [{ aclFormula: "", permissionsText: "-R", rulePos: 1 }]
    })
  );
  await adapter.mutateAccessRuleGroup(
    "doc-1",
    plan({
      mode: "delete",
      requestedMode: "delete",
      resourceRecordId: 9,
      ruleRecordIds: [30],
      rules: []
    })
  );

  assert.deepEqual(calls, [
    [
      ["BulkRemoveRecord", "_grist_ACLRules", [20, 21]],
      [
        "AddRecord",
        "_grist_ACLRules",
        null,
        {
          resource: 9,
          aclFormula: "",
          permissionsText: "-R",
          rulePos: 1
        }
      ]
    ],
    [
      ["BulkRemoveRecord", "_grist_ACLRules", [30]],
      ["RemoveRecord", "_grist_ACLResources", 9]
    ]
  ]);
});

test("ACL adapter performs no native write for a verified semantic no-op", async () => {
  let calls = 0;
  const adapter = new GristUiActionsAdapter({
    applyUserActions: async () => {
      calls += 1;
      return {};
    }
  } as any);

  await adapter.mutateAccessRuleGroup(
    "doc-1",
    plan({ mode: "noop", requestedMode: "replace" })
  );
  assert.equal(calls, 0);
});
