import type { DocumentUiContext, GristPageWidget } from "./documentUi.js";
import { buildSelectBySchemaIndex, type ColumnSelectByInput } from "./selectBy.js";

export interface NormalizedSelectByContext {
  selectByNormalized?: ColumnSelectByInput;
  selectByNormalizationIncomplete: boolean;
}

export function normalizeExistingSelectBy(
  context: DocumentUiContext,
  tableResponse: unknown,
  target: GristPageWidget
): NormalizedSelectByContext | undefined {
  const raw = target.selectBy;
  if (!raw) return undefined;

  const source = context.pages
    .find((page) => page.id === target.pageId)
    ?.widgets.find((widget) => widget.id === raw.sourceSectionId);
  if (!source) {
    return { selectByNormalizationIncomplete: true };
  }

  const sourceRef = raw.sourceColumnRef;
  const targetRef = raw.targetColumnRef;
  if (sourceRef === undefined && targetRef === undefined) {
    return {
      selectByNormalized: { sourceWidgetId: source.id },
      selectByNormalizationIncomplete: false
    };
  }

  const schema = buildSelectBySchemaIndex(tableResponse);
  const sourceTable = schema.byRef.get(source.tableRef);
  const targetTable = schema.byRef.get(target.tableRef);
  if (schema.truncated || !sourceTable || !targetTable ||
    (source.tableId !== undefined && sourceTable.id !== source.tableId) ||
    (target.tableId !== undefined && targetTable.id !== target.tableId)) {
    return { selectByNormalizationIncomplete: true };
  }

  const sourceColumnId =
    sourceRef !== undefined ? sourceTable.columnIdsByRef.get(sourceRef) : undefined;
  const targetColumnId =
    targetRef !== undefined ? targetTable.columnIdsByRef.get(targetRef) : undefined;

  if (
    (sourceRef !== undefined && sourceColumnId === undefined) ||
    (targetRef !== undefined && targetColumnId === undefined)
  ) {
    return { selectByNormalizationIncomplete: true };
  }

  return {
    selectByNormalized: {
      sourceWidgetId: source.id,
      ...(sourceColumnId !== undefined ? { sourceColumnId } : {}),
      ...(targetColumnId !== undefined ? { targetColumnId } : {})
    },
    selectByNormalizationIncomplete: false
  };
}
