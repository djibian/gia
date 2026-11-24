import { isDeepStrictEqual } from "node:util";

type Json = Record<string, unknown>;
type Column = { ref: number; fields: Json };

function object(value: unknown): Json | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Json : null;
}

/** Read a complete, unambiguous native column snapshot; never publish metadata. */
function snapshot(raw: unknown, limit: number): Map<string, Column> {
  const rows = object(raw)?.columns;
  if (!Array.isArray(rows) || !Number.isInteger(limit) || limit < 2 ||
      rows.length >= limit || rows.length > 5000) {
    throw new Error("Native formula column snapshot is incomplete.");
  }
  const columns = new Map<string, Column>();
  const refs = new Set<number>();
  for (const row of rows) {
    const entry = object(row), fields = object(entry?.fields);
    const id = entry?.id, ref = fields?.colRef;
    if (typeof id !== "string" || !id || !fields ||
        typeof ref !== "number" || !Number.isSafeInteger(ref) || ref < 1 ||
        columns.has(id) || refs.has(ref)) {
      throw new Error("Native formula column identities are ambiguous.");
    }
    columns.set(id, { ref, fields: { ...fields } });
    refs.add(ref);
  }
  return columns;
}

function target(columns: ReadonlyMap<string, Column>, columnId: string): Column {
  const found = columns.get(columnId);
  if (!found || found.fields.isFormula !== true ||
      typeof found.fields.formula !== "string" ||
      typeof found.fields.type !== "string" || !found.fields.type) {
    throw new Error("Target must be a verified existing native formula column.");
  }
  return found;
}

/** A formula is ordinary Grist Python, never an ACL expression or raw UserAction. */
export function planColumnFormulaReplacement(
  raw: unknown, columnId: string, formula: string, limit: number
): { changed: boolean } {
  if (!columnId || typeof formula !== "string" || !formula.trim() ||
      formula.length > 4096 || /[\u0000]/.test(formula)) {
    throw new Error("Replacement requires an existing column and bounded nonempty formula.");
  }
  const before = snapshot(raw, limit);
  return { changed: target(before, columnId).fields.formula !== formula };
}

/** Confirm the requested formula and preserve every other native column field. */
export function verifyColumnFormulaReplacement(
  beforeRaw: unknown, afterRaw: unknown, columnId: string,
  formula: string, limit: number
): void {
  const before = snapshot(beforeRaw, limit), after = snapshot(afterRaw, limit);
  target(before, columnId);
  target(after, columnId);
  if (before.size !== after.size) throw new Error("Native column set changed.");
  for (const [id, previous] of before) {
    const current = after.get(id);
    if (!current || current.ref !== previous.ref ||
        !isDeepStrictEqual(current.fields, id === columnId
          ? { ...previous.fields, formula } : previous.fields)) {
      throw new Error("Native formula replacement did not preserve unrelated schema.");
    }
  }
}
