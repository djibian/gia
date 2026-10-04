import assert from "node:assert/strict";
import test from "node:test";

import type { AuditLogger } from "../src/audit/auditLogger.js";
import type { AuthorizationService } from "../src/auth/authorizationService.js";
import type { GristCapability, Principal } from "../src/auth/principal.js";
import {
  AccessRuleWriteVerificationError,
  type AccessRuleMutationPlan
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

function harness(options: { applyWrite?: boolean } = {}) {
  const resources: Array<{ id: number; fields: Record<string, unknown> }> = [
    { id: 1, fields: { tableId: "*", colIds: "*" } }
  ];
  const rules: Array<{ id: number; fields: Record<string, unknown> }> = [
    {
      id: 10,
      fields: {
        resource: 1,
        aclFormula: "user.LinkKey.token == 'do-not-expose'",
        aclFormulaParsed: '["Eq"]',
        permissionsText: "-R",
        rulePos: 1,
        memo: "sensitive memo"
      }
    }
  ];
  let nextResourceId = 2;
  let nextRuleId = 20;
  const capabilities: Array<GristCapability | null> = [];
  const ownerChecks: string[] = [];
  const writes: AccessRuleMutationPlan[] = [];

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
      if (tableId === "_grist_ACLRules") return { records: rules };
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
              aclFormulaParsed: write.aclFormula ? '["parsed"]' : "",
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
    writes
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
