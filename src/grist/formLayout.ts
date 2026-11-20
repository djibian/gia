import { safeNativeFormText } from "./formInspection.js";
import { tableColumnMaps } from "./tableColumnMaps.js";
import { existingWidgetFields } from "./widgetFields.js";

type JsonRecord = Record<string, unknown>;
type FormParagraph = { type: "paragraph"; text: string; alignment?: "left" | "center" | "right" | undefined };
type FormField = { type: "field"; columnId: string };
type FormSection = { type: "section"; children: readonly (FormField | FormParagraph)[] };
type FormSubmit = { type: "submit" };
export interface FormLayoutInput {
  children: readonly (FormSection | FormParagraph | FormSubmit)[];
  submitText?: string | undefined;
  successText?: string | undefined;
  anotherResponse?: boolean | undefined;
}
export interface ResolvedFormLayout {
  layoutSpec: JsonRecord;
  layoutSpecJson: string;
}
const MAX_NODES = 100;
const MAX_CHILDREN = 40;

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord : undefined;
}
function keys(value: JsonRecord, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}
function safeText(value: unknown, label: string): string {
  if (typeof value !== "string" || safeNativeFormText(value, 300) !== value) {
    throw new Error(label + " must be bounded non-link-bearing text.");
  }
  return value;
}

/** Refuse to replace unsupported native attributes, links or unresolvable field references. */
function assertSafePreviousLayout(value: unknown, knownFields: ReadonlySet<number>): void {
  if (value === undefined) return;
  const root = record(value);
  if (!root) throw new Error("Native Form layout is opaque or malformed; refusing overwrite.");
  if (Object.keys(root).length === 0) return;
  if (root.type !== "Layout" ||
      !keys(root, ["id", "type", "children", "submitText", "successText", "anotherResponse"]) ||
      !Array.isArray(root.children)) {
    throw new Error("Native Form layout contains unsupported settings; refusing overwrite.");
  }
  if (root.submitText !== undefined) safeText(root.submitText, "Existing submit text");
  if (root.successText !== undefined) safeText(root.successText, "Existing success text");
  if (root.anotherResponse !== undefined && typeof root.anotherResponse !== "boolean") {
    throw new Error("Native Form response setting is malformed.");
  }
  const visitedIds = new Set<string>();
  const visitedFields = new Set<number>();
  let nodes = 0;
  const walk = (raw: unknown, depth: number): void => {
    if (depth > 8 || ++nodes > MAX_NODES) throw new Error("Native Form layout is over budget.");
    const node = record(raw);
    if (!node || typeof node.type !== "string") throw new Error("Malformed native Form node.");
    if (node.id !== undefined) {
      if (typeof node.id !== "string" || !node.id || visitedIds.has(node.id)) {
        throw new Error("Ambiguous native Form node identifier.");
      }
      visitedIds.add(node.id);
    }
    if (node.type === "Layout" || node.type === "Section") {
      if (!keys(node, node.type === "Layout"
          ? ["id", "type", "children", "submitText", "successText", "anotherResponse"]
          : ["id", "type", "children"]) ||
        !Array.isArray(node.children) || node.children.length > MAX_CHILDREN) {
        throw new Error("Unsupported native Form container.");
      }
      for (const child of node.children) walk(child, depth + 1);
      return;
    }
    if (node.type === "Field") {
      if (!keys(node, ["id", "type", "leaf", "children"]) ||
        !Number.isInteger(node.leaf) || !knownFields.has(node.leaf as number) ||
        visitedFields.has(node.leaf as number) ||
        (node.children !== undefined && (!Array.isArray(node.children) || node.children.length))) {
        throw new Error("Unknown or duplicate native Form field reference.");
      }
      visitedFields.add(node.leaf as number);
      return;
    }
    if (node.type === "Paragraph") {
      if (!keys(node, ["id", "type", "text", "alignment", "children"])) {
        throw new Error("Unsupported native Form paragraph settings.");
      }
      safeText(node.text ?? "", "Existing paragraph");
      if (node.alignment !== undefined && !["left", "center", "right"].includes(node.alignment as string)) {
        throw new Error("Unsupported native Form alignment.");
      }
    } else if (node.type === "Submit") {
      if (!keys(node, ["id", "type", "children"])) throw new Error("Unsupported native Submit settings.");
    } else {
      throw new Error("Unsupported native Form layout node.");
    }
    if (node.children !== undefined && (!Array.isArray(node.children) || node.children.length)) {
      throw new Error("Unsupported children in native Form leaf.");
    }
  };
  walk(root, 0);
}

export function resolveFormLayoutUpdate(
  widget: { id: number; tableRef: number; tableId?: string; layoutSpec?: unknown },
  tables: unknown,
  sectionFields: unknown,
  input: FormLayoutInput
): ResolvedFormLayout {
  const fields = existingWidgetFields(widget, tables, sectionFields);
  const columns = tableColumnMaps(widget, tables);
  if (!fields || !columns || fields.length === 0) {
    throw new Error("Native Form field metadata is incomplete; refusing layout write.");
  }
  const fieldsByColumnId = new Map(fields.map(field => [field.columnId, field.fieldId]));
  assertSafePreviousLayout(widget.layoutSpec, new Set(fields.map(field => field.fieldId)));
  if (!Array.isArray(input.children) || !input.children.length || input.children.length > MAX_CHILDREN) {
    throw new Error("Form layout requires a bounded nonempty root.");
  }
  const used = new Set<string>();
  let count = 1, submits = 0;
  const children: JsonRecord[] = [];
  const paragraph = (node: FormParagraph, id: string): JsonRecord => {
    return { id, type: "Paragraph", text: safeText(node.text, "Form paragraph"),
      ...(node.alignment !== undefined ? { alignment: node.alignment } : {}) };
  };
  for (const [index, node] of input.children.entries()) {
    if (++count > MAX_NODES) throw new Error("Form layout exceeds the node budget.");
    const id = "gia_" + index;
    if (node.type === "paragraph") {
      children.push(paragraph(node, id));
    } else if (node.type === "section") {
      if (!Array.isArray(node.children) || !node.children.length ||
          node.children.length > MAX_CHILDREN) throw new Error("Form section must contain bounded fields.");
      const section: JsonRecord[] = [];
      for (const [inner, child] of node.children.entries()) {
        if (++count > MAX_NODES) throw new Error("Form layout exceeds the node budget.");
        if (child.type === "paragraph") {
          section.push(paragraph(child, id + "_" + inner));
          continue;
        }
        if (child.type !== "field" || !child.columnId || used.has(child.columnId)) {
          throw new Error("Form fields must have unique stable column IDs.");
        }
        const ref = fieldsByColumnId.get(child.columnId);
        const metadata = columns.fieldsById.get(child.columnId);
        if (!ref || !metadata ||
            (metadata.isFormula === true && typeof metadata.formula === "string" &&
              metadata.formula.length > 0)) {
          throw new Error("Form field is unavailable or a computed column.");
        }
        used.add(child.columnId);
        section.push({ id: id + "_" + inner, type: "Field", leaf: ref });
      }
      children.push({ id, type: "Section", children: section });
    } else if (node.type === "submit") {
      submits++;
      if (index !== input.children.length - 1) throw new Error("Form Submit must be the final node.");
      children.push({ id, type: "Submit" });
    } else {
      throw new Error("Unsupported Form node.");
    }
  }
  if (!used.size || submits !== 1) throw new Error("Form needs a field and exactly one final Submit.");
  const layoutSpec: JsonRecord = {
    id: "gia_root", type: "Layout", children,
    ...(input.submitText !== undefined ? { submitText: safeText(input.submitText, "Form submit text") } : {}),
    ...(input.successText !== undefined ? { successText: safeText(input.successText, "Form success text") } : {}),
    ...(input.anotherResponse !== undefined ? { anotherResponse: input.anotherResponse } : {})
  };
  const layoutSpecJson = JSON.stringify(layoutSpec);
  if (layoutSpecJson.length > 16_384) throw new Error("Form layout exceeds the native payload bound.");
  return { layoutSpec, layoutSpecJson };
}
