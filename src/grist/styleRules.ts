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

export const MAX_CONDITIONAL_STYLE_RULES = 8;
export interface NativeStyleSequence {
  ownerRef: number;
  options: JsonRecord;
  rules: Array<{ helperRef: number; formula: string; style: JsonRecord }>;
}

/** Native _grist_Tables_column rules and rulesOptions are paired in order. */
export function readNativeColumnStyleSequence(
  tableResponse: unknown, columnResponse: unknown,
  tableId: string, columnId: string, limit: number
): NativeStyleSequence {
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
  if (!refs || refs.length > MAX_CONDITIONAL_STYLE_RULES || new Set(refs).size !== refs.length ||
      refs.some(ref => typeof ref !== "number" || !Number.isInteger(ref) || ref < 1)) {
    throw new Error("Native conditional style rule state is protected.");
  }
  const options = parseOptions(target.fields.widgetOptions);
  const rawStyles = options.rulesOptions;
  if (rawStyles !== undefined && (!Array.isArray(rawStyles) ||
      rawStyles.length > refs.length || rawStyles.some(item => !object(item)))) {
    throw new Error("Native conditional style options are protected.");
  }
  const styles: JsonRecord[] = Array.isArray(rawStyles) ? rawStyles as JsonRecord[] : [];
  if (styles.some(style => Object.keys(style).some(key =>
        !["fillColor", "textColor"].includes(key)) ||
      Object.values(style).some(value =>
        typeof value !== "string" || !COLOR.test(value)))) {
    throw new Error("Unknown or malformed native style attributes are protected.");
  }
  const rules = refs.map((ref, index) => {
    const helpers = columns.filter(row => row.id === ref);
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
      helperRef: ref as number,
      formula: helper.fields.formula as string,
      style: styles[index] ?? {}
    };
  });
  return { ownerRef: target.id, options, rules };
}

/** Preserve old one-rule semantics, including refusing any native multi-rule target. */
export function readNativeColumnStyle(
  tableResponse: unknown, columnResponse: unknown,
  tableId: string, columnId: string, limit: number
): NativeStyleState {
  const sequence = readNativeColumnStyleSequence(
    tableResponse, columnResponse, tableId, columnId, limit
  );
  if (sequence.rules.length > 1) {
    throw new Error("Existing conditional style rule state is protected.");
  }
  const rule = sequence.rules[0];
  return {
    ownerRef: sequence.ownerRef,
    ...(rule ? { helperRef: rule.helperRef, formula: rule.formula } : {}),
    options: sequence.options, existingStyle: rule?.style ?? {}
  };
}


/** Modify the colors of exactly one existing formula without touching native helper identity or order. */
export function planExistingColumnStyleUpdate(
  sequence: NativeStyleSequence, conditionFormula: string, style: ColumnStyleInput["style"]
): { changed: boolean; options?: JsonRecord; widgetOptions?: string } {
  const validated = planColumnStyle(
    { ownerRef: sequence.ownerRef, options: {}, existingStyle: {} },
    { conditionFormula, style }
  );
  const wanted = (validated.options.rulesOptions as JsonRecord[])[0]!;
  if (sequence.rules.some(rule => !rule.formula.trim() || !Object.keys(rule.style).length)) {
    throw new Error("An existing conditional style is incomplete; refusing update.");
  }
  const matches = sequence.rules.flatMap((rule, index) =>
    rule.formula === conditionFormula ? [index] : []);
  if (matches.length !== 1) {
    throw new Error("Conditional style formula is absent or ambiguous; select an existing unique formula.");
  }
  const index = matches[0]!;
  if (isDeepStrictEqual(sequence.rules[index]!.style, wanted)) return { changed: false };
  const options: JsonRecord = {
    ...sequence.options,
    rulesOptions: sequence.rules.map((rule, i) => i === index ? wanted : rule.style)
  };
  const widgetOptions = JSON.stringify(options);
  if (widgetOptions.length > MAX_OPTIONS) throw new Error("Conditional style options exceed the native bound.");
  return { changed: true, options, widgetOptions };
}

export function planAppendColumnStyleRule(
  sequence: NativeStyleSequence, input: ColumnStyleInput
): { changed: boolean; options?: JsonRecord; widgetOptions?: string } {
  const validated = planColumnStyle(
    { ownerRef: sequence.ownerRef, options: {}, existingStyle: {} }, input
  );
  const style = (validated.options.rulesOptions as JsonRecord[])[0]!;
  if (sequence.rules.some(rule => !rule.formula.trim() || Object.keys(rule.style).length === 0)) {
    throw new Error("An existing conditional style is unconfigured; refusing append.");
  }
  for (const rule of sequence.rules) {
    if (rule.formula === input.conditionFormula) {
      if (isDeepStrictEqual(rule.style, style)) return { changed: false };
      throw new Error("Existing conditional style has the same formula but different colors.");
    }
  }
  if (sequence.rules.length >= MAX_CONDITIONAL_STYLE_RULES) {
    throw new Error("Conditional style rule count exceeds the bounded maximum.");
  }
  const options: JsonRecord = {
    ...sequence.options,
    rulesOptions: [...sequence.rules.map(rule => rule.style), style]
  };
  const widgetOptions = JSON.stringify(options);
  if (widgetOptions.length > MAX_OPTIONS) {
    throw new Error("Conditional style options exceed the native payload bound.");
  }
  return { changed: true, options, widgetOptions };
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
