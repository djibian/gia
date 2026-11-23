import { isDeepStrictEqual } from "node:util";

type NativeObject = Record<string, unknown>;

function object(value: unknown): NativeObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as NativeObject : null;
}

/** Preflight a complete native column snapshot; a Text key is an identity hint, not a unique index. */
export function assertTextKeyRecordColumns(
  response: unknown, keyColumnId: string, fields: Record<string, unknown>
): void {
  const columns = object(response)?.columns;
  if (!Array.isArray(columns) || columns.length === 0 || columns.length >= 2000) {
    throw new Error("Native column metadata is missing or exceeds the bounded read.");
  }
  const byId = new Map<string, NativeObject>();
  for (const entry of columns) {
    const column = object(entry);
    const id = column?.id;
    const metadata = object(column?.fields);
    if (typeof id !== "string" || !id || !metadata || byId.has(id)) {
      throw new Error("Native column metadata is ambiguous or malformed.");
    }
    byId.set(id, metadata);
  }
  const key = byId.get(keyColumnId);
  if (!key || key.type !== "Text" || key.isFormula === true) {
    throw new Error("The reconciliation key must be an existing non-formula Text column.");
  }
  for (const columnId of Object.keys(fields)) {
    const column = byId.get(columnId);
    if (!column || column.isFormula === true) {
      throw new Error("Every supplied record field must resolve to an existing writable column.");
    }
  }
}

/** Read exactly zero or one owner-visible native row; never guess between duplicates. */
export function readUniqueTextKeyRecord(
  response: unknown, fields: Record<string, unknown>
): number | undefined {
  const records = object(response)?.records;
  if (!Array.isArray(records) || records.length > 2) {
    throw new Error("Native filtered record read is missing or malformed.");
  }
  if (records.length > 1) {
    throw new Error("The supplied record key is ambiguous; duplicate native rows exist.");
  }
  if (records.length === 0) return undefined;
  const row = object(records[0]);
  const nativeFields = object(row?.fields);
  if (typeof row?.id !== "number" || !Number.isSafeInteger(row.id) || row.id < 1 ||
      !nativeFields) {
    throw new Error("Native record identity or fields are incomplete.");
  }
  for (const [columnId, expected] of Object.entries(fields)) {
    if (!Object.hasOwn(nativeFields, columnId) ||
        !isDeepStrictEqual(nativeFields[columnId], expected)) {
      throw new Error("Existing keyed record conflicts with the requested values.");
    }
  }
  return row.id;
}

/** Complete Owner-visible filtered batch: reject truncation, unrequested keys and duplicates. */
export function readUniqueTextKeyRecords(
  response: unknown, keyColumnId: string,
  requested: readonly { fields: Record<string, unknown> }[], limit: number
): (number | undefined)[] {
  const rows = object(response)?.records;
  if (!Array.isArray(rows) || rows.length >= limit) {
    throw new Error("Native keyed batch read is missing or may be truncated.");
  }
  const wanted = new Set(requested.map(row => row.fields[keyColumnId]));
  const byKey = new Map<string, unknown[]>();
  const ids = new Set<number>();
  for (const row of rows) {
    const item = object(row), fields = object(item?.fields);
    const key = fields?.[keyColumnId], id = item?.id;
    if (typeof key !== "string" || !wanted.has(key) ||
        typeof id !== "number" || !Number.isSafeInteger(id) ||
        id < 1 || ids.has(id)) {
      throw new Error("Native keyed batch contains unknown or ambiguous row identity.");
    }
    ids.add(id);
    const bucket = byKey.get(key) ?? [];
    bucket.push(row);
    byKey.set(key, bucket);
  }
  return requested.map(row => readUniqueTextKeyRecord(
    { records: byKey.get(row.fields[keyColumnId] as string) ?? [] }, row.fields
  ));
}
