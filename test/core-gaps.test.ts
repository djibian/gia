import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCalendarConfig,
  resolveCalendarConfigUpdate
} from "../src/grist/calendarConfig.js";
import {
  resolveReferenceDisplayMutation,
  verifyReferenceDisplayMutation
} from "../src/grist/referenceDisplay.js";
import { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";

const eventTables = {
  tables: [
    {
      id: "Events",
      fields: { tableRef: 1 },
      columns: [
        { id: "Title", fields: { colRef: 11, type: "Text" } },
        { id: "Start", fields: { colRef: 12, type: "DateTime:UTC" } },
        { id: "End", fields: { colRef: 13, type: "Date" } },
        { id: "AllDay", fields: { colRef: 14, type: "Bool" } },
        { id: "Kind", fields: { colRef: 15, type: "Choice" } }
      ]
    }
  ]
};

test("calendarConfig resolves stable IDs and preserves unrelated options", () => {
  const widget = {
    id: 7,
    type: "calendar",
    tableId: "Events",
    tableRef: 1,
    options: { unrelated: { keep: true } }
  };
  const resolved = resolveCalendarConfigUpdate(widget, eventTables, {
    titleColumnId: "Title",
    startDateColumnId: "Start",
    endDateColumnId: "End",
    allDayColumnId: "AllDay",
    typeColumnId: "Kind"
  });

  assert.deepEqual(resolved.options.unrelated, { keep: true });
  const customView = JSON.parse(String(resolved.options.customView));
  assert.deepEqual(customView.columnsMapping, {
    startDate: 12,
    title: 11,
    endDate: 13,
    isAllDay: 14,
    type: 15
  });

  const normalized = normalizeCalendarConfig(
    { ...widget, options: resolved.options },
    eventTables
  );
  assert.deepEqual(normalized, {
    calendarConfig: {
      startDateColumnId: "Start",
      titleColumnId: "Title",
      endDateColumnId: "End",
      allDayColumnId: "AllDay",
      typeColumnId: "Kind"
    }
  });
});

test("calendarConfig rejects unusable start-date mappings", () => {
  assert.throws(
    () =>
      resolveCalendarConfigUpdate(
        {
          id: 7,
          type: "calendar",
          tableId: "Events",
          tableRef: 1,
          options: {}
        },
        eventTables,
        { titleColumnId: "Title", startDateColumnId: "Title" }
      ),
    /expected Date or DateTime/
  );
});

test("visibleColumnId resolves to private refs and native display formula atomically", () => {
  const before = {
    tables: [
      {
        id: "Customers",
        fields: { tableRef: 1 },
        columns: [
          { id: "Name", fields: { colRef: 12, type: "Text" } }
        ]
      },
      {
        id: "Orders",
        fields: { tableRef: 2 },
        columns: [
          { id: "Customer", fields: { colRef: 21, type: "Ref:Customers" } }
        ]
      }
    ]
  };

  const plan = resolveReferenceDisplayMutation(before, "Orders", [
    { id: "Customer", fields: { visibleColumnId: "Name" } }
  ]);
  assert.deepEqual(plan.actions, [
    [
      "UpdateRecord",
      "_grist_Tables_column",
      21,
      { visibleCol: 12 }
    ],
    ["SetDisplayFormula", "Orders", null, 21, "$Customer.Name"]
  ]);

  const after = {
    tables: [
      {
        id: "Customers",
        fields: { tableRef: 1 },
        columns: [
          { id: "Name", fields: { colRef: 12, type: "Text" } }
        ]
      },
      {
        id: "Orders",
        fields: { tableRef: 2 },
        columns: [
          {
            id: "Customer",
            fields: {
              colRef: 21,
              type: "Ref:Customers",
              visibleCol: 12,
              displayCol: 22
            }
          },
          {
            id: "gristHelper_Display",
            fields: {
              colRef: 22,
              type: "Text",
              isFormula: true,
              formula: "$Customer.Name"
            }
          }
        ]
      }
    ]
  };
  const hiddenOrderColumns = {
    columns: [
      {
        id: "Customer",
        fields: {
          colRef: 21,
          type: "Ref:Customers",
          visibleCol: 12,
          displayCol: 22
        }
      },
      {
        id: "gristHelper_Display",
        fields: {
          colRef: 22,
          type: "Text",
          isFormula: true,
          formula: "$Customer.Name"
        }
      }
    ]
  };
  assert.doesNotThrow(() =>
    verifyReferenceDisplayMutation(
      after,
      hiddenOrderColumns,
      "Orders",
      plan.plans
    )
  );
});

test("calendar creation chooses legacy and native storage representations without changing public type", async () => {
  for (const [widgets, expectedType] of [
    [[{ widgetId: "@gristlabs/widget-calendar" }], "custom.calendar"],
    [[], "calendar"]
  ] as const) {
    const observed: unknown[][][] = [];
    const adapter = new GristUiActionsAdapter({
      listWidgets: async () => widgets,
      applyUserActions: async (_documentId: string, actions: unknown[][]) => {
        observed.push(actions);
        return {
          actionNum: 1,
          retValues: [{ tableRef: 2, viewRef: 7, sectionRef: 11 }]
        };
      }
    });

    const result = await adapter.addPageWidget("doc", 7, 2, "calendar");
    assert.deepEqual(result, { pageId: 7, tableRef: 2, widgetId: 11 });
    assert.equal((observed[0]![0] as unknown[])[3], expectedType);
  }
});
