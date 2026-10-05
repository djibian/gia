import assert from "node:assert/strict";
import test from "node:test";

import type { AccessPolicy } from "../src/grist/accessPolicy.js";
import type { GristClient } from "../src/grist/client.js";
import { GristService } from "../src/grist/service.js";

function harness() {
  const observed: unknown[] = [];
  const client = {
    applyUserActions: async (documentId: string, actions: unknown) => {
      observed.push({ documentId, actions });
      return {
        actionNum: 481,
        retValues: ["Name_2"],
        stored: ["must-not-be-forwarded"]
      };
    }
  } as unknown as GristClient;
  const accessPolicy = {
    assertDocumentAllowed: async (documentId: string) => documentId
  } as unknown as AccessPolicy;

  return {
    grist: new GristService(client, accessPolicy, {
      maxReadRecords: 1000,
      maxWriteRecords: 100,
      writeBatchRecords: 20,
      maxSchemaItems: 100
    }),
    observed
  };
}

test("rename_column returns the native resulting stable identifier", async () => {
  const { grist, observed } = harness();

  assert.deepEqual(
    await grist.renameColumn("doc-1", "People", "FullName", "Name"),
    {
      tableId: "People",
      oldColumnId: "FullName",
      newColumnId: "Name_2",
      renamed: true
    }
  );
  assert.deepEqual(observed, [
    {
      documentId: "doc-1",
      actions: [["RenameColumn", "People", "FullName", "Name"]]
    }
  ]);
});

test("rename_column fails with no-retry verification semantics when native result identity is unusable", async () => {
  const observed: unknown[] = [];
  const client = {
    applyUserActions: async (documentId: string, actions: unknown) => {
      observed.push({ documentId, actions });
      return { actionNum: 1, retValues: [null] };
    }
  } as unknown as GristClient;
  const accessPolicy = {
    assertDocumentAllowed: async (documentId: string) => documentId
  } as unknown as AccessPolicy;
  const grist = new GristService(client, accessPolicy, {
    maxReadRecords: 1000,
    maxWriteRecords: 100,
    writeBatchRecords: 20,
    maxSchemaItems: 100
  });

  await assert.rejects(
    () => grist.renameColumn("doc-1", "People", "FullName", "Name"),
    /may already have succeeded.*do not retry/i
  );
  assert.equal(observed.length, 1);
});

test("delete_table returns a semantic acknowledgement without Grist action internals", async () => {
  const { grist, observed } = harness();

  const result = await grist.deleteTable("doc-1", "OldTable");
  assert.deepEqual(result, { tableId: "OldTable", deleted: true });
  assert.equal(JSON.stringify(result).includes("actionNum"), false);
  assert.equal(JSON.stringify(result).includes("retValues"), false);
  assert.equal(JSON.stringify(result).includes("stored"), false);
  assert.deepEqual(observed, [
    {
      documentId: "doc-1",
      actions: [["RemoveTable", "OldTable"]]
    }
  ]);
});
