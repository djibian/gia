import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWidgetFields,
  resolveWidgetFieldsUpdate
} from "../src/grist/widgetFields.js";

const tables = {
  tables: [
    {
      id: "People",
      fields: { tableRef: 1 },
      columns: [
        { id: "Name", fields: { colRef: 11, type: "Text" } },
        { id: "Email", fields: { colRef: 12, type: "Text" } },
        { id: "City", fields: { colRef: 13, type: "Text" } }
      ]
    }
  ]
};

const widget = { id: 7, tableRef: 1 };

const sectionFields = {
  records: [
    {
      id: 101,
      fields: {
        parentId: 7,
        parentPos: 2,
        colRef: 11,
        width: 120,
        widgetOptions: "{\"keep\":true}"
      }
    },
    {
      id: 102,
      fields: {
        parentId: 7,
        parentPos: 1,
        colRef: 12,
        width: 0,
        rules: "keep"
      }
    },
    {
      id: 201,
      fields: { parentId: 8, parentPos: 1, colRef: 13, width: 90 }
    }
  ]
};

test("normalizes widget fields by stable column ID and native order", () => {
  assert.deepEqual(normalizeWidgetFields(widget, tables, sectionFields), {
    visibleFields: [
      { columnId: "Email" },
      { columnId: "Name", width: 120 }
    ]
  });
});

test("plans a bounded replacement while preserving retained field metadata", () => {
  assert.deepEqual(
    resolveWidgetFieldsUpdate(widget, tables, sectionFields, [
      { columnId: "City", width: 180 },
      { columnId: "Name" }
    ]),
    {
      expected: [
        { columnId: "City", width: 180 },
        { columnId: "Name", width: 120 }
      ],
      removeFieldIds: [102],
      reposition: [],
      resize: [],
      add: [{ columnRef: 13, parentPos: 1, width: 180 }]
    }
  );
});

test("plans retained-field reorder and explicit resize without recreating records", () => {
  const plan = resolveWidgetFieldsUpdate(widget, tables, sectionFields, [
    { columnId: "Name", width: 150 },
    { columnId: "Email" }
  ]);

  assert.deepEqual(plan.removeFieldIds, []);
  assert.deepEqual(plan.reposition, [
    { fieldId: 101, parentPos: 1 },
    { fieldId: 102, parentPos: 2 }
  ]);
  assert.deepEqual(plan.resize, [{ fieldId: 101, width: 150 }]);
  assert.deepEqual(plan.add, []);
  assert.deepEqual(plan.expected, [
    { columnId: "Name", width: 150 },
    { columnId: "Email" }
  ]);
});

test("fails closed for duplicate, unknown or incomplete field metadata", () => {
  assert.throws(
    () =>
      resolveWidgetFieldsUpdate(widget, tables, sectionFields, [
        { columnId: "Name" },
        { columnId: "Name" }
      ]),
    /duplicated/
  );
  assert.throws(
    () =>
      resolveWidgetFieldsUpdate(widget, tables, sectionFields, [
        { columnId: "Missing" }
      ]),
    /does not exist/
  );

  const incomplete = {
    records: [
      { id: 101, fields: { parentId: 7, parentPos: 1, colRef: 999, width: 0 } }
    ]
  };
  assert.deepEqual(normalizeWidgetFields(widget, tables, incomplete), {
    visibleFieldsNormalizationIncomplete: true
  });
  assert.throws(
    () =>
      resolveWidgetFieldsUpdate(widget, tables, incomplete, [
        { columnId: "Name" }
      ]),
    /incomplete or unsupported/
  );
});

test("bounds widths and visible-field count", () => {
  assert.throws(
    () =>
      resolveWidgetFieldsUpdate(widget, tables, sectionFields, [
        { columnId: "Name", width: 2001 }
      ]),
    /between 1 and 2000/
  );
  assert.throws(
    () => resolveWidgetFieldsUpdate(widget, tables, sectionFields, []),
    /between 1 and 200/
  );
});
