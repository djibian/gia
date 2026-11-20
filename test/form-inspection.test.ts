import assert from "node:assert/strict";
import test from "node:test";

import { DocumentUiService } from "../src/grist/documentUi.js";

const service = new DocumentUiService();

function fixture() {
  const layout = {
    type: "Layout", id: "native-root", submitText: "Envoyer", successText: "Merci",
    children: [
      { type: "Paragraph", text: "Prénom et classe", alignment: "center" },
      { type: "Section", children: [{ type: "Field", leaf: 91 }, { type: "Field", leaf: 92 }] },
      { type: "Submit" }
    ]
  };
  const tables = { tables: [
    { id: "Students", fields: { tableRef: 10 }, columns: [
      { id: "Name", fields: { colRef: 12, widgetOptions: '{"formRequired":true,"question":"Prénom"}' } },
      { id: "Class", fields: { colRef: 13, widgetOptions: '{"formAcceptFromUrl":true,"dropdownCondition":{"text":"synthetic"}}' } }
    ] },
    { id: "Other", fields: { tableRef: 11 }, columns: [{ id: "Name", fields: { colRef: 14 } }] }
  ] };
  const fields = { records: [
    { id: 91, fields: { parentId: 8, colRef: 12, parentPos: 1, widgetOptions: '{"formRequired":false,"question":"Ton prénom"}' } },
    { id: 92, fields: { parentId: 8, colRef: 13, parentPos: 2, widgetOptions: "" } }
  ] };
  const section = {
    parentId: 7, tableRef: 10, parentKey: "form", options: "",
    shareOptions: '{"form":true,"publish":true}', layoutSpec: ""
  };
  const inspect = () => {
    section.layoutSpec = JSON.stringify(layout);
    const ui = service.build("synthetic", tables,
      { records: [{ id: 3, fields: { viewRef: 7 } }] },
      { records: [{ id: 7, fields: { name: "Application" } }] },
      { records: [
        { id: 8, fields: section },
        { id: 9, fields: { parentId: 7, tableRef: 11, parentKey: "record" } }
      ] }, fields);
    return service.getPageWidgets(ui, 7, tables, fields) as {
      widgets: Array<{ id: number; form?: Record<string, unknown> }>;
    };
  };
  return { layout, fields, section, tables, inspect };
}

test("page widget inspection projects native form layout with stable field IDs and option origins", () => {
  const { inspect, tables } = fixture();
  Object.assign(tables.tables[0]!.columns[0]!.fields, { isFormula: true, formula: "" });
  const [form, grid] = inspect().widgets;
  assert.equal(grid?.id, 9);
  assert.equal(grid?.form, undefined);
  assert.deepEqual(form?.form, {
    status: "protected", sectionPublicationIntent: "requested", publicationQualification: "not_tested",
    tableId: "Students", submission: { submitText: "Envoyer", successText: "Merci" },
    layout: { type: "layout", children: [
      { type: "paragraph", text: "Prénom et classe", alignment: "center" },
      { type: "section", children: [
        { type: "field", columnId: "Name", columnOptions: { required: true, question: "Prénom" },
          fieldOptions: { required: false, question: "Ton prénom" } },
        { type: "field", columnId: "Class", columnOptions: { acceptFromUrl: true },
          fieldOptions: {}, dropdownConditionConfigured: true }
      ] },
      { type: "submit" }
    ] }
  });
});

test("form inspection omits URLs, link-bearing prose and raw private options", () => {
  const { layout, section, fields, inspect } = fixture();
  Object.assign(layout, {
    successURL: "https://example.test/?token=synthetic-private-marker",
    successText: "[Suivant](/forms?token=synthetic-private-marker)"
  });
  section.shareOptions = '{"form":true,"publish":true,"linkId":"synthetic-private-marker"}';
  fields.records[1]!.fields.widgetOptions = '{"custom":"synthetic-private-marker","question":"https://example.test/synthetic-private-marker"}';
  const result = inspect();
  assert.equal(result.widgets[0]?.form?.status, "protected");
  assert.deepEqual(result.widgets[0]?.form?.submission, {
    submitText: "Envoyer", successText: { protected: true }, successUrlConfigured: true
  });
  assert.doesNotMatch(JSON.stringify(result), /synthetic-private-marker|native-root|shareOptions/);
});

test("form inspection marks unsupported and unresolved layouts incomplete without guessing field IDs", () => {
  for (const damage of [
    ({ fields }: ReturnType<typeof fixture>) => fields.records.pop(),
    ({ fields }: ReturnType<typeof fixture>) => fields.records.push(fields.records[0]!),
    ({ fields }: ReturnType<typeof fixture>) => { fields.records[0]!.fields.colRef = 14; },
    ({ layout }: ReturnType<typeof fixture>) => { layout.children[0]!.type = "Unsupported"; },
    ({ layout }: ReturnType<typeof fixture>) => { layout.children[1]!.children![1]!.leaf = 91; },
    ({ tables }: ReturnType<typeof fixture>) => {
      Object.assign(tables.tables[0]!.columns[0]!.fields, { isFormula: true, formula: "1 + 1" });
    }
  ]) {
    const app = fixture();
    damage(app);
    const form = app.inspect().widgets[0]?.form;
    assert.equal(form?.status, "incomplete");
    assert.equal(form?.layout, undefined);
    assert.equal(form?.publicationQualification, "not_tested");
  }
});

test("configured dropdown predicates are protected until a typed projection exists", () => {
  const { inspect, tables } = fixture();
  const field = tables.tables[0]!.columns[1]!.fields;
  const secret = "synthetic-private-predicate";
  field.widgetOptions = JSON.stringify({
    formAcceptFromUrl: true,
    dropdownCondition: { text: `choice.Name == "${secret}"` }
  });
  const inspected = inspect().widgets[0]?.form;
  assert.equal(inspected?.status, "protected");
  assert.deepEqual((inspected?.layout as any).children[1].children[1], {
    type: "field", columnId: "Class", columnOptions: { acceptFromUrl: true },
    fieldOptions: {}, dropdownConditionConfigured: true
  });
  assert.doesNotMatch(JSON.stringify(inspected), /synthetic-private-predicate/);

  field.widgetOptions = '{"formAcceptFromUrl":true}';
  const withoutCondition = inspect().widgets[0]?.form;
  assert.equal(withoutCondition?.status, "supported");
  assert.doesNotMatch(JSON.stringify(withoutCondition), /dropdownConditionConfigured/);
});

test("malformed native dropdown predicates cannot be mistaken for an absent condition", () => {
  for (const malformed of [
    null, false, "secret", {}, { text: "" }, { text: 5 },
    { text: "choice.Name == True", parsed: 123 },
    { text: "x".repeat(2049) }
  ]) {
    const { inspect, tables } = fixture();
    tables.tables[0]!.columns[1]!.fields.widgetOptions =
      JSON.stringify({ dropdownCondition: malformed });
    const form = inspect().widgets[0]?.form;
    assert.equal(form?.status, "incomplete");
    assert.equal(form?.layout, undefined);
  }
});

test("unknown native form field options are protected at both column and field origin", () => {
  const secret = "synthetic-private-unprojected-form-option";
  for (const origin of ["column", "field"] as const) {
    const { tables, fields, inspect } = fixture();
    tables.tables[0]!.columns[1]!.fields.widgetOptions = '{"formAcceptFromUrl":true}';
    const baseline = inspect().widgets[0]?.form;
    assert.equal(baseline?.status, "supported");

    if (origin === "column") {
      const native = tables.tables[0]!.columns[1]!.fields;
      native.widgetOptions = JSON.stringify({
        ...JSON.parse(native.widgetOptions), futureNativeFormOption: secret
      });
    } else {
      const native = fields.records[0]!.fields;
      native.widgetOptions = JSON.stringify({
        ...JSON.parse(native.widgetOptions), futureNativeFormOption: secret
      });
    }

    const form = inspect().widgets[0]?.form;
    assert.equal(form?.status, "protected");
    assert.deepEqual(form?.layout, baseline?.layout);
    assert.deepEqual(form?.submission, baseline?.submission);
    assert.doesNotMatch(JSON.stringify(form), /synthetic-private-unprojected-form-option/);
  }
});

test("unknown native form layout properties are protected and never returned as reconstructible", () => {
  const secret = "synthetic-private-opaque-form-property";
  const inject = [
    (layout: ReturnType<typeof fixture>["layout"]) => Object.assign(layout, { nativeTheme: secret }),
    (layout: ReturnType<typeof fixture>["layout"]) => Object.assign(layout.children[0]!, { nativeRichText: secret }),
    (layout: ReturnType<typeof fixture>["layout"]) => Object.assign(layout.children[1]!, { nativeSectionLayout: secret }),
    (layout: ReturnType<typeof fixture>["layout"]) =>
      Object.assign(layout.children[1]!.children![0]!, { nativeFieldPresentation: secret }),
    (layout: ReturnType<typeof fixture>["layout"]) => Object.assign(layout.children[2]!, { nativeSubmitStyle: secret })
  ];
  for (const addUnknown of inject) {
    const { layout, tables, inspect } = fixture();
    tables.tables[0]!.columns[1]!.fields.widgetOptions = '{"formAcceptFromUrl":true}';
    const baseline = inspect().widgets[0]?.form;
    assert.equal(baseline?.status, "supported");
    addUnknown(layout);
    const inspected = inspect().widgets[0]?.form;
    assert.equal(inspected?.status, "protected");
    assert.deepEqual(inspected?.layout, baseline?.layout);
    assert.doesNotMatch(JSON.stringify(inspected), /synthetic-private-opaque-form-property/);
  }
});
