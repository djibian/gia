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
  widget: { tableRef: number; tableId?: string | undefined },
  tableResponse: unknown
): { byRef: Map<number, string>; byId: Map<string, number>; fieldsById: Map<string, JsonRecord> } | null {
  const root = record(tableResponse);
  if (!Array.isArray(root?.tables)) return null;
  const tableIds = new Set<string>();
  const tableRefs = new Set<number>();
  const columnRefs = new Set<number>();
  const byRef = new Map<number, string>();
  const byId = new Map<string, number>();
  const fieldsById = new Map<string, JsonRecord>();
  let table: JsonRecord | null = null;
  for (const value of root.tables) {
    const candidate = record(value);
    const id = candidate?.id;
    const ref = positiveInteger(record(candidate?.fields)?.tableRef);
    if (typeof id !== "string" || !id.trim() || !ref || tableIds.has(id) || tableRefs.has(ref)) return null;
    tableIds.add(id);
    tableRefs.add(ref);
    if (ref === widget.tableRef) table = candidate;
    if (!Array.isArray(candidate?.columns)) return null;
    const columnIds = new Set<string>();
    for (const value of candidate.columns) {
      const column = record(value);
      const columnId = typeof column?.id === "string" && column.id.trim() ? column.id : undefined;
      const fields = record(column?.fields);
      const columnRef = positiveInteger(fields?.colRef);
      if (!columnId || !columnRef || columnRefs.has(columnRef) || columnIds.has(columnId)) return null;
      columnRefs.add(columnRef);
      columnIds.add(columnId);
      if (columnRefs.size > 5000) return null;
      if (ref !== widget.tableRef) continue;
      byRef.set(columnRef, columnId);
      byId.set(columnId, columnRef);
      fieldsById.set(columnId, fields!);
    }
  }
  if (widget.tableId !== undefined && table?.id !== widget.tableId) return null;
  if (!table) return null;
  return { byRef, byId, fieldsById };
}
