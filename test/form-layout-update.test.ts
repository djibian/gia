import assert from "node:assert/strict";
import test from "node:test";
import { resolveFormLayoutUpdate, type FormLayoutInput } from "../src/grist/formLayout.js";

const tables = { tables: [{ id: "People", fields: { tableRef: 10 }, columns: [
  { id: "Name", fields: { colRef: 11, isFormula: false } },
  { id: "Class", fields: { colRef: 12, isFormula: false } },
  { id: "Computed", fields: { colRef: 13, isFormula: true, formula: "1+1" } }
] }] };
const fields = { records: [
  { id: 77, fields: { parentId: 5, colRef: 11, parentPos: 1, width: 0 } },
  { id: 78, fields: { parentId: 5, colRef: 12, parentPos: 2, width: 0 } },
  { id: 79, fields: { parentId: 5, colRef: 13, parentPos: 3, width: 0 } }
] };
const widget = (layoutSpec?: unknown) => ({ id: 5, tableRef: 10, tableId: "People",
  ...(layoutSpec !== undefined ? { layoutSpec } : {}) });
const requested: FormLayoutInput = {
  submitText: "Envoyer", successText: "Merci", anotherResponse: false,
  children: [
    { type: "paragraph", text: "Application" },
    { type: "section", children: [
      { type: "paragraph", text: "Votre profil" }, { type: "field", columnId: "Name" },
      { type: "field", columnId: "Class" }
    ] },
    { type: "submit" }
  ]
};

test("Form layout resolves stable column IDs to private native section field IDs", () => {
  const result = resolveFormLayoutUpdate(widget(), tables, fields, requested);
  assert.deepEqual(result.layoutSpec, {
    id: "gia_root", type: "Layout", submitText: "Envoyer",
    successText: "Merci", anotherResponse: false, children: [
      { id: "gia_paragraph_0", type: "Paragraph", text: "Application", alignment: "left" },
      { id: "gia_section_1", type: "Section", children: [
        { id: "gia_paragraph_1_0", type: "Paragraph", text: "Votre profil", alignment: "left" },
        { id: "gia_field_77", type: "Field", leaf: 77 },
        { id: "gia_field_78", type: "Field", leaf: 78 }
      ] }, { id: "gia_submit", type: "Submit" }
    ]
  });
  assert.deepEqual(resolveFormLayoutUpdate(widget(result.layoutSpec), tables, fields, requested).layoutSpec,
    result.layoutSpec);
});

test("Form layout preserves omitted submission settings and uses IDs compatible with native reconciliation", () => {
  const first = resolveFormLayoutUpdate(widget(), tables, fields, requested).layoutSpec;
  const layout: FormLayoutInput = { children: [requested.children[1]!, requested.children[0]!,
    requested.children[2]!] };
  const second = resolveFormLayoutUpdate(widget({ ...first, id: "native-root" }), tables, fields, layout).layoutSpec;
  assert.equal(second.id, "native-root");
  assert.equal(second.submitText, "Envoyer");
  assert.equal(second.successText, "Merci");
  assert.equal(second.anotherResponse, false);
  const previousNodes = first.children as { id: string }[];
  const currentNodes = second.children as { id: string }[];
  assert.notEqual(currentNodes[0]?.id, previousNodes[0]?.id);
  assert.notEqual(currentNodes[1]?.id, previousNodes[1]?.id);
  assert.deepEqual(resolveFormLayoutUpdate(widget(second), tables, fields, layout).layoutSpec, second);
});

test("Typed Form links require confirmation and a verified private native share path", () => {
  const link = {type:"form_link" as const,label:"Second step",targetPageId:9,targetWidgetId:17};
  const layout: FormLayoutInput = { children:[link,requested.children[1]!,{type:"submit"}],
    confirmPublicLink:true };
  const paths = new Map([["9:17","/forms/syntheticShareKey/17"]]);
  const resolved = resolveFormLayoutUpdate(widget(),tables,fields,layout,paths);
  assert.equal((resolved.layoutSpec.children as Array<{text?:string}>)[0]?.text,
    "[Second step](/forms/syntheticShareKey/17)");
  assert.deepEqual(resolveFormLayoutUpdate(widget(resolved.layoutSpec),tables,fields,layout,paths).layoutSpec,
    resolved.layoutSpec);
  assert.throws(()=>resolveFormLayoutUpdate(widget(),tables,fields,
    {...layout,confirmPublicLink:undefined},paths),/confirmPublicLink/);
  assert.throws(()=>resolveFormLayoutUpdate(widget(),tables,fields,layout),/not resolved/);
  assert.throws(()=>resolveFormLayoutUpdate(widget(),tables,fields,layout,
    new Map([["9:17","https://untrusted.invalid/"]])));
  assert.throws(()=>resolveFormLayoutUpdate(widget(),tables,fields,{
    ...layout,children:[{...link,label:"https://unsafe.invalid"},requested.children[1]!,{type:"submit"}]
  },paths));
});

test("Form layout refuses unknown, duplicate or computed fields and absent submit", () => {
  for (const bad of [
    [{ type: "section", children: [{ type: "field", columnId: "Unknown" }] }, { type: "submit" }],
    [{ type: "section", children: [{ type: "field", columnId: "Computed" }] }, { type: "submit" }],
    [{ type: "section", children: [{ type: "field", columnId: "Name" },
      { type: "field", columnId: "Name" }] }, { type: "submit" }],
    [{ type: "section", children: [{ type: "field", columnId: "Name" }] }]
  ]) {
    assert.throws(() => resolveFormLayoutUpdate(widget(), tables, fields,
      { children: bad } as FormLayoutInput));
  }
  assert.throws(() => resolveFormLayoutUpdate(widget(), tables, { records: [] }, requested));
  assert.throws(() => resolveFormLayoutUpdate(widget(), tables, fields,
    { ...requested, successText: "https://example.test/?key=token" }));
});

test("Form layout refuses to destroy protected/opaque pre-existing native settings", () => {
  for (const layoutSpec of [
    { type: "Layout", children: [], successURL: "https://example.test/" },
    { type: "Layout", children: [], unknown: 7 },
    { type: "Layout", children: [{ type: "FutureWidget" }] },
    { type: "Layout", children: [{ type: "Field", leaf: 123456 }] },
    "{malformed-json"
  ]) {
    assert.throws(() => resolveFormLayoutUpdate(widget(layoutSpec), tables, fields, requested));
  }
});
