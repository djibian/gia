import assert from "node:assert/strict";
import test from "node:test";

import type { AuditLogger } from "../src/audit/auditLogger.js";
import type { AuthorizationService } from "../src/auth/authorizationService.js";
import type { Principal } from "../src/auth/principal.js";
import { AuthorizedGristService } from "../src/grist/authorizedService.js";
import type { PageOrderWrite } from "../src/grist/pageOrder.js";
import type { GristService } from "../src/grist/service.js";
import {
  UiWriteVerificationError,
  type GristUiActionsAdapter
} from "../src/grist/uiActionsAdapter.js";

const principal: Principal = {
  id: "authorized-page-order-test",
  transport: "mcp",
  grants: [
    {
      documentIds: ["doc-1"],
      workspaceIds: [],
      capabilities: ["doc.schema:write"]
    }
  ]
};

const authorization = {
  assertDocumentAllowed: async (
    _principal: Principal,
    documentId: string
  ) => documentId
} as unknown as AuthorizationService;

const audit = {
  nextRequestId: () => "request-page-order",
  record: () => undefined
} as unknown as AuditLogger;

function harness(options: { applyWrite?: boolean; nativePositions?: boolean } = {}) {
  const applyWrite = options.applyWrite ?? true;
  const pages = [
    { id: 101, viewRef: 1, indentation: 0, pagePos: 1 },
    { id: 102, viewRef: 2, indentation: 1, pagePos: 2 },
    { id: 103, viewRef: 3, indentation: 1, pagePos: 3 },
    { id: 104, viewRef: 4, indentation: 0, pagePos: 4 }
  ];
  const writes: PageOrderWrite[][] = [];

  const inner = {
    maxReadRecords: 5000,
    maxWriteRecords: 500,
    writeBatchRecords: 200,
    maxSchemaItems: 100,
    queryRecords: async (_documentId: string, tableId: string) => {
      if (tableId === "_grist_Pages") {
        return {
          records: pages.map((page) => ({
            id: page.id,
            fields: {
              viewRef: page.viewRef,
              indentation: page.indentation,
              pagePos: page.pagePos
            }
          }))
        };
      }
      if (tableId === "_grist_Views") {
        return {
          records: [1, 2, 3, 4].map((id) => ({
            id,
            fields: { name: `Page ${id}`, type: "raw_data", layoutSpec: "" }
          }))
        };
      }
      if (tableId === "_grist_Tables") return { records: [] };
      if (tableId === "_grist_Views_section") return { records: [] };
      return { records: [] };
    },
    listTables: async () => ({ tables: [] })
  } as unknown as GristService;

  const uiActions = {
    reorderPages: async (_documentId: string, updates: readonly PageOrderWrite[]) => {
      writes.push([...updates]);
      if (!applyWrite) return;
      for (const update of updates) {
        const page = pages.find((candidate) => candidate.id === update.pageRecordId)!;
        page.pagePos = update.pagePos;
      }
      if (options.nativePositions) for (const page of pages) page.pagePos -= 0.5;
    }
  } as unknown as GristUiActionsAdapter;

  return {
    service: new AuthorizedGristService(
      inner,
      authorization,
      audit,
      principal,
      uiActions
    ),
    writes
  };
}

test("page reorder accepts native fractional positions while verifying order and hierarchy", async () => {
  const { service } = harness({ nativePositions: true });
  assert.deepEqual(await service.reorderPages("doc-1", [4, 1, 2, 3]), { documentId: "doc-1", pageIds: [4, 1, 2, 3] });
});

test("authorized page reorder writes resolved page records and verifies exact navigation state", async () => {
  const { service, writes } = harness();

  const result = await service.reorderPages("doc-1", [4, 1, 2, 3]) as {
    documentId: string;
    pageIds: number[];
  };

  assert.deepEqual(writes, [[
    { pageRecordId: 104, pagePos: 1 },
    { pageRecordId: 101, pagePos: 2 },
    { pageRecordId: 102, pagePos: 3 },
    { pageRecordId: 103, pagePos: 4 }
  ]]);
  assert.deepEqual(result, {
    documentId: "doc-1",
    pageIds: [4, 1, 2, 3]
  });
});

test("page-order post-write divergence is a non-blind-retry verification failure", async () => {
  const { service, writes } = harness({ applyWrite: false });

  await assert.rejects(
    () => service.reorderPages("doc-1", [4, 1, 2, 3]),
    (error: unknown) => {
      assert.ok(error instanceof UiWriteVerificationError);
      assert.match(error.message, /did not match the requested page order/i);
      assert.match(error.message, /do not retry the whole operation blindly/i);
      return true;
    }
  );
  assert.equal(writes.length, 1);
});

test("authorized page reorder refuses a hierarchy-changing permutation before write", async () => {
  const { service, writes } = harness();

  await assert.rejects(
    () => service.reorderPages("doc-1", [1, 4, 2, 3]),
    /change the existing page hierarchy/i
  );
  assert.deepEqual(writes, []);
});
