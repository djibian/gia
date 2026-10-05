import { existingWidgetFields } from "./widgetFields.js";

export const MAX_CARD_LAYOUT_NODES = 500;
export const MAX_CARD_LAYOUT_DEPTH = 50;

type JsonRecord = Record<string, unknown>;

interface WidgetIdentity {
  id: number;
  tableRef: number;
}

export type NormalizedCardLayoutNode =
  | {
      kind: "field";
      columnId: string;
      size?: number | undefined;
    }
  | {
      kind: "group";
      children: NormalizedCardLayoutNode[];
      size?: number | undefined;
    };

export interface NormalizedCardLayout {
  root?: NormalizedCardLayoutNode;
  unplacedColumnIds: string[];
}

export interface CardLayoutUpdateInput {
  root: NormalizedCardLayoutNode;
}

export interface ResolvedCardLayoutUpdate {
  layoutSpecJson: string;
  expectedLayout: NormalizedCardLayout;
}

export type CardLayoutNormalizationResult =
  | { cardLayout: NormalizedCardLayout }
  | { cardLayoutNormalizationIncomplete: true };

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function normalizedSize(value: unknown): { size?: number; invalid: boolean } {
  if (value === undefined) return { invalid: false };
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return { invalid: true };
  }
  return { size: value, invalid: false };
}

function assertOnlyKeys(node: JsonRecord, allowed: readonly string[], label: string): void {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(node).filter((key) => !allowedKeys.has(key));
  if (unknown.length > 0) {
    throw new Error(`${label} contains unsupported field "${unknown[0]}".`);
  }
}

/**
 * Normalize a persisted Card/Card List layout without exposing private Grist
 * view-field row IDs. Missing persisted leaves are reported as unplaced stable
 * column IDs rather than reproducing Grist's client-side default layout logic.
 */
export function normalizeCardLayout(
  widget: WidgetIdentity,
  layoutSpec: unknown,
  tableResponse: unknown,
  sectionFieldsResponse: unknown
): CardLayoutNormalizationResult {
  const fields = existingWidgetFields(widget, tableResponse, sectionFieldsResponse);
  if (!fields) return { cardLayoutNormalizationIncomplete: true };

  if (layoutSpec === undefined) {
    return {
      cardLayout: {
        unplacedColumnIds: fields.map((field) => field.columnId)
      }
    };
  }

  const byFieldId = new Map(fields.map((field) => [field.fieldId, field.columnId]));
  const placedColumnIds = new Set<string>();
  let visited = 0;
  let incomplete = false;

  const walk = (
    value: unknown,
    depth: number
  ): NormalizedCardLayoutNode | undefined => {
    if (depth > MAX_CARD_LAYOUT_DEPTH || visited >= MAX_CARD_LAYOUT_NODES) {
      incomplete = true;
      return undefined;
    }
    const node = record(value);
    if (!node) {
      incomplete = true;
      return undefined;
    }
    visited += 1;

    const unknownKeys = Object.keys(node).filter(
      (key) => !["leaf", "children", "size"].includes(key)
    );
    if (unknownKeys.length > 0) {
      incomplete = true;
      return undefined;
    }

    const hasLeaf = node.leaf !== undefined && node.leaf !== null;
    const hasChildren = node.children !== undefined;
    if (hasLeaf === hasChildren) {
      incomplete = true;
      return undefined;
    }
    const { size, invalid: invalidSize } = normalizedSize(node.size);
    if (invalidSize) {
      incomplete = true;
      return undefined;
    }

    if (hasLeaf) {
      const fieldId = positiveInteger(node.leaf);
      if (!fieldId) {
        incomplete = true;
        return undefined;
      }
      const columnId = byFieldId.get(fieldId);
      if (!columnId) {
        // Grist does not rewrite persisted Card layoutSpec when a view field
        // is removed. A positive leaf that no longer resolves is therefore a
        // supported stale native leaf: omit it from the normalized view
        // without treating the whole layout as malformed.
        return undefined;
      }
      if (placedColumnIds.has(columnId)) {
        incomplete = true;
        return undefined;
      }
      placedColumnIds.add(columnId);
      return {
        kind: "field",
        columnId,
        ...(size !== undefined ? { size } : {})
      };
    }

    if (!Array.isArray(node.children) || node.children.length === 0) {
      incomplete = true;
      return undefined;
    }
    const children: NormalizedCardLayoutNode[] = [];
    for (const child of node.children) {
      const normalized = walk(child, depth + 1);
      if (normalized) children.push(normalized);
      if (incomplete) return undefined;
    }
    // A group may become empty after pruning only stale native leaves.
    if (children.length === 0) return undefined;
    // Grist's persisted layout may retain a now-redundant wrapper after a field
    // is hidden. Collapse a size-less unary group so the normalized semantic
    // tree remains stable across that native stale-leaf state.
    if (
      children.length === 1 &&
      children.length < node.children.length &&
      size === undefined
    ) return children[0];
    return {
      kind: "group",
      children,
      ...(size !== undefined ? { size } : {})
    };
  };

  const root = walk(layoutSpec, 0);
  if (incomplete) {
    return { cardLayoutNormalizationIncomplete: true };
  }

  return {
    cardLayout: {
      ...(root ? { root } : {}),
      unplacedColumnIds: fields
        .filter((field) => !placedColumnIds.has(field.columnId))
        .map((field) => field.columnId)
    }
  };
}

/**
 * Resolve a complete stable-column Card/Card List layout into Grist's private
 * BoxSpec field-row references. The request must place every currently visible
 * field exactly once; showing/hiding fields remains a separate visible-field intention.
 */
export function resolveCardLayoutUpdate(
  widget: WidgetIdentity,
  tableResponse: unknown,
  sectionFieldsResponse: unknown,
  input: CardLayoutUpdateInput
): ResolvedCardLayoutUpdate {
  const request = record(input);
  if (!request) throw new Error("Card layout must be a JSON object.");
  assertOnlyKeys(request, ["root"], "Card layout");

  const fields = existingWidgetFields(widget, tableResponse, sectionFieldsResponse);
  if (!fields) {
    throw new Error(
      `Grist widget ${widget.id} has incomplete or unsupported visible-field metadata; refusing to overwrite its card layout.`
    );
  }
  if (fields.length === 0) {
    throw new Error("Cannot set a card layout for a widget with no visible fields.");
  }

  const byColumnId = new Map(fields.map((field) => [field.columnId, field.fieldId]));
  const placedColumnIds = new Set<string>();
  let visited = 0;

  const encode = (
    value: unknown,
    depth: number
  ): { raw: JsonRecord; normalized: NormalizedCardLayoutNode } => {
    if (depth > MAX_CARD_LAYOUT_DEPTH) {
      throw new Error(
        `Card layout exceeds the maximum depth of ${MAX_CARD_LAYOUT_DEPTH}.`
      );
    }
    if (visited >= MAX_CARD_LAYOUT_NODES) {
      throw new Error(
        `Card layout exceeds the maximum of ${MAX_CARD_LAYOUT_NODES} nodes.`
      );
    }

    const node = record(value);
    if (!node) throw new Error("Every card layout node must be a JSON object.");
    visited += 1;

    const { size, invalid: invalidSize } = normalizedSize(node.size);
    if (invalidSize) {
      throw new Error("Card layout node size must be a finite positive number.");
    }

    if (node.kind === "field") {
      assertOnlyKeys(node, ["kind", "columnId", "size"], "Card field layout node");
      if (typeof node.columnId !== "string" || !node.columnId.trim()) {
        throw new Error("Card field layout node requires a non-empty columnId.");
      }
      const fieldId = byColumnId.get(node.columnId);
      if (!fieldId) {
        throw new Error(
          `Card layout column "${node.columnId}" is not a currently visible widget field.`
        );
      }
      if (placedColumnIds.has(node.columnId)) {
        throw new Error(
          `Card layout column "${node.columnId}" appears more than once.`
        );
      }
      placedColumnIds.add(node.columnId);
      return {
        raw: {
          leaf: fieldId,
          ...(size !== undefined ? { size } : {})
        },
        normalized: {
          kind: "field",
          columnId: node.columnId,
          ...(size !== undefined ? { size } : {})
        }
      };
    }

    if (node.kind === "group") {
      assertOnlyKeys(node, ["kind", "children", "size"], "Card group layout node");
      if (!Array.isArray(node.children) || node.children.length === 0) {
        throw new Error("Card group layout node requires at least one child.");
      }
      const children = node.children.map((child) => encode(child, depth + 1));
      return {
        raw: {
          children: children.map((child) => child.raw),
          ...(size !== undefined ? { size } : {})
        },
        normalized: {
          kind: "group",
          children: children.map((child) => child.normalized),
          ...(size !== undefined ? { size } : {})
        }
      };
    }

    throw new Error('Card layout node kind must be either "field" or "group".');
  };

  const root = encode(request.root, 0);
  const missing = fields.filter((field) => !placedColumnIds.has(field.columnId));
  if (missing.length > 0) {
    throw new Error(
      `Card layout must place every currently visible field exactly once; missing column "${missing[0]!.columnId}".`
    );
  }

  return {
    layoutSpecJson: JSON.stringify(root.raw),
    expectedLayout: {
      root: root.normalized,
      unplacedColumnIds: []
    }
  };
}
