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
