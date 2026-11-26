import { safeNativeFormText } from "./formInspection.js";
import { tableColumnMaps } from "./tableColumnMaps.js";
import { existingWidgetFields } from "./widgetFields.js";

type JsonRecord = Record<string, unknown>;
type FormParagraph = { type: "paragraph"; text: string; alignment?: "left" | "center" | "right" | undefined };
type FormLink = { type: "form_link"; label: string; prefix?: string | undefined; targetPageId: number; targetWidgetId: number; alignment?: "left" | "center" | "right" | undefined };
type FormField = { type: "field"; columnId: string };
type FormSection = { type: "section"; children: readonly (FormField | FormParagraph | FormLink)[] };
type FormSubmit = { type: "submit" };
export interface FormLayoutInput {
  children: readonly (FormSection | FormParagraph | FormLink | FormSubmit)[];
  confirmPublicLink?: true | undefined;
  submitText?: string | undefined;
  successText?: string | undefined;
  successRedirect?: { targetPageId: number; targetWidgetId: number } | undefined;
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

/** Plain instructional prose, not Markdown syntax that can alter the verified link. */
function safeLinkPrefix(value: unknown): string {
  const text = safeText(value, "Form link prefix");
  if (text.length < 1 || text.length > 160 ||
      !/^\p{L}[\p{L}\p{N}\p{Zs}.,;:'’\-]*$/u.test(text)) {
    throw new Error("Form link prefix must be bounded plain prose.");
  }
  return text;
}

/** Permit only the private Grist Form-link format emitted by Gia. */
function safePreviousParagraph(value: unknown, publicPaths: ReadonlySet<string>): void {
  if (typeof value !== "string") throw new Error("Malformed native Form paragraph.");
  if (safeNativeFormText(value, 300) === value) return;
  const match = /^([^\[\]\r\n]{0,160})\[([^\[\]()\r\n]{1,100})\]\((\/forms\/[a-zA-Z0-9_-]{1,100}\/[1-9]\d{0,9})\)$/.exec(value);
  if (value.length > 300 || !match || !publicPaths.has(match[3]!) ||
      safeNativeFormText(match[2]!, 100) !== match[2]) {
    throw new Error("Pre-existing Form link is protected or malformed.");
  }
  if (match[1]) safeLinkPrefix(match[1]);
}

/** Refuse to replace unsupported native attributes, links or unresolvable field references. */
function safePreviousLayout(
  value: unknown, knownFields: ReadonlySet<number>, publicPaths: ReadonlySet<string>, verifiedRedirect: string | undefined
): JsonRecord | undefined {
  if (value === undefined) return;
  const root = record(value);
  if (!root) throw new Error("Native Form layout is opaque or malformed; refusing overwrite.");
  if (Object.keys(root).length === 0) return;
  if (root.type !== "Layout" ||
      !keys(root, ["id", "type", "children", "submitText", "successText", "successURL", "anotherResponse"]) ||
      !Array.isArray(root.children)) {
    throw new Error("Native Form layout contains unsupported settings; refusing overwrite.");
  }
  if (root.submitText !== undefined) safeText(root.submitText, "Existing submit text");
  if (root.successText !== undefined) safeText(root.successText, "Existing success text");
  if (root.successURL !== undefined && root.successURL !== verifiedRedirect) {
    throw new Error("Pre-existing Form redirect is protected or malformed.");
  }
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
    if ((node.type === "Layout" && depth === 0) || node.type === "Section") {
      if (!keys(node, node.type === "Layout"
          ? ["id", "type", "children", "submitText", "successText", "successURL", "anotherResponse"]
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
      safePreviousParagraph(node.text ?? "", publicPaths);
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
  return root;
}

export function resolveFormLayoutUpdate(
  widget: { id: number; tableRef: number; tableId?: string; layoutSpec?: unknown },
  tables: unknown,
  sectionFields: unknown,
  input: FormLayoutInput,
  publishedFormPaths: ReadonlyMap<string, string> = new Map(),
  verifiedRedirect?: string
): ResolvedFormLayout {
  const fields = existingWidgetFields(widget, tables, sectionFields);
  const columns = tableColumnMaps(widget, tables);
  if (!fields || !columns || fields.length === 0) {
    throw new Error("Native Form field metadata is incomplete; refusing layout write.");
  }
  const fieldsByColumnId = new Map(fields.map(field => [field.columnId, field.fieldId]));
  if (input.successRedirect) {
    if (input.confirmPublicLink !== true) throw new Error("Form redirect requires confirmPublicLink:true.");
    const {targetPageId, targetWidgetId} = input.successRedirect;
    const path = publishedFormPaths.get(targetPageId + ":" + targetWidgetId);
    let parsed: URL | undefined;
    try { if (verifiedRedirect) parsed = new URL(verifiedRedirect); } catch { /* fail closed below */ }
    if (!path || !/^\/forms\/[a-zA-Z0-9_-]{1,100}\/[1-9]\d{0,9}$/.test(path) ||
        !parsed || !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username || parsed.password || parsed.search || parsed.hash ||
        parsed.pathname !== path || parsed.href !== verifiedRedirect) {
      throw new Error("Form redirect target is not resolved to a verified published share.");
    }
  } else if (verifiedRedirect !== undefined) {
    throw new Error("Unexpected verified Form redirect.");
  }
  const previous = safePreviousLayout(widget.layoutSpec, new Set(fields.map(field => field.fieldId)),
    new Set(publishedFormPaths.values()), verifiedRedirect);
  if (!Array.isArray(input.children) || !input.children.length || input.children.length > MAX_CHILDREN) {
    throw new Error("Form layout requires a bounded nonempty root.");
  }
  const used = new Set<string>();
  let count = 1, submits = 0;
  const children: JsonRecord[] = [];
  const paragraph = (node: FormParagraph | FormLink, position: string): JsonRecord => {
    let text: string;
    if (node.type === "form_link") {
      if (input.confirmPublicLink !== true) throw new Error("Form link requires confirmPublicLink:true.");
      if (!Number.isInteger(node.targetPageId) || node.targetPageId < 1 ||
          !Number.isInteger(node.targetWidgetId) || node.targetWidgetId < 1) {
        throw new Error("Form link target IDs must be positive integers.");
      }
      const path = publishedFormPaths.get(node.targetPageId + ":" + node.targetWidgetId);
      if (!path || !/^\/forms\/[a-zA-Z0-9_-]{1,100}\/[1-9]\d{0,9}$/.test(path)) {
        throw new Error("Form link target is not resolved to a verified published share.");
      }
      if (typeof node.label !== "string" || node.label.length < 1 ||
          node.label.length > 100 || /[()\r\n]/.test(node.label)) {
        throw new Error("Form link label must be bounded, nonempty Markdown-safe text.");
      }
      const prefix = node.prefix === undefined ? "" : safeLinkPrefix(node.prefix);
      text = prefix + "[" + safeText(node.label, "Form link label") + "](" + path + ")";
      if (text.length > 300) throw new Error("Form link exceeds the native text budget.");
    } else text = safeText(node.text, "Form paragraph");
    return {id:"gia_paragraph_" + position,type:"Paragraph",text,alignment:node.alignment ?? "left"};
  };
  for (const [index, node] of input.children.entries()) {
    if (++count > MAX_NODES) throw new Error("Form layout exceeds the node budget.");
    if (node.type === "paragraph" || node.type === "form_link") {
      children.push(paragraph(node, String(index)));
    } else if (node.type === "section") {
      if (!Array.isArray(node.children) || !node.children.length ||
          node.children.length > MAX_CHILDREN) throw new Error("Form section must contain bounded fields.");
      const section: JsonRecord[] = [];
      for (const [inner, child] of node.children.entries()) {
        if (++count > MAX_NODES) throw new Error("Form layout exceeds the node budget.");
        if (child.type === "paragraph" || child.type === "form_link") {
          section.push(paragraph(child, index + "_" + inner));
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
        section.push({ id: "gia_field_" + ref, type: "Field", leaf: ref });
      }
      children.push({ id: "gia_section_" + index, type: "Section", children: section });
    } else if (node.type === "submit") {
      submits++;
      if (index !== input.children.length - 1) throw new Error("Form Submit must be the final node.");
      children.push({ id: "gia_submit", type: "Submit" });
    } else {
      throw new Error("Unsupported Form node.");
    }
  }
  if (!used.size || submits !== 1) throw new Error("Form needs a field and exactly one final Submit.");
  const submitText = input.submitText ?? previous?.submitText;
  const successText = input.successText ?? previous?.successText;
  const anotherResponse = input.anotherResponse ?? previous?.anotherResponse;
  const layoutSpec: JsonRecord = {
    id: previous?.id ?? "gia_root", type: "Layout", children,
    ...(submitText !== undefined ? { submitText: safeText(submitText, "Form submit text") } : {}),
    ...(successText !== undefined ? { successText: safeText(successText, "Form success text") } : {}),
    ...(verifiedRedirect !== undefined ? { successURL: verifiedRedirect } : {}),
    ...(anotherResponse !== undefined ? { anotherResponse } : {})
  };
  const layoutSpecJson = JSON.stringify(layoutSpec);
  if (layoutSpecJson.length > 16_384) throw new Error("Form layout exceeds the native payload bound.");
  return { layoutSpec, layoutSpecJson };
}
