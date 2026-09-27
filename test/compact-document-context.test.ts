import assert from "node:assert/strict";
import test from "node:test";

import { DocumentContextService } from "../src/grist/documentContext.js";
import type { DocumentUiContext } from "../src/grist/documentUi.js";

function sampleUi(): DocumentUiContext & { metadataSnapshotIncomplete?: true } {
  return {
    documentId: "doc-1",
    summary: { pageCount: 1, widgetCount: 2 },
    pages: [
      {
        id: 7,
        pageRecordId: 70,
        name: "Dashboard",
        type: "raw_data",
        indentation: 0,
        pagePos: 1,
        layoutSpec: { private: "raw-layout" },
        layoutNormalized: {
          root: {
            kind: "group",
            children: [
              { kind: "widget", widgetId: 11 },
              { kind: "widget", widgetId: 12 }
            ]
          },
          collapsedWidgetIds: [],
          unplacedWidgetIds: []
        },
        widgets: [
          {
            id: 11,
            pageId: 7,
            tableRef: 101,
            tableId: "Clients",
            type: "record",
            title: "Clients",
            options: { private: "raw-options" },
            sortColRefs: [201],
            sort: [{ columnId: "Nom", direction: "asc" }],
            selectBy: { sourceSectionId: 12, sourceColumnRef: 202, targetColumnRef: 203 },
            selectByNormalized: {
              sourceWidgetId: 12,
              sourceColumnId: "Client",
              targetColumnId: "Client"
            }
          },
          {
            id: 12,
            pageId: 7,
            tableRef: 102,
            tableId: "Commandes",
            type: "grid",
            title: "Commandes",
            gridOptions: {
              verticalGridlines: true,
              horizontalGridlines: true,
              zebraStripes: false,
              rowNumbers: "normal"
            },
            gridOptionsNormalizationIncomplete: true
          }
        ]
      }
    ],
    metadataSnapshotIncomplete: true
  };
}

test("document snapshot keeps semantic UI state and removes private/raw Grist references", () => {
  const tableResponse = {
    tables: [
      {
        id: "Clients",
        columns: [
          { id: "Nom", fields: { type: "Text" } },
          { id: "Commandes", fields: { type: "RefList:Commandes" } }
        ]
      },
      {
        id: "Commandes",
        columns: [{ id: "Client", fields: { type: "Ref:Clients" } }]
      }
    ]
  };

  const context = new DocumentContextService().build(
    "doc-1",
    tableResponse,
    sampleUi()
  ) as any;

  assert.equal(context.summary.pageCount, 1);
  assert.equal(context.summary.widgetCount, 2);
  assert.equal(context.summary.uiIncomplete, true);
  assert.equal(context.ui.summary.incomplete, true);
  assert.equal(context.ui.metadataSnapshotIncomplete, true);

  assert.deepEqual(context.ui.pages[0].widgets[0].selectBy, {
    sourceWidgetId: 12,
    sourceColumnId: "Client",
    targetColumnId: "Client"
  });
  assert.deepEqual(context.ui.pages[0].widgets[0].sort, [
    { columnId: "Nom", direction: "asc" }
  ]);
  assert.equal(
    context.ui.pages[0].widgets[1].gridOptionsNormalizationIncomplete,
    true
  );

  const serializedUi = JSON.stringify(context.ui);
  for (const privateField of [
    "pageRecordId",
    "tableRef",
    "layoutSpec",
    "options",
    "sortColRefs",
    "sourceSectionId",
    "sourceColumnRef",
    "targetColumnRef"
  ]) {
    assert.equal(
      serializedUi.includes(`\"${privateField}\"`),
      false,
      `${privateField} should not leak through the compact document snapshot`
    );
  }
});

test("document snapshot reports complete UI explicitly when normalized metadata is complete", () => {
  const ui = sampleUi();
  delete ui.metadataSnapshotIncomplete;
  delete ui.pages[0]!.widgets[1]!.gridOptionsNormalizationIncomplete;

  const context = new DocumentContextService().build(
    "doc-1",
    { tables: [] },
    ui
  ) as any;

  assert.equal(context.summary.uiIncomplete, false);
  assert.equal(context.ui.summary.incomplete, false);
  assert.equal("metadataSnapshotIncomplete" in context.ui, false);
});
