import {
  normalizeCardLayout,
  type NormalizedCardLayout
} from "./cardLayout.js";
import {
  normalizeCustomWidgetSettings,
  type NormalizedCustomWidgetSettings
} from "./customWidgetSettings.js";
import {
  normalizeGridOptions,
  type NormalizedGridOptions
} from "./gridOptions.js";
import {
  directSelectByValidator,
  discoverColumnSelectByOptions,
  type ColumnSelectByInput
} from "./selectBy.js";
import { GristApiError } from "./client.js";
import {
  normalizePageLayout,
  type NormalizedPageLayout
} from "./pageLayout.js";
import { normalizeExistingSelectBy } from "./selectByContext.js";
import { projectPublicPage, projectPublicWidget } from "./publicMetadata.js";
import {
  normalizeWidgetSort,
  type WidgetSortInput
} from "./widgetSort.js";
import {
  normalizeWidgetFields,
  type NormalizedWidgetField
} from "./widgetFields.js";
import {
  normalizeWidgetFilters,
  type NormalizedWidgetFilter
} from "./widgetFilters.js";

type JsonRecord = Record<string, unknown>;

interface MetaRecord {
  id: number;
  fields: JsonRecord;
}

export interface GristPageWidget {
  id: number;
  pageId: number;
  tableRef: number;
  tableId?: string;
  type: string;
  title: string;
  description?: string;
  chartType?: string;
  options?: unknown;
  layoutSpec?: unknown;
  sortColRefs?: unknown;
  sort?: WidgetSortInput[];
  sortNormalizationIncomplete?: boolean;
  selectBy?: {
    sourceSectionId: number;
    sourceColumnRef?: number;
    targetColumnRef?: number;
  };
  selectByNormalized?: ColumnSelectByInput;
  selectByNormalizationIncomplete?: boolean;
  customWidgetSettings?: NormalizedCustomWidgetSettings;
  customWidgetSettingsNormalizationIncomplete?: true;
  gridOptions?: NormalizedGridOptions;
  gridOptionsNormalizationIncomplete?: true;
  visibleFields?: NormalizedWidgetField[];
  visibleFieldsNormalizationIncomplete?: true;
  cardLayout?: NormalizedCardLayout;
  cardLayoutNormalizationIncomplete?: true;
  filters?: NormalizedWidgetFilter[];
  filtersNormalizationIncomplete?: true;
}

export interface GristPage {
  id: number;
  pageRecordId: number;
  name: string;
  type: string;
  indentation: number;
  pagePos?: number;
  layoutSpec?: unknown;
  layoutNormalized?: NormalizedPageLayout;
  layoutNormalizationIncomplete?: true;
  widgets: GristPageWidget[];
}

export interface DocumentUiContext {
  documentId: string;
  metadataSnapshotIncomplete?: true;
  summary: {
    pageCount: number;
    widgetCount: number;
  };
  pages: GristPage[];
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function records(value: unknown, incomplete: () => void): MetaRecord[] {
  const root = record(value);
  if (!Array.isArray(root?.records)) { incomplete(); return []; }
  const result = new Map<number, MetaRecord>();
  const seenIds = new Set<number>();
  for (const entry of root.records) {
    const item = record(entry);
    const id = typeof item?.id === "number" && Number.isInteger(item.id) && item.id > 0 ? item.id : undefined;
    const fields = record(item?.fields);
    if (id === undefined || !fields) { incomplete(); continue; }
    if (seenIds.has(id)) { incomplete(); result.delete(id); continue; }
    seenIds.add(id);
    result.set(id, { id, fields });
  }
  return [...result.values()];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function ref(value: unknown): number {
  const candidate = number(value);
  return candidate !== undefined && Number.isInteger(candidate) && candidate > 0
    ? candidate
    : 0;
}

function jsonText(value: unknown): unknown | undefined {
  const source = text(value);
  if (!source) return undefined;
  try {
    return JSON.parse(source) as unknown;
  } catch {
    return source;
  }
}

function tableRefMap(tableResponse: unknown, incomplete: () => void): Map<number, string> {
  const root = record(tableResponse);
  if (!Array.isArray(root?.tables)) { incomplete(); return new Map(); }
  const source = root.tables;
  const result = new Map<number, string>();
  const seenIds = new Set<string>();
  for (const entry of source) {
    const table = record(entry);
    const id = text(table?.id);
    const fields = record(table?.fields);
    const tableRef = ref(fields?.tableRef);
    if (!id?.trim() || !tableRef || seenIds.has(id) || result.has(tableRef)) {
      incomplete(); return new Map();
    }
    seenIds.add(id);
    result.set(tableRef, id);
  }
  return result;
}

function hasExpandedColumns(tableResponse: unknown): boolean {
  const root = record(tableResponse);
  const source = Array.isArray(root?.tables) ? root.tables : [];
  return source.some((entry) => Array.isArray(record(entry)?.columns));
}

export class DocumentUiService {
  build(
    documentId: string,
    tableResponse: unknown,
    pagesResponse: unknown,
    viewsResponse: unknown,
    sectionsResponse: unknown,
    sectionFieldsResponse?: unknown,
    filtersResponse?: unknown
  ): DocumentUiContext {
    let metadataIncomplete = false;
    const incomplete = () => { metadataIncomplete = true; };
    const tableIds = tableRefMap(tableResponse, incomplete);
    const views = new Map(records(viewsResponse, incomplete).map((view) => [view.id, view]));
    const sections = records(sectionsResponse, incomplete);
    for (const [response, parentKey] of [[sectionFieldsResponse, "parentId"], [filtersResponse, "viewSectionRef"]] as const) {
      if (response === undefined) continue;
      for (const item of records(response, incomplete)) {
        if (!ref(item.fields[parentKey]) || !ref(item.fields.colRef)) incomplete();
      }
    }

    const widgetsByPage = new Map<number, GristPageWidget[]>();
    for (const section of sections) {
      const pageId = ref(section.fields.parentId);
      if (section.fields.parentId === 0) continue; // Native raw sections are not page widgets.
      if (!pageId || !views.has(pageId)) { incomplete(); continue; }

      const tableRef = ref(section.fields.tableRef);
      const tableId = tableIds.get(tableRef);
      if (!tableRef || !tableId) incomplete();
      const description = text(section.fields.description);
      const chartType = text(section.fields.chartType);
      const options = section.fields.options === "" ? {} : jsonText(section.fields.options);
      const layoutSpec = jsonText(section.fields.layoutSpec);
      const sortColRefs = jsonText(section.fields.sortColRefs);
      const sourceSectionId = ref(section.fields.linkSrcSectionRef);
      const sourceColumnRef = ref(section.fields.linkSrcColRef);
      const targetColumnRef = ref(section.fields.linkTargetColRef);
      for (const key of ["linkSrcSectionRef", "linkSrcColRef", "linkTargetColRef"]) {
        const value = section.fields[key];
        if (value !== undefined && !(typeof value === "number" && Number.isInteger(value) && value >= 0)) incomplete();
      }
      if (!sourceSectionId && (sourceColumnRef || targetColumnRef)) incomplete();

      const widget: GristPageWidget = {
        id: section.id,
        pageId,
        tableRef,
        ...(tableId !== undefined ? { tableId } : {}),
        type: text(section.fields.parentKey) ?? "unknown",
        title: text(section.fields.title) ?? "",
        ...(description !== undefined && description !== "" ? { description } : {}),
        ...(chartType !== undefined && chartType !== "" ? { chartType } : {}),
        ...(options !== undefined ? { options } : {}),
        ...(layoutSpec !== undefined ? { layoutSpec } : {}),
        ...(sortColRefs !== undefined ? { sortColRefs } : {}),
        ...(sourceSectionId
          ? {
              selectBy: {
                sourceSectionId,
                ...(sourceColumnRef ? { sourceColumnRef } : {}),
                ...(targetColumnRef ? { targetColumnRef } : {})
              }
            }
          : {})
      };
      const normalizedSort = normalizeWidgetSort(widget, tableResponse);
      if (normalizedSort) Object.assign(widget, normalizedSort);
      const normalizedCustomWidgetSettings = normalizeCustomWidgetSettings(
        widget,
        tableResponse
      );
      if (normalizedCustomWidgetSettings) {
        Object.assign(widget, normalizedCustomWidgetSettings);
      }
      const normalizedGridOptions = normalizeGridOptions(widget);
      if (normalizedGridOptions) Object.assign(widget, normalizedGridOptions);
      if (sectionFieldsResponse !== undefined && hasExpandedColumns(tableResponse)) {
        Object.assign(
          widget,
          normalizeWidgetFields(widget, tableResponse, sectionFieldsResponse)
        );
        if (widget.type === "single" || widget.type === "detail") {
          Object.assign(
            widget,
            normalizeCardLayout(
              widget,
              widget.layoutSpec,
              tableResponse,
              sectionFieldsResponse
            )
          );
        }
      }
      if (filtersResponse !== undefined && hasExpandedColumns(tableResponse)) {
        Object.assign(
          widget,
          normalizeWidgetFilters(widget, tableResponse, filtersResponse)
        );
      }

      const widgets = widgetsByPage.get(pageId) ?? [];
      widgets.push(widget);
      widgetsByPage.set(pageId, widgets);
    }

    const seenViewRefs = new Set<number>();
    const pages = records(pagesResponse, incomplete)
      .flatMap((pageRecord) => {
        const pageId = ref(pageRecord.fields.viewRef);
        if (!pageId || seenViewRefs.has(pageId)) { incomplete(); return []; }
        seenViewRefs.add(pageId);
        const view = views.get(pageId);
        if (!view) { incomplete(); return []; }

        const pagePos = number(pageRecord.fields.pagePos);
        const layoutSpec = jsonText(view.fields.layoutSpec);
        const widgets = (widgetsByPage.get(pageId) ?? []).sort((a, b) => a.id - b.id);
        const normalizedLayout = normalizePageLayout(
          layoutSpec,
          widgets.map((widget) => widget.id)
        );
        const page: GristPage = {
          id: pageId,
          pageRecordId: pageRecord.id,
          name: text(view.fields.name) ?? `Page ${pageId}`,
          type: text(view.fields.type) ?? "",
          indentation: number(pageRecord.fields.indentation) ?? 0,
          ...(pagePos !== undefined ? { pagePos } : {}),
          ...(layoutSpec !== undefined ? { layoutSpec } : {}),
          ...normalizedLayout,
          widgets
        };
        return [page];
      })
      .sort((a, b) => {
        if (a.pagePos !== undefined && b.pagePos !== undefined) return a.pagePos - b.pagePos;
        if (a.pagePos !== undefined) return -1;
        if (b.pagePos !== undefined) return 1;
        return a.pageRecordId - b.pageRecordId;
      });

    const context: DocumentUiContext = {
      documentId,
      summary: {
        pageCount: pages.length,
        widgetCount: pages.reduce((count, page) => count + page.widgets.length, 0)
      },
      pages
    };
    const widgetIds = new Set(context.pages.flatMap((page) => page.widgets.map((widget) => widget.id)));
    for (const page of context.pages) {
      for (const widget of page.widgets) {
        if (widget.selectBy && !widgetIds.has(widget.selectBy.sourceSectionId)) incomplete();
      }
    }
    if (metadataIncomplete) context.metadataSnapshotIncomplete = true;

    if (hasExpandedColumns(tableResponse)) {
      for (const page of context.pages) {
        for (const widget of page.widgets) {
          const normalizedSelectBy = normalizeExistingSelectBy(
            context,
            tableResponse,
            widget
          );
          if (normalizedSelectBy) Object.assign(widget, normalizedSelectBy);
        }
      }
    }

    return context;
  }

  listPages(context: DocumentUiContext): unknown {
    return {
      documentId: context.documentId,
      summary: context.summary,
      pages: context.pages.map((page) => ({
        ...projectPublicPage(page),
        widgetCount: page.widgets.length,
        widgetIds: page.widgets.map((widget) => widget.id)
      }))
    };
  }

  getPageWidgets(
    context: DocumentUiContext,
    pageId: number,
    expandedTableResponse?: unknown
  ): unknown {
    const page = context.pages.find((candidate) => candidate.id === pageId);
    if (!page) {
      throw new GristApiError(
        `Grist page ${pageId} does not exist in document "${context.documentId}".`,
        404
      );
    }
    const { widgets } = page;
    const assertAllowed = directSelectByValidator(context);
    let remainingOptions = 1000;
    let remainingCandidates = 10000;
    let remainingColumnOptions = 1000;
    let remainingColumnCandidates = 10000;

    return {
      documentId: context.documentId,
      page: projectPublicPage(page),
      widgets: widgets.map((target, targetIndex) => {
        const directSelectByOptions: Array<{ sourceWidgetId: number }> = [];
        let examined = 0;
        for (const source of widgets) {
          if (remainingOptions === 0 || remainingCandidates === 0) break;
          examined++;
          remainingCandidates--;
          try {
            assertAllowed(source, target);
            directSelectByOptions.push({ sourceWidgetId: source.id });
            remainingOptions--;
          } catch {
            // Unsupported candidates never become advertised update inputs.
          }
        }

        const remainingTargets = widgets.length - targetIndex;
        const maxColumnOptions =
          remainingTargets > 0
            ? Math.floor(remainingColumnOptions / remainingTargets)
            : 0;
        const maxColumnCandidates =
          remainingTargets > 0
            ? Math.floor(remainingColumnCandidates / remainingTargets)
            : 0;
        let columnSelectByOptions: Array<{
          sourceWidgetId: number;
          sourceColumnId?: string | undefined;
          targetColumnId?: string | undefined;
        }> = [];
        let columnSelectByOptionsTruncated = false;

        if (expandedTableResponse !== undefined) {
          if (maxColumnOptions === 0 || maxColumnCandidates === 0) {
            columnSelectByOptionsTruncated = true;
          } else {
            const discovered = discoverColumnSelectByOptions(
              context,
              expandedTableResponse,
              target,
              {
                maxOptions: maxColumnOptions,
                maxCandidates: maxColumnCandidates
              }
            );
            columnSelectByOptions = discovered.options;
            columnSelectByOptionsTruncated = discovered.truncated;
          }
        }
        remainingColumnOptions -= columnSelectByOptions.length;
        remainingColumnCandidates = Math.max(
          0,
          remainingColumnCandidates - maxColumnCandidates
        );

        return {
          ...projectPublicWidget(target),
          directSelectByOptions,
          directSelectByOptionsTruncated: examined < widgets.length,
          columnSelectByOptions,
          columnSelectByOptionsTruncated
        };
      })
    };
  }
}
