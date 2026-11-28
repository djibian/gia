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
    ["grist_add_structure", { action: "create_tables", documentId: "doc-1", tables: [{ id: "Tasks", columns: [{ id: "Name" }], extra: true }] }],
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

function capture(grist: any = {}, limits = {
  maxReadRecords: 200, maxWriteRecords: 50, maxSchemaItems: 100
}): Registration[] {
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

  registerLeanTools(server, grist, limits);
  return registrations;
}

test("ACL inspection dispatches only an explicit closed policy-coverage request", async () => {
  const calls: unknown[] = [];
  const registration = capture({
    inspectAccessRules: async (...args: unknown[]) => { calls.push(args); return {}; }
  }).find((entry) => entry.name === "grist_inspect")!;
  const schema = registration.options.inputSchema!;
  const input = { action: "access_rules", documentId: "doc-1" };
  const policyCoverage = {
    target: { kind: "column", tableId: "Items", columnId: "Name" }, operation: "read",
    context: { role: "editor", linkKeys: [{ name: "Token", value: { kind: "symbol", symbol: "A" } }] }
  };
  await registration.callback(schema.parse(input));
  await registration.callback(schema.parse({ ...input, policyCoverage }));
  assert.deepEqual(calls, [
    ["doc-1", undefined, undefined, undefined],
    ["doc-1", undefined, undefined, policyCoverage]
  ]);
  assert.throws(() => schema.parse({ ...input, policyCoverage: { ...policyCoverage, operation: "schema" } }));
  assert.throws(() => schema.parse({ ...input, policyCoverage: { ...policyCoverage, formula: "opaque" } }));
  assert.throws(() => schema.parse({ ...input, policyCoverage: {
    ...policyCoverage, context: { linkKeys: [{ name: "Token", value: "literal-not-accepted" }] }
  } }));
});

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


test("selected help exposes usable current guides and real-schema-valid synthetic examples", async () => {
  const registrations = capture();
  const help = registrations.find((entry) => entry.name === "grist_help")!;
  const index = JSON.parse((await help.callback({})).content[0].text);
  assert.equal(index.contractVersion, "2");
  assert.equal(index.tools.length, 10);
  assert(index.tools.every((entry: any) => entry.guide === undefined));
  assert.equal(index.configuredLimits, undefined);

  const payload = JSON.parse((await help.callback({ tools: registrations.map((entry) => entry.name) }))
    .content[0].text);
  assert.deepEqual(payload.configuredLimits, {
    maxReadRecords: 200, maxWriteRecords: 50, maxSchemaItems: 100
  });
  assert.equal(payload.tools.length, 10);
  const minimumLimits = capture({}, { maxReadRecords: 1, maxWriteRecords: 1, maxSchemaItems: 1 });
  for (const entry of payload.tools) {
    assert(entry.guide?.request?.length > 0, `missing request for ${entry.name}`);
    assert(entry.guide?.constraints?.length > 0, `missing constraints for ${entry.name}`);
    assert(entry.guide?.examples?.length > 0, `missing examples for ${entry.name}`);
    const registered = registrations.find((tool) => tool.name === entry.name)!;
    for (const example of entry.guide.examples) {
      assert.equal(typeof example.purpose, "string");
      assert.deepEqual(registered.options.inputSchema!.parse(example.arguments), example.arguments,
        `stale advertised example in ${entry.name}: ${example.purpose}`);
      const minimumRegistration = minimumLimits.find((tool) => tool.name === entry.name)!;
      assert.deepEqual(minimumRegistration.options.inputSchema!.parse(example.arguments), example.arguments,
        `advertised example exceeds minimum deployment limits in ${entry.name}: ${example.purpose}`);
    }
  }
  const inspect = payload.tools.find((entry: any) => entry.name === "grist_inspect");
  assert(inspect.guide.request.some((value: string) => value.includes("schemaImpact")));
  assert(inspect.guide.examples.some((example: any) => example.arguments.simulation));
  const change = payload.tools.find((entry: any) => entry.name === "grist_change_structure");
  assert(change.guide.actions.includes("access_rule_group"));
  assert(change.guide.request.some((value: string) => value.includes("match_link_key")));
  assert(change.guide.examples.some((example: any) => example.arguments.target?.userAttributeName));
  const add = payload.tools.find((entry: any) => entry.name === "grist_add_structure");
  assert(add.guide.request.some((value: string) => value.includes("create_columns")));
  assert(add.guide.examples.some((example: any) => example.arguments.action === "copy_document_as_template"));
  assert(add.guide.actions.includes("copy_document"));
  assert(add.guide.examples.some((example: any) => example.arguments.action === "copy_document"));
  const ui = payload.tools.find((entry: any) => entry.name === "grist_change_ui");
  assert(ui.guide.constraints.some((value: string) =>
    /Omitting endDateColumnId, allDayColumnId or typeColumnId clears/.test(value)));
  const calendar = ui.guide.examples.find((example: any) => example.arguments.update?.calendarConfig);
  assert.deepEqual(calendar.arguments.update.calendarConfig, {
    titleColumnId: "Name", startDateColumnId: "Start", endDateColumnId: "End",
    allDayColumnId: "AllDay", typeColumnId: "Category"
  });
  const unknown = await help.callback({ tools: ["nonexistent_mcp_tool"] });
  assert.equal(unknown.isError, true);
  assert.doesNotMatch(JSON.stringify(payload), /private-token|example\\.com|sk-proj/i);
});

test("ACL MCP schema exposes only bounded LinkKey names", async () => {
  const observed: unknown[] = [];
  const registrations = capture({
    changeAccessRuleGroup: async (
      documentId: string,
      target: unknown,
      mode: string,
      rules: unknown
    ) => {
      observed.push({ documentId, target, mode, rules });
      return { ok: true };
    }
  });
  const tool = registrations.find((entry) => entry.name === "grist_change_structure")!;
  const valid = {
    action: "access_rule_group",
    documentId: "doc-1",
    mode: "create",
    target: { tableId: "Projects" },
    rules: [
      {
        condition: {
          kind: "match_link_key",
          operator: "equals",
          columnId: "ShareToken",
          linkKeyName: "StageToken"
        },
        permissions: { read: "allow", update: "unspecified" }
      }
    ]
  };
  await tool.callback(tool.options.inputSchema!.parse(valid));
  assert.equal(observed.length, 1);

  for (const linkKeyName of ["bad-name", "x".repeat(101)]) {
    assert.throws(
      () =>
        tool.options.inputSchema!.parse({
          ...valid,
          rules: [
            {
              ...valid.rules[0],
              condition: { ...valid.rules[0]!.condition, linkKeyName }
            }
          ]
        }),
      /LinkKey|Too big|100/i
    );
  }

  assert.throws(
    () =>
      tool.options.inputSchema!.parse({
        ...valid,
        rules: [
          {
            ...valid.rules[0],
            condition: {
              ...valid.rules[0]!.condition,
              linkKeyValue: "must-never-enter-the-contract"
            }
          }
        ]
      }),
    /Unrecognized key/i
  );
});


test("ACL MCP schema bounds finite composite conditions without free-form formulas", async () => {
  const registrations = capture({ changeAccessRuleGroup: async () => ({ ok: true }) });
  const tool = registrations.find((entry) => entry.name === "grist_change_structure")!;
  const leaf = { kind: "user_access", operator: "equals", role: "owner" };
  const base = {
    action: "access_rule_group",
    documentId: "doc-1",
    mode: "create",
    target: { tableId: "Projects" }
  };
  const parse = (condition: unknown) => tool.options.inputSchema!.parse({
    ...base,
    rules: [{
      condition,
      permissions: { read: "allow", update: "unspecified" }
    }]
  });
  assert.ok(parse({ kind: "all", conditions: [
    leaf,
    { kind: "not", condition: { kind: "match_link_key",
      operator: "equals", columnId: "ShareToken", linkKeyName: "StageToken" } }
  ] }));
  assert.throws(() => parse({
    kind: "any", conditions: [leaf]
  }), /Too small|2/i);
  assert.throws(() => parse({
    kind: "not", condition: { kind: "literal", value: "secret" }
  }), /Invalid|discriminator|kind/i);
  assert.throws(() => parse({
    kind: "all", aclFormula: "True", conditions: [leaf, leaf]
  }), /Unrecognized key/i);
  let tooDeep: unknown = leaf;
  for (let i = 0; i < 5; i++) {
    tooDeep = { kind: "not", condition: tooDeep };
  }
  assert.throws(() => parse(tooDeep));
});


test("ACL MCP schema accepts only explicit newRec on existing typed record matches", () => {
  const registrations = capture({ changeAccessRuleGroup: async () => ({ ok: true }) });
  const tool = registrations.find((entry) => entry.name === "grist_change_structure")!;
  const base = {
    action: "access_rule_group", documentId: "doc-1", mode: "create",
    target: { tableId: "Projects" }
  };
  const parse = (condition: unknown) => tool.options.inputSchema!.parse({
    ...base,
    rules: [{ condition, permissions: { read: "unspecified", update: "allow" } }]
  });
  assert.ok(parse({
    kind: "match_user", operator: "equals",
    record: "newRec", columnId: "OwnerEmail", userProperty: "Email"
  }));
  assert.ok(parse({
    kind: "match_link_key", operator: "equals",
    record: "newRec", columnId: "ShareToken", linkKeyName: "StageToken"
  }));
  assert.throws(() => parse({
    kind: "match_user", operator: "equals",
    record: "rec", columnId: "OwnerEmail", userProperty: "Email"
  }), /Invalid|literal|record/i);
  assert.throws(() => parse({
    kind: "match_link_key", operator: "equals",
    record: "other", columnId: "ShareToken", linkKeyName: "StageToken"
  }), /Invalid|literal|record/i);
  assert.throws(() => parse({
    kind: "match_link_key", operator: "equals",
    record: "newRec", columnId: "ShareToken", linkKeyName: "StageToken",
    value: "secret"
  }), /Unrecognized key/i);
});


test("ACL MCP schema exposes a strict, finite column_change leaf without raw record operands", () => {
  const registrations = capture({ changeAccessRuleGroup: async () => ({ ok: true }) });
  const tool = registrations.find((entry) => entry.name === "grist_change_structure")!;
  const base = {
    action: "access_rule_group", documentId: "doc-1", mode: "create",
    target: { tableId: "Projects" }
  };
  const parse = (condition: unknown) => tool.options.inputSchema!.parse({
    ...base,
    rules: [{
      condition, permissions: { read: "unspecified", update: "allow" }
    }]
  });
  const changed = { kind: "column_change", operator: "not_equals", columnId: "Status" };
  assert.ok(parse(changed));
  assert.ok(parse({ kind: "not", condition: changed }));
  for (const rejected of [
    { ...changed, record: "newRec" },
    { ...changed, columnId: "Status", value: "secret" },
    { ...changed, nativeFormula: "rec.Status != newRec.Status" },
    { ...changed, operator: "greater_than" },
    { ...changed, columnId: "" }
  ]) assert.throws(() => parse(rejected));
});

test("ACL MCP schema accepts only Bool values in bounded literal predicates", () => {
  const registrations = capture({ changeAccessRuleGroup: async () => ({ ok: true }) });
  const tool = registrations.find((entry) => entry.name === "grist_change_structure")!;
  const base = { action: "access_rule_group", documentId: "doc-1", mode: "create",
    target: { tableId: "Projects" } };
  const parse = (condition: unknown) => tool.options.inputSchema!.parse({
    ...base, rules: [{ condition, permissions: { read: "unspecified", update: "allow" } }]
  });
  const bool = { kind: "match_boolean", operator: "equals", columnId: "Enabled", value: true };
  assert.ok(parse(bool));
  assert.ok(parse({ ...bool, value: false, record: "newRec" }));
  assert.ok(parse({ kind: "not", condition: bool }));
  for (const invalid of [
    { ...bool, value: "True" },
    { ...bool, value: 1 },
    { ...bool, value: "private-token" },
    { ...bool, record: "rec" },
    { ...bool, record: "other" },
    { ...bool, aclFormula: "rec.Enabled == True" },
    { ...bool, columnId: "" },
    { ...bool, operator: "in" }
  ]) assert.throws(() => parse(invalid));
});


test("ACL MCP role membership is an exact finite built-in role set", () => {
  const registrations = capture({ changeAccessRuleGroup: async () => ({ ok: true }) });
  const tool = registrations.find((entry) => entry.name === "grist_change_structure")!;
  const parse = (condition: unknown) => tool.options.inputSchema!.parse({
    action: "access_rule_group", documentId: "doc-1", mode: "create",
    target: { tableId: "Projects" },
    rules: [{ condition, permissions: { read: "deny", update: "unspecified" } }]
  });
  const roles = { kind: "user_access_membership", operator: "in",
    roles: ["viewer", "editor"] };
  assert.ok(parse(roles));
  assert.ok(parse({ ...roles, operator: "not_in", roles: ["owner", "editor", "viewer"] }));
  assert.ok(parse({ kind: "not", condition: roles }));
  for (const rejected of [
    { ...roles, roles: ["owner"] },
    { ...roles, roles: [] },
    { ...roles, roles: ["viewer", "viewer"] },
    { ...roles, roles: ["owner", "admin"] },
    { ...roles, roles: ["owner", "editor", "viewer", "editor"] },
    { ...roles, roles: "viewer, editor" },
    { ...roles, operator: "contains" },
    { ...roles, aclFormula: "user.Access in [OWNER, EDITOR]" },
    { ...roles, value: "secret" }
  ]) assert.throws(() => parse(rejected));
});


test("ACL MCP user login status accepts only closed boolean login predicates", () => {
  const registrations = capture({ changeAccessRuleGroup: async () => ({ ok: true }) });
  const tool = registrations.find((entry) => entry.name === "grist_change_structure")!;
  const parse = (condition: unknown) => tool.options.inputSchema!.parse({
    action: "access_rule_group", documentId: "doc-1", mode: "create",
    target: { tableId: "Projects" },
    rules: [{ condition, permissions: { read: "deny", update: "unspecified" } }]
  });
  const login = { kind: "user_login_status", operator: "equals", value: true };
  assert.ok(parse(login));
  assert.ok(parse({ ...login, operator: "not_equals", value: false }));
  assert.ok(parse({ kind: "not", condition: login }));
  for (const bad of [
    { ...login, value: "True" },
    { ...login, value: "private-token" },
    { ...login, value: 1 },
    { ...login, operator: "in" },
    { ...login, userProperty: "SessionID" },
    { ...login, linkKeyName: "Secret" },
    { ...login, aclFormula: "user.IsLoggedIn == True" },
    { ...login, record: "newRec" }
  ]) assert.throws(() => parse(bad));
});

test("ACL MCP typed integer flags admit only zero/one on stable columns", () => {
  const registrations = capture({ changeAccessRuleGroup: async () => ({ ok: true }) });
  const tool = registrations.find((entry) => entry.name === "grist_change_structure")!;
  const parse = (condition: unknown) => tool.options.inputSchema!.parse({
    action: "access_rule_group", documentId: "doc-1", mode: "create",
    target: { tableId: "Projects" },
    rules: [{ condition, permissions: { read: "unspecified", update: "deny" } }]
  });
  const flag = { kind: "match_integer_flag", operator: "equals", columnId: "UserId", value: 0 };
  assert.ok(parse(flag));
  assert.ok(parse({ ...flag, operator: "not_equals", value: 1, record: "newRec" }));
  assert.ok(parse({ kind: "not", condition: flag }));
  for (const invalid of [
    { ...flag, value: -1 }, { ...flag, value: 2 },
    { ...flag, value: 0.5 }, { ...flag, value: "0" },
    { ...flag, value: "private-token" }, { ...flag, value: true },
    { ...flag, operator: "in" }, { ...flag, columnId: "" },
    { ...flag, record: "rec" }, { ...flag, record: "other" },
    { ...flag, aclFormula: "rec.UserId == 0" }, { ...flag, linkKeyName: "Secret" }
  ]) assert.throws(() => parse(invalid));
});

test("ACL MCP empty-text check accepts no model-facing literal content", () => {
  const registrations = capture({ changeAccessRuleGroup: async () => ({ ok: true }) });
  const tool = registrations.find((entry) => entry.name === "grist_change_structure")!;
  const parse = (condition: unknown) => tool.options.inputSchema!.parse({
    action: "access_rule_group", documentId: "doc-1", mode: "create",
    target: { tableId: "Projects" },
    rules: [{ condition, permissions: { read: "unspecified", update: "deny" } }]
  });
  const empty = { kind: "match_empty_text", operator: "equals", columnId: "OwnerEmail" };
  assert.ok(parse(empty));
  assert.ok(parse({ ...empty, operator: "not_equals", record: "newRec" }));
  assert.ok(parse({ kind: "not", condition: empty }));
  for (const invalid of [
    { ...empty, value: "" }, { ...empty, value: "private-token" },
    { ...empty, literal: "" }, { ...empty, aclFormula: "rec.OwnerEmail == ''" },
    { ...empty, operator: "in" }, { ...empty, columnId: "" },
    { ...empty, record: "rec" }, { ...empty, record: "other" },
    { ...empty, linkKeyName: "Secret" }
  ]) assert.throws(() => parse(invalid));
});

test("user-attribute mutations reuse the typed access_rule_group entry point", async () => {
  const observed: unknown[] = [];
  const registrations = capture({
    changeAccessRuleGroup: async (...args: unknown[]) => {
      observed.push(args);
      return { persistedDefinitionVerified: true };
    }
  });
  const tool = registrations.find(entry => entry.name === "grist_change_structure")!;
  const base = { action: "access_rule_group", documentId: "doc-1",
    mode: "create", target: { userAttributeName: "StageAccess" },
    definition: { tableId: "Projects", lookupColId: "ShareToken",
      source: { kind: "link_key", name: "StageToken" } } };
  const input = tool.options.inputSchema!.parse(base);
  await tool.callback(input);
  assert.equal(observed.length, 1);
  assert.deepEqual((observed[0] as unknown[])[4], base.definition);
  for (const forbidden of [
    { ...base, definition: { ...base.definition,
      source: { kind: "link_key", name: "bad-name" } } },
    { ...base, definition: { ...base.definition, charId: "PRIVATE" } },
    { ...base, definition: { ...base.definition,
      source: { kind: "literal", value: "PRIVATE" } } },
    { ...base, target: { ...base.target, linkKeyValue: "PRIVATE" } },
    { ...base, aclFormula: "True" },
    { ...base, target: { userAttributeName: "bad-name" } }
  ]) assert.throws(() => tool.options.inputSchema!.parse(forbidden));
  assert.ok(tool.options.inputSchema!.parse({
    ...base, mode: "delete", definition: undefined
  }));
});


test("typed ACL user-attribute references carry identifiers only, never row values or formulas", async () => {
  const recorded: unknown[] = [];
  const registrations = capture({
    changeAccessRuleGroup: async (...args: unknown[]) => {
      recorded.push(args);
      return { persistedDefinitionVerified: true, effectiveEnforcementVerified: false };
    }
  });
  const tool = registrations.find(item => item.name === "grist_change_structure")!;
  const condition = { kind: "match_user_attribute", operator: "equals",
    columnId: "OwnerEmail", attributeName: "Mentor", attributeColumnId: "OwnerEmail" };
  const base = {
    action: "access_rule_group", documentId: "doc-1", mode: "create",
    target: { tableId: "Projects" },
    rules: [{ condition, permissions: { read: "allow", update: "unspecified" } }]
  };
  const parsed = tool.options.inputSchema!.parse(base);
  await tool.callback(parsed);
  assert.equal(recorded.length, 1);
  assert.deepEqual((recorded[0] as any[])[3], base.rules);
  for (const forbidden of [
    { ...condition, attributeName: "Mentor.Name/Secret" },
    { ...condition, attributeColumnId: "Role.Email" },
    { ...condition, linkKeyValue: "PRIVATE" },
    { ...condition, attributeValue: "PRIVATE" },
    { ...condition, rawFormula: "user.Mentor.Role == 'PRIVATE'" },
    { ...condition, record: "oldRec" },
    { ...condition, operator: "contains" },
    { ...condition, attributeName: "x".repeat(101) }
  ]) {
    assert.throws(() => tool.options.inputSchema!.parse({
      ...base, rules: [{ ...base.rules[0], condition: forbidden }]
    }));
  }
  assert.ok(tool.options.inputSchema!.parse({
    ...base, rules: [{ ...base.rules[0],
      condition: { ...condition, record: "newRec" } }]
  }));
});

test("create_tables schema refuses missing or empty column arrays", () => {
  const registration = capture().find((entry) => entry.name === "grist_add_structure")!;
  const input = { action: "create_tables", documentId: "doc-1" };
  assert.throws(() => registration.options.inputSchema!.parse({ ...input, tables: [{ id: "Missing" }] }));
  assert.throws(() => registration.options.inputSchema!.parse({ ...input, tables: [{ id: "Empty", columns: [] }] }));
  assert.deepEqual(registration.options.inputSchema!.parse({
    ...input, tables: [{ id: "Valid", columns: [{ id: "Name" }] }]
  }).tables, [{ id: "Valid", columns: [{ id: "Name" }] }]);
});

test("create_tables and create_columns reject ignored metadata before dispatch", () => {
  const add = capture().find((entry) => entry.name === "grist_add_structure")!;
  const change = capture().find((entry) => entry.name === "grist_change_structure")!;
  const effective = { type: "Text", label: "Short name", isFormula: false, formula: "", widgetOptions: "{}" };
  const valid = { id: "Name", fields: effective };
  const common = { documentId: "doc-1" };
  const table = (column: unknown) => ({ ...common, action: "create_tables", tables: [{ id: "People", columns: [column] }] });
  const column = (item: unknown) => ({ ...common, action: "create_columns", tableId: "People", columns: [item] });
  assert.deepEqual(add.options.inputSchema!.parse(table(valid)).tables[0].columns[0], valid);
  assert.deepEqual(add.options.inputSchema!.parse(column(valid)).columns[0], valid);
  for (const metadata of [{ description: "Ignored" }, { visibleColumnId: "Display" }]) {
    for (const request of [table({ ...valid, fields: { ...effective, ...metadata } }),
      column({ ...valid, fields: { ...effective, ...metadata } })]) {
      assert.throws(() => add.options.inputSchema!.parse(request));
    }
  }
  const update = {
    ...common, action: "update_columns", tableId: "People",
    columns: [{ id: "Name", fields: { description: "Updated", visibleColumnId: "Display" } }]
  };
  assert.deepEqual(change.options.inputSchema!.parse(update).columns, update.columns);
});

test("ACL schema advertises compact shared finite definitions and retains depth/strictness", () => {
  const tool = capture().find((entry) => entry.name === "grist_change_structure")!;
  const json = z.toJSONSchema(tool.options.inputSchema as z.ZodType, { io: "input" });
  const bytes = Buffer.byteLength(JSON.stringify(json), "utf8");
  // Was ~471 KB at this tool alone. Budget retains headroom for other actions.
  assert(bytes < 60_000, `ACL tool schema expanded to ${bytes} bytes`);
  const refs = new Set<string>();
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
    } else if (item !== null && typeof item === "object") {
      for (const [key, value] of Object.entries(item)) {
        if (key === "$ref") {
          assert.equal(typeof value, "string");
          refs.add(value as string);
        } else {
          visit(value);
        }
      }
    }
  };
  visit(json);
  assert(refs.size > 0, "shared ACL condition depths must have local refs");
  for (const ref of refs) {
    assert(ref.startsWith("#/$defs/"), `external or nonlocal schema reference: ${ref}`);
    const id = ref.slice("#/$defs/".length).replace(/~1/g, "/").replace(/~0/g, "~");
    assert(Object.hasOwn((json as { $defs?: Record<string, unknown> }).$defs ?? {}, id),
      `unresolved MCP reference ${ref}`);
  }

  const base = { action: "access_rule_group", documentId: "doc-1", mode: "create",
    target: { tableId: "Projects" } };
  const leaf = { kind: "match_link_key", operator: "equals", columnId: "Token",
    linkKeyName: "StageToken" };
  let deepest: unknown = leaf;
  for (let depth = 0; depth < 4; depth++) deepest = { kind: "not", condition: deepest };
  const parse = (condition: unknown) => tool.options.inputSchema!.parse({
    ...base, rules: [{ condition, permissions: { read: "unspecified", update: "allow" } }]
  });
  assert.ok(parse(deepest));
  assert.throws(() => parse({ kind: "not", condition: deepest }));
  assert.throws(() => parse({ kind: "any", conditions: [leaf] }));
  assert.throws(() => parse({ kind: "not", condition: { ...leaf, linkKeyValue: "SECRET" } }));
});

test("local ACL patch accepts a typed expected rule and permissions, not native selectors", async () => {
  const observed: unknown[][] = [];
  const tool = capture({patchAccessRule: async (...args: unknown[]) => {
    observed.push(args);
    return {changed: true};
  }}).find(entry => entry.name === "grist_change_structure")!;
  const input = {action: "patch_access_rule_permissions", documentId: "doc-1",
    target: {tableId: "Projects"},
    expected: {condition: {kind: "user_access", operator: "equals", role: "viewer"},
      permissions: {read: "allow", update: "unspecified"}},
    permissions: {read: "deny", update: "unspecified"}};
  await tool.callback(tool.options.inputSchema!.parse(input));
  assert.deepEqual(observed, [[input.documentId, input.target, input.expected, {permissions: input.permissions}]]);
  assert.throws(() => tool.options.inputSchema!.parse({...input, ruleId: 1}));
  assert.throws(() => tool.options.inputSchema!.parse({...input, target: {userAttributeName: "Mentor"}}));
  assert.throws(() => tool.options.inputSchema!.parse({...input, permissions: {...input.permissions, schema: "allow"}}));
  const {permissions, ...rest} = input;
  const conditionInput = {...rest, action: "patch_access_rule_condition",
    condition: {kind: "user_access", operator: "equals", role: "editor"}};
  await tool.callback(tool.options.inputSchema!.parse(conditionInput));
  assert.deepEqual(observed[1], [input.documentId, input.target, input.expected, {condition: conditionInput.condition}]);
  assert.throws(() => tool.options.inputSchema!.parse({...conditionInput, permissions}));
  assert.throws(() => tool.options.inputSchema!.parse({...conditionInput, condition: "user.Access == EDITOR"}));
  const swapInput = {...rest, action: "swap_access_rule_order",
    swapWith: {...input.expected, condition: conditionInput.condition}};
  await tool.callback(tool.options.inputSchema!.parse(swapInput));
  assert.deepEqual(observed[2], [input.documentId, input.target, input.expected, {swapWith: swapInput.swapWith}]);
  assert.throws(() => tool.options.inputSchema!.parse({...swapInput, rulePos: 3}));
  assert.throws(() => tool.options.inputSchema!.parse({...swapInput, swapWith: {ruleId: 3}}));
});
