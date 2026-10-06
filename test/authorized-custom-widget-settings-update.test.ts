import assert from "node:assert/strict";
import test from "node:test";
import type { McpServer } from "@modelcontextprotocol/server";

import type { AuditLogger } from "../src/audit/auditLogger.js";
import type { AuthorizationService } from "../src/auth/authorizationService.js";
import type { Principal } from "../src/auth/principal.js";
import { AuthorizedGristService } from "../src/grist/authorizedService.js";
import type { GristService } from "../src/grist/service.js";
import type { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";
import { registerLeanTools } from "../src/mcp/leanTools.js";

const PRIVATE_URL = "https://widget.example.invalid/private?apiKey=synthetic-secret-marker";

function harness(applyWrite = true, initialOptions?: unknown) {
  let options: unknown = initialOptions ?? {
    unrelated: { keep: true },
    customView: JSON.stringify({
      url: PRIVATE_URL,
      widgetId: "@example/widget",
      pluginId: "private-plugin",
      access: "none",
      widgetOptions: { keep: [1, 2] },
      columnsMapping: { title: 11 }
    })
  };
  const writes: unknown[] = [];

  const inner = {
    maxReadRecords: 5000,
    maxWriteRecords: 500,
    writeBatchRecords: 200,
    maxSchemaItems: 100,
    getDocumentMetadata: async () => ({
      id: "doc-1",
      name: "Test document",
      type: "normal"
    }),
    listTables: async () => ({
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
    }),
    queryRecords: async (_documentId: string, tableId: string) => {
      if (tableId === "_grist_Pages") {
        return { records: [{ id: 12, fields: { viewRef: 7, indentation: 0, pagePos: 1 } }] };
      }
      if (tableId === "_grist_Views") {
        return { records: [{ id: 7, fields: { name: "Page", type: "empty", layoutSpec: "" } }] };
      }
      if (tableId === "_grist_Views_section") {
        return {
          records: [
            {
              id: 21,
              fields: {
                parentId: 7,
                tableRef: 2,
                parentKey: "custom",
                title: "Custom",
                description: "",
                chartType: "",
                options: options === "" ? "" : JSON.stringify(options),
                layoutSpec: "",
                sortColRefs: "[]",
                linkSrcSectionRef: 0,
                linkSrcColRef: 0,
                linkTargetColRef: 0
              }
            }
          ]
        };
      }
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
    nextRequestId: () => "request-custom-widget",
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
      update: { optionsJson?: string }
    ) => {
      writes.push({ documentId, widgetId, update });
      if (applyWrite && update.optionsJson !== undefined) {
        options = JSON.parse(update.optionsJson);
      }
    }
  } as unknown as GristUiActionsAdapter;

  return {
    service: new AuthorizedGristService(inner, authorization, audit, principal, uiActions),
    writes,
    currentOptions: () => options as Record<string, unknown>
  };
}

test("authorized custom widget update resolves stable IDs and preserves complete options", async () => {
  const { service, writes, currentOptions } = harness();

  const result = await service.updatePageWidget("doc-1", 7, 21, {
    customWidgetSettings: {
      access: "read table",
      columnsMapping: {
        title: "Name",
        contacts: ["Email"],
        optional: null
      }
    }
  }) as {
    widget: {
      options: unknown;
      customWidgetSettings?: unknown;
      customWidgetSettingsNormalizationIncomplete?: boolean;
    };
  };

  assert.equal(writes.length, 1);
  const written = writes[0] as {
    documentId: string;
    widgetId: number;
    update: { optionsJson: string };
  };
  assert.equal(written.documentId, "doc-1");
  assert.equal(written.widgetId, 21);
  assert.deepEqual(JSON.parse(written.update.optionsJson), {
    unrelated: { keep: true },
    customView: JSON.stringify({
      url: PRIVATE_URL,
      widgetId: "@example/widget",
      pluginId: "private-plugin",
      access: "read table",
      widgetOptions: { keep: [1, 2] },
      columnsMapping: {
        title: 11,
        contacts: [12],
        optional: null
      }
    })
  });
  assert.deepEqual(currentOptions(), JSON.parse(written.update.optionsJson));
  assert.deepEqual(result.widget.options, {
    customView: { access: "read table", widgetId: "@example/widget" }
  });
  assert.equal(JSON.stringify(result).includes(PRIVATE_URL), false);
  assert.deepEqual(result.widget.customWidgetSettings, {
    access: "read table",
    widgetId: "@example/widget",
    columnsMapping: {
      title: "Name",
      contacts: ["Email"],
      optional: null
    }
  });
  assert.equal(result.widget.customWidgetSettingsNormalizationIncomplete, undefined);
});

test("custom widget post-write divergence is non-retryable verification failure", async () => {
  const { service } = harness(false);

  await assert.rejects(
    () =>
      service.updatePageWidget("doc-1", 7, 21, {
        customWidgetSettings: { access: "full" }
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.name, "UiWriteVerificationError");
      assert.match(error.message, /did not preserve the exact expected options/);
      assert.match(error.message, /do not retry the whole operation blindly/i);
      return true;
    }
  );
});

test("registered inspect and change callbacks never return private custom options", async () => {
  const { service, currentOptions, writes } = harness();
  const callbacks = new Map<string, (input: any) => Promise<any>>();
  const server = {
    registerTool: (name: string, _options: unknown, callback: (input: any) => Promise<any>) => {
      callbacks.set(name, callback);
      return {};
    }
  } as unknown as McpServer;
  registerLeanTools(server, service, {
    maxReadRecords: 200,
    maxWriteRecords: 50,
    maxSchemaItems: 100
  });
  const before = JSON.stringify(currentOptions());
  for (const action of ["document", "pages", "page_widgets"]) {
    const result = await callbacks.get("grist_inspect")!({ action, documentId: "doc-1", pageId: 7 });
    assert.equal(result.isError, undefined);
    assert.equal(JSON.stringify(result).includes("synthetic-secret-marker"), false);
    assert.equal(JSON.stringify(result).includes("private-plugin"), false);
  }
  assert.equal(JSON.stringify(currentOptions()), before);
  const result = await callbacks.get("grist_change_ui")!({
    action: "update_widget",
    documentId: "doc-1",
    pageId: 7,
    widgetId: 21,
    update: { customWidgetSettings: { access: "read table" } }
  });
  assert.equal(result.isError, undefined);
  assert.equal(JSON.stringify(result).includes("synthetic-secret-marker"), false);
  assert.equal(JSON.stringify(result).includes("private-plugin"), false);
  const customView = JSON.parse(currentOptions().customView as string);
  assert.equal(customView.url, PRIVATE_URL);
  assert.deepEqual(customView.widgetOptions, { keep: [1, 2] });
  assert.equal(writes.length, 1);
});

test("a freshly created native blank custom widget accepts bounded settings", async () => {
  const { service, writes, currentOptions } = harness(true, "");
  const result = await service.updatePageWidget("doc-1", 7, 21, {
    customWidgetSettings: { access: "none", columnsMapping: { title: "Name" } }
  }) as any;
  assert.equal(writes.length, 1);
  assert.equal(typeof currentOptions().customView, "string");
  assert.deepEqual(JSON.parse(currentOptions().customView as string), { access: "none", columnsMapping: { title: 11 } });
  assert.deepEqual(result.widget.customWidgetSettings, { access: "none", columnsMapping: { title: "Name" } });
});
