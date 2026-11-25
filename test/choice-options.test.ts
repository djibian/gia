import assert from "node:assert/strict";
import test from "node:test";
import { planAppendChoiceOptions, planReorderChoiceOptions, planSetChoiceColors, readChoiceColumnState } from "../src/grist/choiceOptions.js";

const snapshot = (type = "Choice", widgetOptions = JSON.stringify({
  choices: ["validé"], choiceOptions: { "validé": { fillColor: "#12AB34" } },
  formRequired: true, custom: { protected: "preserved" }
}), isFormula = false) => ({ columns: [
  { id: "Status", fields: { type, isFormula, ...(isFormula ? {formula: "$Other"} : {}), widgetOptions } },
  { id: "Name", fields: { type: "Text", isFormula: false, widgetOptions: "" } }
] });

test("append native Choice labels without modifying existing colors or Form options", () => {
  const before = readChoiceColumnState(snapshot(), "Status", 50);
  const plan = planAppendChoiceOptions(before, ["en attente", "validé", "refusé"]);
  assert.equal(plan.changed, true);
  assert.deepEqual(plan.choices, ["validé", "en attente", "refusé"]);
  assert.deepEqual(plan.options.choiceOptions, before.options.choiceOptions);
  assert.equal(plan.options.formRequired, true);
  assert.deepEqual(plan.options.custom, { protected: "preserved" });
  const reread = readChoiceColumnState(snapshot("Choice", plan.widgetOptions), "Status", 50);
  assert.equal(planAppendChoiceOptions(reread, ["en attente", "validé", "refusé"]).changed, false);
});

test("Choice and ChoiceList formulas are supported; Text or incomplete metadata is refused", () => {
  assert.equal(readChoiceColumnState(snapshot("ChoiceList", ""), "Status", 50).type, "ChoiceList");
  assert.throws(() => readChoiceColumnState(snapshot("Text"), "Status", 50), /Choice or ChoiceList/);
  for (const type of ["Choice", "ChoiceList"]) {
    const before = readChoiceColumnState(snapshot(type, "{}", true), "Status", 50);
    assert.equal(before.metadata.formula, "$Other");
    const appended = planAppendChoiceOptions(before, ["validé", "refusé"]);
    const after = readChoiceColumnState(snapshot(type, appended.widgetOptions, true), "Status", 50);
    assert.deepEqual(after.metadata, before.metadata);
    assert.equal(planSetChoiceColors(after, "validé", {textColor: "#12AB34"}).changed, true);
    assert.equal(planReorderChoiceOptions(after, ["refusé", "validé"]).changed, true);
  }
  assert.throws(() => readChoiceColumnState({columns: [{id:"Status",
    fields:{type:"Choice",isFormula:true,widgetOptions:"{}"}}]}, "Status", 50), /complete formula metadata/);
  assert.throws(() => readChoiceColumnState(snapshot("Choice", '{"choices":["x","x"]}'), "Status", 50), /ambiguous/);
  assert.throws(() => readChoiceColumnState(snapshot("Choice", '{"choices":null}'), "Status", 50), /malformed/);
  assert.throws(() => readChoiceColumnState({ columns: [] }, "Status", 50), /absent/);
  assert.throws(() => readChoiceColumnState(snapshot("Choice"), "Status", 2), /truncated/);
});

test("invalid requests and overfull choice sets fail before any write", () => {
  const before = readChoiceColumnState(snapshot("Choice", ""), "Status", 50);
  for (const input of [[], ["x","x"], [" x"], ["x\n"], [""]]) {
    assert.throws(() => planAppendChoiceOptions(before, input), /unique|plain text/);
  }
  const full = readChoiceColumnState(snapshot("Choice",
    JSON.stringify({ choices: Array.from({length:64}, (_, i) => "Label"+i) })), "Status", 50);
  assert.throws(() => planAppendChoiceOptions(full, ["new"]), /64/);
});


test("set native Choice colors on an existing label without losing siblings", () => {
  const before = readChoiceColumnState(snapshot(), "Status", 50);
  const plan = planSetChoiceColors(before, "validé", { textColor: "#FFFFFF" });
  assert.equal(plan.changed, true);
  assert.deepEqual(plan.options.choiceOptions, { "validé": {
    fillColor: "#12AB34", textColor: "#FFFFFF"
  } });
  assert.deepEqual(plan.options.choices, before.choices);
  assert.equal(plan.options.formRequired, true);
  assert.deepEqual(plan.options.custom, before.options.custom);
  const after = readChoiceColumnState(snapshot("Choice", plan.widgetOptions), "Status", 50);
  assert.equal(planSetChoiceColors(after, "validé", {textColor: "#FFFFFF"}).changed, false);
  assert.equal(planSetChoiceColors(after, "validé", {fillColor: "#ABCDEF"}).changed, true);
});

test("invalid choice colors and malformed native maps are refused", () => {
  const before = readChoiceColumnState(snapshot(), "Status", 50);
  assert.throws(() => planSetChoiceColors(before, "unknown", {fillColor:"#000000"}), /existing native choice/);
  assert.throws(() => planSetChoiceColors(before, "validé", {}), /#RRGGBB/);
  assert.throws(() => planSetChoiceColors(before, "validé", {fillColor:"#ZZZZZZ"}), /#RRGGBB/);
  assert.throws(() => planSetChoiceColors(before, "validé",
    {background:"unsafe"} as {fillColor?:string}), /#RRGGBB/);
  for (const raw of ['{"choices":["validé"],"choiceOptions":[]}',
    '{"choices":["validé"],"choiceOptions":{"validé":"not-an-object"}}',
    '{"choices":["validé"],"choiceOptions":{"validé":{"fillColor":"invalid"}}}']) {
    const malformed = readChoiceColumnState(snapshot("Choice", raw), "Status", 50);
    assert.throws(() => planSetChoiceColors(malformed, "validé", {textColor:"#FFFFFF"}), /malformed/);
  }
});

test("reorder exact native Choice and ChoiceList labels while retaining all options", () => {
  for (const type of ["Choice", "ChoiceList"]) {
    const original = readChoiceColumnState(snapshot(type, JSON.stringify({
      choices: ["validé", "en attente", "refusé"],
      choiceOptions: { "validé": { fillColor: "#12AB34" } },
      formRequired: true, custom: { protected: "preserved" }
    })), "Status", 50);
    const requested = ["refusé", "validé", "en attente"];
    const plan = planReorderChoiceOptions(original, requested);
    assert.equal(plan.changed, true);
    assert.deepEqual(plan.choices, requested);
    assert.deepEqual(plan.options.choiceOptions, original.options.choiceOptions);
    assert.deepEqual(plan.options.custom, original.options.custom);
    assert.equal(plan.options.formRequired, true);
    const persisted = readChoiceColumnState(snapshot(type, plan.widgetOptions), "Status", 50);
    assert.equal(planReorderChoiceOptions(persisted, requested).changed, false);
  }
});

test("choice reorder rejects omissions, insertions, collisions and malformed labels", () => {
  const original = readChoiceColumnState(snapshot("Choice", JSON.stringify({
    choices: ["validé", "en attente", "refusé"]
  })), "Status", 50);
  for (const attempt of [
    ["validé", "en attente"], ["validé", "en attente", "absent"],
    ["validé", "validé", "refusé"], ["validé", " en attente", "refusé"], []
  ]) {
    assert.throws(() => planReorderChoiceOptions(original, attempt), /complete unique existing label set/);
  }
  assert.equal(planReorderChoiceOptions(original, original.choices).changed, false);
});
