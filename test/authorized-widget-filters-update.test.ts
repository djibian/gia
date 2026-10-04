import assert from "node:assert/strict";
import test from "node:test";

import type { AuditLogger } from "../src/audit/auditLogger.js";
import type { AuthorizationService } from "../src/auth/authorizationService.js";
import type { Principal } from "../src/auth/principal.js";
import { AuthorizedGristService } from "../src/grist/authorizedService.js";
import type { GristService } from "../src/grist/service.js";
import type { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";
import type { WidgetFilterMutationPlan } from "../src/grist/widgetFilters.js";

function harness(applyWrite = true) {
  let nextFilterId = 200;
  let filters = [
    {
      id: 101,
      fields: {
        viewSectionRef: 21,
        colRef: 11,
        filter: "{\"excluded\":[\"Archive\"]}",
        pinned: false
      }
    },
    {
      id: 102,
      fields: {
        viewSectionRef: 21,
        colRef: 12,
        filter: "{\"min\":18}",
        pinned: true
      }
    }
  ];
  const writes: unknown[] = [];

  const inner = {
    maxReadRecords: 5000,
    maxWriteRecords: 500,
    writeBatchRecords: 200,
    maxSchemaItems: 100,
    listTables: async () => ({
      tables: [
        {
          id: "People",
          fields: { tableRef: 2 },
          columns: [
            { id: "Name", fields: { colRef: 11, type: "Text" } },
            { id: "Age", fields: { colRef: 12, type: "Numeric" } },
            { id: "City", fields: { colRef: 13, type: "Text" } }
          ]
        }
      ]
    }),
    queryRecords: async (_documentId: string, tableId: string) => {
      if (tableId === "_grist_Pages") {
        return {
          records: [{ id: 12, fields: { viewRef: 7, indentation: 0, pagePos: 1 } }]
        };
      }
      if (tableId === "_grist_Views") {
        return {
          records: [{ id: 7, fields: { name: "Page", type: "empty", layoutSpec: "" } }]
        };
      }
      if (tableId === "_grist_Views_section") {
        return {
          records: [
            {
              id: 21,
              fields: {
                parentId: 7,
                tableRef: 2,
                parentKey: "record",
                title: "People",
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
      if (tableId === "_grist_Filters") return { records: filters };
      return { records: [] };
    }
  } as unknown as GristService;

  const authorization = {
    assertDocumentAllowed: async (_principal: Principal, documentId: string) => documentId
  } as unknown as AuthorizationService;
  const audit = {
    nextRequestId: () => "request-widget-filters",
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
    updatePageWidget: async (
      documentId: string,
      widgetId: number,
      update: { filters?: WidgetFilterMutationPlan }
    ) => {
      writes.push({ documentId, widgetId, update });
      if (!applyWrite || update.filters === undefined) return;
      const plan = update.filters;

      const removed = new Set(plan.removeFilterIds);
      filters = filters.filter((filter) => !removed.has(filter.id));
      for (const change of plan.update) {
        const filter = filters.find((candidate) => candidate.id === change.filterId);
        if (!filter) continue;
        if (change.filterJson !== undefined) filter.fields.filter = change.filterJson;
        if (change.pinned !== undefined) filter.fields.pinned = change.pinned;
      }
      for (const change of plan.add) {
        filters.push({
          id: nextFilterId++,
          fields: {
            viewSectionRef: widgetId,
            colRef: change.columnRef,
            filter: change.filterJson,
            pinned: change.pinned
          }
        });
      }
    }
  } as unknown as GristUiActionsAdapter;

  return {
    service: new AuthorizedGristService(inner, authorization, audit, principal, uiActions),
    writes,
    currentFilters: () => filters
  };
}

test("authorized widget-filter update preserves untargeted filters and verifies exact re-read state", async () => {
  const { service, writes, currentFilters } = harness();

  const result = await service.updatePageWidget("doc-1", 7, 21, {
    filters: [
      {
        columnId: "City",
        mode: "include",
        values: ["Nantes"],
        pinned: true
      },
      { columnId: "Name", mode: "remove" }
    ]
  }) as {
    widget: {
      filters?: unknown[];
      filtersNormalizationIncomplete?: boolean;
    };
  };

  assert.deepEqual(result.widget.filters, [
    { columnId: "Age", mode: "range", min: 18, pinned: true },
    {
      columnId: "City",
      mode: "include",
      values: ["Nantes"],
      pinned: true
    }
  ]);
  assert.equal(result.widget.filtersNormalizationIncomplete, undefined);
  assert.equal(writes.length, 1);

  const plan = (writes[0] as {
    update: { filters: WidgetFilterMutationPlan };
  }).update.filters;
  assert.deepEqual(plan.removeFilterIds, [101]);
  assert.deepEqual(plan.add, [
    {
      columnRef: 13,
      filterJson: "{\"included\":[\"Nantes\"]}",
      pinned: true
    }
  ]);
  assert.ok(currentFilters().some((filter) => filter.id === 102));
});

test("authorized widget-filter update fails closed when the write cannot be verified", async () => {
  const { service, writes } = harness(false);

  await assert.rejects(
    () =>
      service.updatePageWidget("doc-1", 7, 21, {
        filters: [
          {
            columnId: "City",
            mode: "include",
            values: ["Nantes"]
          }
        ]
      }),
    /did not match the requested persistent filters/
  );

  assert.equal(writes.length, 1);
});
