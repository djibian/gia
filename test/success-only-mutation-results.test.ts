import assert from "node:assert/strict";
import test from "node:test";

import type { AccessPolicy } from "../src/grist/accessPolicy.js";
import type { GristClient } from "../src/grist/client.js";
import { GristService, PartialBatchError, SchemaWriteVerificationError } from "../src/grist/service.js";
import { errorResult } from "../src/mcp/results.js";

function service(overrides: Record<string, unknown> = {}) {
  const observed: Array<{ action: string; payload: unknown }> = [];
  let nextRecordId = 100;
  const client = {
    listTables: async () => ({ tables: ["People", "Places", "Again"].map((id, index) => ({ id, fields: { tableRef: index + 1 } })) }),
    listColumns: async () => ({ columns: ["Name", "Age", "Again"].map((id, index) => ({ id, fields: { colRef: index + 11 } })) }),
    updateTables: async (_documentId: string, tables: unknown) => {
      observed.push({ action: "updateTables", payload: tables });
      return { engineActionNum: 41, internal: "do-not-expose" };
    },
    updateColumns: async (_documentId: string, _tableId: string, columns: unknown) => {
      observed.push({ action: "updateColumns", payload: columns });
      return { engineActionNum: 42, internal: "do-not-expose" };
    },
    deleteColumn: async (_documentId: string, _tableId: string, columnId: string) => {
      observed.push({ action: "deleteColumn", payload: columnId });
      return { engineActionNum: 43, internal: "do-not-expose" };
    },
    updateRecords: async (_documentId: string, _tableId: string, records: unknown[]) => {
      observed.push({ action: "updateRecords", payload: records });
      return { engineActionNum: 44, internal: "do-not-expose" };
    },
    deleteRecords: async (_documentId: string, _tableId: string, recordIds: number[]) => {
      observed.push({ action: "deleteRecords", payload: recordIds });
      return { engineActionNum: 45, internal: "do-not-expose" };
    },
    createRecords: async (_documentId: string, _tableId: string, records: unknown[]) => {
      observed.push({ action: "createRecords", payload: records });
      return {
        records: records.map(() => ({ id: nextRecordId++ }))
      };
    },
    ...overrides
  } as unknown as GristClient;
  const accessPolicy = {
    assertDocumentAllowed: async (documentId: string) => documentId
  } as unknown as AccessPolicy;

  return {
    grist: new GristService(client, accessPolicy, {
      maxReadRecords: 1000,
      maxWriteRecords: 100,
      writeBatchRecords: 2,
      maxSchemaItems: 100
    }),
    observed
  };
}

test("success-only record and schema mutations return bounded semantic acknowledgements", async () => {
  const { grist, observed } = service();

  assert.deepEqual(
    await grist.updateTables("doc", [
      { id: "People", fields: { onDemand: true } },
      { id: "Places", fields: { onDemand: false } }
    ]),
    {
      targetTableIds: ["People", "Places"],
      updatedTables: [{ targetTableId: "People", tableId: "People" }, { targetTableId: "Places", tableId: "Places" }],
      updated: true
    }
  );

  assert.deepEqual(
    await grist.updateColumns("doc", "People", [
      { id: "Name", fields: { label: "Full name" } },
      { id: "Age", fields: { type: "Int" } }
    ]),
    {
      tableId: "People",
      targetColumnIds: ["Name", "Age"],
      updatedColumns: [{ targetColumnId: "Name", columnId: "Name" }, { targetColumnId: "Age", columnId: "Age" }],
      updated: true
    }
  );

  assert.deepEqual(
    await grist.deleteColumns("doc", "People", ["OldA", "OldB"]),
    {
      tableId: "People",
      columnIds: ["OldA", "OldB"],
      deleted: true
    }
  );

  assert.deepEqual(
    await grist.updateRecords("doc", "People", [
      { id: 1, fields: { Name: "A" } },
      { id: 2, fields: { Name: "B" } },
      { id: 3, fields: { Name: "C" } }
    ]),
    {
      tableId: "People",
      recordIds: [1, 2, 3],
      updated: true
    }
  );

  assert.deepEqual(
    await grist.deleteRecords("doc", "People", [4, 5, 6]),
    {
      tableId: "People",
      recordIds: [4, 5, 6],
      deleted: true
    }
  );

  assert.deepEqual(
    observed.filter((entry) => entry.action === "updateRecords").map((entry) => entry.payload),
    [
      [
        { id: 1, fields: { Name: "A" } },
        { id: 2, fields: { Name: "B" } }
      ],
      [{ id: 3, fields: { Name: "C" } }]
    ]
  );
  assert.deepEqual(
    observed.filter((entry) => entry.action === "deleteRecords").map((entry) => entry.payload),
    [[4, 5], [6]]
  );

  const serializedResults = JSON.stringify([
    await grist.updateTables("doc", [{ id: "Again", fields: {} }]),
    await grist.updateColumns("doc", "People", [{ id: "Again", fields: {} }])
  ]);
  assert.equal(serializedResults.includes("engineActionNum"), false);
  assert.equal(serializedResults.includes("do-not-expose"), false);
});

test("PATCH results correlate resulting native IDs by private identity, independent of order or requested names", async () => {
  let tableReads = 0;
  let columnReads = 0;
  const { grist } = service({
    listTables: async () => (++tableReads === 1
      ? { tables: [{ id: "People", fields: { tableRef: 1 } }, { id: "Places", fields: { tableRef: 2 } }] }
      : { tables: [{ id: "Native_Other", fields: { tableRef: 2 } }, { id: "Native_Actual2", fields: { tableRef: 1, secret: "do-not-expose" } }] }),
    listColumns: async () => (++columnReads === 1
      ? { columns: [{ id: "Name", fields: { colRef: 11 } }, { id: "Age", fields: { colRef: 12 } }] }
      : { columns: [{ id: "Age", fields: { colRef: 12 } }, { id: "Full_name2", fields: { colRef: 11, secret: "do-not-expose" } }] })
  });
  assert.deepEqual(await grist.updateTables("doc", [
    { id: "People", fields: { tableId: "Native Actual" } }, { id: "Places", fields: { tableId: "Native Other" } }
  ]), {
    targetTableIds: ["People", "Places"],
    updatedTables: [{ targetTableId: "People", tableId: "Native_Actual2" }, { targetTableId: "Places", tableId: "Native_Other" }],
    updated: true
  });
  assert.deepEqual(await grist.updateColumns("doc", "People", [
    { id: "Name", fields: { label: "Full name" } }, { id: "Age", fields: { type: "Int" } }
  ]), {
    tableId: "People", targetColumnIds: ["Name", "Age"],
    updatedColumns: [{ targetColumnId: "Name", columnId: "Full_name2" }, { targetColumnId: "Age", columnId: "Age" }],
    updated: true
  });
});

test("schema PATCH refuses missing, malformed and ambiguous identity metadata before mutation", async () => {
  for (const collection of ["tables", "columns"] as const) {
    const refField = collection === "tables" ? "tableRef" : "colRef";
    const valid = { id: "Target", fields: { [refField]: 1 } };
    for (const metadata of [
      {}, { [collection]: [null] }, { [collection]: [{ id: "Target", fields: { [refField]: 0 } }] },
      { [collection]: [{ id: "   ", fields: { [refField]: 1 } }] },
      { [collection]: [valid, { id: "Target", fields: { [refField]: 2 } }] },
      { [collection]: [valid, { id: "Other", fields: { [refField]: 1 } }] },
      { [collection]: [{ id: "Other", fields: { [refField]: 1 } }] }
    ]) {
      const { grist, observed } = service({ listTables: async () => metadata, listColumns: async () => metadata });
      await assert.rejects(() => collection === "tables"
        ? grist.updateTables("doc", [{ id: "Target", fields: {} }])
        : grist.updateColumns("doc", "People", [{ id: "Target", fields: {} }]), /metadata|unavailable/);
      assert.deepEqual(observed, []);
    }
  }
});

test("acknowledged schema PATCH retains applied no-retry knowledge when its identity re-read fails", async () => {
  for (const collection of ["tables", "columns"] as const) {
    const refField = collection === "tables" ? "tableRef" : "colRef";
    for (const after of [undefined, {}, { [collection]: [] }, { [collection]: [{ id: "   ", fields: { [refField]: 1 } }] }, { [collection]: [
      { id: "One", fields: { [refField]: 1 } }, { id: "Two", fields: { [refField]: 1 } }
    ] }]) {
      let reads = 0;
      const read = async () => {
        if (++reads === 1) return { [collection]: [{ id: "Target", fields: { [refField]: 1 } }] };
        if (after === undefined) throw new Error("secret upstream body");
        return after;
      };
      const { grist, observed } = service({ listTables: read, listColumns: read });
      await assert.rejects(() => collection === "tables"
        ? grist.updateTables("doc", [{ id: "Target", fields: {} }])
        : grist.updateColumns("doc", "People", [{ id: "Target", fields: {} }]), (error) => {
          assert.ok(error instanceof SchemaWriteVerificationError);
          const result = JSON.parse(errorResult(error).content[0]!.text);
          assert.equal(result.operation, collection === "tables" ? "update_tables" : "update_columns");
          assert.equal(result.effectState, "APPLIED");
          assert.equal(result.postconditionVerified, false);
          assert.equal(result.retryWholeOperation, false);
          assert.equal(JSON.stringify(result).includes("secret"), false);
          return true;
        });
      assert.equal(observed.length, 1);
      assert.equal(reads, 2);
    }
  }
});

test("creation keeps functional upstream record IDs", async () => {
  const { grist } = service();

  const result = await grist.createRecords("doc", "People", [
    { fields: { Name: "A" } },
    { fields: { Name: "B" } },
    { fields: { Name: "C" } }
  ]);

  assert.deepEqual(result, {
    batches: 2,
    results: [
      { records: [{ id: 100 }, { id: 101 }] },
      { records: [{ id: 102 }] }
    ]
  });
});

test("acknowledgement batching preserves partial-write recovery semantics", async () => {
  let calls = 0;
  const { grist } = service({
    updateRecords: async () => {
      calls += 1;
      if (calls === 2) throw new Error("upstream failure");
      return { engineActionNum: 99 };
    }
  });

  await assert.rejects(
    () =>
      grist.updateRecords("doc", "People", [
        { id: 1, fields: { Name: "A" } },
        { id: 2, fields: { Name: "B" } },
        { id: 3, fields: { Name: "C" } }
      ]),
    (error: unknown) => {
      assert.ok(error instanceof PartialBatchError);
      assert.equal(error.operation, "updateRecords");
      assert.equal(error.completedBatches, 1);
      assert.equal(error.completedItems, 2);
      assert.equal(error.failedBatch, 2);
      assert.match(error.message, /Do not retry the whole operation blindly/);
      return true;
    }
  );
});
