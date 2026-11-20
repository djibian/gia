import assert from "node:assert/strict";
import test from "node:test";

test("public discovery rejects ambiguous table identities and column IDs", () => {
  const table = { id: "Items", fields: { tableRef: 1 } };
  assert.throws(() => projectPublicTables({ tables: [table, { ...table, id: "Other" }] }), /Ambiguous/);
  assert.throws(() => projectPublicTables({ tables: [table, { ...table, fields: { tableRef: 2 } }] }), /Ambiguous/);
  assert.throws(() => projectPublicColumns({ columns: [{ id: "Name", fields: {} }, { id: "Name", fields: {} }] }), /Ambiguous/);
});

import {
  projectPublicColumns,
  projectPublicPage,
  projectPublicWidget,
  projectPublicTables
} from "../src/grist/publicMetadata.js";
import type { GristPage, GristPageWidget } from "../src/grist/documentUi.js";

test("table projection resolves summary source IDs without exposing numeric refs", () => {
  const projected = projectPublicTables({
    tables: [
      {
        id: "Source",
        fields: { tableRef: 7, onDemand: false, primaryViewId: 42 }
      },
      {
        id: "Source_summary_State",
        fields: { tableRef: 8, summarySourceTable: 7, rawViewSectionRef: 99 }
      }
    ]
  });

  assert.deepEqual(projected, {
    tables: [
      { id: "Source", fields: { onDemand: false, isSummary: false } },
      {
        id: "Source_summary_State",
        fields: { isSummary: true, summarySourceTableId: "Source" }
      }
    ]
  });
  assert.equal(JSON.stringify(projected).includes("tableRef"), false);
  assert.equal(JSON.stringify(projected).includes("primaryViewId"), false);
  assert.equal(JSON.stringify(projected).includes("rawViewSectionRef"), false);
});

test("column projection keeps functional schema metadata and drops engine metadata", () => {
  const projected = projectPublicColumns({
    columns: [
      {
        id: "Computed",
        fields: {
          colRef: 17,
          parentId: 2,
          parentPos: 3,
          label: "Computed",
          type: "Numeric",
          isFormula: true,
          formula: "$Amount * 2",
          description: "Derived amount",
          widgetOptions: "{\"numMode\":\"decimal\"}",
          displayCol: 18,
          visibleCol: 19,
          rules: ["L", 20],
          recalcWhen: 2,
          recalcDeps: ["L", 11]
        }
      }
    ]
  });

  assert.deepEqual(projected, {
    columns: [
      {
        id: "Computed",
        fields: {
          label: "Computed",
          type: "Numeric",
          isFormula: true,
          formula: "$Amount * 2",
          description: "Derived amount",
          widgetOptions: "{\"numMode\":\"decimal\"}",
          conditionalStyleRules: { status: "protected" }
        }
      }
    ]
  });
});

test("custom widget inspection distinguishes supported, opaque and incomplete native configuration", () => {
  const base: GristPageWidget = {
    id: 9, pageId: 3, tableRef: 1, tableId: "Items", type: "custom",
    title: "Widget", customWidgetSettings: {
      access: "read table", widgetId: "@example/widget", columnsMapping: { title: "Name" }
    }
  };
  const settings = {
    access: "read table", widgetId: "@example/widget", columnsMapping: { title: 11 }
  };
  const supported = projectPublicWidget({
    ...base, options: { customView: settings }
  });
  assert.deepEqual(supported.customWidgetConfiguration, { status: "supported" });

  const secret = "synthetic-private-custom-widget-option";
  for (const options of [
    { customView: { ...settings, widgetOptions: { private: secret } } },
    { customView: { ...settings, url: "https://example.invalid/" + secret } },
    { customView: settings, futureNativeOption: secret }
  ]) {
    const projected = projectPublicWidget({ ...base, options });
    assert.deepEqual(projected.customWidgetConfiguration, { status: "protected" });
    assert.equal(projected.compatibilityMetadataOmitted, true);
    assert.doesNotMatch(JSON.stringify(projected), new RegExp(secret));
    assert.deepEqual(projected.customWidgetSettings, base.customWidgetSettings);
  }

  for (const widget of [
    { ...base, options: { customView: "not-json" }, customWidgetSettingsNormalizationIncomplete: true as const },
    { ...base, options: { customView: settings }, customWidgetSettingsNormalizationIncomplete: true as const },
    { ...base, options: undefined }
  ]) {
    assert.deepEqual(projectPublicWidget(widget).customWidgetConfiguration, {
      status: "incomplete"
    });
  }
  assert.equal(projectPublicWidget({ ...base, type: "record" }).customWidgetConfiguration, undefined);
});

test("conditional styles are signaled without exporting private helper references", () => {
  const project = (rules: unknown) => projectPublicColumns({
    columns: [{ id: "Name", fields: { type: "Text", rules } }]
  });
  assert.deepEqual(project(["L"]), {
    columns: [{ id: "Name", fields: { type: "Text" } }]
  });
  assert.deepEqual(project(["L", 20, 21]), {
    columns: [{ id: "Name", fields: { type: "Text",
      conditionalStyleRules: { status: "protected" } } }]
  });
  for (const malformed of [
    null, false, "synthetic-private-rule", [], ["L", 0],
    ["L", -2], ["L", "synthetic-private-rule"], ["L", 7, 7],
    ["L", ...Array.from({ length: 33 }, (_, i) => i + 1)]
  ]) {
    const result = project(malformed);
    assert.deepEqual(result, {
      columns: [{ id: "Name", fields: { type: "Text",
        conditionalStyleRules: { status: "incomplete" } } }]
    });
    assert.doesNotMatch(JSON.stringify(result), /synthetic-private-rule/);
  }
  const expanded = projectPublicTables({ tables: [{
    id: "Data", fields: { tableRef: 1 }, columns: [
      { id: "Name", fields: { colRef: 2, rules: ["L", 19] } }
    ]
  }] });
  assert.deepEqual(expanded, { tables: [{
    id: "Data", fields: { isSummary: false }, columns: [
      { id: "Name", fields: { conditionalStyleRules: { status: "protected" } } }
    ]
  }] });
});

test("unexpected upstream metadata shapes fail closed", () => {
  assert.throws(() => projectPublicTables({ tables: [{ fields: {} }] }), /table metadata shape/);
  assert.throws(() => projectPublicColumns({ columns: [{ id: "A" }] }), /column metadata shape/);
  assert.throws(() => projectPublicTables({ nope: [] }), /table metadata response shape/);
  assert.throws(() => projectPublicColumns({ nope: [] }), /column metadata response shape/);
});

test("legacy numeric UI layouts remain available but arbitrary layout metadata is omitted", () => {
  const safeLayout = {
    children: [{ leaf: 21, size: 60 }, { children: [{ leaf: 22 }] }],
    collapsed: [{ leaf: 23 }]
  };
  const widget: GristPageWidget = {
    id: 21, pageId: 7, tableRef: 2, type: "single", title: "Card",
    layoutSpec: safeLayout,
    sortColRefs: [11, "-12:emptyLast;naturalSort"]
  };
  const page: GristPage = {
    id: 7, pageRecordId: 12, name: "Page", type: "empty", indentation: 0,
    layoutSpec: safeLayout, widgets: [widget]
  };
  assert.deepEqual(projectPublicPage(page).layoutSpec, safeLayout);
  assert.deepEqual(projectPublicWidget(widget).layoutSpec, safeLayout);
  assert.deepEqual(projectPublicWidget(widget).sortColRefs, widget.sortColRefs);

  const raw = { ...safeLayout, privateUrl: "https://example.invalid/?LinkKey=synthetic-secret" };
  for (const projected of [
    projectPublicPage({ ...page, layoutSpec: raw }),
    projectPublicWidget({ ...widget, layoutSpec: raw }),
    projectPublicWidget({ ...widget, layoutSpec: { leaf: "synthetic-secret" } }),
    projectPublicWidget({ ...widget, sortColRefs: ["synthetic-secret"] })
  ]) {
    assert.equal(JSON.stringify(projected).includes("synthetic-secret"), false);
    assert.equal(projected.compatibilityMetadataOmitted, true);
  }
  assert.equal(raw.privateUrl.includes("synthetic-secret"), true);
});
