type JsonRecord = Record<string, unknown>;

export const MAX_WIDGET_FILTERS = 200;
export const MAX_WIDGET_FILTER_VALUES = 200;

export type WidgetFilterValue = string | number | boolean | null;

export type NormalizedWidgetFilter =
  | {
      columnId: string;
      mode: "include" | "exclude";
      values: WidgetFilterValue[];
      pinned: boolean;
    }
  | {
      columnId: string;
      mode: "range";
      min?: number;
      max?: number;
      pinned: boolean;
    };

export type WidgetFilterUpdateInput =
  | {
      columnId: string;
      mode: "include" | "exclude";
      values: readonly WidgetFilterValue[];
      pinned?: boolean;
    }
  | {
      columnId: string;
      mode: "range";
      min?: number;
      max?: number;
      pinned?: boolean;
    }
  | {
      columnId: string;
      mode: "remove";
    };

export interface WidgetFilterMutationPlan {
  expected: NormalizedWidgetFilter[];
  removeFilterIds: number[];
  update: Array<{
    filterId: number;
    filterJson?: string;
    pinned?: boolean;
  }>;
  add: Array<{
    columnRef: number;
    filterJson: string;
    pinned: boolean;
  }>;
}

interface WidgetIdentity {
  id: number;
  tableRef: number;
}

interface ExistingWidgetFilter {
  filterId: number;
  columnId: string;
  columnRef: number;
  normalized: NormalizedWidgetFilter;
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

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === 0) return false;
  if (value === 1) return true;
  return undefined;
}

function isFilterValue(value: unknown): value is WidgetFilterValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function valueKey(value: WidgetFilterValue): string {
  if (value === null) return "null";
  return `${typeof value}:${JSON.stringify(value)}`;
}

function assertUniqueValues(values: readonly WidgetFilterValue[]): void {
  const keys = new Set<string>();
  for (const value of values) {
    const key = valueKey(value);
    if (keys.has(key)) {
      throw new Error("Widget filter values must not contain duplicates.");
    }
    keys.add(key);
  }
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
  if (!table || !Array.isArray(table.columns) || table.columns.length > 5000) return null;

  const byRef = new Map<number, string>();
  const byId = new Map<string, number>();
  for (const value of table.columns) {
    const column = record(value);
    const columnId =
      typeof column?.id === "string" && column.id.length > 0 ? column.id : undefined;
    const columnRef = positiveInteger(record(column?.fields)?.colRef);
    if (!columnId || !columnRef || byRef.has(columnRef) || byId.has(columnId)) return null;
    byRef.set(columnRef, columnId);
    byId.set(columnId, columnRef);
  }
  return { byRef, byId };
}

function parseNativeFilter(
  columnId: string,
  filterJson: string,
  pinned: boolean
): NormalizedWidgetFilter | null {
  let parsed: unknown;
  try {
    parsed = filterJson ? JSON.parse(filterJson) : {};
  } catch {
    return null;
  }
  const spec = record(parsed);
  if (!spec) return null;
  if (Object.keys(spec).some((key) => !["included", "excluded", "min", "max"].includes(key))) {
    return null;
  }

  const hasMin = spec.min !== undefined;
  const hasMax = spec.max !== undefined;
  const hasIncluded = spec.included !== undefined;
  const hasExcluded = spec.excluded !== undefined;

  if (hasMin || hasMax) {
    if (hasIncluded || hasExcluded) return null;
    const min = hasMin && typeof spec.min === "number" && Number.isFinite(spec.min)
      ? spec.min : undefined;
    const max = hasMax && typeof spec.max === "number" && Number.isFinite(spec.max)
      ? spec.max : undefined;
    if ((hasMin && min === undefined) || (hasMax && max === undefined)) return null;
    if (min !== undefined && max !== undefined && min > max) return null;
    return {
      columnId,
      mode: "range",
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      pinned
    };
  }

  if (hasIncluded && hasExcluded) return null;
  const mode: "include" | "exclude" = hasIncluded ? "include" : "exclude";
  const rawValues = hasIncluded ? spec.included : hasExcluded ? spec.excluded : [];
  if (!Array.isArray(rawValues) || rawValues.length > MAX_WIDGET_FILTER_VALUES) return null;
  if (!rawValues.every(isFilterValue)) return null;
  const values = rawValues as WidgetFilterValue[];
  if (new Set(values.map(valueKey)).size !== values.length) return null;
  return { columnId, mode, values: [...values], pinned };
}

function existingWidgetFilters(
  widget: WidgetIdentity,
  tableResponse: unknown,
  filtersResponse: unknown
): ExistingWidgetFilter[] | null {
  const maps = tableColumnMaps(widget, tableResponse);
  if (!maps) return null;
  const root = record(filtersResponse);
  if (!root || !Array.isArray(root.records)) return null;

  const result: ExistingWidgetFilter[] = [];
  const seenIds = new Set<number>();
  const seenColumns = new Set<string>();
  for (const value of root.records) {
    const item = record(value);
    const fields = record(item?.fields);
    if (positiveInteger(fields?.viewSectionRef) !== widget.id) continue;

    const filterId = positiveInteger(item?.id);
    const columnRef = positiveInteger(fields?.colRef);
    const columnId = columnRef ? maps.byRef.get(columnRef) : undefined;
    const filterJson = typeof fields?.filter === "string" ? fields.filter : undefined;
    const pinned = booleanValue(fields?.pinned);
    if (!filterId || !columnRef || !columnId || filterJson === undefined || pinned === undefined ||
        seenIds.has(filterId) || seenColumns.has(columnId)) {
      return null;
    }
    const normalized = parseNativeFilter(columnId, filterJson, pinned);
    if (!normalized) return null;
    seenIds.add(filterId);
    seenColumns.add(columnId);
    result.push({ filterId, columnId, columnRef, normalized });
  }
  if (result.length > MAX_WIDGET_FILTERS) return null;
  result.sort((a, b) => a.columnId.localeCompare(b.columnId));
  return result;
}

function sameFilterState(actual: NormalizedWidgetFilter, expected: NormalizedWidgetFilter): boolean {
  if (actual.columnId !== expected.columnId || actual.mode !== expected.mode ||
      actual.pinned !== expected.pinned) return false;
  if (actual.mode === "range" && expected.mode === "range") {
    return actual.min === expected.min && actual.max === expected.max;
  }
  if (actual.mode !== "range" && expected.mode !== "range") {
    return actual.values.length === expected.values.length &&
      actual.values.every((value, index) => valueKey(value) === valueKey(expected.values[index]!));
  }
  return false;
}

function requestedState(
  input: Exclude<WidgetFilterUpdateInput, { mode: "remove" }>,
  pinned: boolean
): { normalized: NormalizedWidgetFilter; filterJson: string } {
  if (input.mode === "range") {
    if (input.min === undefined && input.max === undefined) {
      throw new Error("Range filters require at least one bound.");
    }
    if (input.min !== undefined && input.max !== undefined && input.min > input.max) {
      throw new Error("Widget filter range min must not exceed max.");
    }
    const spec = {
      ...(input.min !== undefined ? { min: input.min } : {}),
      ...(input.max !== undefined ? { max: input.max } : {})
    };
    return {
      normalized: { columnId: input.columnId, mode: "range", ...spec, pinned },
      filterJson: JSON.stringify(spec)
    };
  }

  if (input.values.length > MAX_WIDGET_FILTER_VALUES) {
    throw new Error(`Widget filters support at most ${MAX_WIDGET_FILTER_VALUES} values per column.`);
  }
  if (!input.values.every(isFilterValue)) {
    throw new Error("Widget filter values must be JSON scalar values.");
  }
  assertUniqueValues(input.values);
  const values = [...input.values];
  return {
    normalized: { columnId: input.columnId, mode: input.mode, values, pinned },
    filterJson: JSON.stringify({
      [input.mode === "include" ? "included" : "excluded"]: values
    })
  };
}

export function normalizeWidgetFilters(
  widget: WidgetIdentity,
  tableResponse: unknown,
  filtersResponse: unknown
): { filters: NormalizedWidgetFilter[] } | { filtersNormalizationIncomplete: true } {
  const current = existingWidgetFilters(widget, tableResponse, filtersResponse);
  if (!current) return { filtersNormalizationIncomplete: true };
  return { filters: current.map((filter) => filter.normalized) };
}

export function resolveWidgetFiltersUpdate(
  widget: WidgetIdentity,
  tableResponse: unknown,
  filtersResponse: unknown,
  requested: readonly WidgetFilterUpdateInput[]
): WidgetFilterMutationPlan {
  if (requested.length < 1) {
    throw new Error("Widget filter update must target at least one column.");
  }
  if (requested.length > MAX_WIDGET_FILTERS) {
    throw new Error(`Widget filter update may target at most ${MAX_WIDGET_FILTERS} columns.`);
  }

  const maps = tableColumnMaps(widget, tableResponse);
  const current = existingWidgetFilters(widget, tableResponse, filtersResponse);
  if (!maps || !current) {
    throw new Error(
      `Grist widget ${widget.id} has incomplete or unsupported persistent-filter metadata; refusing to overwrite it.`
    );
  }

  const requestedColumns = new Set<string>();
  const currentByColumn = new Map(current.map((filter) => [filter.columnId, filter]));
  const expectedByColumn = new Map(current.map((filter) => [filter.columnId, filter.normalized]));
  const removeFilterIds: number[] = [];
  const update: WidgetFilterMutationPlan["update"] = [];
  const add: WidgetFilterMutationPlan["add"] = [];

  for (const input of requested) {
    const columnId = input.columnId.trim();
    if (!columnId) throw new Error("Widget filter column ID must not be empty.");
    if (requestedColumns.has(columnId)) {
      throw new Error(`Widget filter column "${columnId}" is targeted more than once.`);
    }
    requestedColumns.add(columnId);

    const columnRef = maps.byId.get(columnId);
    if (!columnRef) {
      throw new Error(`Widget filter column "${columnId}" does not exist in the widget table.`);
    }
    const existing = currentByColumn.get(columnId);

    if (input.mode === "remove") {
      if (existing) {
        removeFilterIds.push(existing.filterId);
        expectedByColumn.delete(columnId);
      }
      continue;
    }

    const pinned = input.pinned ?? existing?.normalized.pinned ?? true;
    const requestedForColumn = { ...input, columnId } as Exclude<
      WidgetFilterUpdateInput,
      { mode: "remove" }
    >;
    const next = requestedState(requestedForColumn, pinned);
    expectedByColumn.set(columnId, next.normalized);

    if (!existing) {
      add.push({ columnRef, filterJson: next.filterJson, pinned });
      continue;
    }

    const change: WidgetFilterMutationPlan["update"][number] = { filterId: existing.filterId };
    const existingAtRequestedPin = { ...existing.normalized, pinned } as NormalizedWidgetFilter;
    if (!sameFilterState(existingAtRequestedPin, next.normalized)) change.filterJson = next.filterJson;
    if (input.pinned !== undefined && existing.normalized.pinned !== pinned) change.pinned = pinned;
    if (change.filterJson !== undefined || change.pinned !== undefined) update.push(change);
  }

  return {
    expected: [...expectedByColumn.values()].sort((a, b) => a.columnId.localeCompare(b.columnId)),
    removeFilterIds,
    update,
    add
  };
}
