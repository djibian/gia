type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

export function tableColumnMaps(
  widget: { tableRef: number },
  tableResponse: unknown
): { byRef: Map<number, string>; byId: Map<string, number> } | null {
  const root = record(tableResponse);
  const tables = Array.isArray(root?.tables) ? root.tables : [];
  const table = tables
    .map(record)
    .find((candidate) => positiveInteger(record(candidate?.fields)?.tableRef) === widget.tableRef);
  if (!table || !Array.isArray(table.columns)) return null;
  if (table.columns.length > 5000) return null;

  const byRef = new Map<number, string>();
  const byId = new Map<string, number>();
  for (const value of table.columns) {
    const column = record(value);
    const columnId =
      typeof column?.id === "string" && column.id.length > 0 ? column.id : undefined;
    const columnRef = positiveInteger(record(column?.fields)?.colRef);
    if (!columnId || !columnRef || byRef.has(columnRef) || byId.has(columnId)) {
      return null;
    }
    byRef.set(columnRef, columnId);
    byId.set(columnId, columnRef);
  }
  return { byRef, byId };
}
