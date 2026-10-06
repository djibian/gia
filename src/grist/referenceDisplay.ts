import type { GristColumnUpdate } from "./client.js";

type JsonRecord = Record<string, unknown>;

export interface ReferenceDisplayPlan {
  sourceColumnId: string;
  sourceColumnRef: number;
  targetTableId: string;
  visibleColumnId: string;
  visibleColumnRef: number;
  displayFormula: string;
}

export interface ResolvedReferenceDisplayMutation {
  actions: unknown[][];
  targetColumnRefs: number[];
  plans: ReferenceDisplayPlan[];
}

interface ParsedColumn {
  tableId: string;
  id: string;
  ref: number;
  fields: JsonRecord;
}

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

function exactId(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${label} must be an exact non-empty stable ID without surrounding whitespace.`);
  }
  return value;
}

function parsedColumns(tableResponse: unknown): {
  byTableAndId: Map<string, Map<string, ParsedColumn>>;
  byRef: Map<number, ParsedColumn>;
} {
  const root = record(tableResponse);
  const tables = Array.isArray(root?.tables) ? root.tables : undefined;
  if (!tables) {
    throw new Error("Expanded Grist table metadata is unavailable.");
  }

  const byTableAndId = new Map<string, Map<string, ParsedColumn>>();
  const byRef = new Map<number, ParsedColumn>();
  for (const value of tables) {
    const table = record(value);
    const tableId = typeof table?.id === "string" && table.id.trim()
      ? table.id
      : undefined;
    if (!tableId || byTableAndId.has(tableId) || !Array.isArray(table?.columns)) {
      throw new Error("Expanded Grist table metadata is incomplete or ambiguous.");
    }
    const columns = new Map<string, ParsedColumn>();
    for (const rawColumn of table.columns) {
      const column = record(rawColumn);
      const id = typeof column?.id === "string" && column.id.trim()
        ? column.id
        : undefined;
      const fields = record(column?.fields);
      const ref = positiveInteger(fields?.colRef);
      if (!id || !fields || !ref || columns.has(id) || byRef.has(ref)) {
        throw new Error("Expanded Grist column metadata is incomplete or ambiguous.");
      }
      const parsed = { tableId, id, ref, fields };
      columns.set(id, parsed);
      byRef.set(ref, parsed);
    }
    byTableAndId.set(tableId, columns);
  }
  return { byTableAndId, byRef };
}

function referenceTarget(type: unknown): string | undefined {
  if (typeof type !== "string") return undefined;
  const match = /^(?:Ref|RefList):(.+)$/.exec(type);
  return match?.[1];
}

function hiddenColumnsByRef(
  columnsResponse: unknown,
  tableId: string
): Map<number, ParsedColumn> {
  const root = record(columnsResponse);
  const columns = Array.isArray(root?.columns) ? root.columns : undefined;
  if (!columns) {
    throw new Error("Hidden Grist column metadata is unavailable.");
  }
  const byRef = new Map<number, ParsedColumn>();
  for (const rawColumn of columns) {
    const column = record(rawColumn);
    const id =
      typeof column?.id === "string" && column.id.trim()
        ? column.id
        : undefined;
    const fields = record(column?.fields);
    const ref = positiveInteger(fields?.colRef);
    if (!id || !fields || !ref || byRef.has(ref)) {
      throw new Error("Hidden Grist column metadata is incomplete or ambiguous.");
    }
    byRef.set(ref, { tableId, id, ref, fields });
  }
  return byRef;
}

export function hasReferenceDisplayUpdates(
  updates: readonly GristColumnUpdate[]
): boolean {
  return updates.some((update) => update.fields.visibleColumnId !== undefined);
}

/**
 * Resolve semantic stable-ID relation-display requests to one native /apply
 * action bundle. This mirrors Grist's own UI behavior: visibleCol alone is not
 * enough; SetDisplayFormula must update/create the helper display column too.
 */
export function resolveReferenceDisplayMutation(
  tableResponse: unknown,
  tableId: string,
  updates: readonly GristColumnUpdate[]
): ResolvedReferenceDisplayMutation {
  const { byTableAndId } = parsedColumns(tableResponse);
  const sourceColumns = byTableAndId.get(tableId);
  if (!sourceColumns) {
    throw new Error(`Grist table "${tableId}" does not exist.`);
  }

  const actions: unknown[][] = [];
  const targetColumnRefs: number[] = [];
  const plans: ReferenceDisplayPlan[] = [];

  for (const update of updates) {
    const source = sourceColumns.get(update.id);
    if (!source) {
      throw new Error(`Grist column "${tableId}.${update.id}" does not exist.`);
    }
    targetColumnRefs.push(source.ref);

    const nativeFields = { ...update.fields };
    const rawVisibleColumnId = nativeFields.visibleColumnId;
    delete nativeFields.visibleColumnId;

    if (rawVisibleColumnId === undefined) {
      actions.push([
        "UpdateRecord",
        "_grist_Tables_column",
        source.ref,
        nativeFields
      ]);
      continue;
    }

    if (nativeFields.label !== undefined) {
      throw new Error(
        `Column "${tableId}.${update.id}" cannot change label and visibleColumnId in the same bounded update because Grist may rename the stable column ID; update the label first, then the relation display column.`
      );
    }

    const visibleColumnId = exactId(
      rawVisibleColumnId,
      `Visible column ID for "${tableId}.${update.id}"`
    );
    const effectiveType =
      nativeFields.type !== undefined ? nativeFields.type : source.fields.type;
    const targetTableId = referenceTarget(effectiveType);
    if (!targetTableId) {
      throw new Error(
        `Column "${tableId}.${update.id}" must be a Ref or RefList column before visibleColumnId can be set.`
      );
    }
    const targetColumns = byTableAndId.get(targetTableId);
    const visible = targetColumns?.get(visibleColumnId);
    if (!visible) {
      throw new Error(
        `Visible column "${targetTableId}.${visibleColumnId}" does not exist.`
      );
    }

    nativeFields.visibleCol = visible.ref;
    const displayFormula = `$${source.id}.${visible.id}`;
    actions.push([
      "UpdateRecord",
      "_grist_Tables_column",
      source.ref,
      nativeFields
    ]);
    actions.push([
      "SetDisplayFormula",
      tableId,
      null,
      source.ref,
      displayFormula
    ]);
    plans.push({
      sourceColumnId: source.id,
      sourceColumnRef: source.ref,
      targetTableId,
      visibleColumnId: visible.id,
      visibleColumnRef: visible.ref,
      displayFormula
    });
  }

  return { actions, targetColumnRefs, plans };
}

export function verifyReferenceDisplayMutation(
  tableResponse: unknown,
  sourceColumnsResponse: unknown,
  sourceTableId: string,
  plans: readonly ReferenceDisplayPlan[]
): void {
  if (plans.length === 0) return;
  const { byRef: expandedByRef } = parsedColumns(tableResponse);
  const hiddenByRef = hiddenColumnsByRef(sourceColumnsResponse, sourceTableId);

  for (const plan of plans) {
    const source = hiddenByRef.get(plan.sourceColumnRef) ?? expandedByRef.get(plan.sourceColumnRef);
    if (!source) {
      throw new Error(
        `Updated relation column "${plan.sourceColumnId}" is unavailable on re-read.`
      );
    }
    const currentTarget = referenceTarget(source.fields.type);
    if (currentTarget !== plan.targetTableId) {
      throw new Error(
        `Updated relation column "${source.id}" no longer targets "${plan.targetTableId}".`
      );
    }
    if (positiveInteger(source.fields.visibleCol) !== plan.visibleColumnRef) {
      throw new Error(
        `Updated relation column "${source.id}" did not persist visibleColumnId "${plan.visibleColumnId}".`
      );
    }

    const displayRef = positiveInteger(source.fields.displayCol);
    const displayColumn = displayRef
      ? hiddenByRef.get(displayRef) ?? expandedByRef.get(displayRef)
      : undefined;
    if (!displayColumn || displayColumn.fields.formula !== plan.displayFormula) {
      throw new Error(
        `Updated relation column "${source.id}" did not persist the expected display formula.`
      );
    }
  }
}

export function stableVisibleColumnId(
  column: { fields: JsonRecord },
  byRef: Map<number, { tableId: string; id: string }>
): string | undefined {
  const targetTableId = referenceTarget(column.fields.type);
  const visibleRef = positiveInteger(column.fields.visibleCol);
  if (!targetTableId || !visibleRef) return undefined;
  const visible = byRef.get(visibleRef);
  return visible?.tableId === targetTableId ? visible.id : undefined;
}
