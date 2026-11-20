import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveExistingDropdownCondition
} from "../src/grist/configuredColumns.js";
import { planDropdownConditionUpdate } from "../src/grist/dropdownConditionUpdate.js";

const column = (id: string, colRef: number, type: string) => ({ id, fields: { colRef, type } });
const placements = { id: "Placements", fields: { tableRef: 1 }, columns: [
  column("Class", 11, "Ref:Classes"), column("Eligible", 12, "RefList:Mentors"),
  column("ActiveMentor", 13, "Ref:Mentors"), column("Text", 14, "Text")
] };
const mentors = { id: "Mentors", fields: { tableRef: 2 }, columns: [
  column("Class", 21, "Ref:Classes"), column("Status", 22, "Choice")
] };
const classes = { id: "Classes", fields: { tableRef: 3 }, columns: [] };
const metadata = { tables: [placements, mentors, classes] };

test("existing Ref predicate reuses closed native compiler and exact Grist operands", () => {
  const literal = resolveExistingDropdownCondition(metadata, "Placements", "ActiveMentor", {
    kind: "choice_field_equals_literal", choiceColumnId: "Status", value: "actif"
  });
  assert.equal(literal?.text, 'choice.Status == "actif"');
  assert.deepEqual(JSON.parse(literal?.parsed ?? ""), ["Eq",
    ["Attr", ["Name", "choice"], "Status"], ["Const", "actif"]]);

  const ref = resolveExistingDropdownCondition(metadata, "Placements", "ActiveMentor", {
    kind: "choice_field_equals_record_ref", choiceColumnId: "Class", recordColumnId: "Class"
  });
  assert.equal(ref?.text, "choice.Class == $Class");
  assert.deepEqual(JSON.parse(ref?.parsed ?? ""), ["Eq",
    ["Attr", ["Name", "choice"], "Class"], ["Attr", ["Name", "rec"], "Class"]]);

  const list = resolveExistingDropdownCondition(metadata, "Placements", "Eligible", {
    kind: "choice_id_in_record_reflist", recordColumnId: "Eligible"
  });
  assert.equal(list?.text, "choice.id in $Eligible");
  assert.equal(resolveExistingDropdownCondition(metadata, "Placements", "ActiveMentor", null), null);
});

test("existing dropdown mutation refuses unknown, non-reference and incompatible columns", () => {
  const good = { kind: "choice_field_equals_literal", choiceColumnId: "Status", value: "actif" };
  assert.throws(() => resolveExistingDropdownCondition(metadata, "Placements", "Text", good), /Ref or RefList/);
  assert.throws(() => resolveExistingDropdownCondition(metadata, "Placements", "Missing", good), /Ref or RefList/);
  assert.throws(() => resolveExistingDropdownCondition({ tables: [placements] }, "Placements",
    "ActiveMentor", good), /incomplete/);
  assert.throws(() => resolveExistingDropdownCondition(metadata, "Placements", "ActiveMentor", {
    kind: "choice_field_equals_record_ref", choiceColumnId: "Class", recordColumnId: "Eligible"
  }), /same table/);
  assert.throws(() => resolveExistingDropdownCondition(metadata, "Placements", "ActiveMentor", {
    kind: "choice_field_equals_literal", choiceColumnId: "Status", value: "https://example.test"
  }), /text|link/i);
});

test("dropdown condition patch preserves unrelated options, supports no-op and clear", () => {
  const current = resolveExistingDropdownCondition(metadata, "Placements", "ActiveMentor", {
    kind: "choice_field_equals_literal", choiceColumnId: "Status", value: "actif"
  });
  assert(current);
  const original = { question: "Mentor", formRequired: true,
    opaqueStyle: { custom: [1, true] }, dropdownCondition: current };
  const replay = planDropdownConditionUpdate(original, current);
  assert.equal(replay.changed, false);
  const cleared = planDropdownConditionUpdate(original, null);
  assert.equal(cleared.changed, true);
  assert.deepEqual(JSON.parse(cleared.widgetOptions), {
    question: "Mentor", formRequired: true, opaqueStyle: { custom: [1, true] }
  });
  assert.deepEqual(original.dropdownCondition, current);
  const replacement = planDropdownConditionUpdate(cleared.options, current);
  assert.equal(replacement.changed, true);
  assert.deepEqual(replacement.options, original);
});

test("dropdown mutation refuses malformed or over-budget persisted conditions", () => {
  assert.throws(() => planDropdownConditionUpdate(
    { dropdownCondition: { text: "", parsed: "[]" } }, null), /malformed/);
  assert.throws(() => planDropdownConditionUpdate(
    { dropdownCondition: { text: "choice.id == 1", parsed: 23 } }, null), /malformed/);
  assert.throws(() => planDropdownConditionUpdate(
    { hidden: "x".repeat(16_384) }, { text: "choice.id == 1", parsed: "[]" }
  ), /bound/);
});
