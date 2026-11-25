import { isDeepStrictEqual } from "node:util";
import { readFormColumnOptions } from "./formColumnOptions.js";

type JsonRecord = Record<string, unknown>;
export const MAX_NATIVE_CHOICE_OPTIONS = 64;
const MAX_CHOICE_LENGTH = 120;

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord : undefined;
}

function validChoice(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= MAX_CHOICE_LENGTH && value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

/** A complete typed native schema read must precede every choice mutation. */
export function readChoiceColumnState(
  response: unknown, columnId: string, limit: number
): { type: "Choice" | "ChoiceList"; metadata: JsonRecord; options: JsonRecord; choices: string[] } {
  const options = readFormColumnOptions(response, columnId, limit);
  const columns = record(response)?.columns;
  const column = Array.isArray(columns)
    ? columns.find(item => record(item)?.id === columnId) : undefined;
  const fields = record(record(column)?.fields);
  if (!fields || (fields.type !== "Choice" && fields.type !== "ChoiceList") ||
      typeof fields.isFormula !== "boolean" ||
      (fields.isFormula && (typeof fields.formula !== "string" || !fields.formula.trim()))) {
    throw new Error("Choice options require an existing Choice or ChoiceList column with complete formula metadata.");
  }
  const raw = options.choices;
  if (raw !== undefined && (!Array.isArray(raw) || raw.length > MAX_NATIVE_CHOICE_OPTIONS ||
      raw.some(value => !validChoice(value)) || new Set(raw).size !== raw.length)) {
    throw new Error("Existing native choices are malformed or ambiguous.");
  }
  // Presentation edits must not change formula ownership, expression or other schema metadata.
  const { widgetOptions: _options, ...metadata } = fields;
  return {
    type: fields.type,
    metadata,
    options,
    choices: raw === undefined ? [] : [...raw as string[]]
  };
}

/** Append only missing labels: no deletions, reordering or sibling-option changes. */
export function planAppendChoiceOptions(
  before: ReturnType<typeof readChoiceColumnState>, values: readonly string[]
): { changed: boolean; options: JsonRecord; widgetOptions: string; choices: string[] } {
  if (!Array.isArray(values) || values.length === 0 ||
      values.length > MAX_NATIVE_CHOICE_OPTIONS ||
      values.some(value => !validChoice(value)) ||
      new Set(values).size !== values.length) {
    throw new Error("Choice labels must be unique, bounded, nonempty plain text.");
  }
  const choices = [...before.choices];
  for (const value of values) if (!choices.includes(value)) choices.push(value);
  if (choices.length > MAX_NATIVE_CHOICE_OPTIONS) {
    throw new Error("Native choice list exceeds 64 entries.");
  }
  const options = isDeepStrictEqual(choices, before.choices)
    ? before.options : { ...before.options, choices };
  const widgetOptions = JSON.stringify(options);
  if (widgetOptions.length > 16_384) {
    throw new Error("Updated native choice options exceed the metadata bound.");
  }
  return { changed: !isDeepStrictEqual(options, before.options), options, widgetOptions, choices };
}


/** Reorder the complete native label set; never add/remove labels or modify siblings. */
export function planReorderChoiceOptions(
  before: ReturnType<typeof readChoiceColumnState>, requested: readonly string[]
): { changed: boolean; options: JsonRecord; widgetOptions: string; choices: string[] } {
  if (!Array.isArray(requested) || requested.length < 2 ||
      requested.length !== before.choices.length ||
      requested.length > MAX_NATIVE_CHOICE_OPTIONS ||
      requested.some(value => !validChoice(value)) ||
      new Set(requested).size !== requested.length ||
      requested.some(value => !before.choices.includes(value))) {
    throw new Error("Choice reorder requires the complete unique existing label set of 2–64 labels.");
  }
  const choices = [...requested];
  const options = isDeepStrictEqual(choices, before.choices)
    ? before.options : { ...before.options, choices };
  const widgetOptions = JSON.stringify(options);
  if (widgetOptions.length > 16_384) {
    throw new Error("Reordered native choices exceed the metadata bound.");
  }
  return { changed: !isDeepStrictEqual(options, before.options), options, widgetOptions, choices };
}

export type ChoiceColors = { fillColor?: string | undefined; textColor?: string | undefined };
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Change colors for one existing native Choice label; never create a label or drop sibling options. */
export function planSetChoiceColors(
  before: ReturnType<typeof readChoiceColumnState>, label: string, colors: ChoiceColors
): { changed: boolean; options: JsonRecord; widgetOptions: string } {
  if (!before.choices.includes(label)) {
    throw new Error("Choice color target must be an existing native choice label.");
  }
  if (!record(colors) || Object.keys(colors).length === 0 ||
      Object.keys(colors).some(key => !["fillColor", "textColor"].includes(key)) ||
      Object.values(colors).some(value => typeof value !== "string" || !HEX_COLOR.test(value))) {
    throw new Error("Choice colors require one or two explicit #RRGGBB fields.");
  }
  const original = before.options.choiceOptions;
  if (original !== undefined && !record(original)) {
    throw new Error("Existing native choice colors are malformed.");
  }
  const styles = (original ?? {}) as JsonRecord;
  if (Object.values(styles).some(value => !record(value))) {
    throw new Error("Existing native choice color entries are malformed.");
  }
  const oldStyle = Object.prototype.hasOwnProperty.call(styles, label)
    ? record(styles[label])! : {};
  for (const colorKey of ["fillColor", "textColor"]) {
    const value = oldStyle[colorKey];
    if (value !== undefined && (typeof value !== "string" || !HEX_COLOR.test(value))) {
      throw new Error("Existing targeted native choice colors are malformed.");
    }
  }
  const options: JsonRecord = {
    ...before.options,
    choiceOptions: { ...styles, [label]: { ...oldStyle, ...colors } }
  };
  const widgetOptions = JSON.stringify(options);
  if (widgetOptions.length > 16_384) {
    throw new Error("Updated native choice color options exceed the metadata bound.");
  }
  return { changed: !isDeepStrictEqual(options, before.options), options, widgetOptions };
}
