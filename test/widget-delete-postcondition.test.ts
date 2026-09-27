import assert from "node:assert/strict";
import test from "node:test";

import type { AuditLogger } from "../src/audit/auditLogger.js";
import type { AuthorizationService } from "../src/auth/authorizationService.js";
import type { Principal } from "../src/auth/principal.js";
import { AuthorizedGristService } from "../src/grist/authorizedService.js";
import type { GristService } from "../src/grist/service.js";
import type { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";

test("widget deletion rejects a target that still exists on another page after re-read", async () => {
  let afterDeletion = false;

  const inner = {
    maxReadRecords: 5000,
    maxWriteRecords: 500,
    writeBatchRecords: 200,
    maxSchemaItems: 100,
    listTables: async () => ({
      tables: [{ id: "Personnes", fields: { tableRef: 2 } }]
    }),
    queryRecords: async (_documentId: string, tableId: string) => {
      if (tableId === "_grist_Pages") {
        return {
          records: [
            { id: 101, fields: { viewRef: 7, indentation: 0, pagePos: 1 } },
            { id: 102, fields: { viewRef: 8, indentation: 0, pagePos: 2 } }
          ]
        };
      }
      if (tableId === "_grist_Views") {
        return {
          records: [
            { id: 7, fields: { name: "Page 1", type: "empty", layoutSpec: "" } },
            { id: 8, fields: { name: "Page 2", type: "empty", layoutSpec: "" } }
          ]
        };
      }
      if (tableId === "_grist_Views_section") {
        return {
          records: [
            {
              id: 12,
              fields: {
                parentId: afterDeletion ? 8 : 7,
                tableRef: 2,
                parentKey: "record",
                title: "Personne",
                description: "",
                chartType: "",
                options: "{}",
                layoutSpec: "",
                sortColRefs: "[]",
                linkSrcSectionRef: 0,
                linkSrcColRef: 0,
                linkTargetColRef: 0
              }
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
      documentId: string
    ) => documentId
  } as unknown as AuthorizationService;

  const audit = {
    nextRequestId: () => "request-widget-delete-postcondition",
    record: () => undefined
  } as unknown as AuditLogger;

  const principal: Principal = {
    id: "test-client",
    transport: "mcp",
    grants: [
      {
        documentIds: ["doc-1"],
        workspaceIds: [],
        capabilities: ["doc.schema:write"]
      }
    ]
  };

  const uiActions = {
    deletePageWidget: async () => {
      afterDeletion = true;
    }
  } as unknown as GristUiActionsAdapter;

  const service = new AuthorizedGristService(
    inner,
    authorization,
    audit,
    principal,
    uiActions
  );

  await assert.rejects(
    () => service.deletePageWidget("doc-1", 7, 12),
    /still present on page 8 on re-read/
  );
  assert.equal(afterDeletion, true);
});
