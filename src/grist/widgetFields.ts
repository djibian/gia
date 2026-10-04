type JsonRecord = Record<string, unknown>;

export const MAX_WIDGET_VISIBLE_FIELDS = 200;
export const MAX_WIDGET_FIELD_WIDTH = 2000;

export interface NormalizedWidgetField {
  columnId: string;
  width?: number;
}

export interface WidgetFieldUpdateInput {
  columnId: string;
  width?: number;
}

export interface WidgetFieldMutationPlan {
  expected: NormalizedWidgetField[];
  removeFieldIds: number[];
  reposition: Array<{ fieldId: number; parentPos: number }>;
  resize: Array<{ fieldId: number; width: number }>;
  add: Array<{ columnRef: number; parentPos: number; width: number }>;
}

interface WidgetIdentity {
  id: number;
  tableRef: number;
}

export interface ExistingWidgetField {
  fieldId: number;
  columnId: string;
  columnRef: number;
  parentPos: number;
  width: number;
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

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function tableColumnMaps(
  widget: WidgetIdentity,
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

export function existingWidgetFields(
  widget: WidgetIdentity,
  tableResponse: unknown,
  sectionFieldsResponse: unknown
): ExistingWidgetField[] | null {
  const maps = tableColumnMaps(widget, tableResponse);
  if (!maps) return null;

  const root = record(sectionFieldsResponse);
  if (!root || !Array.isArray(root.records)) return null;

  const fields: ExistingWidgetField[] = [];
  const seenColumnIds = new Set<string>();
  const seenFieldIds = new Set<number>();

  for (const value of root.records) {
    const item = record(value);
    const itemFields = record(item?.fields);
    if (positiveInteger(itemFields?.parentId) !== widget.id) continue;

    const fieldId = positiveInteger(item?.id);
    const columnRef = positiveInteger(itemFields?.colRef);
    const parentPos = finiteNumber(itemFields?.parentPos);
    const rawWidth = itemFields?.width;
    const width = rawWidth === undefined ? 0 : nonNegativeInteger(rawWidth);
    const columnId = columnRef ? maps.byRef.get(columnRef) : undefined;
    if (
      !fieldId ||
      !columnRef ||
      parentPos === undefined ||
      width === undefined ||
      !columnId ||
      seenColumnIds.has(columnId) ||
      seenFieldIds.has(fieldId)
    ) {
      return null;
    }

    seenColumnIds.add(columnId);
    seenFieldIds.add(fieldId);
    fields.push({ fieldId, columnId, columnRef, parentPos, width });
  }

  if (fields.length > MAX_WIDGET_VISIBLE_FIELDS) return null;
  fields.sort((a, b) => a.parentPos - b.parentPos || a.fieldId - b.fieldId);
  return fields;
}

export function normalizeWidgetFields(
  widget: WidgetIdentity,
  tableResponse: unknown,
  sectionFieldsResponse: unknown
):
  | { visibleFields: NormalizedWidgetField[] }
  | { visibleFieldsNormalizationIncomplete: true } {
  const current = existingWidgetFields(widget, tableResponse, sectionFieldsResponse);
  if (!current) return { visibleFieldsNormalizationIncomplete: true };

  return {
    visibleFields: current.map((field) => ({
      columnId: field.columnId,
      ...(field.width > 0 ? { width: field.width } : {})
    }))
  };
}

export function resolveWidgetFieldsUpdate(
  widget: WidgetIdentity,
  tableResponse: unknown,
  sectionFieldsResponse: unknown,
  requested: readonly WidgetFieldUpdateInput[]
): WidgetFieldMutationPlan {
  if (requested.length > MAX_WIDGET_VISIBLE_FIELDS) {
    throw new Error(
      `Widget visible fields must contain at most ${MAX_WIDGET_VISIBLE_FIELDS} columns.`
    );
  }

  const maps = tableColumnMaps(widget, tableResponse);
  const current = existingWidgetFields(widget, tableResponse, sectionFieldsResponse);
  if (!maps || !current) {
    throw new Error(
      `Grist widget ${widget.id} has incomplete or unsupported visible-field metadata; refusing to overwrite it.`
    );
  }

  const requestedIds = new Set<string>();
  for (const field of requested) {
    if (!field.columnId.trim()) {
      throw new Error("Widget field column ID must not be empty.");
    }
    if (requestedIds.has(field.columnId)) {
      throw new Error(`Widget field column "${field.columnId}" is duplicated.`);
    }
    requestedIds.add(field.columnId);
    if (!maps.byId.has(field.columnId)) {
      throw new Error(
        `Widget field column "${field.columnId}" does not exist in the widget table.`
      );
    }
    if (
      field.width !== undefined &&
      (!Number.isInteger(field.width) ||
        field.width < 1 ||
        field.width > MAX_WIDGET_FIELD_WIDTH)
    ) {
      throw new Error(
        `Widget field width must be an integer between 1 and ${MAX_WIDGET_FIELD_WIDTH} pixels.`
      );
    }
  }

  const currentByColumnId = new Map(current.map((field) => [field.columnId, field]));
  const expected: NormalizedWidgetField[] = [];
  const reposition: WidgetFieldMutationPlan["reposition"] = [];
  const resize: WidgetFieldMutationPlan["resize"] = [];
  const add: WidgetFieldMutationPlan["add"] = [];

  requested.forEach((field, index) => {
    const parentPos = index + 1;
    const existing = currentByColumnId.get(field.columnId);
    if (existing) {
      if (existing.parentPos !== parentPos) {
        reposition.push({ fieldId: existing.fieldId, parentPos });
      }
      if (field.width !== undefined && existing.width !== field.width) {
        resize.push({ fieldId: existing.fieldId, width: field.width });
      }
      const expectedWidth = field.width ?? (existing.width > 0 ? existing.width : undefined);
      expected.push({
        columnId: field.columnId,
        ...(expectedWidth !== undefined ? { width: expectedWidth } : {})
      });
      return;
    }

    const columnRef = maps.byId.get(field.columnId)!;
    const width = field.width ?? 0;
    add.push({ columnRef, parentPos, width });
    expected.push({
      columnId: field.columnId,
      ...(field.width !== undefined ? { width: field.width } : {})
    });
  });

  return {
    expected,
    removeFieldIds: current
      .filter((field) => !requestedIds.has(field.columnId))
      .map((field) => field.fieldId),
    reposition,
    resize,
    add
  };
}
