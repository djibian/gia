import assert from "node:assert/strict";
import test from "node:test";

import type { AuditLogger } from "../src/audit/auditLogger.js";
import type { AuthorizationService } from "../src/auth/authorizationService.js";
import type { Principal } from "../src/auth/principal.js";
import { AuthorizedGristService } from "../src/grist/authorizedService.js";
import type { GristService } from "../src/grist/service.js";
import {
  UiWriteVerificationError,
  type GristUiActionsAdapter
} from "../src/grist/uiActionsAdapter.js";

const principal: Principal = {
  id: "q0-ui-completeness",
  transport: "mcp",
  grants: [
    {
      documentIds: ["doc-1"],
      workspaceIds: [],
      capabilities: ["doc:read", "doc.schema:write"]
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
  nextRequestId: () => "q0-ui-completeness",
  record: () => undefined
} as unknown as AuditLogger;

function tableResponse() {
  return {
    tables: [
      {
        id: "Personnes",
        fields: { tableRef: 2 }
      }
    ]
  };
}

function pageRecord(id: number, viewRef: number) {
  return { id, fields: { viewRef, indentation: 0, pagePos: id } };
}

function viewRecord(id: number, name: string) {
  return { id, fields: { name, type: "empty", layoutSpec: "" } };
}

function sectionRecord(id: number, linkSrcSectionRef: number) {
  return {
    id,
    fields: {
      parentId: 7,
      tableRef: 2,
      parentKey: "record",
      title: `Widget ${id}`,
      description: "",
      chartType: "",
      options: "{}",
      layoutSpec: "",
      sortColRefs: "[]",
      linkSrcSectionRef,
      linkSrcColRef: 0,
      linkTargetColRef: 0
    }
  };
}

test("malformed, missing and duplicate UI identities remain explicit and block mutations before dispatch", async () => {
  const base = {
    _grist_Pages: { records: [pageRecord(1, 7)] },
    _grist_Views: { records: [viewRecord(7, "Vue"), viewRecord(8, "Unlisted view")] },
    _grist_Views_section: { records: [sectionRecord(11, 0)] },
    _grist_Views_section_field: { records: [] },
    _grist_Filters: { records: [] }
  };
  for (const [key, malformed] of [
    ["_grist_Views_section", { records: [sectionRecord(11, 0), null] }],
    ["_grist_Views_section", {}],
    ["_grist_Views_section", { records: [sectionRecord(11, 0), sectionRecord(11, 0)] }],
    ["_grist_Views_section", { records: [sectionRecord(11, 0), { id: 12, fields: { ...sectionRecord(12, 0).fields, parentId: 8 } }] }],
    ["_grist_Views_section", { records: [{ id: 11, fields: { ...sectionRecord(11, 0).fields, parentId: ["C"] } }] }],
    ["_grist_Views_section", { records: [{ id: 11, fields: { ...sectionRecord(11, 0).fields, tableRef: ["C"] } }] }],
    ["_grist_Views_section", { records: [{ id: 11, fields: { ...sectionRecord(11, 0).fields, linkSrcSectionRef: ["C"] } }] }],
    ["_grist_Views", { records: [] }],
    ["_grist_Pages", { records: [pageRecord(1, 7), pageRecord(2, 7)] }],
    ["_grist_Views_section_field", { records: [null] }],
    ["_grist_Views_section_field", { records: [{ id: 1, fields: { parentId: 999, colRef: 21 } }] }],
    ["_grist_Filters", { records: [{ id: 1, fields: { viewSectionRef: 999, colRef: 21 } }] }],
    ["_grist_Filters", { records: [{ id: 1, fields: { colRef: 21 } }] }]
  ] as const) {
    const writes: unknown[] = [];
    const inner = {
      maxReadRecords: 5000, maxWriteRecords: 500, writeBatchRecords: 200, maxSchemaItems: 100,
      listTables: async () => tableResponse(),
      queryRecords: async (_id: string, tableId: string) => tableId === key ? malformed : base[tableId as keyof typeof base]
    } as unknown as GristService;
    const uiActions = { updatePageWidget: async (...args: unknown[]) => { writes.push(args); } } as unknown as GristUiActionsAdapter;
    const service = new AuthorizedGristService(inner, authorization, audit, principal, uiActions);
    const inspected = await service.inspectDocument("doc-1") as any;
    assert.equal(inspected.summary.uiIncomplete, true, key);
    await assert.rejects(() => service.updatePageWidget("doc-1", 7, 11,
      key === "_grist_Views_section_field" ? { visibleFields: [] } : key === "_grist_Filters" ? { filters: [] } : { title: "Changed" }), /metadata snapshot.*refusing a UI mutation/i);
    assert.deepEqual(writes, []);
  }
});

test("acknowledged UI creation retains its known ID when the re-read contains malformed metadata", async () => {
  let created = false;
  let calls = 0;
  const inner = {
    maxReadRecords: 5000, maxWriteRecords: 500, writeBatchRecords: 200, maxSchemaItems: 100,
    listTables: async () => tableResponse(),
    queryRecords: async (_id: string, tableId: string) => ({ records: tableId === "_grist_Pages"
      ? [pageRecord(1, 7), ...(created ? [pageRecord(2, 8)] : [])]
      : tableId === "_grist_Views" ? [viewRecord(7, "Old"), ...(created ? [viewRecord(8, "New")] : [])]
      : tableId === "_grist_Views_section" && created ? [null] : [] })
  } as unknown as GristService;
  const uiActions = { createEmptyPage: async () => { calls++; created = true; return { pageId: 8 }; } } as unknown as GristUiActionsAdapter;
  const service = new AuthorizedGristService(inner, authorization, audit, principal, uiActions);
  await assert.rejects(() => service.createPage("doc-1", "Personnes", "New"), (error) => {
    assert.ok(error instanceof UiWriteVerificationError);
    assert.equal(error.createdId, 8);
    assert.match(error.message, /do not retry the whole operation blindly/i);
    return true;
  });
  assert.equal(calls, 1);
});

test("metadata reads that reach the bound are marked incomplete and block topology-sensitive mutation", async () => {
  const writes: unknown[] = [];
  const inner = {
    maxReadRecords: 2,
    maxWriteRecords: 500,
    writeBatchRecords: 200,
    maxSchemaItems: 100,
    listTables: async () => tableResponse(),
    queryRecords: async (_documentId: string, tableId: string) => {
      if (tableId === "_grist_Pages") {
        return { records: [pageRecord(1, 7)] };
      }
      if (tableId === "_grist_Views") {
        return { records: [viewRecord(7, "Vue générale")] };
      }
      if (tableId === "_grist_Views_section") {
        return {
          records: [
            sectionRecord(11, 0),
            sectionRecord(12, 11)
          ]
        };
      }
      return { records: [] };
    }
  } as unknown as GristService;

  const uiActions = {
    updatePageWidget: async (
      documentId: string,
      widgetId: number,
      update: unknown
    ) => {
      writes.push({ documentId, widgetId, update });
    }
  } as unknown as GristUiActionsAdapter;

  const service = new AuthorizedGristService(
    inner,
    authorization,
    audit,
    principal,
    uiActions
  );

  const widgets = await service.getPageWidgets("doc-1", 7) as {
    metadataSnapshotIncomplete?: boolean;
  };
  assert.equal(widgets.metadataSnapshotIncomplete, true);

  await assert.rejects(
    () => service.updatePageWidget("doc-1", 7, 11, {
      selectBy: { sourceWidgetId: 12 }
    }),
    /metadata snapshot reached the configured read limit.*refusing a UI mutation/i
  );
  assert.deepEqual(writes, []);
});

test("post-write verification fails closed if the metadata snapshot reaches the bound", async () => {
  let created = false;
  let createCalls = 0;
  const inner = {
    maxReadRecords: 2,
    maxWriteRecords: 500,
    writeBatchRecords: 200,
    maxSchemaItems: 100,
    listTables: async () => tableResponse(),
    queryRecords: async (_documentId: string, tableId: string) => {
      if (tableId === "_grist_Pages") {
        return {
          records: created
            ? [pageRecord(1, 7), pageRecord(2, 8)]
            : [pageRecord(1, 7)]
        };
      }
      if (tableId === "_grist_Views") {
        return {
          records: created
            ? [viewRecord(7, "Vue générale"), viewRecord(8, "Nouvelle vue")]
            : [viewRecord(7, "Vue générale")]
        };
      }
      if (tableId === "_grist_Views_section") {
        return { records: [] };
      }
      return { records: [] };
    }
  } as unknown as GristService;

  const uiActions = {
    createEmptyPage: async () => {
      createCalls++;
      created = true;
      return { pageId: 8 };
    }
  } as unknown as GristUiActionsAdapter;

  const service = new AuthorizedGristService(
    inner,
    authorization,
    audit,
    principal,
    uiActions
  );

  await assert.rejects(
    () => service.createPage("doc-1", "Personnes", "Nouvelle vue"),
    (error: unknown) => {
      assert.ok(error instanceof UiWriteVerificationError);
      assert.match(error.message, /metadata snapshot reached the configured read limit/i);
      assert.match(error.message, /do not retry the whole operation blindly/i);
      return true;
    }
  );
  assert.equal(createCalls, 1);
});

for (const scenario of ["oversized", "truncated", "ambiguous"] as const) {
  test(`inspection survives ${scenario} navigation while reorder still refuses it`, async () => {
    const pageCount = scenario === "oversized" ? 501 : 2;
    const writes: unknown[] = [];
    const inner = {
      maxReadRecords: scenario === "truncated" ? 2 : 5000,
      maxWriteRecords: 500,
      writeBatchRecords: 200,
      maxSchemaItems: 100,
      listTables: async () => tableResponse(),
      queryRecords: async (_documentId: string, tableId: string) => ({
        records: tableId === "_grist_Pages"
          ? Array.from({ length: pageCount }, (_, index) => ({
              id: index + 1,
              fields: {
                viewRef: index + 1,
                indentation: 0,
                pagePos: scenario === "ambiguous" ? 1 : index + 1
              }
            }))
          : tableId === "_grist_Views"
            ? Array.from({ length: pageCount }, (_, index) =>
                viewRecord(index + 1, `Page ${index + 1}`))
            : []
      })
    } as unknown as GristService;
    const uiActions = {
      reorderPages: async (...args: unknown[]) => { writes.push(args); }
    } as unknown as GristUiActionsAdapter;
    const service = new AuthorizedGristService(inner, authorization, audit, principal, uiActions);

    const pages = await service.getPages("doc-1") as any;
    assert.equal(pages.navigationNormalizationIncomplete, true);
    assert.equal(pages.navigationPageIds, undefined);
    assert.equal(pages.pages.length, pageCount);
    const document = await service.inspectDocument("doc-1") as any;
    assert.equal(document.navigationNormalizationIncomplete, true);
    assert.equal(document.navigationPageIds, undefined);
    assert.equal(document.summary.uiIncomplete, true);
    assert.equal(document.ui.summary.incomplete, true);
    assert.deepEqual(document.tables.map((table: { id: string }) => table.id), ["Personnes"]);

    await assert.rejects(
      () => service.reorderPages("doc-1", pages.pages.map((page: { id: number }) => page.id)),
      /maximum of 500|read limit|duplicate page positions/
    );
    assert.deepEqual(writes, []);
  });
}
