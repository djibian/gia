import type { GristPage, GristPageWidget } from "./documentUi.js";
import { customViewOptions } from "./customWidgetSettings.js";
import {
  MAX_NORMALIZED_LAYOUT_DEPTH,
  MAX_NORMALIZED_LAYOUT_NODES
} from "./pageLayout.js";
import { MAX_WIDGET_SORT_COLUMNS } from "./widgetSort.js";

type JsonRecord = Record<string, unknown>;

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

function safeCompatibilityLayout(value: unknown): boolean {
  let visited = 0;
  const walk = (value: unknown, depth: number, root: boolean): boolean => {
    if (depth > MAX_NORMALIZED_LAYOUT_DEPTH || visited >= MAX_NORMALIZED_LAYOUT_NODES) {
      return false;
    }
    const node = record(value);
    if (!node) return false;
    visited += 1;
    const allowedKeys = root
      ? ["leaf", "children", "size", "collapsed"]
      : ["leaf", "children", "size"];
    if (Object.keys(node).some((key) => !allowedKeys.includes(key))) return false;
    if (
      node.size !== undefined &&
      (typeof node.size !== "number" || !Number.isFinite(node.size) || node.size < 0)
    ) return false;
    const hasLeaf = node.leaf !== undefined;
    const hasChildren = node.children !== undefined;
    if (hasLeaf === hasChildren) return false;
    if (hasLeaf && positiveInteger(node.leaf) === undefined) return false;
    if (hasChildren) {
      if (!Array.isArray(node.children) || (!root && node.children.length === 0)) return false;
      if (!node.children.every((child) => walk(child, depth + 1, false))) return false;
    }
    if (node.collapsed !== undefined && node.collapsed !== null) {
      if (!Array.isArray(node.collapsed)) return false;
      if (!node.collapsed.every((child) => {
        const leaf = record(child);
        return leaf?.children === undefined && walk(child, depth + 1, false);
      })) return false;
    }
    return true;
  };
  return walk(value, 0, true);
}

/** Keep legacy numeric layout detail without forwarding arbitrary metadata. */
export function projectPublicPage(page: GristPage) {
  const { widgets, layoutSpec, ...projected } = page;
  const safeLayout = layoutSpec !== undefined && safeCompatibilityLayout(layoutSpec);
  return {
    ...projected,
    ...(safeLayout ? { layoutSpec } : {}),
    ...(layoutSpec !== undefined && !safeLayout
      ? { compatibilityMetadataOmitted: true as const }
      : {})
  };
}

/** Full options remain internal for preservation and post-write verification. */
export function projectPublicWidget(widget: GristPageWidget) {
  const { options, layoutSpec, sortColRefs, ...projected } = widget;
  let omitted = false;
  let publicOptions: JsonRecord | undefined;
  if (options !== undefined) {
    const raw = record(options);
    if (!raw) {
      omitted = true;
    } else {
      publicOptions = {};
      for (const key of [
        "verticalGridlines", "horizontalGridlines", "zebraStripes", "rowNumbers"
      ] as const) {
        const value = widget.gridOptions?.[key];
        if (value !== undefined && raw[key] === value) publicOptions[key] = value;
      }
      const customView = customViewOptions(raw);
      if (customView && raw.customView !== undefined) {
        const safeView: JsonRecord = {};
        for (const key of ["access", "widgetId"] as const) {
          const value = widget.customWidgetSettings?.[key];
          if (value !== undefined && customView[key] === value) safeView[key] = value;
        }
        publicOptions.customView = safeView;
      }
      omitted = JSON.stringify(publicOptions) !== JSON.stringify(raw);
    }
  }
  const safeLayout = layoutSpec !== undefined && safeCompatibilityLayout(layoutSpec);
  if (layoutSpec !== undefined && !safeLayout) omitted = true;
  const safeSort = Array.isArray(sortColRefs) &&
    sortColRefs.length <= MAX_WIDGET_SORT_COLUMNS &&
    sortColRefs.every((value) =>
      (typeof value === "number" && Number.isInteger(value) && value !== 0) ||
      (typeof value === "string" && /^-?[1-9]\d*(?::(?:emptyLast|naturalSort|orderByChoice)(?:;(?:emptyLast|naturalSort|orderByChoice))*)?$/.test(value))
    );
  if (sortColRefs !== undefined && !safeSort) omitted = true;
  return {
    ...projected,
    ...(publicOptions !== undefined ? { options: publicOptions } : {}),
    ...(safeLayout ? { layoutSpec } : {}),
    ...(safeSort ? { sortColRefs } : {}),
    ...(omitted ? { compatibilityMetadataOmitted: true as const } : {})
  };
}

function publicColumn(entry: unknown): { id: string; fields: JsonRecord } {
  const column = record(entry);
  const id = typeof column?.id === "string" ? column.id : undefined;
  const fields = record(column?.fields);
  if (!id?.trim() || !fields) {
    throw new Error("Unexpected Grist column metadata shape.");
  }

  const projected: JsonRecord = {};
  if (typeof fields.label === "string") projected.label = fields.label;
  if (typeof fields.type === "string") projected.type = fields.type;
  if (typeof fields.isFormula === "boolean") projected.isFormula = fields.isFormula;
  if (typeof fields.formula === "string") projected.formula = fields.formula;
  if (typeof fields.description === "string") projected.description = fields.description;
  if (typeof fields.widgetOptions === "string") projected.widgetOptions = fields.widgetOptions;

  return { id, fields: projected };
}

function publicColumns(entries: unknown[]) {
  const seen = new Set<string>();
  return entries.map((entry) => {
    const column = publicColumn(entry);
    if (seen.has(column.id)) throw new Error("Ambiguous Grist column metadata IDs.");
    seen.add(column.id);
    return column;
  });
}

function tableEntries(value: unknown): unknown[] {
  const root = record(value);
  if (!root || !Array.isArray(root.tables)) {
    throw new Error("Unexpected Grist table metadata response shape.");
  }
  return root.tables;
}

function columnEntries(value: unknown): unknown[] {
  const root = record(value);
  if (!root || !Array.isArray(root.columns)) {
    throw new Error("Unexpected Grist column metadata response shape.");
  }
  return root.columns;
}

/**
 * Project Grist's intentionally open-ended table metadata response to the
 * bounded metadata contract exposed to models. Internal numeric metadata refs
 * remain available to bridge internals through the raw service path.
 */
export function projectPublicTables(value: unknown): unknown {
  const entries = tableEntries(value);
  const tableIdByRef = new Map<number, string>();
  const tableIds = new Set<string>();

  for (const entry of entries) {
    const table = record(entry);
    const id = typeof table?.id === "string" ? table.id : undefined;
    const fields = record(table?.fields);
    const tableRef = positiveInteger(fields?.tableRef);
    if (!id?.trim() || !fields) {
      throw new Error("Unexpected Grist table metadata shape.");
    }
    if (tableIds.has(id) || (tableRef !== undefined && tableIdByRef.has(tableRef))) throw new Error("Ambiguous Grist table metadata identities.");
    tableIds.add(id);
    if (tableRef !== undefined) tableIdByRef.set(tableRef, id);
  }

  return {
    tables: entries.map((entry) => {
      const table = record(entry)!;
      const id = table.id as string;
      const fields = record(table.fields)!;
      const projected: JsonRecord = {};

      if (typeof fields.onDemand === "boolean") projected.onDemand = fields.onDemand;

      const summarySourceRef = positiveInteger(fields.summarySourceTable);
      if (summarySourceRef !== undefined) {
        projected.isSummary = true;
        const sourceId = tableIdByRef.get(summarySourceRef);
        if (sourceId !== undefined) projected.summarySourceTableId = sourceId;
      } else {
        projected.isSummary = false;
      }

      const columns = Array.isArray(table.columns)
        ? publicColumns(table.columns)
        : undefined;

      return {
        id,
        fields: projected,
        ...(columns !== undefined ? { columns } : {})
      };
    })
  };
}

/** Project the public list_columns response without internal engine refs. */
export function projectPublicColumns(value: unknown): unknown {
  return { columns: publicColumns(columnEntries(value)) };
}
