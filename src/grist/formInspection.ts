import { tableColumnMaps } from "./tableColumnMaps.js";
import { existingWidgetFields } from "./widgetFields.js";

type JsonRecord = Record<string, unknown>;
type FormText = string | { protected: true };
type FormOptions = {
  question?: FormText;
  required?: boolean;
  acceptFromUrl?: boolean;
};
type FormNode =
  | { type: "layout" | "section"; children: FormNode[] }
  | {
      type: "field";
      columnId: string;
      columnOptions: FormOptions;
      fieldOptions: FormOptions;
      dropdownConditionConfigured?: true;
    }
  | { type: "paragraph"; text: FormText; alignment?: "left" | "center" | "right" }
  | { type: "submit" };

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function options(value: unknown): JsonRecord | undefined {
  if (value === undefined || value === "") return {};
  if (typeof value !== "string" || value.length > 16_384) return undefined;
  try {
    return record(JSON.parse(value));
  } catch {
    return undefined;
  }
}

/** An opaque native dropdown predicate is present, or its metadata cannot be trusted.
 * This is not a parser or a promise of native Form display filtering. */
export function nativeDropdownConditionState(value: unknown): "protected" | "incomplete" {
  const condition = record(value);
  return condition && typeof condition.text === "string" &&
    condition.text.trim() !== "" && condition.text.length <= 2048 &&
    (condition.parsed === undefined ||
      (typeof condition.parsed === "string" && condition.parsed.length <= 16_384))
    ? "protected" : "incomplete";
}

/** Redact link-bearing native Form prose instead of returning potential tokens/URLs. */
export function safeNativeFormText(value: string, maxLength: number): FormText {
  const linkLike = /[:/\\\\@<>{}\\[\\]=&%]|[\\p{L}\\d]\\.[\\p{L}\\d]/u;
  return value.length > Math.min(1000, maxLength) || linkLike.test(value)
    ? { protected: true } : value;
}

function publicationIntent(value: unknown): "requested" | "not_requested" | "unknown" {
  if (value === undefined) return "unknown";
  const parsed = options(value);
  if (!parsed || [parsed.form, parsed.publish].some(
    flag => flag !== undefined && typeof flag !== "boolean"
  )) return "unknown";
  return parsed.form === true && parsed.publish === true ? "requested" : "not_requested";
}

/** Project the native layout elements qualified for application reconstruction. */
export function inspectNativeForm(
  widget: { id: number; tableRef: number; tableId?: string; layoutSpec?: unknown; options?: unknown; formShareOptions?: unknown },
  tables: unknown,
  sectionFields: unknown,
  budget: { forms: number; nodes: number; text: number }
): {
  status: "supported" | "protected" | "incomplete";
  sectionPublicationIntent: ReturnType<typeof publicationIntent>;
  publicationQualification: "not_tested";
  tableId?: string;
  layout?: FormNode;
  submission?: {
    submitText?: FormText;
    successText?: FormText;
    successUrlConfigured?: true;
    anotherResponse?: boolean;
  };
} {
  // Unprojected native section options can affect form semantics. Treat
  // malformed options as incomplete and unknown keys as protected, not absent.
  const sectionOptions = widget.options === undefined ? {} : record(widget.options);
  const hasProtectedSectionOptions = Object.keys(sectionOptions ?? {}).length > 0;
  const sectionPublicationIntent = publicationIntent(widget.formShareOptions);
  // Native share options may alter publication even when form/publish are known.
  // Report unknown keys as protected without returning their names or values.
  const hasProtectedShareOptions = Object.keys(options(widget.formShareOptions) ?? {}).some(
    key => key !== "form" && key !== "publish");
  const common = { sectionPublicationIntent, publicationQualification: "not_tested" as const };
  const incomplete = { ...common, status: "incomplete" as const };
  if (!sectionOptions || budget.forms <= 0 || budget.nodes <= 0) return incomplete;
  budget.forms--;
  const fields = existingWidgetFields(widget, tables, sectionFields);
  const columns = tableColumnMaps(widget, tables);
  const root = record(widget.layoutSpec);
  if (!widget.tableId || !fields || !columns || root?.type !== "Layout") return incomplete;

  const fieldsById = new Map(fields.map(field => [field.fieldId, field.columnId]));
  const rawFields = new Map<number, JsonRecord>();
  const records = record(sectionFields)?.records;
  if (!Array.isArray(records)) return incomplete;
  for (const entry of records) {
    const field = record(entry);
    const id = field?.id;
    if (typeof id !== "number" || !fieldsById.has(id)) continue;
    const metadata = record(field?.fields);
    if (!metadata || metadata.parentId !== widget.id || rawFields.has(id)) return incomplete;
    rawFields.set(id, metadata);
  }

  let hasProtectedText = false;
  let hasProtectedDropdownCondition = false;
  let hasProtectedLayoutAttributes = false;
  let hasProtectedFieldOptions = false;
  const markUnprojectedAttributes = (node: JsonRecord, supported: readonly string[]): void => {
    if (Object.keys(node).some(key => !supported.includes(key))) {
      // Native form presentation may be meaningful even when we cannot safely
      // project it. Never claim a completely reconstructible layout.
      hasProtectedLayoutAttributes = true;
    }
  };
  const safeText = (value: string): FormText => {
    const safe = safeNativeFormText(value, budget.text);
    if (typeof safe !== "string") {
      hasProtectedText = true;
      return safe;
    }
    budget.text -= value.length;
    return safe;
  };

  const fieldOptions = (parsed: JsonRecord): FormOptions | undefined => {
    const { question, formRequired, formAcceptFromUrl } = parsed;
    if ((question !== undefined && typeof question !== "string") ||
        (formRequired !== undefined && typeof formRequired !== "boolean") ||
        (formAcceptFromUrl !== undefined && typeof formAcceptFromUrl !== "boolean")) return undefined;
    return {
      ...(typeof question === "string" ? { question: safeText(question) } : {}),
      ...(typeof formRequired === "boolean" ? { required: formRequired } : {}),
      ...(typeof formAcceptFromUrl === "boolean" ? { acceptFromUrl: formAcceptFromUrl } : {})
    };
  };

  const usedFields = new Set<number>();
  const usedNodeIds = new Set<string>();
  let nodes = 0;
  const walk = (value: unknown, depth: number): FormNode | undefined => {
    if (depth > 12 || ++nodes > 200 || budget.nodes <= 0) return undefined;
    budget.nodes--;
    const node = record(value);
    if (!node) return undefined;
    if (node.id !== undefined) {
      if (typeof node.id !== "string" || !node.id || usedNodeIds.has(node.id)) return undefined;
      usedNodeIds.add(node.id);
    }
    if (node.type === "Section" || (depth === 0 && node.type === "Layout")) {
      if (!Array.isArray(node.children) || node.leaf !== undefined) return undefined;
      markUnprojectedAttributes(node, node.type === "Layout"
        ? ["id", "type", "children", "submitText", "successText", "successURL", "anotherResponse"]
        : ["id", "type", "children"]);
      const children: FormNode[] = [];
      for (const child of node.children) {
        const normalized = walk(child, depth + 1);
        if (!normalized) return undefined;
        children.push(normalized);
      }
      return { type: node.type === "Layout" ? "layout" : "section", children };
    }
    if (node.children !== undefined && (!Array.isArray(node.children) || node.children.length)) return undefined;
    if (node.type === "Field") {
      const leaf = node.leaf;
      if (typeof leaf !== "number" || usedFields.has(leaf)) return undefined;
      const columnId = fieldsById.get(leaf);
      const field = rawFields.get(leaf);
      if (!columnId || !field) return undefined;
      const columnMetadata = columns.fieldsById.get(columnId);
      if (!columnMetadata ||
          (columnMetadata.isFormula === true && typeof columnMetadata.formula === "string" &&
            columnMetadata.formula.length > 0)) return undefined;
      const columnRaw = options(columnMetadata.widgetOptions);
      const fieldRaw = options(field.widgetOptions);
      if (!columnRaw || !fieldRaw) return undefined;
      const column = fieldOptions(columnRaw);
      const override = fieldOptions(fieldRaw);
      if (!column || !override) return undefined;
      // Native widget options can alter form rendering or behavior. An option
      // Gia has not projected must not silently appear absent to a builder.
      if ([columnRaw, fieldRaw].some(source => Object.keys(source).some(key =>
        !["question", "formRequired", "formAcceptFromUrl", "dropdownCondition"].includes(key)))) {
        hasProtectedFieldOptions = true;
      }
      // The native predicate is not yet normalized into a supported, stable-ID
      // contract. Report its presence as protected, never as reconstructible.
      const configured = [columnRaw, fieldRaw].some(source =>
        Object.prototype.hasOwnProperty.call(source, "dropdownCondition"));
      if (configured) {
        for (const source of [columnRaw, fieldRaw]) {
          if (!Object.prototype.hasOwnProperty.call(source, "dropdownCondition")) continue;
          if (nativeDropdownConditionState(source.dropdownCondition) === "incomplete") {
            return undefined;
          }
        }
        hasProtectedDropdownCondition = true;
      }
      markUnprojectedAttributes(node, ["id", "type", "leaf", "children"]);
      usedFields.add(leaf);
      return {
        type: "field", columnId, columnOptions: column, fieldOptions: override,
        ...(configured ? { dropdownConditionConfigured: true } : {})
      };
    }
    if (node.leaf !== undefined) return undefined;
    if (node.type === "Submit") {
      markUnprojectedAttributes(node, ["id", "type", "children"]);
      return { type: "submit" };
    }
    if (node.type === "Paragraph") {
      const { text, alignment } = node;
      if (text !== undefined && typeof text !== "string") return undefined;
      if (alignment !== undefined && alignment !== "left" && alignment !== "center" && alignment !== "right") return undefined;
      markUnprojectedAttributes(node, ["id", "type", "children", "text", "alignment"]);
      return { type: "paragraph", text: safeText(text ?? ""), ...(alignment ? { alignment } : {}) };
    }
    return undefined;
  };

  const { submitText, successText, successURL, anotherResponse } = root;
  if ([submitText, successText, successURL].some(value => value !== undefined && typeof value !== "string") ||
      (anotherResponse !== undefined && typeof anotherResponse !== "boolean")) return incomplete;
  const layout = walk(root, 0);
  if (!layout) return incomplete;
  const submission = {
    ...(typeof submitText === "string" ? { submitText: safeText(submitText) } : {}),
    ...(typeof successText === "string" ? { successText: safeText(successText) } : {}),
    ...(successURL ? { successUrlConfigured: true as const } : {}),
    ...(typeof anotherResponse === "boolean" ? { anotherResponse } : {})
  };
  return {
    ...common, tableId: widget.tableId, layout, submission,
    status: sectionPublicationIntent === "unknown" ? "incomplete" :
      hasProtectedText || hasProtectedDropdownCondition || hasProtectedLayoutAttributes ||
      hasProtectedFieldOptions || hasProtectedShareOptions || hasProtectedSectionOptions || successURL
        ? "protected" : "supported"
  };
}
