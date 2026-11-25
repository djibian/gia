import assert from "node:assert/strict";
import { test } from "node:test";
import {
  planColumnFormulaReplacement, verifyColumnFormulaReplacement
} from "../src/grist/columnFormulaReplacement.js";

const before = {
  columns: [
    { id: "Code", fields: { colRef: 1, type: "Text", isFormula: false, label: "Code" } },
    { id: "Calculated", fields: {
      colRef: 2, type: "Text", isFormula: true, formula: "$Code", label: "Display"
    } },
    { id: "Unrelated", fields: {
      colRef: 3, type: "Int", isFormula: true, formula: "1", widgetOptions: "{}"
    } }
  ]
};
const changed = {
  columns: before.columns.map(column => column.id === "Calculated"
    ? { ...column, fields: { ...column.fields, formula: '$Code + "!"' } }
    : column)
};

test("replacement verifies existing formula, exact persisted value and untouched columns", () => {
  assert.deepEqual(planColumnFormulaReplacement(before, "Calculated", "$Code", 10),
    { changed: false });
  assert.deepEqual(planColumnFormulaReplacement(before, "Calculated", '$Code + "!"', 10),
    { changed: true });
  verifyColumnFormulaReplacement(before, changed, "Calculated", '$Code + "!"', 10);
  assert.deepEqual(planColumnFormulaReplacement(changed, "Calculated", '$Code + "!"', 10),
    { changed: false });
});

test("formula replacement rejects unsafe targets, incomplete reads and invalid formulas", () => {
  assert.throws(() => planColumnFormulaReplacement(before, "Code", "1", 10));
  assert.throws(() => planColumnFormulaReplacement(before, "Missing", "1", 10));
  assert.throws(() => planColumnFormulaReplacement(before, "Calculated", "", 10));
  assert.throws(() => planColumnFormulaReplacement(before, "Calculated", "\u0000", 10));
  assert.throws(() => planColumnFormulaReplacement(before, "Calculated", "x", 3));
  assert.throws(() => planColumnFormulaReplacement({
    columns: [...before.columns, before.columns[0]]
  }, "Calculated", "x", 10));
});

test("postcondition rejects changed unrelated schema, refs, formulas and non-effect", () => {
  assert.throws(() => verifyColumnFormulaReplacement(before, before,
    "Calculated", '$Code + "!"', 10));
  assert.throws(() => verifyColumnFormulaReplacement(before, {
    columns: changed.columns.map(column => column.id === "Unrelated"
      ? { ...column, fields: { ...column.fields, formula: "2" } } : column)
  }, "Calculated", '$Code + "!"', 10));
  assert.throws(() => verifyColumnFormulaReplacement(before, {
    columns: changed.columns.map(column => column.id === "Calculated"
      ? { ...column, fields: { ...column.fields, colRef: 99 } } : column)
  }, "Calculated", '$Code + "!"', 10));
});

const trigger = (deps: unknown = ["L", 1], extra: Record<string, unknown> = {}) => ({
  columns: [...before.columns, {id: "Trigger", fields: {
    colRef: 4, type: "Text", isFormula: false, formula: "$Code",
    recalcWhen: 0, recalcDeps: deps, ...extra
  }}]
});

test("explicit trigger formula replacement preserves supported DEFAULT ownership and dependency", () => {
  for (const deps of [null, ["L", 1]]) {
    const source = trigger(deps);
    const dest = trigger(deps, {formula: '$Code + "!"'});
    assert.deepEqual(planColumnFormulaReplacement(source, "Trigger", '$Code + "!"', 10, "trigger"),
      {changed: true});
    verifyColumnFormulaReplacement(source, dest, "Trigger", '$Code + "!"', 10, "trigger");
    assert.deepEqual(planColumnFormulaReplacement(dest, "Trigger", '$Code + "!"', 10, "trigger"),
      {changed: false});
    assert.throws(() => planColumnFormulaReplacement(source, "Trigger", "1", 10));
  }
  assert.deepEqual(planColumnFormulaReplacement(trigger(null, {type: "Choice"}), "Trigger",
    "'New'", 10, "trigger"), {changed: true});
});

test("trigger replacement fails closed on ordinary data, calculated columns and unsupported native dependencies", () => {
  for (const raw of [trigger(["L", 99]), trigger(["L", 4]), trigger(["L", 1, 2]),
    trigger(undefined, {recalcDeps: undefined}), trigger(null, {recalcWhen: 1}),
    trigger(null, {type: "Numeric"}), trigger(null, {formula: ""})]) {
    assert.throws(() => planColumnFormulaReplacement(raw, "Trigger", "1", 10, "trigger"));
  }
  assert.throws(() => planColumnFormulaReplacement(before, "Code", "1", 10, "trigger"));
  assert.throws(() => planColumnFormulaReplacement(before, "Calculated", "1", 10, "trigger"));
  assert.throws(() => verifyColumnFormulaReplacement(trigger(), trigger(null, {formula: "1"}),
    "Trigger", "1", 10, "trigger"));
});
