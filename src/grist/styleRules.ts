import { isDeepStrictEqual } from "node:util";

type JsonRecord = Record<string, unknown>;
const MAX_OPTIONS = 16_384;
const MAX_FORMULA = 4096;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;

export interface ColumnStyleInput {
  conditionFormula: string;
  style: { fillColor?: string | undefined; textColor?: string | undefined };
}
export interface NativeStyleState {
  ownerRef: number;
  helperRef?: number;
  formula?: string;
  options: JsonRecord;
  existingStyle: JsonRecord;
}
function object(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord : undefined;
}
function nativeRows(value: unknown, label: string, limit: number) {
  const records = object(value)?.records;
  if (!Number.isInteger(limit) || limit < 2 || !Array.isArray(records) || records.length >= limit) {
    throw new Error(label + " metadata unavailable or truncated.");
  }
  const seen = new Set<number>();
  return records.map(value => {
    const record = object(value);
    const id = record?.id;
    const fields = object(record?.fields);
    if (typeof id !== "number" || !Number.isInteger(id) || id < 1 || !fields || seen.has(id)) {
      throw new Error(label + " metadata malformed or censored.");
    }
    seen.add(id);
    return { id, fields };
  });
}
function parseOptions(value: unknown): JsonRecord {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value !== "string" || value.length > MAX_OPTIONS) {
    throw new Error("Native style options unreadable or oversized.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(value) as unknown; }
  catch { throw new Error("Native style options malformed."); }
  const result = object(parsed);
  if (!result) throw new Error("Native style options not an object.");
  return result;
}

/** Strictly one column-scoped native rule, never a row or view-field rule. */
export function readNativeColumnStyle(
  tableResponse: unknown, columnResponse: unknown, tableId: string, columnId: string, limit: number
): NativeStyleState {
  if (!IDENTIFIER.test(tableId) || !IDENTIFIER.test(columnId) ||
      columnId.startsWith("gristHelper_")) {
    throw new Error("Style target requires stable public table and column IDs.");
  }
  const tables = nativeRows(tableResponse, "Table", limit);
  const matchingTables = tables.filter(row => row.fields.tableId === tableId);
  if (matchingTables.length !== 1) throw new Error("Style table identity missing or ambiguous.");
  const tableRef = matchingTables[0]!.id;
  const columns = nativeRows(columnResponse, "Column", limit);
  const matches = columns.filter(row =>
    row.fields.parentId === tableRef && row.fields.colId === columnId);
  if (matches.length !== 1) throw new Error("Style column identity missing or ambiguous.");
  const target = matches[0]!;
  const rawRules = target.fields.rules;
  const refs = rawRules === null || rawRules === undefined
    ? [] : Array.isArray(rawRules) && rawRules[0] === "L" ? rawRules.slice(1) : undefined;
  if (!refs || refs.length > 1 || refs.some(ref =>
    typeof ref !== "number" || !Number.isInteger(ref) || ref < 1)) {
    throw new Error("Existing conditional style rule state is protected.");
  }
  const options = parseOptions(target.fields.widgetOptions);
  const styleOptions = options.rulesOptions;
  if (styleOptions !== undefined && (!Array.isArray(styleOptions) ||
      styleOptions.length > 1 || styleOptions.some(item => !object(item)))) {
    throw new Error("Existing conditional style options are protected.");
  }
  if (refs.length === 0 && Array.isArray(styleOptions) && styleOptions.length) {
    throw new Error("Unlinked conditional style metadata is protected.");
  }
  const existingStyle = Array.isArray(styleOptions) ? object(styleOptions[0]) ?? {} : {};
  if (Object.keys(existingStyle).some(key => !["fillColor", "textColor"].includes(key)) ||
      Object.values(existingStyle).some(value => typeof value !== "string" || !COLOR.test(value))) {
    throw new Error("Unknown or malformed native style attributes are protected.");
  }
  if (!refs.length) return { ownerRef: target.id, options, existingStyle };
  const helperRef = refs[0] as number;
  const helpers = columns.filter(row => row.id === helperRef);
  const helper = helpers[0];
  if (helpers.length !== 1 || !helper ||
      helper.fields.parentId !== tableRef ||
      typeof helper.fields.colId !== "string" ||
      !/^gristHelper_ConditionalRule\d*$/.test(helper.fields.colId) ||
      helper.fields.type !== "Any" || helper.fields.isFormula !== true ||
      typeof helper.fields.formula !== "string") {
    throw new Error("Native conditional style helper cannot be verified.");
  }
  return {
    ownerRef: target.id, helperRef,
    formula: helper.fields.formula as string, options, existingStyle
  };
}
export function planColumnStyle(state: NativeStyleState, input: ColumnStyleInput) {
  const { conditionFormula, style } = input;
  if (typeof conditionFormula !== "string" || !conditionFormula.trim() ||
      conditionFormula.length > MAX_FORMULA || conditionFormula.includes("\0")) {
    throw new Error("Conditional style formula must be bounded, nonempty Grist Python.");
  }
  if (!object(style) || !Object.keys(style).length ||
      Object.keys(style).some(key => !["fillColor", "textColor"].includes(key)) ||
      Object.values(style).some(value => typeof value !== "string" || !COLOR.test(value))) {
    throw new Error("Conditional style colors must be explicit #RRGGBB values.");
  }
  const wanted = { ...style };
  const options = { ...state.options, rulesOptions: [wanted] };
  const widgetOptions = JSON.stringify(options);
  if (widgetOptions.length > MAX_OPTIONS) throw new Error("Style options exceed native bound.");
  return {
    changed: state.helperRef === undefined || state.formula !== conditionFormula ||
      !isDeepStrictEqual(state.existingStyle, wanted),
    options, widgetOptions
  };
}
