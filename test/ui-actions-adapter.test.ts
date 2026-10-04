import assert from "node:assert/strict";
import test from "node:test";

import type { GristClient } from "../src/grist/client.js";
import { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";

function harness(
  retValues: unknown[] = [],
  pageIds: number[] = [7, 8],
  pageNames: Record<number, string> = {},
  hiddenPrimaryViewIds: number[] = []
) {
  const observed: unknown[][][] = [];
  const metadataQueries: unknown[] = [];
  const client = {
    applyUserActions: async (_documentId: string, actions: unknown[][]) => {
      observed.push(actions);
      return { actionNum: 1, retValues };
    },
    queryRecords: async (
      documentId: string,
      tableId: string,
      options: { limit?: number; hidden?: boolean } = {}
    ) => {
      metadataQueries.push({ documentId, tableId, options });
      if (tableId === "_grist_Pages") {
        return {
          records: pageIds.map((id) => ({ id, fields: { viewRef: id } }))
        };
      }
      if (tableId === "_grist_Views") {
        return {
          records: pageIds.map((id) => ({
            id,
            fields: { name: pageNames[id] ?? `Page ${id}` }
          }))
        };
      }
      if (tableId === "_grist_Tables") {
        return {
          records: hiddenPrimaryViewIds.map((primaryViewId, index) => ({
            id: index + 1,
            fields: {
              tableId: `GristHidden_${index + 1}`,
              primaryViewId
            }
          }))
        };
      }
      return { records: [] };
    }
  } as Pick<GristClient, "applyUserActions" | "queryRecords">;
  return {
    adapter: new GristUiActionsAdapter(client),
    observed,
    metadataQueries
  };
}

const expectedVisibilityQueries = [
  {
    documentId: "doc-1",
    tableId: "_grist_Pages",
    options: { limit: 5000, hidden: true }
  },
  {
    documentId: "doc-1",
    tableId: "_grist_Views",
    options: { limit: 5000, hidden: true }
  },
  {
    documentId: "doc-1",
    tableId: "_grist_Tables",
    options: { limit: 5000, hidden: true }
  }
];

test("createEmptyPage emits exactly one bounded AddView action", async () => {
  const { adapter, observed } = harness([{ id: 7, sections: [] }]);

  const result = await adapter.createEmptyPage("doc-1", "Personnes", "Vue générale");

  assert.deepEqual(result, { pageId: 7 });
  assert.deepEqual(observed, [
    [["AddView", "Personnes", "empty", "Vue générale"]]
  ]);
});

test("addPageWidget emits exactly one bounded CreateViewSection action", async () => {
  const { adapter, observed } = harness([
    { tableRef: 2, viewRef: 7, sectionRef: 11 }
  ]);

  const result = await adapter.addPageWidget(
    "doc-1",
    7,
    2,
    "record"
  );

  assert.deepEqual(result, { pageId: 7, tableRef: 2, widgetId: 11 });
  assert.deepEqual(observed, [
    [["CreateViewSection", 2, 7, "record", null, null]]
  ]);
});

test("renamePage emits only the bounded _grist_Views name update", async () => {
  const { adapter, observed } = harness();

  await adapter.renamePage("doc-1", 7, "Nouvelle page");

  assert.deepEqual(observed, [
    [["UpdateRecord", "_grist_Views", 7, { name: "Nouvelle page" }]]
  ]);
});

test("deletePage proves there is another visible page before bounded removal", async () => {
  const { adapter, observed, metadataQueries } = harness();

  await adapter.deletePage("doc-1", 7);

  assert.deepEqual(metadataQueries, expectedVisibilityQueries);
  assert.deepEqual(observed, [
    [["RemoveRecord", "_grist_Views", 7]]
  ]);
});

test("deletePage refuses to remove the last visible Grist page before writing", async () => {
  const { adapter, observed, metadataQueries } = harness([], [7]);

  await assert.rejects(
    () => adapter.deletePage("doc-1", 7),
    /last visible Grist page/
  );

  assert.deepEqual(metadataQueries, expectedVisibilityQueries);
  assert.deepEqual(observed, []);
});

test("deletePage does not count a special Grist page as a second visible page", async () => {
  const { adapter, observed } = harness(
    [],
    [7, 8],
    { 7: "Main", 8: "GristDocTour" }
  );

  await assert.rejects(
    () => adapter.deletePage("doc-1", 7),
    /last visible Grist page/
  );

  assert.deepEqual(observed, []);
});

test("deletePage does not count a hidden-table primary view as a second visible page", async () => {
  const { adapter, observed } = harness(
    [],
    [7, 8],
    { 7: "Main", 8: "Hidden table" },
    [8]
  );

  await assert.rejects(
    () => adapter.deletePage("doc-1", 7),
    /last visible Grist page/
  );

  assert.deepEqual(observed, []);
});

test("deletePageWidget emits only a bounded _grist_Views_section record removal", async () => {
  const { adapter, observed } = harness();

  await adapter.deletePageWidget("doc-1", 11);

  assert.deepEqual(observed, [
    [["RemoveRecord", "_grist_Views_section", 11]]
  ]);
});

test("updatePageWidget combines title, description and direct select-by in one bounded action", async () => {
  const { adapter, observed } = harness();

  await adapter.updatePageWidget("doc-1", 11, {
    title: "Fiche personne",
    description: "  Résumé affiché  ",
    selectBy: { sourceSectionId: 9 }
  });

  assert.deepEqual(observed, [
    [["UpdateRecord", "_grist_Views_section", 11, {
      title: "Fiche personne",
      description: "Résumé affiché",
      linkSrcSectionRef: 9,
      linkSrcColRef: 0,
      linkTargetColRef: 0
    }]]
  ]);
});

test("updatePageWidget sends section and visible-field changes in one bounded apply", async () => {
  const { adapter, observed } = harness();

  await adapter.updatePageWidget("doc-1", 11, {
    title: "People",
    visibleFields: {
      expected: [
        { columnId: "City", width: 180 },
        { columnId: "Name", width: 120 }
      ],
      removeFieldIds: [102],
      reposition: [{ fieldId: 101, parentPos: 2 }],
      resize: [{ fieldId: 101, width: 120 }],
      add: [{ columnRef: 13, parentPos: 1, width: 180 }]
    }
  });

  assert.equal(observed.length, 1);
  assert.deepEqual(observed[0], [
    ["UpdateRecord", "_grist_Views_section", 11, { title: "People" }],
    ["BulkRemoveRecord", "_grist_Views_section_field", [102]],
    ["BulkUpdateRecord", "_grist_Views_section_field", [101], {
      parentPos: [2]
    }],
    ["BulkUpdateRecord", "_grist_Views_section_field", [101], {
      width: [120]
    }],
    ["BulkAddRecord", "_grist_Views_section_field", [null], {
      parentId: [11],
      colRef: [13],
      parentPos: [1],
      width: [180]
    }]
  ]);
});

test("updatePageWidget accepts an already-satisfied visible-field plan as a no-op", async () => {
  const { adapter, observed } = harness();

  await adapter.updatePageWidget("doc-1", 11, {
    visibleFields: {
      expected: [
        { columnId: "Email" },
        { columnId: "Name", width: 120 }
      ],
      removeFieldIds: [],
      reposition: [],
      resize: [],
      add: []
    }
  });

  assert.deepEqual(observed, []);
});

test("updatePageWidget clears a description with an empty string", async () => {
  const { adapter, observed } = harness();

  await adapter.updatePageWidget("doc-1", 11, { description: "   " });

  assert.deepEqual(observed, [
    [["UpdateRecord", "_grist_Views_section", 11, { description: "" }]]
  ]);
});

test("updatePageWidget clears all three select-by references atomically", async () => {
  const { adapter, observed } = harness();

  await adapter.updatePageWidget("doc-1", 11, { selectBy: null });

  assert.deepEqual(observed, [
    [["UpdateRecord", "_grist_Views_section", 11, {
      linkSrcSectionRef: 0,
      linkSrcColRef: 0,
      linkTargetColRef: 0
    }]]
  ]);
});

test("adapter fails closed on inconsistent Grist return identifiers", async () => {
  const { adapter } = harness([
    { tableRef: 2, viewRef: 8, sectionRef: 11 }
  ]);

  await assert.rejects(
    () => adapter.addPageWidget("doc-1", 7, 2, "record"),
    /inconsistent identifiers/
  );
});
