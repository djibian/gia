import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SUMMARY_GROUP_BY_COLUMNS,
  findSummaryTableRef,
  resolveSummaryCreationPlan,
  verifySummaryCreation,
  withNativeSummaryColumns
} from "../src/grist/summaryTables.js";

const metadata = {
  tables: [
    {
      id: "Orders",
      fields: { tableRef: 2, summarySourceTable: 0 },
      columns: [
        { id: "Region", fields: { colRef: 11, type: "Text" } },
        { id: "Status", fields: { colRef: 12, type: "Choice" } },
        { id: "Amount", fields: { colRef: 13, type: "Numeric" } }
      ]
    },
    {
      id: "Orders_summary_Region_Status",
      fields: { tableRef: 4, summarySourceTable: 2 },
      columns: [
        { id: "Region", fields: { colRef: 31, type: "Text", summarySourceCol: 11 } },
        { id: "Status", fields: { colRef: 32, type: "Choice", summarySourceCol: 12 } },
        { id: "count", fields: { colRef: 33, type: "Int", summarySourceCol: 0 } }
      ]
    }
  ]
};

test("summary plan resolves stable source column IDs to private Grist refs", () => {
  assert.deepEqual(resolveSummaryCreationPlan(metadata, "Orders", ["Region", "Status"]), {
    sourceTableId: "Orders",
    sourceTableRef: 2,
    groupByColumnIds: ["Region", "Status"],
    groupByColumnRefs: [11, 12]
  });
});

test("summary verification proves source table and exact group-by membership", () => {
  const plan = resolveSummaryCreationPlan(metadata, "Orders", ["Status", "Region"]);
  assert.deepEqual(verifySummaryCreation(metadata, plan, 4), {
    sourceTableId: "Orders",
    summaryTableId: "Orders_summary_Region_Status",
    groupByColumnIds: ["Status", "Region"]
  });
});

test("summary planning rejects generated summary sources and ambiguous group lists", () => {
  assert.throws(
    () => resolveSummaryCreationPlan(metadata, "Orders_summary_Region_Status", ["Region"]),
    /already a generated summary table/
  );
  assert.throws(
    () => resolveSummaryCreationPlan(metadata, "Orders", ["Region", "Region"]),
    /duplicated/
  );
  assert.throws(
    () => resolveSummaryCreationPlan(metadata, "Orders", ["Missing"]),
    /does not exist/
  );
});

test("summary planning enforces its independent group-by bound", () => {
  const ids = Array.from(
    { length: MAX_SUMMARY_GROUP_BY_COLUMNS + 1 },
    (_, index) => `C${index}`
  );
  assert.throws(() => resolveSummaryCreationPlan(metadata, "Orders", ids), /at most/);
});

test("native hidden grouping cannot be mistaken for a grand total", () => {
  const visible = {
    tables: [metadata.tables[0]!, {
      id: "Orders_summary_Manual", fields: { tableRef: 4, summarySourceTable: 2 },
      columns: [{ id: "count", fields: { colRef: 33, summarySourceCol: 0 } }]
    }]
  };
  const records = visible.tables.flatMap(table => table.columns.map(column => ({
    id: column.fields.colRef,
    fields: { summarySourceCol: 0, ...column.fields, parentId: table.fields.tableRef, colId: column.id }
  })));
  const hiddenRecords = [
    { id: 14, fields: { colId: "manualSort", parentId: 2, colRef: 14, summarySourceCol: 0 } },
    { id: 34, fields: { colId: "gristHelper_Key", parentId: 4, colRef: 34, summarySourceCol: 14 } }
  ];
  const complete = withNativeSummaryColumns(visible, { records: [...records, ...hiddenRecords] }, 20);
  const grandTotal = resolveSummaryCreationPlan(visible, "Orders", []);
  assert.equal(findSummaryTableRef(complete, grandTotal), undefined);
  assert.throws(() => withNativeSummaryColumns(visible, {
    records: [...records, { id: 34, fields: { colId: "", parentId: 0 } }]
  }, 20), /incomplete or ambiguous/);
});
