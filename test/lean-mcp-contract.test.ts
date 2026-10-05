import assert from "node:assert/strict";
import test from "node:test";

import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { LEAN_TOOL_REGISTRY } from "../src/mcp/leanRegistry.js";
import { registerLeanTools } from "../src/mcp/leanTools.js";

interface Registration {
  name: string;
  options: {
    inputSchema?: { parse(input: unknown): any };
    title?: string;
    description?: string;
    annotations?: {
      readOnlyHint?: boolean;
      destructiveHint?: boolean;
      openWorldHint?: boolean;
    };
  };
  callback: (...args: any[]) => any;
}

test("registered mutation schemas reject unsupported wrapper keys before dispatch", async () => {
  const writes: unknown[] = [];
  const grist = new Proxy({}, { get: () => async (...args: unknown[]) => {
    writes.push(args);
    return {};
  } });
  const registrations = capture(grist);
  const cases = [
    ["grist_add_records", { documentId: "doc-1", tableId: "Tasks", records: [{ id: 12345, fields: { Name: "test" } }] }],
    ["grist_change_records", { action: "update", documentId: "doc-1", tableId: "Tasks", records: [{ id: 1, fields: {}, extra: true }] }],
    ["grist_add_structure", { action: "create_tables", documentId: "doc-1", tables: [{ id: "Tasks", extra: true }] }],
    ["grist_add_structure", { action: "create_tables", documentId: "doc-1", tables: [{ id: "Tasks", columns: [{ id: "Name", extra: true }] }] }],
    ["grist_add_structure", { action: "create_columns", documentId: "doc-1", tableId: "Tasks", columns: [{ id: "Name", extra: true }] }],
    ["grist_change_structure", { action: "update_columns", documentId: "doc-1", tableId: "Tasks", columns: [{ id: "Name", fields: { label: "Name" }, extra: true }] }],
    ["grist_change_structure", { action: "update_tables", documentId: "doc-1", tables: [{ id: "Tasks", fields: { onDemand: false }, extra: true }] }]
  ] as const;
  for (const [name, input] of cases) {
    const registration = registrations.find((entry) => entry.name === name)!;
    await assert.rejects(async () => registration.callback(registration.options.inputSchema!.parse(input)), /Unrecognized key/);
  }
  assert.deepEqual(writes, []);
  const add = registrations.find((entry) => entry.name === "grist_add_records")!;
  const input = { documentId: "doc-1", tableId: "Tasks", records: [{ fields: { arbitraryCell: { nested: true } } }] };
  await add.callback(add.options.inputSchema!.parse(input));
  assert.equal(writes.length, 1);
});

function capture(grist: any = {}): Registration[] {
  const registrations: Registration[] = [];
  const server = {
    registerTool: (
      name: string,
      options: Registration["options"],
      callback: Registration["callback"]
    ) => {
      registrations.push({ name, options, callback });
      return {};
    }
  } as unknown as McpServer;

  registerLeanTools(server, grist, {
    maxReadRecords: 200,
    maxWriteRecords: 50,
    maxSchemaItems: 100
  });
  return registrations;
}

test("registered dictionary schemas reject raw own __proto__ keys without dispatch or silent loss", async () => {
  const calls: unknown[] = [];
  const registrations = capture(new Proxy({}, { get: () => async (...args: unknown[]) => { calls.push(args); return {}; } }));
  const values = JSON.parse('{"__proto__":"must-not-disappear","constructor":"preserved","Name":{"__proto__":"nested-cell-data"}}');
  const filter = JSON.parse('{"__proto__":["must-not-disappear"],"constructor":["preserved"]}');
  const mapping = JSON.parse('{"__proto__":"Name","constructor":"Name"}');
  const cases = [
    ["grist_add_records", { documentId: "doc-1", tableId: "Tasks", records: [{ fields: values }] }],
    ["grist_change_records", { action: "update", documentId: "doc-1", tableId: "Tasks", records: [{ id: 1, fields: values }] }],
    ["grist_query", { documentId: "doc-1", tableId: "Tasks", filter }],
    ["grist_change_ui", { action: "update_widget", documentId: "doc-1", pageId: 7, widgetId: 11, update: { customWidgetSettings: { columnsMapping: mapping } } }]
  ] as const;
  for (const [name, input] of cases) {
    const registration = registrations.find((entry) => entry.name === name)!;
    await assert.rejects(async () => registration.callback(registration.options.inputSchema!.parse(input)), /Dictionary key __proto__ is unsupported/);
    // The preprocess guard retains an object-shaped advertised dictionary schema.
    const jsonSchema = z.toJSONSchema(registration.options.inputSchema as z.ZodType, { io: "input" });
    assert.equal(JSON.stringify(jsonSchema).includes('"propertyNames"'), true);
  }
  assert.deepEqual(calls, []);
  delete values.__proto__;
  const add = registrations.find((entry) => entry.name === "grist_add_records")!;
  const valid = { documentId: "doc-1", tableId: "Tasks", records: [{ fields: values }] };
  assert.deepEqual(add.options.inputSchema!.parse(valid).records[0].fields, values);
  assert.equal(Object.hasOwn(values.Name, "__proto__"), true);
  delete mapping.__proto__;
  const ui = registrations.find((entry) => entry.name === "grist_change_ui")!;
  assert.deepEqual(ui.options.inputSchema!.parse({ ...cases[3][1], update: { customWidgetSettings: { columnsMapping: mapping } } }).update.customWidgetSettings.columnsMapping, mapping);
});

test("lean MCP surface is exactly ten prefixed bounded tools with precise risk classes", () => {
  const registrations = capture();
  const names = registrations.map((entry) => entry.name);
  const registryNames = LEAN_TOOL_REGISTRY.map((entry) => entry.name);

  assert.equal(names.length, 10);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual([...names].sort(), [...registryNames].sort());
  assert.ok(names.every((name) => name.startsWith("grist_")));

  const byName = new Map(registrations.map((entry) => [entry.name, entry]));
  for (const definition of LEAN_TOOL_REGISTRY) {
    const registration = byName.get(definition.name);
    assert.ok(registration, `missing ${definition.name}`);
    assert.equal(registration.options.title, definition.title);
    assert.equal(registration.options.description, definition.description);
    assert.deepEqual(registration.options.annotations, {
      readOnlyHint: definition.readOnly,
      destructiveHint: definition.destructive,
      openWorldHint: false
    });
  }

  assert.deepEqual(
    LEAN_TOOL_REGISTRY.filter((entry) => entry.readOnly)
      .map((entry) => entry.name)
      .sort(),
    ["grist_discover", "grist_help", "grist_inspect", "grist_query"]
  );
  assert.deepEqual(
    LEAN_TOOL_REGISTRY.filter((entry) => entry.destructive)
      .map((entry) => entry.name)
      .sort(),
    ["grist_change_records", "grist_change_structure", "grist_change_ui"]
  );
});

test("record manager dispatches one explicit bounded action", async () => {
  const observed: unknown[] = [];
  const registrations = capture({
    updateRecords: async (documentId: string, tableId: string, records: unknown[]) => {
      observed.push({ action: "update", documentId, tableId, records });
      return { updated: records.length };
    },
    deleteRecords: async (documentId: string, tableId: string, recordIds: number[]) => {
      observed.push({ action: "delete", documentId, tableId, recordIds });
      return { deleted: recordIds.length };
    }
  });
  const tool = registrations.find((entry) => entry.name === "grist_change_records");
  assert.ok(tool);

  const result = await tool.callback({
    action: "update",
    documentId: "doc-1",
    tableId: "Tasks",
    records: [{ id: 7, fields: { Status: "Done" } }]
  });

  assert.equal(result.isError, undefined);
  assert.deepEqual(observed, [
    {
      action: "update",
      documentId: "doc-1",
      tableId: "Tasks",
      records: [{ id: 7, fields: { Status: "Done" } }]
    }
  ]);
});

test("structure and UI managers preserve stable semantic identifiers at their boundary", async () => {
  const observed: unknown[] = [];
  const registrations = capture({
    renameColumn: async (
      documentId: string,
      tableId: string,
      oldColumnId: string,
      newColumnId: string
    ) => {
      observed.push({
        action: "rename_column",
        documentId,
        tableId,
        oldColumnId,
        newColumnId
      });
      return { ok: true };
    },
    updatePageWidget: async (
      documentId: string,
      pageId: number,
      widgetId: number,
      update: unknown
    ) => {
      observed.push({
        action: "update_widget",
        documentId,
        pageId,
        widgetId,
        update
      });
      return { ok: true };
    }
  });

  const structure = registrations.find(
    (entry) => entry.name === "grist_change_structure"
  );
  const ui = registrations.find((entry) => entry.name === "grist_change_ui");
  assert.ok(structure);
  assert.ok(ui);

  await structure.callback({
    action: "rename_column",
    documentId: "doc-1",
    tableId: "Tasks",
    oldColumnId: "Owner",
    newColumnId: "Assignee"
  });
  await ui.callback({
    action: "update_widget",
    documentId: "doc-1",
    pageId: 3,
    widgetId: 9,
    update: {
      title: "Open tasks",
      filters: [
        {
          columnId: "Status",
          mode: "include",
          values: ["Open"],
          pinned: true
        }
      ]
    }
  });

  assert.deepEqual(observed, [
    {
      action: "rename_column",
      documentId: "doc-1",
      tableId: "Tasks",
      oldColumnId: "Owner",
      newColumnId: "Assignee"
    },
    {
      action: "update_widget",
      documentId: "doc-1",
      pageId: 3,
      widgetId: 9,
      update: {
        title: "Open tasks",
        filters: [
          {
            columnId: "Status",
            mode: "include",
            values: ["Open"],
            pinned: true
          }
        ]
      }
    }
  ]);
});

test("UI add manager carries only stable summary source-column IDs across the MCP boundary", async () => {
  const observed: unknown[] = [];
  const registrations = capture({
    addPageWidget: async (
      documentId: string,
      pageId: number,
      tableId: string,
      type: string,
      groupByColumnIds?: readonly string[]
    ) => {
      observed.push({
        action: "add_widget",
        documentId,
        pageId,
        tableId,
        type,
        groupByColumnIds
      });
      return { ok: true };
    }
  });
  const ui = registrations.find((entry) => entry.name === "grist_add_ui");
  assert.ok(ui);

  const result = await ui.callback({
    action: "add_widget",
    documentId: "doc-1",
    pageId: 3,
    tableId: "Orders",
    type: "record",
    groupByColumnIds: ["Region", "Status"]
  });

  assert.equal(result.isError, undefined);
  assert.deepEqual(observed, [{
    action: "add_widget",
    documentId: "doc-1",
    pageId: 3,
    tableId: "Orders",
    type: "record",
    groupByColumnIds: ["Region", "Status"]
  }]);
  assert.equal(registrations.length, 10);
});

test("UI manager routes page order and deletion without exposing a new tool", async () => {
  const observed: unknown[] = [];
  const registrations = capture({
    reorderPages: async (documentId: string, pageIds: number[]) => {
      observed.push({ action: "reorder_pages", documentId, pageIds });
      return { ok: true };
    },
    deletePage: async (documentId: string, pageId: number) => {
      observed.push({ action: "delete_page", documentId, pageId });
      return { ok: true };
    },
    deletePageWidget: async (
      documentId: string,
      pageId: number,
      widgetId: number
    ) => {
      observed.push({ action: "delete_widget", documentId, pageId, widgetId });
      return { ok: true };
    }
  });
  const ui = registrations.find((entry) => entry.name === "grist_change_ui");
  assert.ok(ui);

  await ui.callback({
    action: "reorder_pages",
    documentId: "doc-1",
    pageIds: [4, 1, 2, 3]
  });
  await ui.callback({
    action: "delete_widget",
    documentId: "doc-1",
    pageId: 3,
    widgetId: 9
  });
  await ui.callback({
    action: "delete_page",
    documentId: "doc-1",
    pageId: 3
  });

  assert.equal(registrations.length, 10);
  assert.deepEqual(observed, [
    {
      action: "reorder_pages",
      documentId: "doc-1",
      pageIds: [4, 1, 2, 3]
    },
    { action: "delete_widget", documentId: "doc-1", pageId: 3, widgetId: 9 },
    { action: "delete_page", documentId: "doc-1", pageId: 3 }
  ]);
});

test("lean help discloses only the lean public contract", async () => {
  const registrations = capture();
  const help = registrations.find((entry) => entry.name === "grist_help");
  assert.ok(help);

  const result = await help.callback({ tools: ["grist_query", "grist_add_records"] });
  assert.equal(result.isError, undefined);
  const payload = JSON.parse(result.content[0].text);
  assert.deepEqual(
    payload.tools.map((entry: { name: string }) => entry.name),
    ["grist_query", "grist_add_records"]
  );
  assert.ok(payload.concepts.includes("change_ui"));
});
