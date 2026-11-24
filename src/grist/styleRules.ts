import { isDeepStrictEqual } from "node:util";

type JsonRecord = Record<string, unknown>;
const MAX_OPTIONS = 16_384;
const MAX_FORMULA = 4096;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;

export interface ColumnStyleInput {
  conditionFormula: string;
  style: { fillColor?: string | undefined; textColor?: string | undefined; fontBold?: boolean | undefined };
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
function hasSupportedStyleAttributes(style: JsonRecord): boolean {
  return Object.entries(style).every(([key, value]) => key === "fontBold"
    ? typeof value === "boolean"
    : (key === "fillColor" || key === "textColor") && typeof value === "string" && COLOR.test(value));
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

/** Shared verified native rule sequence, on either a column or a raw table section. */
function readVerifiedStyleSequence(
  ownerRef: number, rawRules: unknown, rawOptions: unknown,
  columns: ReturnType<typeof nativeRows>, tableRef: number, helperName: RegExp
): NativeStyleSequence {
  const refs = rawRules === null || rawRules === undefined
    ? [] : Array.isArray(rawRules) && rawRules[0] === "L" ? rawRules.slice(1) : undefined;
  if (!refs || refs.length > MAX_CONDITIONAL_STYLE_RULES || new Set(refs).size !== refs.length ||
      refs.some(ref => typeof ref !== "number" || !Number.isInteger(ref) || ref < 1)) {
    throw new Error("Native conditional style rule state is protected.");
  }
  const options = parseOptions(rawOptions);
  const rawStyles = options.rulesOptions;
  if (rawStyles !== undefined && (!Array.isArray(rawStyles) ||
      rawStyles.length > refs.length || rawStyles.some(item => !object(item)))) {
    throw new Error("Native conditional style options are protected.");
  }
  const styles: JsonRecord[] = Array.isArray(rawStyles) ? rawStyles as JsonRecord[] : [];
  if (styles.some(style => !hasSupportedStyleAttributes(style))) {
    throw new Error("Unknown or malformed native style attributes are protected.");
  }
  const rules = refs.map((ref, index) => {
    const helpers = columns.filter(row => row.id === ref);
    const helper = helpers[0];
    if (helpers.length !== 1 || !helper ||
        helper.fields.parentId !== tableRef ||
        typeof helper.fields.colId !== "string" ||
        !helperName.test(helper.fields.colId) ||
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
  return { ownerRef, options, rules };
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
  return readVerifiedStyleSequence(
    target.id, target.fields.rules, target.fields.widgetOptions,
    columns, tableRef, /^gristHelper_ConditionalRule\d*$/
  );
}

/** Row formatting belongs to the table's native raw view section, not its visible grid widgets. */
export function readNativeRowStyleSequence(
  tableResponse: unknown, sectionResponse: unknown, columnResponse: unknown,
  tableId: string, limit: number
): NativeStyleSequence {
  if (!IDENTIFIER.test(tableId) || tableId.startsWith("_")) {
    throw new Error("Row style target requires a stable public table ID.");
  }
  const tables = nativeRows(tableResponse, "Table", limit);
  const matches = tables.filter(row => row.fields.tableId === tableId);
  if (matches.length !== 1) throw new Error("Row style table identity missing or ambiguous.");
  const table = matches[0]!;
  const rawRef = table.fields.rawViewSectionRef;
  if (typeof rawRef !== "number" || !Number.isInteger(rawRef) || rawRef < 1) {
    throw new Error("Native raw view section is unavailable.");
  }
  const sections = nativeRows(sectionResponse, "Section", limit);
  const owners = sections.filter(row => row.id === rawRef && row.fields.tableRef === table.id);
  if (owners.length !== 1) throw new Error("Native raw view section is missing or ambiguous.");
  const owner = owners[0]!;
  return readVerifiedStyleSequence(
    owner.id, owner.fields.rules, owner.fields.options,
    nativeRows(columnResponse, "Column", limit), table.id,
    /^gristHelper_RowConditionalRule\d*$/
  );
}


/** Reorder existing raw-table styles only; formula is an exact stable selector.
 * Pair helper refs with colors so priority changes cannot silently swap styling. */
export function planReorderRowStyleRules(
  sequence: NativeStyleSequence, orderedFormulas: readonly string[]
): {
  changed: boolean;
  rules?: NativeStyleSequence["rules"];
  refs?: number[];
  options?: JsonRecord;
  optionsJson?: string;
} {
  const current = sequence.rules;
  if (!Array.isArray(orderedFormulas) || current.length < 2 ||
      current.length > MAX_CONDITIONAL_STYLE_RULES ||
      orderedFormulas.length !== current.length ||
      orderedFormulas.some(formula =>
        typeof formula !== "string" || !formula.trim() ||
        formula.length > MAX_FORMULA || formula.includes("\0")) ||
      new Set(orderedFormulas).size !== orderedFormulas.length ||
      new Set(current.map(rule => rule.formula)).size !== current.length ||
      current.some(rule => !rule.formula.trim() || !Object.keys(rule.style).length)) {
    throw new Error("Row-style reorder requires exactly the complete unique configured rule sequence.");
  }
  const byFormula = new Map(current.map(rule => [rule.formula, rule] as const));
  const rules = orderedFormulas.map(formula => byFormula.get(formula));
  if (rules.some(rule => !rule)) {
    throw new Error("Row-style reorder contains an absent native predicate.");
  }
  const ordered = rules as NativeStyleSequence["rules"];
  const changed = ordered.some((rule, index) => rule.helperRef !== current[index]!.helperRef);
  if (!changed) return { changed: false };
  const options = { ...sequence.options, rulesOptions: ordered.map(rule => rule.style) };
  const optionsJson = JSON.stringify(options);
  if (optionsJson.length > MAX_OPTIONS) throw new Error("Reordered row style options exceed the native bound.");
  return { changed: true, rules: ordered, refs: ordered.map(rule => rule.helperRef), options, optionsJson };
}

/** Both native column and raw-row style owners have identical paired rule semantics. */
export const planReorderColumnStyleRules = planReorderRowStyleRules;


/** Drop one uniquely selected rule from a verified native column owner.
 * Keep all remaining helper/style pairs, including an empty sequence. */
export function planRemoveColumnStyleRule(
  sequence: NativeStyleSequence, conditionFormula: string
): { helperRef: number; remainingRules: NativeStyleSequence["rules"];
     options: JsonRecord; optionsJson: string } {
  if (typeof conditionFormula !== "string" || !conditionFormula.trim() ||
      conditionFormula.length > MAX_FORMULA || conditionFormula.includes("\0") ||
      sequence.rules.length < 1 || sequence.rules.length > MAX_CONDITIONAL_STYLE_RULES ||
      new Set(sequence.rules.map(rule => rule.helperRef)).size !== sequence.rules.length ||
      new Set(sequence.rules.map(rule => rule.formula)).size !== sequence.rules.length ||
      sequence.rules.some(rule => !rule.formula.trim() || !Object.keys(rule.style).length)) {
    throw new Error("Style deletion requires one to eight complete, unique native rules.");
  }
  const matched = sequence.rules.filter(rule => rule.formula === conditionFormula);
  if (matched.length !== 1) {
    throw new Error("Selected style rule formula is absent or ambiguous.");
  }
  const helperRef = matched[0]!.helperRef;
  const remainingRules = sequence.rules.filter(rule => rule.helperRef !== helperRef);
  const options = { ...sequence.options, rulesOptions: remainingRules.map(rule => rule.style) };
  const optionsJson = JSON.stringify(options);
  if (optionsJson.length > MAX_OPTIONS) throw new Error("Remaining native style options exceed the bound.");
  return { helperRef, remainingRules, options, optionsJson };
}

/** Refuse RemoveColumn if any section, field or another column owns the
 * helper, or if a native ownership list is incomplete/opaque/truncated. */
export function exclusiveNativeColumnStyleHelper(
  columnResponse: unknown, sectionResponse: unknown, fieldResponse: unknown,
  ownerRef: number, helperRef: number, limit: number
): string {
  const columns = nativeRows(columnResponse, "Column", limit);
  const sections = nativeRows(sectionResponse, "Section", limit);
  const fields = nativeRows(fieldResponse, "Field", limit);
  const helper = columns.find(row => row.id === helperRef);
  if (!helper || !Number.isSafeInteger(ownerRef) || ownerRef < 1 ||
      ownerRef === helperRef || typeof helper.fields.colId !== "string" ||
      !/^gristHelper_ConditionalRule\d*$/.test(helper.fields.colId) ||
      helper.fields.type !== "Any" || helper.fields.isFormula !== true) {
    throw new Error("Native style helper identity cannot be verified.");
  }
  const references = (value: unknown): number[] => {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value) || value[0] !== "L" ||
        value.slice(1).some(ref =>
          typeof ref !== "number" || !Number.isSafeInteger(ref) || ref < 1)) {
      throw new Error("Opaque or malformed native rule ownership prevents deletion.");
    }
    return value.slice(1) as number[];
  };
  const owningColumns = columns.filter(row => references(row.fields.rules).includes(helperRef));
  if (owningColumns.length !== 1 || owningColumns[0]!.id !== ownerRef ||
      sections.some(row => references(row.fields.rules).includes(helperRef)) ||
      fields.some(row => references(row.fields.rules).includes(helperRef))) {
    throw new Error("Selected style helper is not exclusively owned by target column.");
  }
  return helper.fields.colId;
}


/** Delete exactly one complete unique raw-row style, preserving sibling pairs. */
export function planRemoveRowStyleRule(
  sequence: NativeStyleSequence, conditionFormula: string
): {helperRef: number; remainingRules: NativeStyleSequence["rules"];
    options: JsonRecord; optionsJson: string} {
  if (typeof conditionFormula !== "string" || !conditionFormula.trim() ||
      conditionFormula.length > MAX_FORMULA || conditionFormula.includes("\0") ||
      sequence.rules.length < 1 || sequence.rules.length > MAX_CONDITIONAL_STYLE_RULES ||
      new Set(sequence.rules.map(rule => rule.helperRef)).size !== sequence.rules.length ||
      new Set(sequence.rules.map(rule => rule.formula)).size !== sequence.rules.length ||
      sequence.rules.some(rule => !rule.formula.trim() || !Object.keys(rule.style).length)) {
    throw new Error("Raw-row style deletion requires one to eight complete unique rules.");
  }
  const matches = sequence.rules.filter(rule => rule.formula === conditionFormula);
  if (matches.length !== 1) throw new Error("Selected raw-row style formula is absent or ambiguous.");
  const helperRef = matches[0]!.helperRef;
  const remainingRules = sequence.rules.filter(rule => rule.helperRef !== helperRef);
  const options = {...sequence.options, rulesOptions: remainingRules.map(rule => rule.style)};
  const optionsJson = JSON.stringify(options);
  if (optionsJson.length > MAX_OPTIONS) throw new Error("Remaining row styles exceed native bounds.");
  return {helperRef, remainingRules, options, optionsJson};
}

/** Verify a raw-section helper is exclusively owned before native RemoveColumn.
 * Unknown, shared or incomplete section/field/column owners fail closed. */
export function exclusiveNativeRowStyleHelper(
  columnsResponse: unknown, sectionsResponse: unknown, fieldsResponse: unknown,
  rawSectionRef: number, helperRef: number, limit: number
): string {
  const columns = nativeRows(columnsResponse, "Column", limit);
  const sections = nativeRows(sectionsResponse, "Section", limit);
  const fields = nativeRows(fieldsResponse, "Field", limit);
  const section = sections.find(row => row.id === rawSectionRef);
  const helper = columns.find(row => row.id === helperRef);
  if (!section || !helper || !Number.isSafeInteger(rawSectionRef) ||
      rawSectionRef < 1 || rawSectionRef === helperRef ||
      typeof section.fields.tableRef !== "number" ||
      helper.fields.parentId !== section.fields.tableRef ||
      typeof helper.fields.colId !== "string" ||
      !/^gristHelper_RowConditionalRule\d*$/.test(helper.fields.colId) ||
      helper.fields.type !== "Any" || helper.fields.isFormula !== true ||
      typeof helper.fields.formula !== "string") {
    throw new Error("Native raw-row helper identity cannot be verified.");
  }
  const refs = (value: unknown): number[] => {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value) || value[0] !== "L" ||
        value.slice(1).some(ref => typeof ref !== "number" ||
          !Number.isSafeInteger(ref) || ref < 1)) {
      throw new Error("Malformed or protected native style ownership.");
    }
    return value.slice(1) as number[];
  };
  const owners = sections.filter(row => refs(row.fields.rules).includes(helperRef));
  if (owners.length !== 1 || owners[0]!.id !== rawSectionRef ||
      columns.some(row => refs(row.fields.rules).includes(helperRef)) ||
      fields.some(row => refs(row.fields.rules).includes(helperRef))) {
    throw new Error("Raw-row style helper has a shared or foreign owner.");
  }
  return helper.fields.colId;
}

/** Change only a uniquely identified native rule's predicate, never its helper, colors or order. */
export function planExistingStyleFormulaReplacement(
  sequence: NativeStyleSequence, previousFormula: string, conditionFormula: string
): { changed: boolean; helperRef: number; rules: NativeStyleSequence["rules"] } {
  for (const formula of [previousFormula, conditionFormula]) {
    if (typeof formula !== "string" || !formula.trim() ||
        formula.length > MAX_FORMULA || formula.includes("\0")) {
      throw new Error("Conditional style formula must be bounded, nonempty Grist Python.");
    }
  }
  if (sequence.rules.some(rule =>
    !rule.formula.trim() || Object.keys(rule.style).length === 0)) {
    throw new Error("Native style rule is incomplete; refusing formula replacement.");
  }
  const matches = sequence.rules.filter(rule => rule.formula === previousFormula);
  if (matches.length !== 1) {
    throw new Error("Previous conditional style formula is absent or ambiguous.");
  }
  if (conditionFormula !== previousFormula &&
      sequence.rules.some(rule => rule.formula === conditionFormula)) {
    throw new Error("Replacement conditional style formula already belongs to another rule.");
  }
  const helperRef = matches[0]!.helperRef;
  return {
    changed: previousFormula !== conditionFormula,
    helperRef,
    rules: sequence.rules.map(rule =>
      rule.helperRef === helperRef ? { ...rule, formula: conditionFormula } : rule)
  };
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


/** Modify the style of exactly one existing formula without changing helper identity or order. */
export function planExistingColumnStyleUpdate(
  sequence: NativeStyleSequence, conditionFormula: string, style: ColumnStyleInput["style"]
): { changed: boolean; options?: JsonRecord; widgetOptions?: string } {
  if (sequence.rules.some(rule => !rule.formula.trim() || !Object.keys(rule.style).length)) {
    throw new Error("An existing conditional style is incomplete; refusing update.");
  }
  const matches = sequence.rules.flatMap((rule, index) =>
    rule.formula === conditionFormula ? [index] : []);
  if (matches.length !== 1) {
    throw new Error("Conditional style formula is absent or ambiguous; select an existing unique formula.");
  }
  const index = matches[0]!;
  const existingStyle = sequence.rules[index]!.style;
  const validated = planColumnStyle(
    { ownerRef: sequence.ownerRef, options: {}, existingStyle }, { conditionFormula, style }
  );
  const wanted = (validated.options.rulesOptions as JsonRecord[])[0]!;
  if (isDeepStrictEqual(existingStyle, wanted)) return { changed: false };
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
      throw new Error("Existing conditional style has the same formula but different attributes.");
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
  if (!object(style) || !Object.keys(style).length || !hasSupportedStyleAttributes(style)) {
    throw new Error("Conditional style requires #RRGGBB colors or a boolean fontBold.");
  }
  const previous = state.existingStyle;
  const wanted = style.fillColor === undefined && style.textColor === undefined
    ? { ...previous, ...style }
    : { ...(typeof previous.fontBold === "boolean" ? { fontBold: previous.fontBold } : {}), ...style };
  const options = { ...state.options, rulesOptions: [wanted] };
  const widgetOptions = JSON.stringify(options);
  if (widgetOptions.length > MAX_OPTIONS) throw new Error("Style options exceed native bound.");
  return {
    changed: state.helperRef === undefined || state.formula !== conditionFormula ||
      !isDeepStrictEqual(state.existingStyle, wanted),
    options, widgetOptions
  };
}
