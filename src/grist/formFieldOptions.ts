import { isDeepStrictEqual } from "node:util";
import { safeNativeFormText } from "./formInspection.js";

type JsonRecord = Record<string, unknown>;
export interface FormFieldOptionsInput {
  question?: string | null | undefined;
  required?: boolean | undefined;
  acceptFromUrl?: boolean | undefined;
}
const MAX_OPTIONS = 16_384;
function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord : undefined;
}

/** Validate a whole bounded metadata snapshot and the exact private section-field identity. */
export function readFormFieldOptions(
  snapshot: unknown, sectionId: number, fieldId: number,
  columnRef: number, limit: number
): JsonRecord {
  const records = record(snapshot)?.records;
  if (!Array.isArray(records) || records.length >= limit || limit < 1) {
    throw new Error("Native Form field metadata is missing or truncated.");
  }
  const seen = new Set<number>();
  let raw: unknown;
  let found = false;
  for (const entry of records) {
    const row = record(entry), fields = record(row?.fields), id = row?.id;
    if (!Number.isInteger(id) || (id as number) < 1 || seen.has(id as number) || !fields) {
      throw new Error("Native Form field metadata is malformed or ambiguous.");
    }
    seen.add(id as number);
    if (id === fieldId) {
      if (fields.parentId !== sectionId || fields.colRef !== columnRef) {
        throw new Error("Native Form field identity no longer matches its target column.");
      }
      raw = fields.widgetOptions;
      found = true;
    }
  }
  if (!found) throw new Error("Native Form field no longer exists.");
  if (raw === undefined || raw === "") return {};
  if (typeof raw !== "string" || raw.length > MAX_OPTIONS) {
    throw new Error("Native Form field options are malformed or over budget.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; }
  catch { throw new Error("Native Form field options are malformed."); }
  const options = record(parsed);
  if (!options) throw new Error("Native Form field options are not an object.");
  return options;
}

/** Form field overrides are independent of the underlying column defaults. */
export function resolveFormFieldOptions(
  before: JsonRecord, input: FormFieldOptionsInput
): { options: JsonRecord; widgetOptions: string; changed: boolean } {
  const keys = Object.keys(input);
  if (!keys.length || keys.some(key =>
    !["question", "required", "acceptFromUrl"].includes(key))) {
    throw new Error("Provide a nonempty closed set of Form field options.");
  }
  const options = { ...before };
  if (input.question !== undefined) {
    if (input.question === null) delete options.question;
    else {
      if (typeof input.question !== "string" || !input.question.trim() ||
          safeNativeFormText(input.question, 300) !== input.question) {
        throw new Error("Form field question must be bounded non-link-bearing text.");
      }
      options.question = input.question;
    }
  }
  if (input.required !== undefined) {
    if (typeof input.required !== "boolean") throw new Error("Required must be boolean.");
    options.formRequired = input.required;
  }
  if (input.acceptFromUrl !== undefined) {
    if (typeof input.acceptFromUrl !== "boolean") throw new Error("URL-prefill must be boolean.");
    options.formAcceptFromUrl = input.acceptFromUrl;
  }
  const widgetOptions = JSON.stringify(options);
  if (widgetOptions.length > MAX_OPTIONS) throw new Error("Native Form field options exceed the bound.");
  return { options, widgetOptions, changed: !isDeepStrictEqual(before, options) };
}
