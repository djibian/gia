import assert from "node:assert/strict";
import test from "node:test";
import { planAppendChoiceOptions, readChoiceColumnState } from "../src/grist/choiceOptions.js";

const snapshot = (type = "Choice", widgetOptions = JSON.stringify({
  choices: ["validé"], choiceOptions: { "validé": { fillColor: "#12AB34" } },
  formRequired: true, custom: { protected: "preserved" }
}), isFormula = false) => ({ columns: [
  { id: "Status", fields: { type, isFormula, widgetOptions } },
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

test("ChoiceList is supported but a Text/formula column or malformed metadata is refused", () => {
  assert.equal(readChoiceColumnState(snapshot("ChoiceList", ""), "Status", 50).type, "ChoiceList");
  assert.throws(() => readChoiceColumnState(snapshot("Text"), "Status", 50), /Choice or ChoiceList/);
  assert.throws(() => readChoiceColumnState(snapshot("Choice", "{}", true), "Status", 50), /non-formula/);
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
