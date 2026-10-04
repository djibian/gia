import assert from "node:assert/strict";
import test from "node:test";

import { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";

test("page order adapter emits one bounded native page-position update", async () => {
  const calls: unknown[] = [];
  const adapter = new GristUiActionsAdapter({
    applyUserActions: async (documentId: string, actions: unknown[]) => {
      calls.push({ documentId, actions });
      return { retValues: [null] };
    }
  } as any);

  await adapter.reorderPages("doc-1", [
    { pageRecordId: 104, pagePos: 1 },
    { pageRecordId: 101, pagePos: 4 }
  ]);

  assert.deepEqual(calls, [
    {
      documentId: "doc-1",
      actions: [
        [
          "BulkUpdateRecord",
          "_grist_Pages",
          [104, 101],
          { pagePos: [1, 4] }
        ]
      ]
    }
  ]);
});

test("page order adapter accepts a verified no-op and rejects malformed trusted plans", async () => {
  let calls = 0;
  const adapter = new GristUiActionsAdapter({
    applyUserActions: async () => {
      calls += 1;
      return {};
    }
  } as any);

  await adapter.reorderPages("doc-1", []);
  assert.equal(calls, 0);

  await assert.rejects(
    () =>
      adapter.reorderPages("doc-1", [
        { pageRecordId: 1, pagePos: 1 },
        { pageRecordId: 1, pagePos: 2 }
      ]),
    /more than once/
  );
  await assert.rejects(
    () =>
      adapter.reorderPages("doc-1", [
        { pageRecordId: 1, pagePos: Number.NaN }
      ]),
    /finite/
  );
});
