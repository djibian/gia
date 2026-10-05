import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCardLayout,
  resolveCardLayoutUpdate
} from "../src/grist/cardLayout.js";

const tables = {
  tables: [
    {
      id: "People",
      fields: { tableRef: 1 },
      columns: [
        { id: "Name", fields: { colRef: 11, type: "Text" } },
        { id: "Email", fields: { colRef: 12, type: "Text" } }
      ]
    }
  ]
};

const widget = { id: 7, tableRef: 1 };

const sectionFields = {
  records: [
    { id: 101, fields: { parentId: 7, parentPos: 2, colRef: 11, width: 120 } },
    { id: 102, fields: { parentId: 7, parentPos: 1, colRef: 12, width: 0 } }
  ]
};

test("normalizes private card-layout field refs to stable column IDs", () => {
  assert.deepEqual(
    normalizeCardLayout(
      widget,
      {
        children: [
          { leaf: 101, size: 40 },
          { leaf: 102 }
        ]
      },
      tables,
      sectionFields
    ),
    {
      cardLayout: {
        root: {
          kind: "group",
          children: [
            { kind: "field", columnId: "Name", size: 40 },
            { kind: "field", columnId: "Email" }
          ]
        },
        unplacedColumnIds: []
      }
    }
  );
});

test("reports implicit native layout as stable unplaced visible fields", () => {
  assert.deepEqual(
    normalizeCardLayout(widget, undefined, tables, sectionFields),
    {
      cardLayout: {
        unplacedColumnIds: ["Email", "Name"]
      }
    }
  );
});

test("prunes stale native field refs after hide and accepts a re-shown field with a new ref", () => {
  const hiddenFields = {
    records: [
      { id: 101, fields: { parentId: 7, parentPos: 1, colRef: 11, width: 120 } }
    ]
  };
  assert.deepEqual(
    normalizeCardLayout(
      widget,
      { children: [{ leaf: 101 }, { leaf: 102 }] },
      tables,
      hiddenFields
    ),
    {
      cardLayout: {
        root: { kind: "field", columnId: "Name" },
        unplacedColumnIds: []
      }
    }
  );

  const reshownFields = {
    records: [
      { id: 101, fields: { parentId: 7, parentPos: 1, colRef: 11, width: 120 } },
      { id: 202, fields: { parentId: 7, parentPos: 2, colRef: 12, width: 0 } }
    ]
  };
  assert.deepEqual(
    normalizeCardLayout(
      widget,
      { children: [{ leaf: 101 }, { leaf: 102 }] },
      tables,
      reshownFields
    ),
    {
      cardLayout: {
        root: { kind: "field", columnId: "Name" },
        unplacedColumnIds: ["Email"]
      }
    }
  );
});

test("resolves a complete stable-column layout to private field refs", () => {
  assert.deepEqual(
    resolveCardLayoutUpdate(widget, tables, sectionFields, {
      root: {
        kind: "group",
        children: [
          { kind: "field", columnId: "Email", size: 25 },
          { kind: "field", columnId: "Name" }
        ]
      }
    }),
    {
      layoutSpecJson: JSON.stringify({
        children: [
          { leaf: 102, size: 25 },
          { leaf: 101 }
        ]
      }),
      expectedLayout: {
        root: {
          kind: "group",
          children: [
            { kind: "field", columnId: "Email", size: 25 },
            { kind: "field", columnId: "Name" }
          ]
        },
        unplacedColumnIds: []
      }
    }
  );
});

test("fails closed for missing, duplicate, unknown or malformed layout state", () => {
  assert.throws(
    () =>
      resolveCardLayoutUpdate(widget, tables, sectionFields, {
        root: { kind: "field", columnId: "Name" }
      }),
    /missing column "Email"/
  );

  assert.throws(
    () =>
      resolveCardLayoutUpdate(widget, tables, sectionFields, {
        root: {
          kind: "group",
          children: [
            { kind: "field", columnId: "Name" },
            { kind: "field", columnId: "Name" }
          ]
        }
      }),
    /appears more than once/
  );

  assert.throws(
    () =>
      resolveCardLayoutUpdate(widget, tables, sectionFields, {
        root: {
          kind: "group",
          children: [
            { kind: "field", columnId: "Missing" },
            { kind: "field", columnId: "Email" }
          ]
        }
      }),
    /not a currently visible/
  );

  assert.deepEqual(
    normalizeCardLayout(widget, { children: [{ leaf: 999 }] }, tables, sectionFields),
    {
      cardLayout: {
        unplacedColumnIds: ["Email", "Name"]
      }
    }
  );
  assert.deepEqual(
    normalizeCardLayout(widget, { children: [{ leaf: "bad" }] }, tables, sectionFields),
    { cardLayoutNormalizationIncomplete: true }
  );
});

test("requires finite positive native flex sizes", () => {
  assert.throws(
    () =>
      resolveCardLayoutUpdate(widget, tables, sectionFields, {
        root: {
          kind: "group",
          children: [
            { kind: "field", columnId: "Email", size: 0 },
            { kind: "field", columnId: "Name" }
          ]
        }
      }),
    /finite positive/
  );
});
