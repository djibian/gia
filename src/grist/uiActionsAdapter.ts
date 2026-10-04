import type { GristClient } from "./client.js";
import type { AccessRuleMutationPlan } from "./accessRules.js";
import { GRIST_CHART_TYPES, type GristChartType } from "./chartTypes.js";
import {
  MAX_PAGE_ORDER_PAGES,
  type PageOrderWrite
} from "./pageOrder.js";
import type { ResolvedWidgetSortSpec } from "./widgetSort.js";
import type { WidgetFieldMutationPlan } from "./widgetFields.js";
import type { WidgetFilterMutationPlan } from "./widgetFilters.js";

export const NATIVE_WIDGET_TYPES = [
  "record",
  "single",
  "detail",
  "form",
  "chart",
  "calendar",
  "custom"
] as const;

export type NativeWidgetType = (typeof NATIVE_WIDGET_TYPES)[number];

export interface WidgetSelectByRefs {
  sourceSectionId: number;
  sourceColumnRef?: number;
  targetColumnRef?: number;
}

export interface WidgetUiUpdate {
  title?: string;
  description?: string;
  chartType?: GristChartType;
  sortColRefs?: readonly ResolvedWidgetSortSpec[];
  selectBy?: WidgetSelectByRefs | null;
  /** Trusted bridge-generated full section options JSON; never a public model input. */
  optionsJson?: string;
  /** Trusted bridge-generated Card/Card List BoxSpec JSON; private field refs never become public inputs. */
  cardLayoutJson?: string;
  /** Trusted bridge-generated field mutation plan; native field refs never become public inputs. */
  visibleFields?: WidgetFieldMutationPlan;
  /** Trusted bridge-generated filter plan; native filter IDs/column refs never become public inputs. */
  filters?: WidgetFilterMutationPlan;
}

type UiActionsClient = Pick<GristClient, "applyUserActions"> &
  Partial<Pick<GristClient, "queryRecords">>;
type JsonRecord = Record<string, unknown>;

interface MetadataRecord {
  id: number;
  fields: JsonRecord;
}

const VISIBILITY_METADATA_LIMIT = 5000;

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

function singleReturnValue(response: unknown, actionName: string): JsonRecord {
  const root = record(response);
  const retValues = Array.isArray(root?.retValues) ? root.retValues : undefined;
  const value = retValues?.length === 1 ? record(retValues[0]) : null;
  if (!value) {
    throw new Error(`Grist ${actionName} returned an unexpected /apply response.`);
  }
  return value;
}

function assertPositiveId(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function metadataRecords(response: unknown, label: string): MetadataRecord[] {
  const root = record(response);
  if (!root || !Array.isArray(root.records)) {
    throw new Error(`Cannot verify visible Grist pages: ${label} metadata is unavailable.`);
  }
  if (root.records.length >= VISIBILITY_METADATA_LIMIT) {
    throw new Error(
      `Cannot verify visible Grist pages: ${label} metadata reached the bounded read limit.`
    );
  }

  return root.records.map((entry) => {
    const item = record(entry);
    const id = positiveInteger(item?.id);
    const fields = record(item?.fields);
    if (!id || !fields) {
      throw new Error(`Cannot verify visible Grist pages: malformed ${label} metadata.`);
    }
    return { id, fields };
  });
}

function classifyPageVisibility(
  pagesResponse: unknown,
  viewsResponse: unknown,
  tablesResponse: unknown
): { allPageIds: Set<number>; visiblePageIds: Set<number> } {
  const pages = metadataRecords(pagesResponse, "page");
  const views = metadataRecords(viewsResponse, "view");
  const tables = metadataRecords(tablesResponse, "table");

  const viewsById = new Map(views.map((view) => [view.id, view]));
  const hiddenPrimaryViewIds = new Set<number>();
  for (const table of tables) {
    const primaryViewId = positiveInteger(table.fields.primaryViewId);
    if (!primaryViewId) continue;
    const tableId = table.fields.tableId;
    if (typeof tableId !== "string" || tableId.startsWith("GristHidden_")) {
      hiddenPrimaryViewIds.add(primaryViewId);
    }
  }

  const allPageIds = new Set<number>();
  const visiblePageIds = new Set<number>();
  for (const page of pages) {
    const pageId = positiveInteger(page.fields.viewRef);
    if (!pageId) continue;
    allPageIds.add(pageId);

    const view = viewsById.get(pageId);
    const name = view?.fields.name;
    if (typeof name !== "string" || name.length === 0) continue;
    if (name === "GristDocTour" || name === "GristDocTutorial") continue;
    if (hiddenPrimaryViewIds.has(pageId)) continue;
    visiblePageIds.add(pageId);
  }

  return { allPageIds, visiblePageIds };
}

export class UiWriteVerificationError extends Error {
  public readonly createdId: number | undefined;

  constructor(
    public readonly operation: string,
    messageOrCreatedId: string | number | undefined,
    createdIdOrMessage?: number | string
  ) {
    const message =
      typeof messageOrCreatedId === "string"
        ? messageOrCreatedId
        : typeof createdIdOrMessage === "string"
          ? createdIdOrMessage
          : "Grist UI write could not be verified.";
    super(`${message} The Grist write may already have succeeded; do not retry the whole operation blindly.`);
    this.name = "UiWriteVerificationError";
    this.createdId =
      typeof messageOrCreatedId === "number"
        ? messageOrCreatedId
        : typeof createdIdOrMessage === "number"
          ? createdIdOrMessage
          : undefined;
  }
}

export class GristUiActionsAdapter {
  constructor(private readonly client: UiActionsClient) {}

  async mutateAccessRuleGroup(
    documentId: string,
    plan: AccessRuleMutationPlan
  ): Promise<void> {
    if (plan.mode === "noop") return;

    const actions: unknown[][] = [];
    const nativeColIds =
      plan.target.columnIds.length === 0 ? "*" : plan.target.columnIds.join(",");

    if (plan.mode === "create") {
      actions.push([
        "AddRecord",
        "_grist_ACLResources",
        -1,
        { tableId: plan.target.tableId, colIds: nativeColIds }
      ]);
      for (const rule of plan.rules) {
        actions.push([
          "AddRecord",
          "_grist_ACLRules",
          null,
          {
            resource: -1,
            aclFormula: rule.aclFormula,
            permissionsText: rule.permissionsText,
            rulePos: rule.rulePos
          }
        ]);
      }
    } else {
      const resourceRecordId = plan.resourceRecordId;
      if (!resourceRecordId) {
        throw new Error("Access-rule mutation is missing its resolved resource record ID.");
      }
      if (plan.ruleRecordIds.length > 0) {
        actions.push(["BulkRemoveRecord", "_grist_ACLRules", [...plan.ruleRecordIds]]);
      }

      if (plan.mode === "replace") {
        for (const rule of plan.rules) {
          actions.push([
            "AddRecord",
            "_grist_ACLRules",
            null,
            {
              resource: resourceRecordId,
              aclFormula: rule.aclFormula,
              permissionsText: rule.permissionsText,
              rulePos: rule.rulePos
            }
          ]);
        }
      } else {
        actions.push(["RemoveRecord", "_grist_ACLResources", resourceRecordId]);
      }
    }

    await this.client.applyUserActions(documentId, actions);
  }

  async createEmptyPage(
    documentId: string,
    tableId: string,
    name: string
  ): Promise<{ pageId: number }> {
    const pageName = name.trim();
    if (!pageName) throw new Error("Page name must not be empty.");
    if (!tableId.trim()) throw new Error("Table ID must not be empty.");

    const response = await this.client.applyUserActions(documentId, [
      ["AddView", tableId, "empty", pageName]
    ]);

    let result: JsonRecord;
    try {
      result = singleReturnValue(response, "AddView");
    } catch (error) {
      throw new UiWriteVerificationError(
        "create_page",
        error instanceof Error ? error.message : "Grist AddView response could not be interpreted."
      );
    }

    const pageId = positiveInteger(result.id);
    if (!pageId) {
      throw new UiWriteVerificationError(
        "create_page",
        "Grist AddView did not return a positive page ID."
      );
    }
    return { pageId };
  }

  async addPageWidget(
    documentId: string,
    pageId: number,
    sourceTableRef: number,
    type: NativeWidgetType,
    groupByColumnRefs?: readonly number[]
  ): Promise<{ pageId: number; tableRef: number; widgetId: number }> {
    assertPositiveId(pageId, "Grist page ID");
    assertPositiveId(sourceTableRef, "Grist table reference");
    if (!NATIVE_WIDGET_TYPES.includes(type)) {
      throw new Error(`Unsupported Grist widget type "${type}".`);
    }

    if (groupByColumnRefs !== undefined) {
      const seen = new Set<number>();
      for (const columnRef of groupByColumnRefs) {
        assertPositiveId(columnRef, "Grist summary group-by column reference");
        if (seen.has(columnRef)) {
          throw new Error("A Grist summary group-by column reference cannot be duplicated.");
        }
        seen.add(columnRef);
      }
    }

    const response = await this.client.applyUserActions(documentId, [
      [
        "CreateViewSection",
        sourceTableRef,
        pageId,
        type,
        groupByColumnRefs === undefined ? null : [...groupByColumnRefs],
        null
      ]
    ]);

    let result: JsonRecord;
    try {
      result = singleReturnValue(response, "CreateViewSection");
    } catch (error) {
      throw new UiWriteVerificationError(
        "add_page_widget",
        error instanceof Error
          ? error.message
          : "Grist CreateViewSection response could not be interpreted."
      );
    }

    const returnedTableRef = positiveInteger(result.tableRef);
    const returnedPageId = positiveInteger(result.viewRef);
    const widgetId = positiveInteger(result.sectionRef);
    const expectedOrdinaryTable =
      groupByColumnRefs === undefined && returnedTableRef === sourceTableRef;
    const expectedSummaryTable =
      groupByColumnRefs !== undefined &&
      returnedTableRef !== undefined &&
      returnedTableRef !== sourceTableRef;

    if (
      (!expectedOrdinaryTable && !expectedSummaryTable) ||
      returnedPageId !== pageId ||
      widgetId === undefined
    ) {
      throw new UiWriteVerificationError(
        "add_page_widget",
        "Grist CreateViewSection returned inconsistent identifiers.",
        widgetId
      );
    }

    return { pageId: returnedPageId, tableRef: returnedTableRef!, widgetId };
  }

  async renamePage(documentId: string, pageId: number, name: string): Promise<void> {
    assertPositiveId(pageId, "Grist page ID");
    const pageName = name.trim();
    if (!pageName) throw new Error("Page name must not be empty.");

    await this.client.applyUserActions(documentId, [
      ["UpdateRecord", "_grist_Views", pageId, { name: pageName }]
    ]);
  }

  async deletePage(documentId: string, pageId: number): Promise<void> {
    assertPositiveId(pageId, "Grist page ID");
    if (!this.client.queryRecords) {
      throw new Error("Cannot verify the visible Grist page count before deletion.");
    }

    const metadataOptions = { limit: VISIBILITY_METADATA_LIMIT, hidden: true } as const;
    const [pages, views, tables] = await Promise.all([
      this.client.queryRecords(documentId, "_grist_Pages", metadataOptions),
      this.client.queryRecords(documentId, "_grist_Views", metadataOptions),
      this.client.queryRecords(documentId, "_grist_Tables", metadataOptions)
    ]);
    const { allPageIds, visiblePageIds } = classifyPageVisibility(
      pages,
      views,
      tables
    );
    if (!allPageIds.has(pageId)) {
      throw new Error(`Cannot verify Grist page ${pageId} immediately before deletion.`);
    }
    if (visiblePageIds.has(pageId) && visiblePageIds.size <= 1) {
      throw new Error("Cannot delete the last visible Grist page.");
    }

    await this.client.applyUserActions(documentId, [
      ["RemoveRecord", "_grist_Views", pageId]
    ]);
  }

  async reorderPages(
    documentId: string,
    updates: readonly PageOrderWrite[]
  ): Promise<void> {
    if (updates.length > MAX_PAGE_ORDER_PAGES) {
      throw new Error(
        `Grist page order update exceeds the maximum of ${MAX_PAGE_ORDER_PAGES} pages.`
      );
    }
    const seenPageRecordIds = new Set<number>();
    const seenPositions = new Set<number>();
    for (const update of updates) {
      assertPositiveId(update.pageRecordId, "Grist page record ID");
      if (seenPageRecordIds.has(update.pageRecordId)) {
        throw new Error("A Grist page record cannot be reordered more than once.");
      }
      if (!Number.isFinite(update.pagePos)) {
        throw new Error("Grist page position must be finite.");
      }
      if (seenPositions.has(update.pagePos)) {
        throw new Error("Grist page positions in one reorder must be unique.");
      }
      seenPageRecordIds.add(update.pageRecordId);
      seenPositions.add(update.pagePos);
    }
    if (updates.length === 0) return;

    await this.client.applyUserActions(documentId, [
      [
        "BulkUpdateRecord",
        "_grist_Pages",
        updates.map((update) => update.pageRecordId),
        { pagePos: updates.map((update) => update.pagePos) }
      ]
    ]);
  }

  async deletePageWidget(documentId: string, widgetId: number): Promise<void> {
    assertPositiveId(widgetId, "Grist widget ID");
    await this.client.applyUserActions(documentId, [
      ["RemoveRecord", "_grist_Views_section", widgetId]
    ]);
  }

  async updatePageLayout(
    documentId: string,
    pageId: number,
    layoutSpecJson: string
  ): Promise<void> {
    assertPositiveId(pageId, "Grist page ID");
    let parsed: unknown;
    try {
      parsed = JSON.parse(layoutSpecJson) as unknown;
    } catch {
      throw new Error("Trusted page layout payload must be valid JSON.");
    }
    if (!record(parsed)) {
      throw new Error("Trusted page layout payload must encode a JSON object.");
    }

    await this.client.applyUserActions(documentId, [
      ["UpdateRecord", "_grist_Views", pageId, { layoutSpec: layoutSpecJson }]
    ]);
  }

  async updatePageWidget(
    documentId: string,
    widgetId: number,
    update: WidgetUiUpdate
  ): Promise<void> {
    assertPositiveId(widgetId, "Grist widget ID");

    const fields: Record<string, unknown> = {};
    if (update.title !== undefined) {
      fields.title = update.title.trim();
    }
    if (update.description !== undefined) {
      fields.description = update.description.trim();
    }
    if (update.chartType !== undefined) {
      if (!GRIST_CHART_TYPES.includes(update.chartType)) {
        throw new Error(`Unsupported Grist chart type "${update.chartType}".`);
      }
      fields.chartType = update.chartType;
    }
    if (update.sortColRefs !== undefined) {
      fields.sortColRefs = JSON.stringify(update.sortColRefs);
    }
    if (update.selectBy !== undefined) {
      if (update.selectBy === null) {
        fields.linkSrcSectionRef = 0;
        fields.linkSrcColRef = 0;
        fields.linkTargetColRef = 0;
      } else {
        assertPositiveId(update.selectBy.sourceSectionId, "Grist source widget ID");
        const sourceColumnRef = update.selectBy.sourceColumnRef ?? 0;
        const targetColumnRef = update.selectBy.targetColumnRef ?? 0;
        if (!Number.isInteger(sourceColumnRef) || sourceColumnRef < 0) {
          throw new Error("Grist source column reference must be a non-negative integer.");
        }
        if (!Number.isInteger(targetColumnRef) || targetColumnRef < 0) {
          throw new Error("Grist target column reference must be a non-negative integer.");
        }
        fields.linkSrcSectionRef = update.selectBy.sourceSectionId;
        fields.linkSrcColRef = sourceColumnRef;
        fields.linkTargetColRef = targetColumnRef;
      }
    }
    if (update.optionsJson !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(update.optionsJson) as unknown;
      } catch {
        throw new Error("Trusted widget options payload must be valid JSON.");
      }
      if (!record(parsed)) {
        throw new Error("Trusted widget options payload must encode a JSON object.");
      }
      fields.options = update.optionsJson;
    }
    if (update.cardLayoutJson !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(update.cardLayoutJson) as unknown;
      } catch {
        throw new Error("Trusted card layout payload must be valid JSON.");
      }
      if (!record(parsed)) {
        throw new Error("Trusted card layout payload must encode a JSON object.");
      }
      fields.layoutSpec = update.cardLayoutJson;
    }

    const actions: unknown[][] = [];
    if (Object.keys(fields).length > 0) {
      actions.push(["UpdateRecord", "_grist_Views_section", widgetId, fields]);
    }

    if (update.visibleFields !== undefined) {
      const plan = update.visibleFields;
      const fieldIds = new Set<number>();
      for (const item of [
        ...plan.reposition.map((value) => value.fieldId),
        ...plan.resize.map((value) => value.fieldId),
        ...plan.removeFieldIds
      ]) {
        assertPositiveId(item, "Grist widget field ID");
        if (fieldIds.has(item) && plan.removeFieldIds.includes(item)) {
          throw new Error("A removed Grist widget field cannot also be updated.");
        }
        fieldIds.add(item);
      }
      if (plan.removeFieldIds.length > 0) {
        actions.push([
          "BulkRemoveRecord",
          "_grist_Views_section_field",
          [...plan.removeFieldIds]
        ]);
      }
      if (plan.reposition.length > 0) {
        actions.push([
          "BulkUpdateRecord",
          "_grist_Views_section_field",
          plan.reposition.map((value) => value.fieldId),
          { parentPos: plan.reposition.map((value) => value.parentPos) }
        ]);
      }
      if (plan.resize.length > 0) {
        actions.push([
          "BulkUpdateRecord",
          "_grist_Views_section_field",
          plan.resize.map((value) => value.fieldId),
          { width: plan.resize.map((value) => value.width) }
        ]);
      }
      if (plan.add.length > 0) {
        for (const value of plan.add) {
          assertPositiveId(value.columnRef, "Grist widget column reference");
          if (!Number.isInteger(value.parentPos) || value.parentPos < 1) {
            throw new Error("Grist widget field position must be a positive integer.");
          }
          if (!Number.isInteger(value.width) || value.width < 0) {
            throw new Error("Grist widget field width must be a non-negative integer.");
          }
        }
        actions.push([
          "BulkAddRecord",
          "_grist_Views_section_field",
          plan.add.map(() => null),
          {
            parentId: plan.add.map(() => widgetId),
            colRef: plan.add.map((value) => value.columnRef),
            parentPos: plan.add.map((value) => value.parentPos),
            width: plan.add.map((value) => value.width)
          }
        ]);
      }
    }


    if (update.filters !== undefined) {
      const plan = update.filters;
      const seenFilterIds = new Set<number>();
      for (const filterId of plan.removeFilterIds) {
        assertPositiveId(filterId, "Grist widget filter ID");
        if (seenFilterIds.has(filterId)) {
          throw new Error("A Grist widget filter cannot be removed more than once.");
        }
        seenFilterIds.add(filterId);
      }
      if (plan.removeFilterIds.length > 0) {
        actions.push(["BulkRemoveRecord", "_grist_Filters", [...plan.removeFilterIds]]);
      }

      for (const value of plan.update) {
        assertPositiveId(value.filterId, "Grist widget filter ID");
        if (seenFilterIds.has(value.filterId)) {
          throw new Error("A removed Grist widget filter cannot also be updated.");
        }
        seenFilterIds.add(value.filterId);
        const fields: JsonRecord = {};
        if (value.filterJson !== undefined) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(value.filterJson) as unknown;
          } catch {
            throw new Error("Trusted widget filter payload must be valid JSON.");
          }
          if (!record(parsed)) {
            throw new Error("Trusted widget filter payload must encode a JSON object.");
          }
          fields.filter = value.filterJson;
        }
        if (value.pinned !== undefined) fields.pinned = value.pinned;
        if (Object.keys(fields).length === 0) {
          throw new Error("A Grist widget filter update must change filter state or pinning.");
        }
        actions.push(["UpdateRecord", "_grist_Filters", value.filterId, fields]);
      }

      if (plan.add.length > 0) {
        for (const value of plan.add) {
          assertPositiveId(value.columnRef, "Grist widget filter column reference");
          let parsed: unknown;
          try {
            parsed = JSON.parse(value.filterJson) as unknown;
          } catch {
            throw new Error("Trusted widget filter payload must be valid JSON.");
          }
          if (!record(parsed)) {
            throw new Error("Trusted widget filter payload must encode a JSON object.");
          }
          if (typeof value.pinned !== "boolean") {
            throw new Error("Grist widget filter pinned state must be boolean.");
          }
        }
        actions.push([
          "BulkAddRecord",
          "_grist_Filters",
          plan.add.map(() => null),
          {
            viewSectionRef: plan.add.map(() => widgetId),
            colRef: plan.add.map((value) => value.columnRef),
            filter: plan.add.map((value) => value.filterJson),
            pinned: plan.add.map((value) => value.pinned)
          }
        ]);
      }
    }

    if (actions.length === 0) {
      if (update.visibleFields !== undefined || update.filters !== undefined) return;
      throw new Error("At least one widget UI field must be updated.");
    }

    await this.client.applyUserActions(documentId, actions);
  }
}
