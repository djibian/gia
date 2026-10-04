import assert from "node:assert/strict";
import test from "node:test";

import { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";

test("card layout uses one bridge-owned section layoutSpec update", async () => {
  const writes: unknown[] = [];
  const adapter = new GristUiActionsAdapter({
    applyUserActions: async (documentId: string, actions: unknown[]) => {
      writes.push({ documentId, actions });
      return { retValues: [] };
    }
  } as any);

  const layout = JSON.stringify({
    children: [{ leaf: 101 }, { leaf: 102, size: 30 }]
  });
  await adapter.updatePageWidget("doc-1", 21, { cardLayoutJson: layout });

  assert.deepEqual(writes, [
    {
      documentId: "doc-1",
      actions: [
        [
          "UpdateRecord",
          "_grist_Views_section",
          21,
          { layoutSpec: layout }
        ]
      ]
    }
  ]);
});

test("card layout adapter rejects malformed trusted payload before mutation", async () => {
  const writes: unknown[] = [];
  const adapter = new GristUiActionsAdapter({
    applyUserActions: async (_documentId: string, actions: unknown[]) => {
      writes.push(actions);
      return { retValues: [] };
    }
  } as any);

  await assert.rejects(
    () => adapter.updatePageWidget("doc-1", 21, { cardLayoutJson: "[]" }),
    /must encode a JSON object/
  );
  assert.deepEqual(writes, []);
});
