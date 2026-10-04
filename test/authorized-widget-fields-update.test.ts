import assert from "node:assert/strict";
import test from "node:test";

import type { AuditLogger } from "../src/audit/auditLogger.js";
import type { AuthorizationService } from "../src/auth/authorizationService.js";
import type { Principal } from "../src/auth/principal.js";
import { AuthorizedGristService } from "../src/grist/authorizedService.js";
import type { GristService } from "../src/grist/service.js";
import type { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";
import type { WidgetFieldMutationPlan } from "../src/grist/widgetFields.js";

function harness(applyWrite = true) {
  let nextFieldId = 200;
  let sectionFields = [
    {
      id: 101,
      fields: {
        parentId: 21,
        parentPos: 2,
        colRef: 11,
        width: 120,
        widgetOptions: "{\"keep\":true}"
      }
    },
    {
      id: 102,
      fields: {
        parentId: 21,
        parentPos: 1,
        colRef: 12,
        width: 0,
        rules: "keep"
      }
    }
  ];
  const writes: unknown[] = [];
  const listTableOptions: unknown[] = [];

  const inner = {
    maxReadRecords: 5000,
    maxWriteRecords: 500,
    writeBatchRecords: 200,
    maxSchemaItems: 100,
    listTables: async (_documentId: string, options: unknown) => {
      listTableOptions.push(options);
      return {
        tables: [
          {
            id: "People",
            fields: { tableRef: 2 },
            columns: [
              { id: "Name", fields: { colRef: 11, type: "Text" } },
              { id: "Email", fields: { colRef: 12, type: "Text" } },
              { id: "City", fields: { colRef: 13, type: "Text" } }
            ]
          }
        ]
      };
    },
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
      if (tableId === "_grist_Views_section_field") {
        return { records: sectionFields };
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
    nextRequestId: () => "request-widget-fields",
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
      update: { visibleFields?: WidgetFieldMutationPlan }
    ) => {
      writes.push({ documentId, widgetId, update });
      if (!applyWrite || update.visibleFields === undefined) return;

      const plan = update.visibleFields;
      const removed = new Set(plan.removeFieldIds);
      sectionFields = sectionFields.filter((field) => !removed.has(field.id));

      for (const change of plan.reposition) {
        const field = sectionFields.find((candidate) => candidate.id === change.fieldId);
        if (field) field.fields.parentPos = change.parentPos;
      }
      for (const change of plan.resize) {
        const field = sectionFields.find((candidate) => candidate.id === change.fieldId);
        if (field) field.fields.width = change.width;
      }
      for (const change of plan.add) {
        sectionFields.push({
          id: nextFieldId++,
          fields: {
            parentId: widgetId,
            parentPos: change.parentPos,
            colRef: change.columnRef,
            width: change.width,
            widgetOptions: ""
          }
        });
      }
    }
  } as unknown as GristUiActionsAdapter;

  return {
    service: new AuthorizedGristService(inner, authorization, audit, principal, uiActions),
    writes,
    listTableOptions,
    currentSectionFields: () => sectionFields
  };
}

test("authorized widget-field update resolves stable IDs and verifies exact re-read state", async () => {
  const { service, writes, listTableOptions, currentSectionFields } = harness();

  const result = await service.updatePageWidget("doc-1", 7, 21, {
    visibleFields: [
      { columnId: "City", width: 180 },
      { columnId: "Name" }
    ]
  }) as {
    widget: {
      visibleFields?: Array<{ columnId: string; width?: number }>;
      visibleFieldsNormalizationIncomplete?: boolean;
    };
  };

  assert.deepEqual(result.widget.visibleFields, [
    { columnId: "City", width: 180 },
    { columnId: "Name", width: 120 }
  ]);
  assert.equal(result.widget.visibleFieldsNormalizationIncomplete, undefined);
  assert.deepEqual(listTableOptions, [
    { expandColumns: true },
    { expandColumns: true }
  ]);

  assert.equal(writes.length, 1);
  const plan = (writes[0] as {
    update: { visibleFields: WidgetFieldMutationPlan };
  }).update.visibleFields;
  assert.deepEqual(plan.removeFieldIds, [102]);
  assert.deepEqual(plan.add, [{ columnRef: 13, parentPos: 1, width: 180 }]);

  const retained = currentSectionFields().find((field) => field.id === 101);
  assert.equal(retained?.fields.widgetOptions, "{\"keep\":true}");
  assert.equal(retained?.fields.width, 120);
});

test("authorized widget-field update fails closed when the write does not reach the requested state", async () => {
  const { service, writes } = harness(false);

  await assert.rejects(
    () =>
      service.updatePageWidget("doc-1", 7, 21, {
        visibleFields: [
          { columnId: "City", width: 180 },
          { columnId: "Name" }
        ]
      }),
    /did not match the requested visible fields/
  );

  assert.equal(writes.length, 1);
});


test("authorized widget-field update can clear all visible fields and verifies the empty state", async () => {
  const { service, writes, currentSectionFields } = harness();

  const result = await service.updatePageWidget("doc-1", 7, 21, {
    visibleFields: []
  }) as {
    widget: {
      visibleFields?: Array<{ columnId: string; width?: number }>;
      visibleFieldsNormalizationIncomplete?: boolean;
    };
  };

  assert.deepEqual(result.widget.visibleFields, []);
  assert.equal(result.widget.visibleFieldsNormalizationIncomplete, undefined);
  assert.equal(writes.length, 1);

  const plan = (writes[0] as {
    update: { visibleFields: WidgetFieldMutationPlan };
  }).update.visibleFields;
  assert.deepEqual(plan.expected, []);
  assert.deepEqual(plan.removeFieldIds, [101, 102]);
  assert.deepEqual(plan.add, []);
  assert.deepEqual(
    currentSectionFields().filter((field) => field.fields.parentId === 21),
    []
  );
});
