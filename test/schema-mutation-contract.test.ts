import assert from "node:assert/strict";
import test from "node:test";

import {
  columnMutationFieldsSchema,
  tableMutationFieldsSchema
} from "../src/operations/schemaMutationContract.js";

test("column mutation fields accept only the stable public semantic allowlist", () => {
  const accepted = {
    label: "Amount",
    type: "Numeric",
    isFormula: true,
    formula: "$Price * $Quantity",
    description: "Computed amount",
    widgetOptions: "{}"
  };

  assert.deepEqual(columnMutationFieldsSchema.parse(accepted), accepted);
  assert.equal(
    columnMutationFieldsSchema.safeParse({ ...accepted, visibleCol: 17 }).success,
    false
  );
  assert.equal(
    columnMutationFieldsSchema.safeParse({ enginePrivateField: 42 }).success,
    false
  );
});

test("table mutation fields accept only tableId and onDemand", () => {
  const accepted = { tableId: "Renamed", onDemand: true };

  assert.deepEqual(tableMutationFieldsSchema.parse(accepted), accepted);
  assert.equal(
    tableMutationFieldsSchema.safeParse({ ...accepted, summarySourceTable: 7 }).success,
    false
  );
  assert.equal(
    tableMutationFieldsSchema.safeParse({ tableId: "" }).success,
    false
  );
});
