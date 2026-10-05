import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CUSTOM_WIDGET_MAPPING_KEYS,
  normalizeCustomWidgetSettings
} from "../src/grist/customWidgetSettings.js";
import { DocumentUiService } from "../src/grist/documentUi.js";

const expandedTables = {
  tables: [
    {
      id: "People",
      fields: { tableRef: 1 },
      columns: [
        { id: "Name", fields: { colRef: 11, type: "Text" } },
        { id: "Email", fields: { colRef: 12, type: "Text" } },
        { id: "Tags", fields: { colRef: 13, type: "ChoiceList" } }
      ]
    }
  ]
};

test("custom mapping inspection marks ambiguous or conflicting table/column identities incomplete", () => {
  const table = expandedTables.tables[0]!;
  for (const metadata of [
    { tables: [{ ...table, columns: [...table.columns, { id: "Other", fields: { colRef: 11, type: "Text" } }] }] },
    { tables: [{ ...table, columns: [...table.columns, { id: "Name", fields: { colRef: 99, type: "Text" } }] }] },
    { tables: [{ ...table, columns: [...table.columns, null] }] },
    { tables: [table, { ...table, id: "Other" }] },
    { tables: [{ ...table, fields: { tableRef: 99 } }] }
  ]) {
    const result = normalizeCustomWidgetSettings({ type: "custom", tableId: "People", tableRef: 1, options: { customView: { columnsMapping: { title: 11 } } } }, metadata);
    assert.equal(result?.customWidgetSettingsNormalizationIncomplete, true);
    assert.equal(result?.customWidgetSettings?.columnsMapping, null);
  }
});

test("normalizes custom widget access and column mappings to stable column IDs", () => {
  const result = normalizeCustomWidgetSettings(
    {
      type: "custom",
      tableId: "People",
      tableRef: 1,
      options: {
        customView: {
          mode: "url",
          url: "https://widget.example.invalid/private-path",
          widgetId: "@example/people-widget",
          access: "read table",
          pluginId: "internal-plugin-id",
          columnsMapping: {
            title: 11,
            extras: [12, 13],
            optional: null
          }
        }
      }
    },
    expandedTables
  );

  assert.deepEqual(result, {
    customWidgetSettings: {
      access: "read table",
      widgetId: "@example/people-widget",
      columnsMapping: {
        extras: ["Email", "Tags"],
        optional: null,
        title: "Name"
      }
    }
  });
  const normalized = JSON.stringify(result);
  assert.equal(normalized.includes("widget.example.invalid"), false);
  assert.equal(normalized.includes("internal-plugin-id"), false);
  assert.equal(normalized.includes('"11"'), false);
});

test("normalizes native blank access to none", () => {
  assert.deepEqual(
    normalizeCustomWidgetSettings(
      {
        type: "custom",
        tableRef: 1,
        options: { customView: { access: "", columnsMapping: null } }
      },
      expandedTables
    ),
    {
      customWidgetSettings: {
        access: "none",
        columnsMapping: null
      }
    }
  );
});

test("native encoded settings and proven blank options normalize without guessing missing state", () => {
  const widget = { type: "custom", tableRef: 1 };
  for (const options of [{}, { customView: "" }, { customView: "{}" }]) {
    assert.deepEqual(normalizeCustomWidgetSettings({ ...widget, options }, expandedTables), {
      customWidgetSettings: { access: "none", columnsMapping: null }
    });
  }
  const encoded = { customView: JSON.stringify({ access: "read table", columnsMapping: { title: 11 }, url: "private-sentinel" }) };
  assert.deepEqual(normalizeCustomWidgetSettings({ ...widget, options: encoded }, expandedTables), {
    customWidgetSettings: { access: "read table", columnsMapping: { title: "Name" } }
  });
  for (const options of [undefined, null, "broken", { customView: "broken" }, { customView: "null" }, { customView: [] }]) {
    assert.deepEqual(normalizeCustomWidgetSettings({ ...widget, options }, expandedTables), { customWidgetSettingsNormalizationIncomplete: true });
  }
  const build = (rawOptions: unknown) => new DocumentUiService().build("doc-1", expandedTables,
    { records: [{ id: 1, fields: { viewRef: 101, indentation: 0, pagePos: 1 } }] },
    { records: [{ id: 101, fields: { name: "Custom" } }] },
    { records: [{ id: 201, fields: { parentId: 101, tableRef: 1, parentKey: "custom", options: rawOptions } }] });
  assert.deepEqual(build("").pages[0]!.widgets[0]!.customWidgetSettings, { access: "none", columnsMapping: null });
  for (const raw of [undefined, null, "broken", "null", "[]", 0]) {
    assert.equal(build(raw).pages[0]!.widgets[0]!.customWidgetSettingsNormalizationIncomplete, true);
  }
});

test("drops unresolved mapping entries and marks incomplete without leaking refs", () => {
  const result = normalizeCustomWidgetSettings(
    {
      type: "custom",
      tableId: "People",
      tableRef: 1,
      options: {
        customView: {
          access: "full",
          columnsMapping: {
            good: 11,
            stale: 999,
            duplicateList: [12, 12],
            invalid: "11"
          }
        }
      }
    },
    expandedTables
  );

  assert.deepEqual(result, {
    customWidgetSettings: {
      access: "full",
      columnsMapping: { good: "Name" }
    },
    customWidgetSettingsNormalizationIncomplete: true
  });
  const normalized = JSON.stringify(result);
  assert.equal(normalized.includes("999"), false);
  assert.equal(normalized.includes('"11"'), false);
});

test("persisted prototype mapping keys are explicitly incomplete rather than silently lost", () => {
  const result = normalizeCustomWidgetSettings({
    type: "custom", tableId: "People", tableRef: 1,
    options: { customView: { columnsMapping: JSON.parse('{"__proto__":11,"constructor":12,"toString":11}') } }
  }, expandedTables);
  assert.equal(result?.customWidgetSettingsNormalizationIncomplete, true);
  assert.deepEqual(result?.customWidgetSettings?.columnsMapping, { constructor: "Email", toString: "Name" });
});

test("bounds mapping keys and ignores legacy calendar alias", () => {
  const columnsMapping = Object.fromEntries(
    Array.from({ length: MAX_CUSTOM_WIDGET_MAPPING_KEYS + 5 }, (_, index) => [
      `slot${index}`,
      11
    ])
  );
  const result = normalizeCustomWidgetSettings(
    {
      type: "custom",
      tableId: "People",
      tableRef: 1,
      options: { customView: { access: "none", columnsMapping } }
    },
    expandedTables
  );

  assert.equal(
    Object.keys(result?.customWidgetSettings?.columnsMapping ?? {}).length,
    MAX_CUSTOM_WIDGET_MAPPING_KEYS
  );
  assert.equal(result?.customWidgetSettingsNormalizationIncomplete, true);
  assert.equal(
    normalizeCustomWidgetSettings(
      {
        type: "custom.calendar",
        tableId: "People",
        tableRef: 1,
        options: { customView: { access: "full", columnsMapping: { title: 11 } } }
      },
      expandedTables
    ),
    undefined
  );
});

test("document UI exposes normalized custom settings with the existing output schema", () => {
  const ui = new DocumentUiService().build(
    "doc-1",
    expandedTables,
    { records: [{ id: 1, fields: { viewRef: 101, indentation: 0, pagePos: 1 } }] },
    { records: [{ id: 101, fields: { name: "Custom", type: "empty", layoutSpec: "" } }] },
    {
      records: [
        {
          id: 201,
          fields: {
            parentId: 101,
            tableRef: 1,
            parentKey: "custom",
            title: "People widget",
            options: JSON.stringify({
              customView: {
                mode: "url",
                url: "https://widget.example.invalid/secret",
                widgetId: "@example/people-widget",
                access: "read table",
                columnsMapping: { title: 11, extras: [12, 13] },
                widgetOptions: { arbitrary: "widget-owned" }
              }
            }),
            linkSrcSectionRef: 0,
            linkSrcColRef: 0,
            linkTargetColRef: 0
          }
        }
      ]
    }
  );

  const result = new DocumentUiService().getPageWidgets(ui, 101, expandedTables);
  assert.deepEqual(result.widgets[0]?.customWidgetSettings, {
    access: "read table",
    widgetId: "@example/people-widget",
    columnsMapping: {
      extras: ["Email", "Tags"],
      title: "Name"
    }
  });
  assert.equal(
    JSON.stringify(result.widgets[0]?.customWidgetSettings).includes("widget.example.invalid"),
    false
  );
  assert.equal(
    JSON.stringify(result.widgets[0]?.customWidgetSettings).includes("widget-owned"),
    false
  );
});
