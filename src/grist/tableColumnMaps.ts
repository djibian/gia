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
  let table: JsonRecord | null = null;
  for (const value of root.tables) {
    const candidate = record(value);
    const id = candidate?.id;
    const ref = positiveInteger(record(candidate?.fields)?.tableRef);
    if (typeof id !== "string" || !id.trim() || !ref || tableIds.has(id) || tableRefs.has(ref)) return null;
    tableIds.add(id);
    tableRefs.add(ref);
    if (ref === widget.tableRef) table = candidate;
  }
  if (widget.tableId !== undefined && table?.id !== widget.tableId) return null;
  if (!table || !Array.isArray(table.columns)) return null;
  if (table.columns.length > 5000) return null;

  const byRef = new Map<number, string>();
  const byId = new Map<string, number>();
  const fieldsById = new Map<string, JsonRecord>();
  for (const value of table.columns) {
    const column = record(value);
    const columnId =
      typeof column?.id === "string" && column.id.trim().length > 0 ? column.id : undefined;
    const fields = record(column?.fields);
    const columnRef = positiveInteger(fields?.colRef);
    if (!columnId || !columnRef || byRef.has(columnRef) || byId.has(columnId)) {
      return null;
    }
    byRef.set(columnRef, columnId);
    byId.set(columnId, columnRef);
    fieldsById.set(columnId, fields!);
  }
  return { byRef, byId, fieldsById };
}
