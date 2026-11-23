import assert from "node:assert/strict";
import test from "node:test";
import type { AuditLogger } from "../src/audit/auditLogger.js";
import type { AuthorizationService } from "../src/auth/authorizationService.js";
import type { Principal } from "../src/auth/principal.js";
import { AuthorizedGristService } from "../src/grist/authorizedService.js";
import { UncertainWriteError, type GristService } from "../src/grist/service.js";
import type { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";

type Row = { id: number; fields: { Name: string; Qty: number } };
type RowSeed = { fields: { Name: string; Qty: number } };

function harness(options: {
  initial?: Row[];
  ownerDenied?: boolean;
  grantDenied?: boolean;
  partialWrite?: boolean;
  maxReadRecords?: number;
} = {}) {
  let rows = (options.initial ?? []).map(row => ({
    id: row.id, fields: { ...row.fields }
  }));
  let reads = 0;
  let writes = 0;
  let ownerProofs = 0;
  const columns = { columns: [
    { id: "Name", fields: { type: "Text", isFormula: false } },
    { id: "Qty", fields: { type: "Int", isFormula: false } }
  ] };
  const service = {
    maxReadRecords: options.maxReadRecords ?? 100,
    assertDocumentOwner: async () => {
      ownerProofs++;
      if (options.ownerDenied) throw new Error("Owner required");
    },
    listColumns: async () => columns,
    queryRecords: async (_id: string, _table: string, query: {
      filter: { Name: string[] }; limit: number
    }) => {
      reads++;
      assert.equal(query.limit, 5);
      return { records: rows.filter(row =>
        query.filter.Name.includes(row.fields.Name)).map(row => ({
        id: row.id, fields: { ...row.fields }
      })) };
    },
    createRecords: async (_id: string, _table: string, records: RowSeed[]) => {
      writes++;
      for (const [index, item] of records.entries()) {
        rows.push({ id: Math.max(0, ...rows.map(row => row.id)) + 1,
          fields: { ...item.fields } });
        if (options.partialWrite && index === 0) {
          throw new Error("Native response lost after partial effect");
        }
      }
      return { created: records.length };
    }
  } as unknown as GristService;
  const auth = {
    assertDocumentAllowed: async (_principal: Principal, id: string) => {
      if (options.grantDenied) throw new Error("Gia grant denied");
      return id;
    }
  } as unknown as AuthorizationService;
  const principal = {
    id: "synthetic", transport: "mcp",
    grants: [{ documentIds: ["doc"], workspaceIds: [],
      capabilities: ["doc:write"] }]
  } as Principal;
  const audit = {
    nextRequestId: () => "synthetic-request",
    record: () => undefined
  } as unknown as AuditLogger;
  return {
    service: new AuthorizedGristService(service, auth, audit, principal,
      {} as GristUiActionsAdapter),
    state: () => ({ rows, reads, writes, ownerProofs })
  };
}

const inputs: RowSeed[] = [
  { fields: { Name: "A", Qty: 1 } },
  { fields: { Name: "B", Qty: 2 } }
];

test("Owner-checked batch creation reconciles stable row IDs on identical replay", async () => {
  const h = harness();
  const created = await h.service.ensureRecords("doc", "Stages", "Name", inputs) as {
    recordIds: number[]; changed: boolean; createdIndices: number[];
    persistedRecordsVerified: boolean
  };
  assert.equal(created.changed, true);
  assert.equal(created.persistedRecordsVerified, true);
  assert.deepEqual(created.recordIds, [1, 2]);
  assert.deepEqual(created.createdIndices, [0, 1]);
  const repeated = await h.service.ensureRecords("doc", "Stages", "Name", inputs) as {
    recordIds: number[]; changed: boolean
  };
  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.recordIds, [1, 2]);
  assert.equal(h.state().writes, 1);
  assert.equal(h.state().ownerProofs, 2);
});

test("existing keyed row retains its ID; conflicting or duplicate seeds cannot write", async () => {
  const h = harness({ initial: [{ id: 17, fields: { Name: "A", Qty: 1 } }] });
  const result = await h.service.ensureRecords("doc", "Stages", "Name", inputs) as {
    recordIds: number[]; createdIndices: number[]
  };
  assert.deepEqual(result.recordIds, [17, 18]);
  assert.deepEqual(result.createdIndices, [1]);
  assert.equal(h.state().writes, 1);
  await assert.rejects(h.service.ensureRecords("doc", "Stages", "Name", [
    { fields: { Name: "A", Qty: 999 } },
    { fields: { Name: "missing", Qty: 3 } }
  ]), /conflicts/);
  await assert.rejects(h.service.ensureRecords("doc", "Stages", "Name", [
    inputs[0]!, inputs[0]!
  ]), /duplicate requested/);
  assert.equal(h.state().writes, 1);
  assert.equal(h.state().rows.length, 2);
});

test("Owner/grant/read-bound refusal prevents creation", async () => {
  const noOwner = harness({ ownerDenied: true });
  await assert.rejects(noOwner.service.ensureRecords("doc", "Stages", "Name", inputs),
    /Owner required/);
  assert.equal(noOwner.state().writes, 0);
  const noGrant = harness({ grantDenied: true });
  await assert.rejects(noGrant.service.ensureRecords("doc", "Stages", "Name", inputs),
    /Gia grant denied/);
  assert.equal(noGrant.state().ownerProofs, 0);
  const small = harness({ maxReadRecords: 4 });
  await assert.rejects(small.service.ensureRecords("doc", "Stages", "Name", inputs),
    /complete native read capacity/);
  assert.equal(small.state().writes, 0);
});

test("partial native effect reports only confirmed request-index/row identities", async () => {
  const h = harness({ partialWrite: true });
  await assert.rejects(h.service.ensureRecords("doc", "Stages", "Name", inputs),
    (error: unknown) => {
      assert.ok(error instanceof UncertainWriteError);
      assert.equal(error.operation, "ensure_records");
      assert.equal(error.completedItems, 1);
      assert.equal(error.uncertainItems, 1);
      assert.deepEqual(error.confirmedResults, [{ requestIndex: 0, recordId: 1 }]);
      return true;
    });
  assert.equal(h.state().rows.length, 1);
  assert.equal(h.state().writes, 1);
});
