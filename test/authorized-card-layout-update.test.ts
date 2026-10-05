import assert from "node:assert/strict";
import test from "node:test";

import type { AuditLogger } from "../src/audit/auditLogger.js";
import type { AuthorizationService } from "../src/auth/authorizationService.js";
import type { Principal } from "../src/auth/principal.js";
import { AuthorizedGristService } from "../src/grist/authorizedService.js";
import type { GristService } from "../src/grist/service.js";
import type {
  GristUiActionsAdapter,
  WidgetUiUpdate
} from "../src/grist/uiActionsAdapter.js";

function harness(options: { applyWrite?: boolean; widgetType?: string; initialLayoutSpec?: string } = {}) {
  const applyWrite = options.applyWrite ?? true;
  const widgetType = options.widgetType ?? "single";
  let layoutSpec = options.initialLayoutSpec ?? "";
  const writes: unknown[] = [];
  const listTableOptions: unknown[] = [];

  const sectionFields = {
    records: [
      { id: 101, fields: { parentId: 21, parentPos: 1, colRef: 11, width: 120 } },
      { id: 102, fields: { parentId: 21, parentPos: 2, colRef: 12, width: 0 } }
    ]
  };

  const inner = {
    maxReadRecords: 5000,
    maxWriteRecords: 500,
    writeBatchRecords: 200,
    maxSchemaItems: 100,
    listTables: async (_documentId: string, options: unknown) => {
      listTableOptions.push(options);
      return {
        tables: [
          {
            id: "People",
            fields: { tableRef: 2 },
            columns: [
              { id: "Name", fields: { colRef: 11, type: "Text" } },
              { id: "Email", fields: { colRef: 12, type: "Text" } }
            ]
          }
        ]
      };
    },
    queryRecords: async (_documentId: string, tableId: string) => {
      if (tableId === "_grist_Pages") {
        return {
          records: [{ id: 12, fields: { viewRef: 7, indentation: 0, pagePos: 1 } }]
        };
      }
      if (tableId === "_grist_Views") {
        return {
          records: [{ id: 7, fields: { name: "Page", type: "empty", layoutSpec: "" } }]
        };
      }
      if (tableId === "_grist_Views_section") {
        return {
          records: [
            {
              id: 21,
              fields: {
                parentId: 7,
                tableRef: 2,
                parentKey: widgetType,
                title: "People",
                description: "",
                chartType: "",
                options: "{}",
                layoutSpec,
                sortColRefs: "[]",
                linkSrcSectionRef: 0,
                linkSrcColRef: 0,
                linkTargetColRef: 0
              }
            }
          ]
        };
      }
      if (tableId === "_grist_Views_section_field") return sectionFields;
      if (tableId === "_grist_Filters") return { records: [] };
      return { records: [] };
    }
  } as unknown as GristService;

  const authorization = {
    assertDocumentAllowed: async (
      _principal: Principal,
      documentId: string
    ) => documentId
  } as unknown as AuthorizationService;
  const audit = {
    nextRequestId: () => "request-card-layout",
    record: () => undefined
  } as unknown as AuditLogger;
  const principal: Principal = {
    id: "test-client",
    transport: "mcp",
    grants: [
      {
        documentIds: ["doc-1"],
        workspaceIds: [],
        capabilities: ["doc.schema:write"]
      }
    ]
  };

  const uiActions = {
    updatePageWidget: async (
      documentId: string,
      widgetId: number,
      update: WidgetUiUpdate
    ) => {
      writes.push({ documentId, widgetId, update });
      if (applyWrite && update.cardLayoutJson !== undefined) {
        layoutSpec = update.cardLayoutJson;
      }
    }
  } as unknown as GristUiActionsAdapter;

  return {
    service: new AuthorizedGristService(inner, authorization, audit, principal, uiActions),
    writes,
    listTableOptions
  };
}

const requestedLayout = {
  root: {
    kind: "group" as const,
    children: [
      { kind: "field" as const, columnId: "Email", size: 30 },
      { kind: "field" as const, columnId: "Name" }
    ]
  }
};

test("authorized Card layout resolves stable columns and verifies exact re-read state", async () => {
  const { service, writes, listTableOptions } = harness();

  const result = await service.updatePageWidget("doc-1", 7, 21, {
    cardLayout: requestedLayout
  }) as {
    widget: {
      cardLayout?: unknown;
      cardLayoutNormalizationIncomplete?: boolean;
    };
  };

  assert.deepEqual(result.widget.cardLayout, {
    root: {
      kind: "group",
      children: [
        { kind: "field", columnId: "Email", size: 30 },
        { kind: "field", columnId: "Name" }
      ]
    },
    unplacedColumnIds: []
  });
  assert.equal(result.widget.cardLayoutNormalizationIncomplete, undefined);
  assert.deepEqual(listTableOptions, [
    { expandColumns: true },
    { expandColumns: true }
  ]);

  assert.equal(writes.length, 1);
  assert.deepEqual(
    (writes[0] as { update: WidgetUiUpdate }).update.cardLayoutJson,
    JSON.stringify({
      children: [
        { leaf: 102, size: 30 },
        { leaf: 101 }
      ]
    })
  );
});

test("authorized Card layout can replace a native layout containing stale removed field refs", async () => {
  const { service, writes } = harness({
    initialLayoutSpec: JSON.stringify({
      children: [{ leaf: 101 }, { leaf: 999 }, { leaf: 102 }]
    })
  });

  const result = await service.updatePageWidget("doc-1", 7, 21, {
    cardLayout: requestedLayout
  }) as { widget: { cardLayout?: unknown } };

  assert.equal(writes.length, 1);
  assert.deepEqual(result.widget.cardLayout, {
    root: {
      kind: "group",
      children: [
        { kind: "field", columnId: "Email", size: 30 },
        { kind: "field", columnId: "Name" }
      ]
    },
    unplacedColumnIds: []
  });
});

test("authorized Card layout fails closed when the write cannot be verified", async () => {
  const { service, writes } = harness({ applyWrite: false });

  await assert.rejects(
    () =>
      service.updatePageWidget("doc-1", 7, 21, {
        cardLayout: requestedLayout
      }),
    /did not match the requested card layout/
  );
  assert.equal(writes.length, 1);
});

test("clean unary Card groups retain their shape through write and re-read", async () => {
  const layouts = [
    {
      root: {
        kind: "group" as const,
        children: [requestedLayout.root]
      }
    },
    {
      root: {
        kind: "group" as const,
        children: [
          { kind: "group" as const, children: [{ kind: "field" as const, columnId: "Email" }] },
          { kind: "field" as const, columnId: "Name" }
        ]
      }
    }
  ];
  for (const cardLayout of layouts) {
    const { service, writes } = harness();
    const result = await service.updatePageWidget("doc-1", 7, 21, { cardLayout }) as {
      widget: { cardLayout: unknown };
    };
    assert.equal(writes.length, 1);
    assert.deepEqual(result.widget.cardLayout, { ...cardLayout, unplacedColumnIds: [] });
  }
});

test("card layout is limited to Card/Card List and cannot be combined with visibleFields", async () => {
  const tableHarness = harness({ widgetType: "record" });
  await assert.rejects(
    () =>
      tableHarness.service.updatePageWidget("doc-1", 7, 21, {
        cardLayout: requestedLayout
      }),
    /not a Card or Card List/
  );
  assert.equal(tableHarness.writes.length, 0);

  const cardHarness = harness();
  await assert.rejects(
    () =>
      cardHarness.service.updatePageWidget("doc-1", 7, 21, {
        visibleFields: [{ columnId: "Name" }, { columnId: "Email" }],
        cardLayout: requestedLayout
      }),
    /separate bounded intentions/
  );
  assert.equal(cardHarness.writes.length, 0);
});
