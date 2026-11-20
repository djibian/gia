import assert from "node:assert/strict";
import test from "node:test";
import { planConfiguredColumns } from "../src/grist/configuredColumns.js";

const existingColumn = (id: string, colRef: number, type: string) => ({ id, fields: { colRef, type } });
const placements = { id: "Placements", fields: { tableRef: 1 }, columns: [
  existingColumn("Class", 11, "Ref:Classes"), existingColumn("Eligible", 12, "RefList:Mentors")
] };
const mentors = { id: "Mentors", fields: { tableRef: 2 }, columns: [
  existingColumn("Class", 21, "Ref:Classes"), existingColumn("Status", 22, "Choice")
] };
const classes = { id: "Classes", fields: { tableRef: 3 }, columns: [] };
const metadata = { tables: [placements, mentors, classes] };
const configured = { id: "Preferred", fields: { type: "Ref:Mentors" }, configuration: {
  form: { question: "Preferred mentor", required: true, acceptFromUrl: false },
  dropdownCondition: { kind: "choice_field_equals_literal", choiceColumnId: "Status", value: 'validé "ici"' }
} };

test("configured columns keep supported form flags and render a closed native predicate", () => {
  const [planned] = planConfiguredColumns(metadata, "Placements", [configured]);
  const options = JSON.parse(String(planned?.fields?.widgetOptions));
  assert.equal(options.question, "Preferred mentor");
  assert.equal(options.formRequired, true);
  assert.equal(options.formAcceptFromUrl, false);
  assert.equal(options.dropdownCondition.text, 'choice.Status == "validé \\"ici\\""');
  assert.deepEqual(JSON.parse(options.dropdownCondition.parsed), ["Eq", ["Attr", ["Name", "choice"], "Status"],
    ["Const", 'validé "ici"']]);
});

test("configured column replay skips exact existing columns and refuses a conflict before any write", () => {
  const [planned] = planConfiguredColumns(metadata, "Placements", [configured]);
  const created = { id: "Preferred", fields: { colRef: 13, ...planned?.fields } };
  const withCreated = { tables: [{ ...placements, columns: [...placements.columns, created] }, mentors, classes] };
  assert.deepEqual(planConfiguredColumns(withCreated, "Placements", [configured]), []);
  const other = { ...configured, id: "Second" };
  assert.deepEqual(planConfiguredColumns(withCreated, "Placements", [configured, other]).map(column => column.id),
    ["Second"]);
  assert.throws(() => planConfiguredColumns(withCreated, "Placements", [other, {
    ...configured, configuration: { form: { required: false } }
  }]), /different configuration/);
});

test("configured columns reject unavailable and incompatible reference operands", () => {
  const request = { ...configured, configuration: { dropdownCondition: {
    kind: "choice_field_equals_record_ref", choiceColumnId: "Class", recordColumnId: "Eligible"
  } } };
  assert.throws(() => planConfiguredColumns(metadata, "Placements", [request]), /same table/);
  assert.throws(() => planConfiguredColumns({ tables: [placements] }, "Placements", [configured]), /incomplete/);
  assert.throws(() => planConfiguredColumns(metadata, "Placements", [configured, { id: "Ordinary" }]), /homogeneous/);
});
