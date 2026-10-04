import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWidgetFilters,
  resolveWidgetFiltersUpdate
} from "../src/grist/widgetFilters.js";

const tables = {
  tables: [
    {
      id: "People",
      fields: { tableRef: 1 },
      columns: [
        { id: "Name", fields: { colRef: 11, type: "Text" } },
        { id: "Age", fields: { colRef: 12, type: "Numeric" } },
        { id: "City", fields: { colRef: 13, type: "Text" } }
      ]
    }
  ]
};

const widget = { id: 7, tableRef: 1 };

const nativeFilters = {
  records: [
    {
      id: 101,
      fields: {
        viewSectionRef: 7,
        colRef: 11,
        filter: "{\"excluded\":[\"Archive\"]}",
        pinned: false
      }
    },
    {
      id: 102,
      fields: {
        viewSectionRef: 7,
        colRef: 12,
        filter: "{\"min\":18,\"max\":65}",
        pinned: true
      }
    },
    {
      id: 201,
      fields: {
        viewSectionRef: 8,
        colRef: 13,
        filter: "{\"included\":[\"Other\"]}",
        pinned: true
      }
    }
  ]
};

test("normalizes widget filters by stable column ID", () => {
  assert.deepEqual(normalizeWidgetFilters(widget, tables, nativeFilters), {
    filters: [
      {
        columnId: "Age",
        mode: "range",
        min: 18,
        max: 65,
        pinned: true
      },
      {
        columnId: "Name",
        mode: "exclude",
        values: ["Archive"],
        pinned: false
      }
    ]
  });
});

test("plans targeted set/remove while preserving untargeted filters and pinning", () => {
  assert.deepEqual(
    resolveWidgetFiltersUpdate(widget, tables, nativeFilters, [
      {
        columnId: "City",
        mode: "include",
        values: ["Nantes"],
        pinned: true
      },
      { columnId: "Name", mode: "remove" }
    ]),
    {
      expected: [
        {
          columnId: "Age",
          mode: "range",
          min: 18,
          max: 65,
          pinned: true
        },
        {
          columnId: "City",
          mode: "include",
          values: ["Nantes"],
          pinned: true
        }
      ],
      removeFilterIds: [101],
      update: [],
      add: [
        {
          columnRef: 13,
          filterJson: "{\"included\":[\"Nantes\"]}",
          pinned: true
        }
      ]
    }
  );
});

test("updates filter content and pinning without replacing its native record", () => {
  const plan = resolveWidgetFiltersUpdate(widget, tables, nativeFilters, [
    {
      columnId: "Name",
      mode: "include",
      values: ["Alice", "Bob"],
      pinned: true
    }
  ]);
  assert.deepEqual(plan.removeFilterIds, []);
  assert.deepEqual(plan.add, []);
  assert.deepEqual(plan.update, [
    {
      filterId: 101,
      filterJson: "{\"included\":[\"Alice\",\"Bob\"]}",
      pinned: true
    }
  ]);
});

test("fails closed on unsupported native state, duplicates and unknown columns", () => {
  assert.deepEqual(
    normalizeWidgetFilters(widget, tables, {
      records: [
        {
          id: 101,
          fields: {
            viewSectionRef: 7,
            colRef: 11,
            filter: "{\"min\":{\"relativeDate\":\"today\"}}",
            pinned: true
          }
        }
      ]
    }),
    { filtersNormalizationIncomplete: true }
  );

  assert.throws(
    () =>
      resolveWidgetFiltersUpdate(widget, tables, nativeFilters, [
        { columnId: "Name", mode: "exclude", values: ["x", "x"] }
      ]),
    /duplicates/
  );
  assert.throws(
    () =>
      resolveWidgetFiltersUpdate(widget, tables, nativeFilters, [
        { columnId: "Missing", mode: "exclude", values: [] }
      ]),
    /does not exist/
  );
});

test("rejects a targeted update that would exceed the bounded final filter count", () => {
  const columns = Array.from({ length: 201 }, (_, index) => ({
    id: `C${index + 1}`,
    fields: { colRef: index + 1, type: "Text" }
  }));
  const largeTables = {
    tables: [{ id: "Large", fields: { tableRef: 9 }, columns }]
  };
  const largeWidget = { id: 99, tableRef: 9 };
  const filters = {
    records: Array.from({ length: 200 }, (_, index) => ({
      id: index + 1,
      fields: {
        viewSectionRef: 99,
        colRef: index + 1,
        filter: "{\"excluded\":[]}",
        pinned: false
      }
    }))
  };

  assert.throws(
    () =>
      resolveWidgetFiltersUpdate(largeWidget, largeTables, filters, [
        { columnId: "C201", mode: "include", values: ["x"] }
      ]),
    /at most 200 columns after the update/
  );
});

test("supports idempotent removal and preserves existing pinning when omitted", () => {
  const plan = resolveWidgetFiltersUpdate(widget, tables, nativeFilters, [
    { columnId: "City", mode: "remove" },
    { columnId: "Name", mode: "exclude", values: ["Archive"] }
  ]);
  assert.deepEqual(plan.removeFilterIds, []);
  assert.deepEqual(plan.update, []);
  assert.deepEqual(
    plan.expected.find((filter) => filter.columnId === "Name"),
    {
      columnId: "Name",
      mode: "exclude",
      values: ["Archive"],
      pinned: false
    }
  );
});
