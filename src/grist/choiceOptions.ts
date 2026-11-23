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
): { type: "Choice" | "ChoiceList"; options: JsonRecord; choices: string[] } {
  const options = readFormColumnOptions(response, columnId, limit);
  const columns = record(response)?.columns;
  const column = Array.isArray(columns)
    ? columns.find(item => record(item)?.id === columnId) : undefined;
  const fields = record(record(column)?.fields);
  if (!fields || (fields.type !== "Choice" && fields.type !== "ChoiceList") ||
      fields.isFormula !== false) {
    throw new Error("Choice options require an existing non-formula Choice or ChoiceList column.");
  }
  const raw = options.choices;
  if (raw !== undefined && (!Array.isArray(raw) || raw.length > MAX_NATIVE_CHOICE_OPTIONS ||
      raw.some(value => !validChoice(value)) || new Set(raw).size !== raw.length)) {
    throw new Error("Existing native choices are malformed or ambiguous.");
  }
  return {
    type: fields.type,
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
