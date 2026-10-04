type JsonRecord = Record<string, unknown>;

export const MAX_SUMMARY_GROUP_BY_COLUMNS = 20;
const MAX_SUMMARY_METADATA_TABLES = 5000;
const MAX_SUMMARY_METADATA_COLUMNS = 5000;

export interface SummaryCreationPlan {
  sourceTableId: string;
  sourceTableRef: number;
  groupByColumnIds: string[];
  groupByColumnRefs: number[];
}

export interface VerifiedSummaryCreation {
  sourceTableId: string;
  summaryTableId: string;
  groupByColumnIds: string[];
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function tables(tableResponse: unknown): JsonRecord[] {
  const root = record(tableResponse);
  if (!root || !Array.isArray(root.tables)) {
    throw new Error("Grist table metadata is unavailable; refusing summary construction.");
  }
  if (root.tables.length > MAX_SUMMARY_METADATA_TABLES) {
    throw new Error(
      `Grist exposes more than ${MAX_SUMMARY_METADATA_TABLES} tables; refusing ambiguous summary construction.`
    );
  }
  const result = root.tables.map(record);
  if (result.some((table) => table === null)) {
    throw new Error("Grist table metadata is malformed; refusing summary construction.");
  }
  return result as JsonRecord[];
}

function tableRef(table: JsonRecord): number | undefined {
  return positiveInteger(record(table.fields)?.tableRef);
}

function tableId(table: JsonRecord): string | undefined {
  return text(table.id);
}

function findTableById(source: JsonRecord[], id: string): JsonRecord | undefined {
  return source.find((table) => tableId(table) === id);
}

function findTableByRef(source: JsonRecord[], ref: number): JsonRecord | undefined {
  return source.find((table) => tableRef(table) === ref);
}

function columnMaps(table: JsonRecord): {
  byId: Map<string, number>;
  byRef: Map<number, string>;
} {
  if (!Array.isArray(table.columns)) {
    throw new Error("Expanded Grist column metadata is required for summary construction.");
  }
  if (table.columns.length > MAX_SUMMARY_METADATA_COLUMNS) {
    throw new Error(
      `Grist table exposes more than ${MAX_SUMMARY_METADATA_COLUMNS} columns; refusing ambiguous summary construction.`
    );
  }

  const byId = new Map<string, number>();
  const byRef = new Map<number, string>();
  for (const value of table.columns) {
    const column = record(value);
    const id = text(column?.id);
    const ref = positiveInteger(record(column?.fields)?.colRef);
    if (!id || !ref || byId.has(id) || byRef.has(ref)) {
      throw new Error("Grist column metadata is incomplete or ambiguous; refusing summary construction.");
    }
    byId.set(id, ref);
    byRef.set(ref, id);
  }
  return { byId, byRef };
}

export function resolveSummaryCreationPlan(
  tableResponse: unknown,
  sourceTableId: string,
  requestedGroupByColumnIds: readonly string[]
): SummaryCreationPlan {
  if (requestedGroupByColumnIds.length > MAX_SUMMARY_GROUP_BY_COLUMNS) {
    throw new Error(
      `Native summaries support at most ${MAX_SUMMARY_GROUP_BY_COLUMNS} group-by columns per widget.`
    );
  }

  const sourceTables = tables(tableResponse);
  const source = findTableById(sourceTables, sourceTableId);
  if (!source) {
    throw new Error(`Grist table "${sourceTableId}" does not exist.`);
  }
  const fields = record(source.fields);
  const sourceTableRef = tableRef(source);
  if (!fields || !sourceTableRef) {
    throw new Error(
      `Grist table "${sourceTableId}" lacks a stable internal table reference.`
    );
  }
  if (positiveInteger(fields.summarySourceTable)) {
    throw new Error(
      `Grist table "${sourceTableId}" is already a generated summary table; summarize its source table instead.`
    );
  }

  const { byId } = columnMaps(source);
  const seen = new Set<string>();
  const groupByColumnIds: string[] = [];
  const groupByColumnRefs: number[] = [];
  for (const value of requestedGroupByColumnIds) {
    const columnId = value.trim();
    if (!columnId) throw new Error("Summary group-by column ID must not be empty.");
    if (seen.has(columnId)) {
      throw new Error(`Summary group-by column "${columnId}" is duplicated.`);
    }
    seen.add(columnId);
    const ref = byId.get(columnId);
    if (!ref) {
      throw new Error(
        `Column "${columnId}" does not exist on source table "${sourceTableId}".`
      );
    }
    groupByColumnIds.push(columnId);
    groupByColumnRefs.push(ref);
  }

  return {
    sourceTableId,
    sourceTableRef,
    groupByColumnIds,
    groupByColumnRefs
  };
}

export function verifySummaryCreation(
  tableResponse: unknown,
  plan: SummaryCreationPlan,
  summaryTableRef: number
): VerifiedSummaryCreation {
  const sourceTables = tables(tableResponse);
  const source = findTableByRef(sourceTables, plan.sourceTableRef);
  const summary = findTableByRef(sourceTables, summaryTableRef);
  if (!source || tableId(source) !== plan.sourceTableId) {
    throw new Error("The native summary source table could not be verified after creation.");
  }
  if (!summary || summaryTableRef === plan.sourceTableRef) {
    throw new Error("Grist did not return a distinct generated summary table.");
  }

  const summaryFields = record(summary.fields);
  const summaryTableId = tableId(summary);
  if (
    !summaryFields ||
    !summaryTableId ||
    positiveInteger(summaryFields.summarySourceTable) !== plan.sourceTableRef
  ) {
    throw new Error("The generated Grist table does not point to the requested summary source.");
  }

  const sourceColumns = columnMaps(source);
  if (!Array.isArray(summary.columns)) {
    throw new Error("Expanded generated-summary column metadata is unavailable.");
  }
  if (summary.columns.length > MAX_SUMMARY_METADATA_COLUMNS) {
    throw new Error("Generated summary column metadata exceeds the verification bound.");
  }

  const actual = new Set<string>();
  for (const value of summary.columns) {
    const column = record(value);
    const sourceColRef = positiveInteger(record(column?.fields)?.summarySourceCol);
    if (!sourceColRef) continue;
    const sourceColumnId = sourceColumns.byRef.get(sourceColRef);
    if (!sourceColumnId || actual.has(sourceColumnId)) {
      throw new Error("Generated summary group-by metadata is incomplete or ambiguous.");
    }
    actual.add(sourceColumnId);
  }

  const expected = new Set(plan.groupByColumnIds);
  if (
    actual.size !== expected.size ||
    [...expected].some((columnId) => !actual.has(columnId))
  ) {
    throw new Error("Generated summary grouping does not match the requested columns.");
  }

  return {
    sourceTableId: plan.sourceTableId,
    summaryTableId,
    groupByColumnIds: [...plan.groupByColumnIds]
  };
}
