import type { DocumentUiContext, GristPageWidget } from "./documentUi.js";

type JsonRecord = Record<string, unknown>;

const MAX_SELECT_BY_SCHEMA_COLUMNS = 5000;

interface SelectByColumn {
  id: string;
  ref: number;
  targetTableId: string;
}

interface SelectByTable {
  id: string;
  ref: number;
  isSummary: boolean;
  columns: SelectByColumn[];
  columnIdsByRef: Map<number, string>;
}

interface SelectBySchemaIndex {
  byId: Map<string, SelectByTable>;
  byRef: Map<number, SelectByTable>;
  truncated: boolean;
}

interface SelectByNode {
  logicalTableId: string;
  columnId?: string;
  columnRef?: number;
}

export interface ColumnSelectByInput {
  sourceWidgetId: number;
  sourceColumnId?: string | undefined;
  targetColumnId?: string | undefined;
}

export interface ColumnSelectByOption extends ColumnSelectByInput {}

export interface ResolvedSelectByRefs {
  sourceSectionId: number;
  sourceColumnRef?: number;
  targetColumnRef?: number;
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

export function buildSelectBySchemaIndex(tableResponse: unknown): SelectBySchemaIndex {
  const root = record(tableResponse);
  const byId = new Map<string, SelectByTable>();
  const byRef = new Map<number, SelectByTable>();
  const invalid = (): SelectBySchemaIndex => ({ byId: new Map(), byRef: new Map(), truncated: true });
  if (!Array.isArray(root?.tables)) return invalid();
  const tables = root.tables;
  for (const value of tables) {
    const table = record(value);
    const id = text(table?.id);
    const fields = record(table?.fields);
    const ref = positiveInteger(fields?.tableRef);
    if (!id?.trim() || !ref || byId.has(id) || byRef.has(ref)) return invalid();
    const parsed: SelectByTable = {
      id, ref,
      isSummary: positiveInteger(fields?.summarySourceTable) !== undefined,
      columns: [], columnIdsByRef: new Map()
    };
    byId.set(id, parsed);
    byRef.set(ref, parsed);
  }

  let remainingColumns = MAX_SELECT_BY_SCHEMA_COLUMNS;
  const seenRefs = new Set<number>();
  for (const value of tables) {
    const table = record(value)!;
    const parsed = byId.get(table.id as string)!;
    if (!Array.isArray(table.columns) || table.columns.length > remainingColumns) return invalid();
    const seenIds = new Set<string>();
    for (const value of table.columns) {
      const column = record(value);
      const columnId = text(column?.id);
      const fields = record(column?.fields);
      const colRef = positiveInteger(fields?.colRef);
      const type = text(fields?.type);
      if (!columnId?.trim() || !colRef || !type || seenIds.has(columnId) || seenRefs.has(colRef)) return invalid();
      seenIds.add(columnId);
      seenRefs.add(colRef);
      parsed.columnIdsByRef.set(colRef, columnId);
      const match = /^(Ref|RefList):(.+)$/.exec(type);
      const targetTable = match?.[2] ? byId.get(match[2]) : undefined;
      if (targetTable && !targetTable.isSummary) parsed.columns.push({ id: columnId, ref: colRef, targetTableId: targetTable.id });
    }
    remainingColumns -= table.columns.length;
  }
  return { byId, byRef, truncated: false };
}

function tableForWidget(
  widget: GristPageWidget,
  schema: SelectBySchemaIndex
): SelectByTable | undefined {
  const table =
    (widget.tableId ? schema.byId.get(widget.tableId) : undefined) ??
    schema.byRef.get(widget.tableRef);
  return table && table.ref === widget.tableRef && (widget.tableId === undefined || table.id === widget.tableId) && !table.isSummary ? table : undefined;
}

function nodesForWidget(
  widget: GristPageWidget,
  schema: SelectBySchemaIndex
): SelectByNode[] {
  const table = tableForWidget(widget, schema);
  if (!table) return [];
  return [
    { logicalTableId: table.id },
    ...table.columns.map((column) => ({
      logicalTableId: column.targetTableId,
      columnId: column.id,
      columnRef: column.ref
    }))
  ];
}

function nodeForColumnId(
  widget: GristPageWidget,
  schema: SelectBySchemaIndex,
  columnId: string | undefined
): SelectByNode {
  const table = tableForWidget(widget, schema);
  if (!table) {
    throw new Error(
      `Widget ${widget.id} is backed by a summary or unavailable table and is outside this bounded select-by subset.`
    );
  }
  if (columnId === undefined) return { logicalTableId: table.id };
  const column = table.columns.find((candidate) => candidate.id === columnId);
  if (!column) {
    throw new Error(
      `Column "${columnId}" is not a supported Ref/RefList select-by column for widget ${widget.id}.`
    );
  }
  return {
    logicalTableId: column.targetTableId,
    columnId: column.id,
    columnRef: column.ref
  };
}

// One index per snapshot, and one graph walk per source, shared across targets.
function selectByGraphValidator(context: DocumentUiContext) {
  const widgets = new Map(
    context.pages.flatMap((page) => page.widgets.map((widget) => [widget.id, widget] as const))
  );
  const paths = new Map<number, { ancestors: Set<number>; cycle: boolean }>();
  return (source: GristPageWidget, target: GristPageWidget): void => {
    if (context.metadataSnapshotIncomplete) throw new Error("Select-by requires a complete and unambiguous page/widget graph.");
    if (source.id === target.id) throw new Error("A Grist widget cannot select itself.");
    if (source.pageId !== target.pageId) {
      throw new Error("Select-by is limited to widgets on the same Grist page.");
    }
    if (source.type === "chart" || source.type === "custom") {
      throw new Error(
        `Widget type "${source.type}" is not allowed as a select-by source in this safe subset.`
      );
    }
    let path = paths.get(source.id);
    if (!path) {
      const ancestors = new Set<number>();
      const visited = new Set<number>();
      let current: GristPageWidget | undefined = source;
      let cycle = false;
      while (current?.selectBy?.sourceSectionId) {
        if (visited.has(current.id)) {
          cycle = true;
          break;
        }
        visited.add(current.id);
        ancestors.add(current.selectBy.sourceSectionId);
        current = widgets.get(current.selectBy.sourceSectionId);
      }
      path = { ancestors, cycle };
      paths.set(source.id, path);
    }
    if (path.ancestors.has(target.id)) {
      throw new Error("The requested select-by link would create a cycle; refusing the update.");
    }
    if (path.cycle) {
      throw new Error("The existing select-by graph already contains a cycle; refusing to modify it.");
    }
  };
}

export function directSelectByValidator(context: DocumentUiContext) {
  const assertGraphSafe = selectByGraphValidator(context);
  return (source: GristPageWidget, target: GristPageWidget): void => {
    assertGraphSafe(source, target);
    if (source.tableRef !== target.tableRef || source.tableId !== target.tableId) {
      throw new Error(
        "This tranche only allows direct select-by between widgets backed by the same Grist table."
      );
    }
  };
}

export function assertDirectSelectByAllowed(
  context: DocumentUiContext,
  source: GristPageWidget,
  target: GristPageWidget
): void {
  directSelectByValidator(context)(source, target);
}

export function discoverColumnSelectByOptions(
  context: DocumentUiContext,
  tableResponse: unknown,
  target: GristPageWidget,
  limits: { maxOptions?: number; maxCandidates?: number } = {}
): { options: ColumnSelectByOption[]; truncated: boolean } {
  const maxOptions = limits.maxOptions ?? 1000;
  const maxCandidates = limits.maxCandidates ?? 10000;
  const schema = buildSelectBySchemaIndex(tableResponse);
  if (schema.truncated) return { options: [], truncated: true };
  const targetNodes = nodesForWidget(target, schema);
  const page = context.pages.find((candidate) => candidate.id === target.pageId);
  if (!page || targetNodes.length === 0) {
    return { options: [], truncated: schema.truncated };
  }

  const assertGraphSafe = selectByGraphValidator(context);
  const options: ColumnSelectByOption[] = [];
  let candidates = 0;
  let truncated: boolean = false;

  outer: for (const source of page.widgets) {
    try {
      assertGraphSafe(source, target);
    } catch {
      continue;
    }
    const sourceNodes = nodesForWidget(source, schema);
    for (const sourceNode of sourceNodes) {
      for (const targetNode of targetNodes) {
        if (sourceNode.columnId === undefined && targetNode.columnId === undefined) continue;
        if (candidates >= maxCandidates || options.length >= maxOptions) {
          truncated = true;
          break outer;
        }
        candidates++;
        if (sourceNode.logicalTableId !== targetNode.logicalTableId) continue;
        options.push({
          sourceWidgetId: source.id,
          ...(sourceNode.columnId !== undefined
            ? { sourceColumnId: sourceNode.columnId }
            : {}),
          ...(targetNode.columnId !== undefined
            ? { targetColumnId: targetNode.columnId }
            : {})
        });
      }
    }
  }

  return { options, truncated };
}

export function resolveColumnSelectByAllowed(
  context: DocumentUiContext,
  tableResponse: unknown,
  source: GristPageWidget,
  target: GristPageWidget,
  input: ColumnSelectByInput
): ResolvedSelectByRefs {
  if (input.sourceColumnId === undefined && input.targetColumnId === undefined) {
    throw new Error("At least one select-by column ID is required for a column link.");
  }
  selectByGraphValidator(context)(source, target);
  const schema = buildSelectBySchemaIndex(tableResponse);
  if (schema.truncated) throw new Error("Select-by schema is incomplete or ambiguous; refusing to resolve a column link.");
  const sourceNode = nodeForColumnId(source, schema, input.sourceColumnId);
  const targetNode = nodeForColumnId(target, schema, input.targetColumnId);
  if (sourceNode.logicalTableId !== targetNode.logicalTableId) {
    throw new Error(
      "The requested Ref/RefList select-by columns do not resolve to the same logical Grist table."
    );
  }
  return {
    sourceSectionId: source.id,
    ...(sourceNode.columnRef !== undefined
      ? { sourceColumnRef: sourceNode.columnRef }
      : {}),
    ...(targetNode.columnRef !== undefined
      ? { targetColumnRef: targetNode.columnRef }
      : {})
  };
}
