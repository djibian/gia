import { tableColumnMaps } from "./tableColumnMaps.js";
import {
  customViewOptions,
  MAX_CUSTOM_WIDGET_MAPPED_COLUMNS,
  MAX_CUSTOM_WIDGET_MAPPING_KEYS,
  type CustomWidgetAccessLevel,
  type CustomWidgetColumnMapping
} from "./customWidgetSettings.js";

export type CustomWidgetOptionValue = string | number | boolean | (string | number)[] | null;
export type CustomWidgetOptionsPatch = Record<string, CustomWidgetOptionValue>;

export interface CustomWidgetSettingsUpdateInput {
  access?: CustomWidgetAccessLevel | undefined;
  /** Explicit authorization of a data-bearing remote widget; never persisted in Grist. */
  confirmDataAccess?: true | undefined;
  columnsMapping?: CustomWidgetColumnMapping | null | undefined;
  optionsPatch?: CustomWidgetOptionsPatch | undefined;
  /** Explicitly clear inert widget-owned options after deactivation, retaining identity/mappings. */
  resetWidgetOptions?: true | undefined;
}

export interface ResolvedCustomWidgetSettingsUpdate {
  options: Record<string, unknown>;
  optionsJson: string;
}

type JsonRecord = Record<string, unknown>;

interface WidgetSettingsUpdateTarget {
  id: number;
  type: string;
  tableId?: string;
  tableRef: number;
  options?: unknown;
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function exactNonEmptyText(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${label} must be an exact non-empty stable ID without surrounding whitespace.`);
  }
  return value;
}

function targetColumnRefs(
  widget: WidgetSettingsUpdateTarget,
  tableResponse: unknown
): Map<string, number> {
  const maps = tableColumnMaps(widget, tableResponse);
  if (!maps) {
    throw new Error(`Custom widget ${widget.id} table/column metadata is unavailable, incomplete, ambiguous or has more than 5000 columns; refusing to guess a mapping.`);
  }
  return maps.byId;
}

function resolveMappings(
  widget: WidgetSettingsUpdateTarget,
  tableResponse: unknown,
  mapping: CustomWidgetColumnMapping
): Record<string, number | number[] | null> {
  const entries = Object.entries(mapping);
  if (entries.length > MAX_CUSTOM_WIDGET_MAPPING_KEYS) {
    throw new Error(
      `Custom widget mapping has ${entries.length} keys; maximum is ${MAX_CUSTOM_WIDGET_MAPPING_KEYS}.`
    );
  }

  const byId = targetColumnRefs(widget, tableResponse);
  const resolved: Record<string, number | number[] | null> = {};
  let mappedColumns = 0;

  for (const [key, value] of entries) {
    exactNonEmptyText(key, "Custom widget mapping key");
    if (key === "__proto__") throw new Error("Custom widget mapping key __proto__ is unsupported.");
    if (value === null) {
      resolved[key] = null;
      continue;
    }

    const ids = Array.isArray(value) ? value : [value];
    mappedColumns += ids.length;
    if (mappedColumns > MAX_CUSTOM_WIDGET_MAPPED_COLUMNS) {
      throw new Error(
        `Custom widget mapping addresses more than ${MAX_CUSTOM_WIDGET_MAPPED_COLUMNS} columns.`
      );
    }

    const seenIds = new Set<string>();
    const refs = ids.map((rawId) => {
      const id = exactNonEmptyText(rawId, "Custom widget mapped column ID");
      if (seenIds.has(id)) {
        throw new Error(`Custom widget mapping contains duplicate column ID "${id}".`);
      }
      seenIds.add(id);
      const ref = byId.get(id);
      if (!ref) {
        throw new Error(
          `Custom widget mapped column "${id}" does not exist on the widget's current table.`
        );
      }
      return ref;
    });
    resolved[key] = Array.isArray(value) ? refs : refs[0]!;
  }

  return resolved;
}

function cloneJsonRecord(value: JsonRecord): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}


/** Patches inert values of an existing widget, never its identity, URL or access. */
function isIdentifiedWidget(customView: JsonRecord, approvedDirect: boolean): boolean {
  return approvedDirect || (typeof customView.widgetId === "string" && customView.widgetId.trim().length > 0);
}

function applyWidgetOptionsPatch(
  customView: JsonRecord, patch: CustomWidgetOptionsPatch, approvedDirect: boolean
): void {
  if (!isIdentifiedWidget(customView, approvedDirect)) {
    throw new Error("Widget option changes require an already identified custom widget.");
  }
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("Widget option patch must be an object.");
  }
  const entries = Object.entries(patch);
  if (entries.length < 1 || entries.length > 24) {
    throw new Error("Widget option patch must contain 1 to 24 keys.");
  }
  const current = customView.widgetOptions;
  if (current !== undefined && current !== null && !record(current)) {
    throw new Error("Existing widget-owned options are opaque; refusing overwrite.");
  }
  const options = cloneJsonRecord(record(current) ?? {});
  const simple = (item: unknown): boolean => {
    if (typeof item === "string") {
      return item.length <= 160 && !/[<>\x00-\x1f]/.test(item) &&
        !/(?:https?|javascript|data|file):/i.test(item);
    }
    return typeof item === "number" ? Number.isFinite(item) && Math.abs(item) <= 1_000_000
      : typeof item === "boolean";
  };
  for (const [key, value] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) ||
        ["__proto__", "constructor", "prototype"].includes(key) ||
        /(?:token|secret|password|credential|apikey|authorization)/i.test(key)) {
      throw new Error("Widget option key is protected or invalid.");
    }
    if (value !== null && !(Array.isArray(value) ?
        value.length <= 20 && value.every(item =>
          (typeof item === "string" || typeof item === "number") && simple(item))
        : simple(value))) {
      throw new Error("Widget option values must be bounded, inert literals.");
    }
    options[key] = value;
  }
  if (JSON.stringify(options).length > 4096) {
    throw new Error("Widget-owned options exceed the payload limit.");
  }
  customView.widgetOptions = options;
}

/** Resolve a bounded update, preserving identity, URL and untargeted options. */
export function resolveCustomWidgetSettingsUpdate(
  widget: WidgetSettingsUpdateTarget,
  tableResponse: unknown,
  update: CustomWidgetSettingsUpdateInput,
  approvedDirect = false
): ResolvedCustomWidgetSettingsUpdate {
  if (widget.type !== "custom") {
    throw new Error(`Grist widget ${widget.id} is not a custom widget.`);
  }
  if (update.access === undefined && update.columnsMapping === undefined &&
      update.optionsPatch === undefined && update.resetWidgetOptions !== true) {
    throw new Error("At least one custom widget setting must be supplied.");
  }

  const currentOptions = record(widget.options);
  const currentCustomView = customViewOptions(currentOptions);
  if (!currentOptions || !currentCustomView) {
    throw new Error(
      `Custom widget ${widget.id} has malformed or unavailable current options; refusing to overwrite them.`
    );
  }

  const options = cloneJsonRecord(currentOptions);
  const customView = cloneJsonRecord(currentCustomView);

  if (update.access !== undefined) {
    if (!(["none", "read table", "full"] as const).includes(update.access)) {
      throw new Error(`Unsupported custom widget access level "${update.access}".`);
    }
    customView.access = update.access;
  }

  if (update.columnsMapping !== undefined) {
    customView.columnsMapping =
      update.columnsMapping === null
        ? null
        : resolveMappings(widget, tableResponse, update.columnsMapping);
  }

  if (update.resetWidgetOptions === true) {
    if (update.optionsPatch !== undefined) {
      throw new Error("Widget option reset and patch are separate intentions.");
    }
    if (currentCustomView.access !== "none" ||
        (update.access !== undefined && update.access !== "none")) {
      throw new Error("Deactivate widget data access to none before resetting options.");
    }
    if (!isIdentifiedWidget(currentCustomView, approvedDirect)) {
      throw new Error("Widget option reset requires an already identified custom widget.");
    }
    if (currentCustomView.widgetOptions !== undefined &&
        currentCustomView.widgetOptions !== null &&
        !record(currentCustomView.widgetOptions)) {
      throw new Error("Existing widget options are opaque; refusing reset.");
    }
    customView.widgetOptions = null;
  }

  if (update.optionsPatch !== undefined) {
    applyWidgetOptionsPatch(customView, update.optionsPatch, approvedDirect);
  }

  options.customView = JSON.stringify(customView);
  return { options, optionsJson: JSON.stringify(options) };
}

export function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameJsonValue(value, right[index]))
    );
  }
  const leftRecord = record(left);
  const rightRecord = record(right);
  if (!leftRecord || !rightRecord) return false;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && sameJsonValue(leftRecord[key], rightRecord[key])
    )
  );
}
