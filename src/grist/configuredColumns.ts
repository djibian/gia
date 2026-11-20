import * as z from "zod/v4";
import type { GristColumnSpec } from "./client.js";
import { sameJsonValue } from "./customWidgetSettingsUpdate.js";
import { safeNativeFormText } from "./formInspection.js";
import { tableColumnMaps } from "./tableColumnMaps.js";

const identifier = z.string().max(100).regex(/^[A-Za-z][A-Za-z0-9_]*$/);
const plainText = (max: number) => z.string().min(1).max(max).refine(
  value => !/[\p{Cc}\p{Cs}]/u.test(value) && safeNativeFormText(value, max) === value,
  "Use bounded plain text without links or control characters."
);
const dropdownCondition = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice_field_equals_literal"),
    choiceColumnId: identifier, value: plainText(120) }).strict(),
  z.object({ kind: z.literal("choice_field_equals_record_ref"),
    choiceColumnId: identifier, recordColumnId: identifier }).strict(),
  z.object({ kind: z.literal("choice_id_in_record_reflist"), recordColumnId: identifier }).strict()
]);

export const configuredColumnSchema = z.object({
  id: identifier,
  fields: z.object({ type: z.string().min(1).max(104), label: z.string().optional() }).strict(),
  configuration: z.object({
    form: z.object({ question: plainText(300).optional(), required: z.boolean().optional(),
      acceptFromUrl: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0).optional(),
    dropdownCondition: dropdownCondition.optional()
  }).strict().refine(value => Object.keys(value).length > 0)
}).strict();

type ConfiguredColumn = z.infer<typeof configuredColumnSchema>;
type Fields = Record<string, unknown>;
type Table = NonNullable<ReturnType<typeof tableColumnMaps>>;
type ReadTable = (id: string) => Table;

function attr(name: "choice" | "rec", columnId: string): unknown[] {
  return ["Attr", ["Name", name], columnId];
}

function resolveCondition(
  condition: z.infer<typeof dropdownCondition>, type: string, table: Table, readTable: ReadTable
): { text: string; parsed: string } {
  const target = /^(?:Ref|RefList):([A-Za-z][A-Za-z0-9_]*)$/.exec(type)?.[1];
  if (!target) throw new Error("A dropdown condition requires a Ref or RefList column.");
  const choice = readTable(target);
  if (condition.kind === "choice_id_in_record_reflist") {
    const id = condition.recordColumnId;
    if (table.fieldsById.get(id)?.type !== `RefList:${target}`) {
      throw new Error("The record column must be a RefList targeting the dropdown table.");
    }
    return { text: `choice.id in $${id}`, parsed: JSON.stringify(["In", attr("choice", "id"), attr("rec", id)]) };
  }
  const id = condition.choiceColumnId;
  const choiceType = choice.fieldsById.get(id)?.type;
  if (condition.kind === "choice_field_equals_literal") {
    if (choiceType !== "Text" && choiceType !== "Choice") {
      throw new Error("A literal comparison requires a Text or Choice column on the dropdown table.");
    }
    const literal = JSON.stringify(condition.value);
    return { text: `choice.${id} == ${literal}`,
      parsed: JSON.stringify(["Eq", attr("choice", id), ["Const", condition.value]]) };
  }
  const recordId = condition.recordColumnId;
  if (typeof choiceType !== "string" || !/^Ref:[A-Za-z][A-Za-z0-9_]*$/.test(choiceType) ||
      table.fieldsById.get(recordId)?.type !== choiceType) {
    throw new Error("A reference comparison requires both columns to reference the same table.");
  }
  readTable(choiceType.slice(4));
  return { text: `choice.${id} == $${recordId}`,
    parsed: JSON.stringify(["Eq", attr("choice", id), attr("rec", recordId)]) };
}

function nativeColumn(column: ConfiguredColumn, table: Table, readTable: ReadTable): GristColumnSpec {
  const { type, label = column.id } = column.fields;
  const { form, dropdownCondition } = column.configuration;
  const relation = /^(?:Ref|RefList):([A-Za-z][A-Za-z0-9_]*)$/.exec(type)?.[1];
  if (relation) readTable(relation);
  else if (!["Text", "Numeric", "Int", "Bool", "Date", "Choice", "ChoiceList"].includes(type)) {
    throw new Error("Unsupported type for configured column creation.");
  }
  const widgetOptions = {
    ...(form?.question !== undefined ? { question: form.question } : {}),
    ...(form?.required !== undefined ? { formRequired: form.required } : {}),
    ...(form?.acceptFromUrl !== undefined ? { formAcceptFromUrl: form.acceptFromUrl } : {}),
    ...(dropdownCondition ? { dropdownCondition: resolveCondition(dropdownCondition, type, table, readTable) } : {})
  };
  return { id: column.id, fields: { type, label, isFormula: false, formula: "",
    widgetOptions: JSON.stringify(widgetOptions) } };
}

function matchesColumn(current: Fields, planned: Fields): boolean {
  if (current.type !== planned.type || current.label !== planned.label ||
      current.isFormula !== false || current.formula !== "" ||
      typeof current.widgetOptions !== "string" || current.widgetOptions.length > 16_384) return false;
  try {
    return sameJsonValue(JSON.parse(current.widgetOptions), JSON.parse(String(planned.widgetOptions)));
  } catch {
    return false;
  }
}

/** Preflight creation and reconcile known stable IDs against fresh Grist columns. */
export function planConfiguredColumns(
  metadata: unknown, tableId: string, requested: readonly GristColumnSpec[]
): GristColumnSpec[] {
  const tables = (metadata as { tables?: unknown } | null)?.tables;
  if (!Array.isArray(tables)) throw new Error("Expanded Grist schema metadata is unavailable.");
  const verified = new Map<string, Table>();
  const readTable: ReadTable = id => {
    const prior = verified.get(id);
    if (prior) return prior;
    const tableRef = tables.find(table => table?.id === id)?.fields?.tableRef;
    const columns = tableColumnMaps({ tableRef, tableId: id }, metadata);
    if (!columns) throw new Error("Expanded Grist schema metadata is incomplete or ambiguous.");
    verified.set(id, columns);
    return columns;
  };
  const table = readTable(tableId);
  const missing: GristColumnSpec[] = [];
  for (const input of requested) {
    const parsed = configuredColumnSchema.safeParse(input);
    if (!parsed.success) throw new Error("Configured column creation requires a homogeneous batch with typed options.");
    const column = nativeColumn(parsed.data, table, readTable);
    const current = table.fieldsById.get(column.id);
    if (!current) missing.push(column);
    else if (!matchesColumn(current, column.fields!)) {
      throw new Error("A requested stable column ID already exists with a different configuration.");
    }
  }
  return missing;
}
