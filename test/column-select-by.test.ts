import assert from "node:assert/strict";
import test from "node:test";

import type { AuditLogger } from "../src/audit/auditLogger.js";
import type { AuthorizationService } from "../src/auth/authorizationService.js";
import type { Principal } from "../src/auth/principal.js";
import { AuthorizedGristService } from "../src/grist/authorizedService.js";
import type { GristClient } from "../src/grist/client.js";
import { DocumentUiService } from "../src/grist/documentUi.js";
import type { GristService } from "../src/grist/service.js";
import { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";
import { discoverColumnSelectByOptions, resolveColumnSelectByAllowed } from "../src/grist/selectBy.js";
import { normalizeExistingSelectBy } from "../src/grist/selectByContext.js";

const tables = {
  tables: [
    {
      id: "Orders",
      fields: { tableRef: 1 },
      columns: [
        {
          id: "Customer",
          fields: { colRef: 11, type: "Ref:Customers" }
        },
        {
          id: "Files",
          fields: { colRef: 12, type: "Attachments" }
        }
      ]
    },
    {
      id: "Customers",
      fields: { tableRef: 2 },
      columns: [
        {
          id: "Orders",
          fields: { colRef: 21, type: "RefList:Orders" }
        }
      ]
    },
    {
      id: "Summary",
      fields: { tableRef: 3, summarySourceTable: 1 },
      columns: [
        {
          id: "Customer",
          fields: { colRef: 31, type: "Ref:Customers" }
        }
      ]
    }
  ]
};

const pages = {
  records: [{ id: 70, fields: { viewRef: 7, indentation: 0, pagePos: 1 } }]
};

const views = {
  records: [{ id: 7, fields: { name: "Links", type: "empty", layoutSpec: "" } }]
};

function section(
  id: number,
  tableRef: number,
  type = "record",
  link = { source: 0, sourceColumn: 0, targetColumn: 0 }
) {
  return {
    id,
    fields: {
      parentId: 7,
      tableRef,
      parentKey: type,
      title: `Widget ${id}`,
      description: "",
      chartType: "",
      options: "{}",
      layoutSpec: "",
      sortColRefs: "[]",
      linkSrcSectionRef: link.source,
      linkSrcColRef: link.sourceColumn,
      linkTargetColRef: link.targetColumn
    }
  };
}

test("discovers reusable Ref/RefList column select-by options without attachments or summaries", () => {
  const service = new DocumentUiService();
  const context = service.build("doc-1", tables, pages, views, {
    records: [
      section(101, 1),
      section(102, 2),
      section(103, 3),
      section(104, 1, "chart")
    ]
  });

  const result = service.getPageWidgets(context, 7, tables);
  const customers = result.widgets.find((widget) => widget.id === 102);
  const summary = result.widgets.find((widget) => widget.id === 103);

  assert.deepEqual(customers?.columnSelectByOptions, [
    { sourceWidgetId: 101, targetColumnId: "Orders" },
    { sourceWidgetId: 101, sourceColumnId: "Customer" }
  ]);
  assert.equal(customers?.columnSelectByOptionsTruncated, false);
  assert.deepEqual(summary?.columnSelectByOptions, []);
  assert.equal(
    customers?.columnSelectByOptions.some(
      (option) => option.sourceColumnId === "Files"
    ),
    false
  );
  assert.equal(
    customers?.columnSelectByOptions.some(
      (option) => option.sourceWidgetId === 104
    ),
    false
  );
});

test("authorized update resolves column IDs to refs and verifies the exact link after re-read", async () => {
  let link = { source: 0, sourceColumn: 0, targetColumn: 0 };
  const listTableCalls: boolean[] = [];
  const uiCalls: unknown[] = [];

  const inner = {
    maxReadRecords: 5000,
    maxWriteRecords: 500,
    writeBatchRecords: 200,
    maxSchemaItems: 100,
    listTables: async (_documentId: string, options: { expandColumns?: boolean } = {}) => {
      listTableCalls.push(options.expandColumns === true);
      return tables;
    },
    queryRecords: async (_documentId: string, tableId: string) => {
      if (tableId === "_grist_Pages") return pages;
      if (tableId === "_grist_Views") return views;
      if (tableId === "_grist_Views_section") {
        return {
          records: [
            section(101, 1),
            section(102, 2, "record", link)
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
      _capability: string
    ) => documentId
  } as unknown as AuthorizationService;
  const audit = {
    nextRequestId: () => "request-ref-select-by",
    record: () => undefined
  } as unknown as AuditLogger;
  const principal: Principal = {
    id: "ref-select-by-test",
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
    updatePageWidget: async (
      documentId: string,
      widgetId: number,
      update: {
        selectBy?: {
          sourceSectionId: number;
          sourceColumnRef?: number;
          targetColumnRef?: number;
        } | null;
      }
    ) => {
      uiCalls.push({ documentId, widgetId, update });
      if (update.selectBy) {
        link = {
          source: update.selectBy.sourceSectionId,
          sourceColumn: update.selectBy.sourceColumnRef ?? 0,
          targetColumn: update.selectBy.targetColumnRef ?? 0
        };
      }
    }
  } as unknown as GristUiActionsAdapter;

  const service = new AuthorizedGristService(
    inner,
    authorization,
    audit,
    principal,
    uiActions
  );

  const result = await service.updatePageWidget("doc-1", 7, 102, {
    selectBy: { sourceWidgetId: 101, sourceColumnId: "Customer" }
  });

  assert.equal(listTableCalls[0], true);
  assert.deepEqual(uiCalls, [
    {
      documentId: "doc-1",
      widgetId: 102,
      update: {
        selectBy: { sourceSectionId: 101, sourceColumnRef: 11 }
      }
    }
  ]);
  assert.deepEqual(
    (result as { widget: { selectBy?: unknown } }).widget.selectBy,
    { sourceSectionId: 101, sourceColumnRef: 11 }
  );
});

test("mismatched Ref/RefList logical tables fail before the write", async () => {
  const context = new DocumentUiService().build("doc-1", tables, pages, views, {
    records: [section(101, 1), section(102, 2)]
  });
  const orders = context.pages[0]!.widgets.find((widget) => widget.id === 101)!;
  const customers = context.pages[0]!.widgets.find((widget) => widget.id === 102)!;
  const { resolveColumnSelectByAllowed } = await import("../src/grist/selectBy.js");

  assert.throws(
    () =>
      resolveColumnSelectByAllowed(context, tables, orders, customers, {
        sourceWidgetId: 101,
        sourceColumnId: "Customer",
        targetColumnId: "Orders"
      }),
    /do not resolve to the same logical Grist table/
  );
});

test("adapter emits only the three bounded Grist select-by references", async () => {
  const observed: unknown[][][] = [];
  const client = {
    applyUserActions: async (_documentId: string, actions: unknown[][]) => {
      observed.push(actions);
      return { actionNum: 1, retValues: [] };
    }
  } as Pick<GristClient, "applyUserActions">;
  const adapter = new GristUiActionsAdapter(client);

  await adapter.updatePageWidget("doc-1", 102, {
    selectBy: { sourceSectionId: 101, sourceColumnRef: 11 }
  });

  assert.deepEqual(observed, [
    [[
      "UpdateRecord",
      "_grist_Views_section",
      102,
      {
        linkSrcSectionRef: 101,
        linkSrcColRef: 11,
        linkTargetColRef: 0
      }
    ]]
  ]);
});

test("column select-by refuses incomplete/ambiguous schemas for reads, advertisement and writes", () => {
  const context = new DocumentUiService().build("doc", tables, pages, views, { records: [section(101, 1), section(102, 2)] });
  const source = context.pages[0]!.widgets[0]!;
  const target = context.pages[0]!.widgets[1]!;
  const order = tables.tables[0]!;
  const cases = [
    { tables: [...tables.tables, { ...order, id: "Other" }] },
    { tables: [...tables.tables, { ...order, fields: { tableRef: 99 } }] },
    { tables: [{ ...order, columns: [...order.columns, { id: "Customer", fields: { colRef: 99, type: "Ref:Customers" } }] }, ...tables.tables.slice(1)] },
    { tables: [{ ...order, columns: [...order.columns, { id: "Other", fields: { colRef: 11, type: "Ref:Customers" } }] }, ...tables.tables.slice(1)] },
    { tables: [{ ...order, columns: [...order.columns, null] }, ...tables.tables.slice(1)] },
    { tables: [{ ...order, columns: undefined }, ...tables.tables.slice(1)] },
    { tables: [{ ...order, columns: [...order.columns, ...Array.from({ length: 5000 }, (_, index) => ({ id: `C${index}`, fields: { colRef: index + 1000, type: "Text" } }))] }, ...tables.tables.slice(1)] }
  ];
  for (const metadata of cases) {
    assert.throws(() => resolveColumnSelectByAllowed(context, metadata, source, target, { sourceWidgetId: 101, sourceColumnId: "Customer" }), /incomplete or ambiguous/);
    assert.deepEqual(discoverColumnSelectByOptions(context, metadata, target), { options: [], truncated: true });
    assert.deepEqual(normalizeExistingSelectBy(context, metadata, { ...target, selectBy: { sourceSectionId: 101, sourceColumnRef: 11 } }), { selectByNormalizationIncomplete: true });
  }
  assert.throws(() => resolveColumnSelectByAllowed(context, tables, { ...source, tableId: "Missing" }, target, { sourceWidgetId: 101, sourceColumnId: "Customer" }), /unavailable table/);
  assert.throws(() => resolveColumnSelectByAllowed(context, tables, { ...source, tableRef: 99 }, target, { sourceWidgetId: 101, sourceColumnId: "Customer" }), /unavailable table/);
});
