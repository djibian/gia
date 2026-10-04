import assert from "node:assert/strict";
import test from "node:test";

import type { AuditLogger } from "../src/audit/auditLogger.js";
import type { AuthorizationService } from "../src/auth/authorizationService.js";
import type { Principal } from "../src/auth/principal.js";
import { AuthorizedGristService } from "../src/grist/authorizedService.js";
import type { GristService } from "../src/grist/service.js";
import type { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";

function harness() {
  let created = false;
  const writes: unknown[] = [];

  const sourceTable = {
    id: "Orders",
    fields: { tableRef: 2, summarySourceTable: 0 },
    columns: [
      { id: "Region", fields: { colRef: 11, type: "Text" } },
      { id: "Status", fields: { colRef: 12, type: "Choice" } }
    ]
  };
  const summaryTable = {
    id: "Orders_summary_Region",
    fields: { tableRef: 4, summarySourceTable: 2 },
    columns: [
      { id: "Region", fields: { colRef: 31, type: "Text", summarySourceCol: 11 } },
      {
        id: "count",
        fields: {
          colRef: 32,
          type: "Int",
          isFormula: true,
          formula: "len($group)",
          summarySourceCol: 0
        }
      }
    ]
  };

  const inner = {
    maxReadRecords: 5000,
    maxWriteRecords: 500,
    writeBatchRecords: 200,
    maxSchemaItems: 100,
    listTables: async () => ({ tables: created ? [sourceTable, summaryTable] : [sourceTable] }),
    queryRecords: async (_documentId: string, tableId: string) => {
      if (tableId === "_grist_Pages") {
        return { records: [{ id: 12, fields: { viewRef: 7, indentation: 0, pagePos: 1 } }] };
      }
      if (tableId === "_grist_Views") {
        return { records: [{ id: 7, fields: { name: "Dashboard", type: "empty", layoutSpec: "" } }] };
      }
      if (tableId === "_grist_Views_section") {
        return {
          records: created
            ? [{
                id: 11,
                fields: {
                  parentId: 7,
                  tableRef: 4,
                  parentKey: "record",
                  title: "Orders summary",
                  description: "",
                  chartType: "",
                  options: "{}",
                  layoutSpec: "",
                  sortColRefs: "[]",
                  linkSrcSectionRef: 0,
                  linkSrcColRef: 0,
                  linkTargetColRef: 0
                }
              }]
            : []
        };
      }
      return { records: [] };
    }
  } as unknown as GristService;

  const authorization = {
    assertDocumentAllowed: async (_principal: Principal, documentId: string) => documentId
  } as unknown as AuthorizationService;
  const audit = {
    nextRequestId: () => "request-summary",
    record: () => undefined
  } as unknown as AuditLogger;
  const principal: Principal = {
    id: "test-client",
    transport: "mcp",
    grants: [{
      documentIds: ["doc-1"],
      workspaceIds: [],
      capabilities: ["doc.schema:write"]
    }]
  };
  const uiActions = {
    addPageWidget: async (
      documentId: string,
      pageId: number,
      sourceTableRef: number,
      type: string,
      groupByColumnRefs?: readonly number[]
    ) => {
      writes.push({ documentId, pageId, sourceTableRef, type, groupByColumnRefs });
      created = true;
      return { pageId, tableRef: 4, widgetId: 11 };
    }
  } as unknown as GristUiActionsAdapter;

  return {
    service: new AuthorizedGristService(inner, authorization, audit, principal, uiActions),
    writes
  };
}

test("authorized native summary creation verifies generated table semantics after re-read", async () => {
  const { service, writes } = harness();

  const result = await service.addPageWidget(
    "doc-1",
    7,
    "Orders",
    "record",
    ["Region"]
  ) as {
    widget: { id: number; tableId?: string };
    summary: {
      sourceTableId: string;
      summaryTableId: string;
      groupByColumnIds: string[];
    };
  };

  assert.deepEqual(writes, [{
    documentId: "doc-1",
    pageId: 7,
    sourceTableRef: 2,
    type: "record",
    groupByColumnRefs: [11]
  }]);
  assert.equal(result.widget.id, 11);
  assert.equal(result.widget.tableId, "Orders_summary_Region");
  assert.deepEqual(result.summary, {
    sourceTableId: "Orders",
    summaryTableId: "Orders_summary_Region",
    groupByColumnIds: ["Region"]
  });
});

test("authorized native summary rejects an unknown source column before any write", async () => {
  const { service, writes } = harness();

  await assert.rejects(
    () => service.addPageWidget("doc-1", 7, "Orders", "record", ["Missing"]),
    /does not exist/
  );
  assert.deepEqual(writes, []);
});
