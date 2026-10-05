import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePageOrderSnapshot,
  resolvePageOrderUpdate,
  samePageOrderSnapshot
} from "../src/grist/pageOrder.js";

function metadata() {
  return {
    pages: {
      records: [
        { id: 101, fields: { viewRef: 1, indentation: 0, pagePos: 1 } },
        { id: 102, fields: { viewRef: 2, indentation: 1, pagePos: 2 } },
        { id: 103, fields: { viewRef: 3, indentation: 1, pagePos: 3 } },
        { id: 104, fields: { viewRef: 4, indentation: 0, pagePos: 4 } }
      ]
    },
    views: {
      records: [
        { id: 1, fields: { name: "A" } },
        { id: 2, fields: { name: "B" } },
        { id: 3, fields: { name: "C" } },
        { id: 4, fields: { name: "D" } }
      ]
    },
    tables: { records: [] }
  };
}

test("page order refuses duplicate view and table row identities before visibility can be overwritten", () => {
  const source = metadata();
  assert.throws(() => normalizePageOrderSnapshot(source.pages, { records: [...source.views.records, { id: 1, fields: { name: "GristDocTour" } }] }, source.tables), /malformed view metadata/);
  assert.throws(() => normalizePageOrderSnapshot(source.pages, source.views, { records: [{ id: 1, fields: {} }, { id: 1, fields: {} }] }), /malformed table metadata/);
});

test("reorders hierarchy-preserving page subtrees using existing native position slots", () => {
  const source = metadata();
  const current = normalizePageOrderSnapshot(
    source.pages,
    source.views,
    source.tables
  );
  const plan = resolvePageOrderUpdate(current, [4, 1, 2, 3]);

  assert.deepEqual(plan.updates, [
    { pageRecordId: 104, pagePos: 1 },
    { pageRecordId: 101, pagePos: 2 },
    { pageRecordId: 102, pagePos: 3 },
    { pageRecordId: 103, pagePos: 4 }
  ]);
  assert.deepEqual(plan.expected.visiblePageIds, [4, 1, 2, 3]);
  assert.deepEqual(
    plan.expected.pages.map((page) => [page.pageId, page.parentPageId]),
    [
      [4, null],
      [1, null],
      [2, 1],
      [3, 1]
    ]
  );
  assert.equal(samePageOrderSnapshot(plan.expected, plan.expected), true);
});

test("rejects a flat permutation that would silently reparent a nested page", () => {
  const source = metadata();
  const current = normalizePageOrderSnapshot(
    source.pages,
    source.views,
    source.tables
  );

  assert.throws(
    () => resolvePageOrderUpdate(current, [1, 4, 2, 3]),
    /change the existing page hierarchy/i
  );
});

test("preserves untargeted censored positions and rejects hierarchy changes across them", () => {
  const pages = {
    records: [
      { id: 101, fields: { viewRef: 1, indentation: 0, pagePos: 1 } },
      { id: 102, fields: { viewRef: 2, indentation: 1, pagePos: 2 } },
      { id: 105, fields: { viewRef: 5, indentation: 0, pagePos: 3 } },
      { id: 104, fields: { viewRef: 4, indentation: 0, pagePos: 4 } }
    ]
  };
  const views = {
    records: [
      { id: 1, fields: { name: "A" } },
      { id: 2, fields: { name: "B" } },
      { id: 4, fields: { name: "D" } },
      { id: 5, fields: { name: "" } }
    ]
  };
  const current = normalizePageOrderSnapshot(pages, views, { records: [] });
  assert.deepEqual(current.visiblePageIds, [1, 2, 4]);

  assert.throws(
    () => resolvePageOrderUpdate(current, [4, 1, 2]),
    /change the existing page hierarchy/i
  );
});

test("special Grist pages are not targetable and keep their position", () => {
  const pages = {
    records: [
      { id: 101, fields: { viewRef: 1, indentation: 0, pagePos: 1 } },
      { id: 109, fields: { viewRef: 9, indentation: 0, pagePos: 2 } },
      { id: 104, fields: { viewRef: 4, indentation: 0, pagePos: 3 } }
    ]
  };
  const views = {
    records: [
      { id: 1, fields: { name: "A" } },
      { id: 4, fields: { name: "D" } },
      { id: 9, fields: { name: "GristDocTour" } }
    ]
  };
  const current = normalizePageOrderSnapshot(pages, views, { records: [] });
  const plan = resolvePageOrderUpdate(current, [4, 1]);

  assert.deepEqual(current.visiblePageIds, [1, 4]);
  assert.equal(plan.expected.pages.find((page) => page.pageId === 9)?.pagePos, 2);
  assert.deepEqual(plan.expected.visiblePageIds, [4, 1]);
  const fractional = { ...plan.expected, pages: plan.expected.pages.map((page) => ({ ...page, pagePos: page.isSpecial ? page.pagePos : page.pagePos - 0.5 })) };
  assert.equal(samePageOrderSnapshot(fractional, plan.expected), true);
  const specialMoved = { ...fractional, pages: fractional.pages.map((page) => ({ ...page, pagePos: page.isSpecial ? page.pagePos + 0.1 : page.pagePos })) };
  assert.equal(samePageOrderSnapshot(specialMoved, plan.expected), false);
  const changedParent = { ...fractional, pages: fractional.pages.map((page, index) => ({ ...page, parentPageId: index === 0 ? 999 : page.parentPageId })) };
  assert.equal(samePageOrderSnapshot(changedParent, plan.expected), false);
  const changedRelativeOrder = { ...fractional, pages: [fractional.pages[0]!, fractional.pages[2]!, fractional.pages[1]!] };
  assert.equal(samePageOrderSnapshot(changedRelativeOrder, plan.expected), false);
});

test("requires the exact current visible-page set and rejects ambiguous metadata", () => {
  const source = metadata();
  const current = normalizePageOrderSnapshot(
    source.pages,
    source.views,
    source.tables
  );
  assert.throws(
    () => resolvePageOrderUpdate(current, [1, 2, 3]),
    /every currently visible/
  );
  assert.throws(
    () => resolvePageOrderUpdate(current, [1, 2, 3, 3]),
    /duplicate page ID/
  );

  const duplicatePositions = metadata();
  duplicatePositions.pages.records[1]!.fields.pagePos = 1;
  assert.throws(
    () =>
      normalizePageOrderSnapshot(
        duplicatePositions.pages,
        duplicatePositions.views,
        duplicatePositions.tables
      ),
    /duplicate page positions/
  );
  for (const value of [Infinity, NaN]) {
    const invalid = metadata();
    invalid.pages.records[1]!.fields.pagePos = value;
    assert.throws(() => normalizePageOrderSnapshot(invalid.pages, invalid.views, invalid.tables), /malformed page navigation/);
  }

  const invalidIndentation = metadata();
  invalidIndentation.pages.records[1]!.fields.indentation = 2;
  assert.throws(
    () =>
      normalizePageOrderSnapshot(
        invalidIndentation.pages,
        invalidIndentation.views,
        invalidIndentation.tables
      ),
    /unsupported indentation shape/
  );
});
