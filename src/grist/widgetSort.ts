import { tableColumnMaps } from "./tableColumnMaps.js";

type JsonRecord = Record<string, unknown>;

export const MAX_WIDGET_SORT_COLUMNS = 20;

export const WIDGET_SORT_DIRECTIONS = ["asc", "desc"] as const;
export type WidgetSortDirection = (typeof WIDGET_SORT_DIRECTIONS)[number];

export interface WidgetSortInput {
  columnId: string;
  direction: WidgetSortDirection;
  emptyLast?: boolean | undefined;
  naturalSort?: boolean | undefined;
  orderByChoice?: boolean | undefined;
}

export type ResolvedWidgetSortSpec = number | string;

interface WidgetSortTarget {
  id: number;
  tableRef: number;
  tableId?: string | undefined;
  sortColRefs?: unknown;
}

export interface NormalizedWidgetSort {
  sort: WidgetSortInput[];
  sortNormalizationIncomplete: boolean;
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function encodeSortSpec(input: WidgetSortInput, colRef: number): ResolvedWidgetSortSpec {
  const signed = input.direction === "desc" ? -colRef : colRef;
  const flags: string[] = [];
  if (input.emptyLast) flags.push("emptyLast");
  if (input.naturalSort) flags.push("naturalSort");
  if (input.orderByChoice) flags.push("orderByChoice");
  return flags.length === 0 ? signed : `${signed}:${flags.join(";")}`;
}

export function resolveWidgetSort(
  widget: WidgetSortTarget,
  tableResponse: unknown,
  sort: readonly WidgetSortInput[] | null
): ResolvedWidgetSortSpec[] {
  if (sort === null || sort.length === 0) return [];
  if (sort.length > MAX_WIDGET_SORT_COLUMNS) {
    throw new Error(
      `Widget saved sort is limited to ${MAX_WIDGET_SORT_COLUMNS} columns per update.`
    );
  }

  const maps = tableColumnMaps(widget, tableResponse);
  if (!maps) throw new Error(`Widget ${widget.id} table/column metadata is unavailable, incomplete or ambiguous; refusing saved-sort resolution.`);

  const seen = new Set<string>();
  return sort.map((input) => {
    const columnId = input.columnId.trim();
    if (!columnId) throw new Error("Widget sort column ID must not be empty.");
    if (!WIDGET_SORT_DIRECTIONS.includes(input.direction)) {
      throw new Error(`Unsupported widget sort direction "${input.direction}".`);
    }
    if (seen.has(columnId)) {
      throw new Error(`Widget sort column "${columnId}" is duplicated.`);
    }
    seen.add(columnId);

    const ref = maps.byId.get(columnId);
    const type = text(maps.fieldsById.get(columnId)?.type);
    if (!ref) {
      throw new Error(
        `Column "${columnId}" does not exist on widget ${widget.id}'s table.`
      );
    }
    if (input.naturalSort && type !== "Text") {
      throw new Error(
        `naturalSort is limited to Text columns; "${columnId}" has type "${type ?? "unknown"}".`
      );
    }
    if (
      input.orderByChoice &&
      type !== "Choice" &&
      type !== "ChoiceList"
    ) {
      throw new Error(
        `orderByChoice is limited to Choice/ChoiceList columns; "${columnId}" has type "${type ?? "unknown"}".`
      );
    }
    return encodeSortSpec({ ...input, columnId }, ref);
  });
}

function parseStoredSortSpec(
  value: unknown
): { colRef: number; direction: WidgetSortDirection; flags: string[] } | undefined {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value === 0) return undefined;
    return {
      colRef: Math.abs(value),
      direction: value < 0 ? "desc" : "asc",
      flags: []
    };
  }
  if (typeof value !== "string") return undefined;

  const parts = value.split(":");
  if (parts.length > 2) return undefined;
  const signed = Number(parts[0]);
  if (!Number.isInteger(signed) || signed === 0) return undefined;
  const flags = parts[1] === undefined || parts[1] === "" ? [] : parts[1].split(";");
  const allowed = new Set(["emptyLast", "naturalSort", "orderByChoice"]);
  if (flags.some((flag) => !allowed.has(flag))) return undefined;

  return {
    colRef: Math.abs(signed),
    direction: signed < 0 ? "desc" : "asc",
    flags
  };
}

export function normalizeWidgetSort(
  widget: WidgetSortTarget,
  tableResponse: unknown
): NormalizedWidgetSort | undefined {
  const root = record(tableResponse);
  if (Array.isArray(root?.tables) && !root.tables.some((value) => Object.hasOwn(record(value) ?? {}, "columns"))) return undefined;
  const maps = tableColumnMaps(widget, tableResponse);
  if (!maps) return { sort: [], sortNormalizationIncomplete: true };

  const raw = widget.sortColRefs;
  if (raw === undefined) {
    return { sort: [], sortNormalizationIncomplete: false };
  }
  if (!Array.isArray(raw)) {
    return { sort: [], sortNormalizationIncomplete: true };
  }

  let incomplete = raw.length > MAX_WIDGET_SORT_COLUMNS;
  const sort: WidgetSortInput[] = [];
  for (const value of raw.slice(0, MAX_WIDGET_SORT_COLUMNS)) {
    const parsed = parseStoredSortSpec(value);
    const columnId = parsed ? maps.byRef.get(parsed.colRef) : undefined;
    if (!parsed || !columnId) {
      incomplete = true;
      continue;
    }
    sort.push({
      columnId,
      direction: parsed.direction,
      ...(parsed.flags.includes("emptyLast") ? { emptyLast: true } : {}),
      ...(parsed.flags.includes("naturalSort") ? { naturalSort: true } : {}),
      ...(parsed.flags.includes("orderByChoice") ? { orderByChoice: true } : {})
    });
  }

  return { sort, sortNormalizationIncomplete: incomplete };
}
