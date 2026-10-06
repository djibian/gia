import { tableColumnMaps } from "./tableColumnMaps.js";

type JsonRecord = Record<string, unknown>;

export interface CalendarConfigInput {
  titleColumnId: string;
  startDateColumnId: string;
  endDateColumnId?: string;
  allDayColumnId?: string;
  typeColumnId?: string;
}

export interface NormalizedCalendarConfig {
  titleColumnId: string;
  startDateColumnId: string;
  endDateColumnId?: string;
  allDayColumnId?: string;
  typeColumnId?: string;
}

export interface CalendarConfigNormalizationResult {
  calendarConfig?: NormalizedCalendarConfig;
  calendarConfigNormalizationIncomplete?: true;
}

export interface ResolvedCalendarConfigUpdate {
  options: Record<string, unknown>;
  optionsJson: string;
  calendarConfig: NormalizedCalendarConfig;
}

interface CalendarWidgetTarget {
  id: number;
  type: string;
  tableId?: string;
  tableRef: number;
  options?: unknown;
}

const CALENDAR_MAPPING_KEYS = {
  startDateColumnId: "startDate",
  endDateColumnId: "endDate",
  allDayColumnId: "isAllDay",
  titleColumnId: "title",
  typeColumnId: "type"
} as const;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function exactId(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${label} must be an exact non-empty stable column ID without surrounding whitespace.`);
  }
  return value;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function customViewOptions(options: unknown): JsonRecord | null {
  const outer = record(options);
  if (!outer) return null;
  const raw = outer.customView;
  if (raw === undefined || raw === "") return {};
  if (typeof raw === "string") {
    try {
      return record(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return record(raw);
}

function cloneJsonRecord(value: JsonRecord): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

function sourceColumnTypes(
  widget: CalendarWidgetTarget,
  tableResponse: unknown
): Map<string, string> {
  const root = record(tableResponse);
  const tables = Array.isArray(root?.tables) ? root.tables : [];
  const matching = tables.filter((value) => record(value)?.id === widget.tableId);
  if (matching.length !== 1) {
    throw new Error(
      `Calendar widget ${widget.id} table metadata is unavailable or ambiguous.`
    );
  }
  const table = record(matching[0])!;
  if (!Array.isArray(table.columns)) {
    throw new Error(
      `Calendar widget ${widget.id} requires expanded column metadata.`
    );
  }
  const types = new Map<string, string>();
  for (const value of table.columns) {
    const column = record(value);
    const id = typeof column?.id === "string" ? column.id : undefined;
    const fields = record(column?.fields);
    const type = typeof fields?.type === "string" ? fields.type : undefined;
    if (!id?.trim() || !type || types.has(id)) {
      throw new Error(
        `Calendar widget ${widget.id} table column metadata is incomplete or ambiguous.`
      );
    }
    types.set(id, type);
  }
  return types;
}

function pureType(type: string): string {
  const separator = type.indexOf(":");
  return separator === -1 ? type : type.slice(0, separator);
}

function assertCalendarColumnTypes(
  widget: CalendarWidgetTarget,
  tableResponse: unknown,
  config: NormalizedCalendarConfig
): void {
  const types = sourceColumnTypes(widget, tableResponse);
  const requireType = (
    columnId: string,
    label: string,
    allowed: readonly string[]
  ) => {
    const type = types.get(columnId);
    if (!type) {
      throw new Error(
        `Calendar ${label} column "${columnId}" does not exist on the widget's current table.`
      );
    }
    const normalized = pureType(type);
    if (!allowed.includes(normalized)) {
      throw new Error(
        `Calendar ${label} column "${columnId}" has type "${type}"; expected ${allowed.join(" or ")}.`
      );
    }
  };

  requireType(config.startDateColumnId, "start date", ["Date", "DateTime"]);
  if (config.endDateColumnId !== undefined) {
    requireType(config.endDateColumnId, "end date", ["Date", "DateTime"]);
  }
  if (config.allDayColumnId !== undefined) {
    requireType(config.allDayColumnId, "all-day", ["Bool"]);
  }
  if (config.typeColumnId !== undefined) {
    requireType(config.typeColumnId, "type", ["Choice", "ChoiceList"]);
  }
  if (!types.has(config.titleColumnId)) {
    throw new Error(
      `Calendar title column "${config.titleColumnId}" does not exist on the widget's current table.`
    );
  }
}

function normalizeInput(input: CalendarConfigInput): NormalizedCalendarConfig {
  return {
    titleColumnId: exactId(input.titleColumnId, "Calendar title column ID"),
    startDateColumnId: exactId(input.startDateColumnId, "Calendar start-date column ID"),
    ...(input.endDateColumnId !== undefined
      ? { endDateColumnId: exactId(input.endDateColumnId, "Calendar end-date column ID") }
      : {}),
    ...(input.allDayColumnId !== undefined
      ? { allDayColumnId: exactId(input.allDayColumnId, "Calendar all-day column ID") }
      : {}),
    ...(input.typeColumnId !== undefined
      ? { typeColumnId: exactId(input.typeColumnId, "Calendar type column ID") }
      : {})
  };
}

export function isCalendarWidgetType(type: string): boolean {
  return type === "calendar" || type === "custom.calendar";
}

export function canonicalWidgetType(type: string): string {
  return isCalendarWidgetType(type) ? "calendar" : type;
}

export function normalizeCalendarConfig(
  widget: CalendarWidgetTarget,
  tableResponse: unknown
): CalendarConfigNormalizationResult | undefined {
  if (!isCalendarWidgetType(widget.type)) return undefined;

  const customView = customViewOptions(widget.options);
  const mapping = record(customView?.columnsMapping);
  const maps = tableColumnMaps(widget, tableResponse);
  if (!customView || !mapping || !maps) {
    return { calendarConfigNormalizationIncomplete: true };
  }

  let incomplete = false;
  const resolve = (key: string): string | undefined => {
    const raw = mapping[key];
    if (raw === undefined || raw === null || raw === 0) return undefined;
    const ref = positiveInteger(raw);
    const id = ref ? maps.byRef.get(ref) : undefined;
    if (!id) incomplete = true;
    return id;
  };

  const startDateColumnId = resolve("startDate");
  const titleColumnId = resolve("title");
  const endDateColumnId = resolve("endDate");
  const allDayColumnId = resolve("isAllDay");
  const typeColumnId = resolve("type");

  if (!startDateColumnId || !titleColumnId) incomplete = true;

  return {
    ...(startDateColumnId && titleColumnId
      ? {
          calendarConfig: {
            startDateColumnId,
            titleColumnId,
            ...(endDateColumnId ? { endDateColumnId } : {}),
            ...(allDayColumnId ? { allDayColumnId } : {}),
            ...(typeColumnId ? { typeColumnId } : {})
          }
        }
      : {}),
    ...(incomplete ? { calendarConfigNormalizationIncomplete: true } : {})
  };
}

export function resolveCalendarConfigUpdate(
  widget: CalendarWidgetTarget,
  tableResponse: unknown,
  input: CalendarConfigInput
): ResolvedCalendarConfigUpdate {
  if (!isCalendarWidgetType(widget.type)) {
    throw new Error(`Grist widget ${widget.id} is not a calendar widget.`);
  }

  const config = normalizeInput(input);
  assertCalendarColumnTypes(widget, tableResponse, config);

  const maps = tableColumnMaps(widget, tableResponse);
  if (!maps) {
    throw new Error(
      `Calendar widget ${widget.id} table/column metadata is unavailable, incomplete, ambiguous or has more than 5000 columns; refusing to guess a mapping.`
    );
  }

  const currentOptions = record(widget.options);
  const currentCustomView = customViewOptions(currentOptions);
  if (!currentOptions || !currentCustomView) {
    throw new Error(
      `Calendar widget ${widget.id} has malformed or unavailable current options; refusing to overwrite them.`
    );
  }

  const rawExistingMapping = currentCustomView.columnsMapping;
  const existingMapping =
    rawExistingMapping === undefined || rawExistingMapping === null
      ? {}
      : record(rawExistingMapping);
  if (!existingMapping) {
    throw new Error(
      `Calendar widget ${widget.id} has malformed current column mappings; refusing to overwrite untargeted mapping state.`
    );
  }

  const refFor = (columnId: string): number => {
    const ref = maps.byId.get(columnId);
    if (!ref) {
      throw new Error(
        `Calendar mapped column "${columnId}" does not exist on the widget's current table.`
      );
    }
    return ref;
  };

  const options = cloneJsonRecord(currentOptions);
  const customView = cloneJsonRecord(currentCustomView);
  const mapping = cloneJsonRecord(existingMapping);

  mapping[CALENDAR_MAPPING_KEYS.startDateColumnId] = refFor(config.startDateColumnId);
  mapping[CALENDAR_MAPPING_KEYS.titleColumnId] = refFor(config.titleColumnId);
  mapping[CALENDAR_MAPPING_KEYS.endDateColumnId] =
    config.endDateColumnId !== undefined ? refFor(config.endDateColumnId) : null;
  mapping[CALENDAR_MAPPING_KEYS.allDayColumnId] =
    config.allDayColumnId !== undefined ? refFor(config.allDayColumnId) : null;
  mapping[CALENDAR_MAPPING_KEYS.typeColumnId] =
    config.typeColumnId !== undefined ? refFor(config.typeColumnId) : null;

  customView.columnsMapping = mapping;
  options.customView = JSON.stringify(customView);

  return {
    options,
    optionsJson: JSON.stringify(options),
    calendarConfig: config
  };
}

export function sameCalendarConfig(
  actual: NormalizedCalendarConfig | undefined,
  expected: NormalizedCalendarConfig
): boolean {
  if (!actual) return false;
  return (
    actual.titleColumnId === expected.titleColumnId &&
    actual.startDateColumnId === expected.startDateColumnId &&
    actual.endDateColumnId === expected.endDateColumnId &&
    actual.allDayColumnId === expected.allDayColumnId &&
    actual.typeColumnId === expected.typeColumnId
  );
}
