import { isDeepStrictEqual } from "node:util";
import { safeNativeFormText } from "./formInspection.js";

type JsonRecord = Record<string, unknown>;
export interface FormColumnOptionsUpdateInput {
  question?: string | null | undefined;
  required?: boolean | undefined;
  acceptFromUrl?: boolean | undefined;
}
const MAX_OPTIONS_LENGTH = 16_384;
function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord : undefined;
}

/** Demand a complete, unambiguous native snapshot before any read-modify-write. */
export function readFormColumnOptions(response: unknown, columnId: string, limit: number): JsonRecord {
  const columns = record(response)?.columns;
  if (!Array.isArray(columns) || !Number.isInteger(limit) || limit < 1 || columns.length >= limit) {
    throw new Error("Native column metadata is missing or may be truncated.");
  }
  const seen = new Set<string>();
  let raw: unknown;
  let found = false;
  for (const entry of columns) {
    const item = record(entry);
    if (typeof item?.id !== "string" || !item.id || !record(item.fields) || seen.has(item.id)) {
      throw new Error("Native column metadata is malformed or ambiguous.");
    }
    seen.add(item.id);
    if (item.id === columnId) { raw = record(item.fields)!.widgetOptions; found = true; }
  }
  if (!found) throw new Error("Requested column is absent from the complete native snapshot.");
  if (raw === undefined || raw === "") return {};
  if (typeof raw !== "string" || raw.length > MAX_OPTIONS_LENGTH) {
    throw new Error("Native column widget options are incomplete or unsupported.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; }
  catch { throw new Error("Native column widget options are malformed."); }
  const result = record(parsed);
  if (!result) throw new Error("Native column widget options are not an object.");
  return result;
}

/** Only Form-owned keys change; opaque Grist display/style/dropdown keys survive. */
export function applyFormColumnOptions(
  before: JsonRecord, update: FormColumnOptionsUpdateInput
): { options: JsonRecord; changed: boolean; widgetOptions: string } {
  const keys = Object.keys(update);
  if (!keys.length || keys.some(key => !["question", "required", "acceptFromUrl"].includes(key))) {
    throw new Error("Provide only supported Form column option changes.");
  }
  const options = { ...before };
  if (update.question !== undefined) {
    if (update.question === null) delete options.question;
    else {
      if (typeof update.question !== "string" || !update.question.trim() ||
        safeNativeFormText(update.question, 300) !== update.question) {
        throw new Error("Form question must be bounded non-link-bearing text.");
      }
      options.question = update.question;
    }
  }
  if (update.required !== undefined) {
    if (typeof update.required !== "boolean") throw new Error("Form required flag must be boolean.");
    options.formRequired = update.required;
  }
  if (update.acceptFromUrl !== undefined) {
    if (typeof update.acceptFromUrl !== "boolean") throw new Error("Form prefill flag must be boolean.");
    options.formAcceptFromUrl = update.acceptFromUrl;
  }
  const widgetOptions = JSON.stringify(options);
  if (widgetOptions.length > MAX_OPTIONS_LENGTH) {
    throw new Error("Updated Form widget options exceed the native read bound.");
  }
  return { options, changed: !isDeepStrictEqual(before, options), widgetOptions };
}
