import { isDeepStrictEqual } from "node:util";
import type { AuditLogger } from "../audit/auditLogger.js";
import type { AuthorizationService } from "../auth/authorizationService.js";
import type { GristCapability, Principal } from "../auth/principal.js";
import {
  getOperation,
  getRequiredCapability
} from "../operations/registry.js";
import {
  AccessRuleWriteVerificationError,
  normalizeAccessRulesSnapshot,
  projectAccessRules,
  projectAccessPolicyCoverage,
  projectAccessRuleSchemaImpact,
  projectAccessRuleSimulation,
  resolveAccessRuleMutation,
  resolveUserAttributeMutation,
  verifyAccessRuleMutation,
  verifyUserAttributeMutation,
  type AccessPolicyCoverageRequest,
  type AccessRuleInput,
  type AccessRuleTarget,
  type AccessRuleSchemaImpactTarget,
  type AccessRuleSimulationRequest,
  type AccessUserAttributeTarget,
  type AccessUserAttributeDefinitionInput,
  type AccessRulesSnapshot
} from "./accessRules.js";
import type {
  GristColumnSpec,
  GristColumnUpdate,
  GristTableSpec,
  GristTableUpdate,
  NewGristRecord,
  UpdateGristRecord
} from "./client.js";
import type { GristChartType } from "./chartTypes.js";
import {
  resolveCalendarConfigUpdate,
  sameCalendarConfig,
  type CalendarConfigInput
} from "./calendarConfig.js";
import {
  resolveCardLayoutUpdate,
  type CardLayoutUpdateInput
} from "./cardLayout.js";
import {
  resolveCustomWidgetSettingsUpdate,
  sameJsonValue,
  type CustomWidgetSettingsUpdateInput
} from "./customWidgetSettingsUpdate.js";
import {
  resolveGridOptionsUpdate,
  type GridOptionsUpdateInput
} from "./gridOptions.js";
import {
  resolvePageLayoutUpdate,
  type PageLayoutUpdateInput
} from "./pageLayout.js";
import {
  normalizePageOrderSnapshot,
  resolvePageOrderUpdate,
  samePageOrderSnapshot,
  type PageOrderSnapshot
} from "./pageOrder.js";
import {
  resolveSummaryCreationPlan,
  verifySummaryCreation
} from "./summaryTables.js";
import {
  assertDirectSelectByAllowed,
  resolveColumnSelectByAllowed,
  type ColumnSelectByInput
} from "./selectBy.js";
import { applyFormColumnOptions, readFormColumnOptions, type FormColumnOptionsUpdateInput } from "./formColumnOptions.js";
import { resolveExistingDropdownCondition, type DropdownConditionInput } from "./configuredColumns.js";
import { planDropdownConditionUpdate } from "./dropdownConditionUpdate.js";
import { planColumnStyle, readNativeColumnStyleSequence, readNativeRowStyleSequence,
  planAppendColumnStyleRule, planExistingColumnStyleUpdate,
  planExistingStyleFormulaReplacement, planReorderRowStyleRules, planReorderColumnStyleRules, type ColumnStyleInput } from "./styleRules.js";
import { planOwnerSchemaGuard, verifyOwnerSchemaGuard } from "./schemaEditGuard.js";
import { resolveFormLayoutUpdate, type FormLayoutInput } from "./formLayout.js";
import { planFormPublication, planFormUnpublication, readNativeFormPageShare } from "./formPublication.js";
import { readFormFieldOptions, resolveFormFieldOptions, type FormFieldOptionsInput } from "./formFieldOptions.js";
import { DocumentContextService } from "./documentContext.js";
import { DocumentUiService, type DocumentUiContext } from "./documentUi.js";
import {
  projectPublicColumns,
  projectPublicPage,
  projectPublicWidget,
  projectPublicTables
} from "./publicMetadata.js";
import {
  SchemaWriteVerificationError,
  type DocumentMetadataUpdateInput,
  type GristService,
  type QueryRecordsOptions
} from "./service.js";
import {
  GristUiActionsAdapter,
  UiWriteVerificationError,
  type NativeWidgetType
} from "./uiActionsAdapter.js";
import {
  resolveWidgetSort,
  type ResolvedWidgetSortSpec,
  type WidgetSortInput
} from "./widgetSort.js";
import { existingWidgetFields } from "./widgetFields.js";
import { approvedWidgets, planTrustedWidgetInstall, planTrustedWidgetRevisionUpdate } from "./trustedWidgetInstall.js";
import {
  resolveWidgetFieldsUpdate,
  type WidgetFieldUpdateInput
} from "./widgetFields.js";
import {
  resolveWidgetFiltersUpdate,
  type WidgetFilterUpdateInput
} from "./widgetFilters.js";

export interface PageWidgetUpdateInput {
  title?: string;
  description?: string;
  chartType?: GristChartType;
  sort?: readonly WidgetSortInput[] | null;
  selectBy?: ColumnSelectByInput | null;
  customWidgetSettings?: CustomWidgetSettingsUpdateInput;
  calendarConfig?: CalendarConfigInput;
  gridOptions?: GridOptionsUpdateInput;
  visibleFields?: readonly WidgetFieldUpdateInput[];
  cardLayout?: CardLayoutUpdateInput;
  filters?: readonly WidgetFilterUpdateInput[];
}

const SECTION_FIELDS_METADATA = Symbol("sectionFieldsMetadata");
const FILTERS_METADATA = Symbol("filtersMetadata");

type CompletenessAwareDocumentUiContext = DocumentUiContext & {
  metadataSnapshotIncomplete?: true;
  navigationNormalizationIncomplete?: true;
  [SECTION_FIELDS_METADATA]?: unknown;
  [FILTERS_METADATA]?: unknown;
};

function sameSortSpec(
  actual: unknown,
  expected: readonly ResolvedWidgetSortSpec[]
): boolean {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function assertPublicTableId(tableId: string): void {
  if (!tableId.trim()) {
    throw new Error("Table ID must not be empty.");
  }
  if (tableId.startsWith("_grist_")) {
    throw new Error(
      "Grist metadata tables are internal to the bridge; use the semantic document/page/widget inspection operations instead."
    );
  }
}

function assertPublicTableUpdates(tables: readonly GristTableUpdate[]): void {
  for (const table of tables) {
    assertPublicTableId(table.id);
    const renamedTableId = table.fields.tableId;
    if (typeof renamedTableId === "string") {
      assertPublicTableId(renamedTableId);
    }
  }
}

function metadataResponseReachedLimit(value: unknown, limit: number): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const source = (value as Record<string, unknown>).records;
  return Array.isArray(source) && source.length >= limit;
}

function assertCompleteUiSnapshot(context: CompletenessAwareDocumentUiContext): void {
  if (!context.metadataSnapshotIncomplete) return;
  throw new Error(
    "Grist UI metadata snapshot reached the configured read limit or is malformed, unavailable or ambiguous; refusing a UI mutation that requires the complete page/widget graph."
  );
}

function exposeUiSnapshotCompleteness(
  value: unknown,
  context: CompletenessAwareDocumentUiContext
): unknown {
  if (!context.metadataSnapshotIncomplete) return value;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  return {
    ...(value as Record<string, unknown>),
    metadataSnapshotIncomplete: true
  };
}

type DocumentGrantUser = {
  id: number;
  email: string;
  access: string | null;
  parentAccess?: string | null | undefined;
  isMember?: boolean | null | undefined;
};
/** Exact individual only; never let native share delta accept public pseudo-identities. */
function assertIndividualGrantEmail(email: string): void {
  if (!/^[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9][a-z0-9.-]{0,190}\.[a-z]{2,24}$/.test(email) ||
      ["everyone@getgrist.com", "anonymous@getgrist.com", "previewer@getgrist.com", "support@getgrist.com"].includes(email)) {
    throw new Error("A normalized, explicit individual email is required.");
  }
}

export class DocumentGrantVerificationError extends Error {
  constructor(message: string) {
    super(message + " The effect is uncertain; do not replay blindly.");
    this.name = "DocumentGrantVerificationError";
  }
}

function documentGrantSnapshot(raw: unknown): {
  maxInheritedRole: unknown; users: DocumentGrantUser[];
} {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Native Grist sharing snapshot is unavailable.");
  }
  const root = raw as Record<string, unknown>;
  if (!Array.isArray(root.users) || root.users.length > 1000) {
    throw new Error("Native Grist sharing snapshot is incomplete or exceeds its limit.");
  }
  const users: DocumentGrantUser[] = [];
  const seen = new Set<string>();
  const seenIds = new Set<number>();
  for (const entry of root.users) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Native Grist sharing entry is malformed.");
    }
    const row = entry as Record<string, unknown>;
    if (!Number.isSafeInteger(row.id) || (row.id as number) < 1 ||
        typeof row.email !== "string" || !row.email ||
        typeof row.access !== "string" && row.access !== null ||
        row.parentAccess !== undefined &&
          typeof row.parentAccess !== "string" && row.parentAccess !== null ||
        row.isMember !== undefined && row.isMember !== null &&
          typeof row.isMember !== "boolean") {
      throw new Error("Native Grist sharing identity or role is incomplete.");
    }
    const canonical = row.email.toLowerCase();
    if (seen.has(canonical) || seenIds.has(row.id as number)) {
      throw new Error("Duplicate native sharing identity; refusing modification.");
    }
    seen.add(canonical);
    seenIds.add(row.id as number);
    users.push({
      id: row.id as number, email: canonical, access: row.access as string | null,
      ...(row.parentAccess !== undefined
        ? { parentAccess: row.parentAccess as string | null } : {}),
      ...(row.isMember !== undefined
        ? { isMember: row.isMember as boolean | null } : {})
    });
  }
  return { maxInheritedRole: root.maxInheritedRole, users };
}

export class DocumentBootstrapVerificationError extends Error {
  constructor(
    public readonly createdDocumentId: string,
    message: string
  ) {
    super(
      `Grist created document "${createdDocumentId}", but Gia could not verify that it is currently authorized in the requested destination workspace: ${message} Do not retry the creation by name and do not delete a guessed document automatically.`
    );
    this.name = "DocumentBootstrapVerificationError";
  }
}

export class AuthorizedGristService {
  private readonly documentContext = new DocumentContextService();
  private readonly documentUi = new DocumentUiService();

  constructor(
    private readonly inner: GristService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditLogger,
    private readonly principal: Principal,
    private readonly uiActions: GristUiActionsAdapter
  ) {}

  get maxReadRecords(): number {
    return this.inner.maxReadRecords;
  }

  get maxWriteRecords(): number {
    return this.inner.maxWriteRecords;
  }

  get writeBatchRecords(): number {
    return this.inner.writeBatchRecords;
  }

  get maxSchemaItems(): number {
    return this.inner.maxSchemaItems;
  }

  async listWorkspaces(): Promise<unknown> {
    const definition = getOperation("list_workspaces");
    const capability = getRequiredCapability(definition.name);
    const requestId = this.audit.nextRequestId();
    const started = Date.now();
    try {
      const workspaces = (
        await this.authorization.listWorkspaces(this.principal, capability)
      ).map(({ org, workspace }) => ({
        org: { id: org.id, name: org.name, domain: org.domain },
        workspace: {
          id: workspace.id,
          name: workspace.name,
          access: workspace.access
        }
      }));
      this.audit.record({
        requestId,
        principal: this.principal.id,
        transport: this.principal.transport,
        operation: definition.name,
        capability,
        status: "success",
        durationMs: Date.now() - started
      });
      return { workspaces };
    } catch (error) {
      this.auditFailure(
        requestId,
        started,
        definition.name,
        capability,
        undefined,
        error
      );
      throw error;
    }
  }

  async listDocuments(): Promise<unknown> {
    const definition = getOperation("list_documents");
    const capability = getRequiredCapability(definition.name);
    const requestId = this.audit.nextRequestId();
    const started = Date.now();
    try {
      const documents = (
        await this.authorization.listDocuments(this.principal, capability)
      ).map(({ org, workspace, document }) => ({
        org: { id: org.id, name: org.name, domain: org.domain },
        workspace: {
          id: workspace.id,
          name: workspace.name,
          access: workspace.access
        },
        document
      }));
      this.audit.record({
        requestId,
        principal: this.principal.id,
        transport: this.principal.transport,
        operation: definition.name,
        capability,
        status: "success",
        durationMs: Date.now() - started
      });
      return { documents };
    } catch (error) {
      this.auditFailure(
        requestId,
        started,
        definition.name,
        capability,
        undefined,
        error
      );
      throw error;
    }
  }

  async inspectDocument(documentIdOrUrl: string): Promise<unknown> {
    return this.execute("inspect_document", documentIdOrUrl, undefined, async (id) => {
      const [document, tableResponse] = await Promise.all([
        this.inner.getDocumentMetadata(id),
        this.inner.listTables(id, { expandColumns: true })
      ]);
      const ui = await this.loadDocumentUi(id, tableResponse, true, true);
      const navigation = await this.inspectNavigation(id);
      if ("navigationNormalizationIncomplete" in navigation) {
        ui.navigationNormalizationIncomplete = true;
      }
      const context = this.documentContext.build(id, tableResponse, ui);
      return {
        ...(context as Record<string, unknown>),
        document,
        ...navigation
      };
    });
  }

  async inspectAccessRules(
    documentIdOrUrl: string,
    schemaImpact?: AccessRuleSchemaImpactTarget,
    simulation?: AccessRuleSimulationRequest,
    policyCoverage?: AccessPolicyCoverageRequest
  ): Promise<unknown> {
    return this.execute("inspect_access_rules", documentIdOrUrl, undefined, async (id) => {
      await this.inner.assertDocumentOwner(id);
      const snapshot = await this.loadAccessRulesSnapshot(id);
      return {
        documentId: id,
        ...(projectAccessRules(snapshot) as Record<string, unknown>),
        ...(schemaImpact ? { schemaChangeImpact: projectAccessRuleSchemaImpact(snapshot, schemaImpact) } : {}),
        ...(simulation ? { simulatedPolicyGroup: projectAccessRuleSimulation(snapshot, simulation) } : {}),
        ...(policyCoverage ? { policyCoverage: projectAccessPolicyCoverage(snapshot, policyCoverage) } : {})
      };
    });
  }

  async getPages(documentIdOrUrl: string): Promise<unknown> {
    return this.execute("get_pages", documentIdOrUrl, undefined, async (id) => {
      const ui = await this.loadDocumentUi(id);
      const navigation = await this.inspectNavigation(id);
      const projected = exposeUiSnapshotCompleteness(
        this.documentUi.listPages(ui),
        ui
      );
      return {
        ...(projected as Record<string, unknown>),
        ...navigation
      };
    });
  }

  async getPageWidgets(documentIdOrUrl: string, pageId: number): Promise<unknown> {
    if (!Number.isInteger(pageId) || pageId < 1) {
      throw new Error("Grist page ID must be a positive integer.");
    }
    return this.execute("get_page_widgets", documentIdOrUrl, undefined, async (id) => {
      const tableResponse = await this.inner.listTables(id, { expandColumns: true });
      const ui = await this.loadDocumentUi(id, tableResponse, true, true);
      const fields = ui[SECTION_FIELDS_METADATA];
      const metadataLimit = this.inner.maxReadRecords || 5000;
      return exposeUiSnapshotCompleteness(
        this.documentUi.getPageWidgets(
          ui, pageId, tableResponse,
          fields && !metadataResponseReachedLimit(fields, metadataLimit) ? fields : undefined
        ),
        ui
      );
    });
  }

  async createPage(
    documentIdOrUrl: string,
    tableId: string,
    name: string
  ): Promise<unknown> {
    return this.execute("create_page", documentIdOrUrl, 1, async (id) => {
      await this.resolveTableRef(id, tableId);
      const before = await this.loadDocumentUi(id);
      assertCompleteUiSnapshot(before);
      const created = await this.uiActions.createEmptyPage(id, tableId, name);
      try {
        const ui = await this.loadDocumentUi(id);
        assertCompleteUiSnapshot(ui);
        const page = ui.pages.find((candidate) => candidate.id === created.pageId);
        if (!page) {
          throw new Error(`Created page ${created.pageId} was not found on re-read.`);
        }
        const { widgets } = page;
        return {
          documentId: id,
          page: {
            ...projectPublicPage(page),
            widgetCount: widgets.length,
            widgetIds: widgets.map((widget) => widget.id)
          }
        };
      } catch (error) {
        throw new UiWriteVerificationError(
          "create_page",
          created.pageId,
          error instanceof Error ? error.message : "Created page could not be verified."
        );
      }
    });
  }

  async addPageWidget(
    documentIdOrUrl: string,
    pageId: number,
    tableId: string,
    type: NativeWidgetType,
    groupByColumnIds?: readonly string[]
  ): Promise<unknown> {
    if (!Number.isInteger(pageId) || pageId < 1) {
      throw new Error("Grist page ID must be a positive integer.");
    }
    return this.execute("add_page_widget", documentIdOrUrl, 1, async (id) => {
      const before = await this.loadDocumentUi(id);
      assertCompleteUiSnapshot(before);
      if (!before.pages.some((page) => page.id === pageId)) {
        throw new Error(`Grist page ${pageId} does not exist in document "${id}".`);
      }

      const summaryPlan =
        groupByColumnIds !== undefined
          ? resolveSummaryCreationPlan(
              await this.inner.listTables(id, { expandColumns: true }),
              tableId,
              groupByColumnIds
            )
          : undefined;
      const tableRef =
        summaryPlan?.sourceTableRef ?? (await this.resolveTableRef(id, tableId));
      const created = await this.uiActions.addPageWidget(
        id,
        pageId,
        tableRef,
        type,
        summaryPlan?.groupByColumnRefs
      );

      try {
        const afterTables = summaryPlan
          ? await this.inner.listTables(id, { expandColumns: true })
          : undefined;
        const after = await this.loadDocumentUi(id, afterTables);
        assertCompleteUiSnapshot(after);
        const page = after.pages.find((candidate) => candidate.id === pageId);
        const widget = page?.widgets.find(
          (candidate) => candidate.id === created.widgetId
        );
        if (!widget) {
          throw new Error(
            `Created widget ${created.widgetId} was not found on re-read.`
          );
        }

        if (!summaryPlan) {
          if (widget.tableRef !== created.tableRef) {
            throw new Error(
              `Created widget ${created.widgetId} did not target the returned source table on re-read.`
            );
          }
          return { documentId: id, pageId, widget: projectPublicWidget(widget) };
        }

        const summary = verifySummaryCreation(
          afterTables,
          summaryPlan,
          widget.tableRef
        );
        if (widget.tableId !== summary.summaryTableId) {
          throw new Error(
            "Created summary widget does not target the verified generated table."
          );
        }
        return { documentId: id, pageId, widget: projectPublicWidget(widget), summary };
      } catch (error) {
        throw new UiWriteVerificationError(
          "add_page_widget",
          created.widgetId,
          error instanceof Error ? error.message : "Created widget could not be verified."
        );
      }
    });
  }

  async renamePage(
    documentIdOrUrl: string,
    pageId: number,
    name: string
  ): Promise<unknown> {
    if (!Number.isInteger(pageId) || pageId < 1) {
      throw new Error("Grist page ID must be a positive integer.");
    }
    const pageName = name.trim();
    if (!pageName) throw new Error("Page name must not be empty.");

    return this.execute("rename_page", documentIdOrUrl, 1, async (id) => {
      const before = await this.loadDocumentUi(id);
      assertCompleteUiSnapshot(before);
      if (!before.pages.some((page) => page.id === pageId)) {
        throw new Error(`Grist page ${pageId} does not exist in document "${id}".`);
      }

      await this.uiActions.renamePage(id, pageId, pageName);
      try {
        const after = await this.loadDocumentUi(id);
        assertCompleteUiSnapshot(after);
        const page = after.pages.find((candidate) => candidate.id === pageId);
        if (!page || page.name !== pageName) {
          throw new Error(`Renamed page ${pageId} did not match the requested name on re-read.`);
        }
        const { widgets } = page;
        return {
          documentId: id,
          page: {
            ...projectPublicPage(page),
            widgetCount: widgets.length,
            widgetIds: widgets.map((widget) => widget.id)
          }
        };
      } catch (error) {
        throw new UiWriteVerificationError(
          "rename_page",
          error instanceof Error ? error.message : "Renamed page could not be verified."
        );
      }
    });
  }

  async deletePage(documentIdOrUrl: string, pageId: number): Promise<unknown> {
    if (!Number.isInteger(pageId) || pageId < 1) {
      throw new Error("Grist page ID must be a positive integer.");
    }

    return this.execute("delete_page", documentIdOrUrl, 1, async (id) => {
      const before = await this.loadDocumentUi(id);
      assertCompleteUiSnapshot(before);
      if (!before.pages.some((page) => page.id === pageId)) {
        throw new Error(`Grist page ${pageId} does not exist in document "${id}".`);
      }

      await this.uiActions.deletePage(id, pageId);
      try {
        const after = await this.loadDocumentUi(id);
        assertCompleteUiSnapshot(after);
        if (after.pages.some((page) => page.id === pageId)) {
          throw new Error(`Deleted page ${pageId} was still present on re-read.`);
        }
        return { documentId: id, deletedPageId: pageId };
      } catch (error) {
        throw new UiWriteVerificationError(
          "delete_page",
          error instanceof Error ? error.message : "Deleted page could not be verified."
        );
      }
    });
  }

  async reorderPages(
    documentIdOrUrl: string,
    pageIds: readonly number[]
  ): Promise<unknown> {
    return this.execute("reorder_pages", documentIdOrUrl, pageIds.length, async (id) => {
      const before = await this.loadPageOrderSnapshot(id);
      const resolved = resolvePageOrderUpdate(before, pageIds);
      await this.uiActions.reorderPages(id, resolved.updates);

      try {
        const after = await this.loadPageOrderSnapshot(id);
        if (!samePageOrderSnapshot(after, resolved.expected)) {
          throw new Error(
            "Updated Grist navigation did not match the requested page order and preserved hierarchy on re-read."
          );
        }
        return {
          documentId: id,
          pageIds: [...after.visiblePageIds]
        };
      } catch (error) {
        throw new UiWriteVerificationError(
          "reorder_pages",
          error instanceof Error ? error.message : "Updated page order could not be verified."
        );
      }
    });
  }

  async deletePageWidget(
    documentIdOrUrl: string,
    pageId: number,
    widgetId: number
  ): Promise<unknown> {
    if (!Number.isInteger(pageId) || pageId < 1) {
      throw new Error("Grist page ID must be a positive integer.");
    }
    if (!Number.isInteger(widgetId) || widgetId < 1) {
      throw new Error("Grist widget ID must be a positive integer.");
    }

    return this.execute("delete_page_widget", documentIdOrUrl, 1, async (id) => {
      const before = await this.loadDocumentUi(id);
      assertCompleteUiSnapshot(before);
      const page = before.pages.find((candidate) => candidate.id === pageId);
      if (!page) {
        throw new Error(`Grist page ${pageId} does not exist in document "${id}".`);
      }
      if (!page.widgets.some((widget) => widget.id === widgetId)) {
        throw new Error(`Grist widget ${widgetId} does not exist on page ${pageId}.`);
      }

      await this.uiActions.deletePageWidget(id, widgetId);
      try {
        const after = await this.loadDocumentUi(id);
        assertCompleteUiSnapshot(after);
        const updatedPage = after.pages.find((candidate) => candidate.id === pageId);
        if (!updatedPage) {
          throw new Error(`Page ${pageId} disappeared while deleting widget ${widgetId}.`);
        }
        const lingeringPage = after.pages.find((candidate) =>
          candidate.widgets.some((widget) => widget.id === widgetId)
        );
        if (lingeringPage) {
          throw new Error(
            `Deleted widget ${widgetId} was still present on page ${lingeringPage.id} on re-read.`
          );
        }
        return { documentId: id, pageId, deletedWidgetId: widgetId };
      } catch (error) {
        throw new UiWriteVerificationError(
          "delete_page_widget",
          error instanceof Error ? error.message : "Deleted widget could not be verified."
        );
      }
    });
  }

  async updatePageLayout(
    documentIdOrUrl: string,
    pageId: number,
    layout: PageLayoutUpdateInput
  ): Promise<unknown> {
    if (!Number.isInteger(pageId) || pageId < 1) {
      throw new Error("Grist page ID must be a positive integer.");
    }

    return this.execute("update_page_layout", documentIdOrUrl, 1, async (id) => {
      const before = await this.loadDocumentUi(id);
      assertCompleteUiSnapshot(before);
      const page = before.pages.find((candidate) => candidate.id === pageId);
      if (!page) {
        throw new Error(`Grist page ${pageId} does not exist in document "${id}".`);
      }
      if (page.layoutNormalizationIncomplete) {
        throw new Error(
          `Grist page ${pageId} has incomplete or unsupported current layout metadata; refusing to overwrite it.`
        );
      }

      const resolved = resolvePageLayoutUpdate(
        layout,
        page.widgets.map((widget) => widget.id)
      );
      await this.uiActions.updatePageLayout(id, pageId, resolved.layoutSpecJson);

      try {
        const after = await this.loadDocumentUi(id);
        assertCompleteUiSnapshot(after);
        const updatedPage = after.pages.find((candidate) => candidate.id === pageId);
        if (!updatedPage) {
          throw new Error(`Updated page ${pageId} was not found on re-read.`);
        }
        if (
          updatedPage.layoutNormalizationIncomplete ||
          !sameJsonValue(updatedPage.layoutNormalized, resolved.expectedLayout)
        ) {
          throw new Error(
            `Updated page ${pageId} did not match the requested normalized layout on re-read.`
          );
        }
        const { widgets } = updatedPage;
        return {
          documentId: id,
          page: {
            ...projectPublicPage(updatedPage),
            widgetCount: widgets.length,
            widgetIds: widgets.map((widget) => widget.id)
          }
        };
      } catch (error) {
        throw new UiWriteVerificationError(
          "update_page_layout",
          error instanceof Error ? error.message : "Updated page layout could not be verified."
        );
      }
    });
  }

  /** Change one native Form publication flag only, preserving the existing public share. */
  async unpublishForm(
    documentIdOrUrl: string, pageId: number, widgetId: number,
    confirmUnpublish: true
  ): Promise<unknown> {
    if (confirmUnpublish !== true ||
        !Number.isInteger(pageId) || pageId < 1 ||
        !Number.isInteger(widgetId) || widgetId < 1) {
      throw new Error("Explicit Form unpublication confirmation and positive IDs are required.");
    }
    return this.execute("unpublish_form", documentIdOrUrl, 1, async id => {
      await this.inner.assertDocumentOwner(id);
      const before = await this.loadDocumentUi(id);
      assertCompleteUiSnapshot(before);
      const page = before.pages.find(item => item.id === pageId);
      const widget = page?.widgets.find(item => item.id === widgetId);
      if (!page || !widget || widget.type !== "form") {
        throw new Error("Target must be an existing native Form on the requested page.");
      }
      const limit = this.inner.maxReadRecords > 0 ? this.inner.maxReadRecords : 5000;
      const nativeShare = async () => {
        const [pages, shares] = await Promise.all([
          this.inner.queryRecords(id, "_grist_Pages", { limit, hidden: true }),
          this.inner.queryRecords(id, "_grist_Shares", { limit, hidden: true })
        ]);
        if (readNativeFormPageShare(
          pages, shares, page.pageRecordId, pageId, limit
        ) !== "published") {
          throw new Error("Unpublication requires a verified existing native Form page share.");
        }
        return { pages, shares };
      };
      const originalShare = await nativeShare();
      const plan = planFormUnpublication(widget.formShareOptions);
      const result = { documentId: id, pageId, widgetId };
      if (!plan.changed) return { ...result, changed: false,
        persistedUnpublicationIntentVerified: true, nativePageSharePreserved: true,
        publicAccessRevocationQualified: false };
      const latest = await this.loadDocumentUi(id);
      assertCompleteUiSnapshot(latest);
      const latestWidget = latest.pages.find(p => p.id === pageId)?.widgets
        .find(w => w.id === widgetId);
      if (!latestWidget || !sameJsonValue(latestWidget, widget) ||
          !isDeepStrictEqual(await nativeShare(), originalShare)) {
        throw new Error("Native Form changed before unpublication; reconcile first.");
      }
      try {
        await this.uiActions.unpublishForm(id, widgetId, plan.shareOptions);
        const [after, share] = await Promise.all([
          this.loadDocumentUi(id), nativeShare()
        ]);
        assertCompleteUiSnapshot(after);
        const current = after.pages.find(p => p.id === pageId)?.widgets
          .find(w => w.id === widgetId);
        if (!current || current.type !== "form" ||
            current.tableRef !== widget.tableRef || current.tableId !== widget.tableId ||
            !sameJsonValue(current.layoutSpec, widget.layoutSpec) ||
            !sameJsonValue(current.options, widget.options) ||
            !sameJsonValue(current.formShareOptions, plan.shareOptions) ||
            !isDeepStrictEqual(share, originalShare)) {
          throw new Error("Native Form unpublication or retained share failed postconditions.");
        }
        return { ...result, changed: true, persistedUnpublicationIntentVerified: true,
          nativePageSharePreserved: true, publicAccessRevocationQualified: false };
      } catch (error) {
        throw new UiWriteVerificationError("unpublish_form",
          "Native Form unpublication may be uncertain; inspect before retry: " +
          (error instanceof Error ? error.message : "unknown result"));
      }
    });
  }

  async publishForm(
    documentIdOrUrl: string, pageId: number, widgetId: number,
    confirmPublic: true
  ): Promise<unknown> {
    if (confirmPublic !== true ||
        !Number.isInteger(pageId) || pageId < 1 ||
        !Number.isInteger(widgetId) || widgetId < 1) {
      throw new Error("Explicit public Form confirmation and positive target IDs are required.");
    }
    return this.execute("publish_form", documentIdOrUrl, 1, async (id) => {
      // Local doc.schema:write is necessary but not sufficient: Grist Owner is also required.
      await this.inner.assertDocumentOwner(id);
      const before = await this.loadDocumentUi(id);
      assertCompleteUiSnapshot(before);
      const page = before.pages.find(page => page.id === pageId);
      const widget = page?.widgets.find(item => item.id === widgetId);
      if (!page || !widget || widget.type !== "form") {
        throw new Error("Target must be an existing native Form on the selected page.");
      }
      const limit = this.inner.maxReadRecords > 0 ? this.inner.maxReadRecords : 5000;
      const nativeShare = async () => {
        const [pages, shares] = await Promise.all([
          this.inner.queryRecords(id, "_grist_Pages", { limit, hidden: true }),
          this.inner.queryRecords(id, "_grist_Shares", { limit, hidden: true })
        ]);
        return readNativeFormPageShare(pages, shares, page.pageRecordId, pageId, limit);
      };
      const originalShare = await nativeShare();
      const plan = planFormPublication(widget.formShareOptions);
      const base = { documentId: id, pageId, widgetId, publicationRequested: true };
      if (!plan.changed && originalShare === "published") return { ...base,
        changed: false, persistedPublicationIntentVerified: true,
        persistedPageShareVerified: true, publicSubmissionQualified: false };
      // One native action bundle creates the share and links the page before
      // publishing the Form. No generated link identifier enters the MCP result.
      await this.uiActions.publishForm(
        id, widgetId, page.pageRecordId, plan.shareOptions, originalShare === "missing"
      );
      try {
        const [after, share] = await Promise.all([this.loadDocumentUi(id), nativeShare()]);
        assertCompleteUiSnapshot(after);
        const current = after.pages.find(candidate => candidate.id === pageId)?.widgets
          .find(item => item.id === widgetId);
        if (!current || current.type !== "form" ||
            current.tableRef !== widget.tableRef || current.tableId !== widget.tableId ||
            !sameJsonValue(current.layoutSpec, widget.layoutSpec) ||
            !sameJsonValue(current.options, widget.options) ||
            planFormPublication(current.formShareOptions).changed || share !== "published") {
          throw new Error("Native Form publication or page share failed verification.");
        }
        return { ...base, changed: true, persistedPublicationIntentVerified: true,
          persistedPageShareVerified: true, publicSubmissionQualified: false };
      } catch (error) {
        throw new UiWriteVerificationError("publish_form",
          error instanceof Error ? error.message : "Form publication state could not be reread.");
      }
    });
  }

  async updateFormLayout(
    documentIdOrUrl: string, pageId: number, widgetId: number,
    layout: FormLayoutInput
  ): Promise<unknown> {
    if (!Number.isInteger(pageId) || pageId < 1 ||
        !Number.isInteger(widgetId) || widgetId < 1) {
      throw new Error("Form page and widget IDs must be positive integers.");
    }
    return this.execute("update_form_layout", documentIdOrUrl, 1, async (id) => {
      const tables = await this.inner.listTables(id, { expandColumns: true });
      const before = await this.loadDocumentUi(id, tables, true);
      assertCompleteUiSnapshot(before);
      const widget = before.pages.find(page => page.id === pageId)?.widgets
        .find(item => item.id === widgetId);
      if (!widget || widget.type !== "form") {
        throw new Error("Target widget is not a verified native Form on the requested page.");
      }
      const fields = before[SECTION_FIELDS_METADATA];
      const resolved = resolveFormLayoutUpdate(widget, tables, fields, layout);
      const base = { documentId: id, pageId, widgetId };
      if (sameJsonValue(widget.layoutSpec, resolved.layoutSpec)) {
        return { ...base, changed: false, persistedLayoutVerified: true,
          nativeFormSubmissionQualified: false };
      }
      await this.uiActions.updateFormLayout(id, widgetId, resolved.layoutSpecJson);
      try {
        const currentTables = await this.inner.listTables(id, { expandColumns: true });
        const after = await this.loadDocumentUi(id, currentTables, true);
        assertCompleteUiSnapshot(after);
        const current = after.pages.find(page => page.id === pageId)?.widgets
          .find(item => item.id === widgetId);
        if (!current || current.type !== "form" ||
            current.tableRef !== widget.tableRef || current.tableId !== widget.tableId ||
            !sameJsonValue(current.layoutSpec, resolved.layoutSpec) ||
            !sameJsonValue(resolveFormLayoutUpdate(current, currentTables,
              after[SECTION_FIELDS_METADATA], layout).layoutSpec, resolved.layoutSpec)) {
          throw new Error("Native Form layout differs from the requested persisted state.");
        }
        return { ...base, changed: true, persistedLayoutVerified: true,
          nativeFormSubmissionQualified: false };
      } catch (error) {
        throw new UiWriteVerificationError("update_form_layout",
          error instanceof Error ? error.message : "Native Form layout post-read failed.");
      }
    });
  }

  async updateFormFieldOptions(
    documentIdOrUrl: string, pageId: number, widgetId: number,
    columnId: string, update: FormFieldOptionsInput
  ): Promise<unknown> {
    if (!Number.isInteger(pageId) || pageId < 1 ||
        !Number.isInteger(widgetId) || widgetId < 1 || !columnId.trim()) {
      throw new Error("Form field update needs positive page/widget IDs and a stable column ID.");
    }
    return this.execute("update_form_field_options", documentIdOrUrl, 1, async (id) => {
      const tables = await this.inner.listTables(id, { expandColumns: true });
      const before = await this.loadDocumentUi(id, tables, true);
      assertCompleteUiSnapshot(before);
      const form = before.pages.find(page => page.id === pageId)?.widgets
        .find(widget => widget.id === widgetId);
      if (!form || form.type !== "form") {
        throw new Error("Target is not a verified native Form on the requested page.");
      }
      const sectionFields = before[SECTION_FIELDS_METADATA];
      const currentFields = existingWidgetFields(form, tables, sectionFields);
      const target = currentFields?.find(field => field.columnId === columnId);
      if (!target) {
        throw new Error("Form column is not an existing uniquely resolved native section field.");
      }
      const limit = this.inner.maxReadRecords > 0 ? this.inner.maxReadRecords : 5000;
      const read = (response: unknown) => readFormFieldOptions(
        response, widgetId, target.fieldId, target.columnRef, limit
      );
      const plan = resolveFormFieldOptions(read(sectionFields), update);
      const base = { documentId: id, pageId, widgetId, columnId };
      if (!plan.changed) return { ...base, changed: false,
        persistedOptionsVerified: true, nativeFormRenderingQualified: false };
      await this.uiActions.updateFormFieldOptions(id, target.fieldId, plan.widgetOptions);
      try {
        const after = await this.inner.queryRecords(id, "_grist_Views_section_field",
          { limit, hidden: true });
        if (!sameJsonValue(read(after), plan.options)) {
          throw new Error("Native Form field options did not match the requested preserved state.");
        }
        return { ...base, changed: true, persistedOptionsVerified: true,
          nativeFormRenderingQualified: false };
      } catch (error) {
        throw new UiWriteVerificationError("update_form_field_options",
          error instanceof Error ? error.message : "Native Form field option post-read failed.");
      }
    });
  }

  async installTrustedWidget(
    documentIdOrUrl: string, pageId: number, widgetId: number,
    trustedKey: string, confirmExternalWidget: true
  ): Promise<unknown> {
    if (confirmExternalWidget !== true) throw new Error("External widget confirmation required.");
    if (!Number.isInteger(pageId) || pageId < 1 ||
        !Number.isInteger(widgetId) || widgetId < 1) {
      throw new Error("Page and widget IDs must be positive integers.");
    }
    const approved = approvedWidgets(
      process.env.GIA_TRUSTED_CUSTOM_WIDGETS_JSON, process.env.GRIST_BASE_URL ?? ""
    ).find(entry => entry.key === trustedKey);
    if (!approved) throw new Error("Widget key is not operator-approved.");
    return this.execute("install_trusted_widget", documentIdOrUrl, 1, async id => {
      await this.inner.assertDocumentOwner(id);
      const before = await this.loadDocumentUi(id);
      assertCompleteUiSnapshot(before);
      const widget = before.pages.find(p => p.id === pageId)
        ?.widgets.find(w => w.id === widgetId);
      if (!widget) throw new Error("Widget does not exist on requested page.");
      const plan = planTrustedWidgetInstall(widget, approved);
      const base = { documentId: id, pageId, widgetId, trustedKey };
      if (!plan.changed) return { ...base, changed: false, persistedWidgetVerified: true };
      try {
        await this.uiActions.updatePageWidget(id, widgetId, { optionsJson: plan.optionsJson });
        const after = await this.loadDocumentUi(id);
        assertCompleteUiSnapshot(after);
        const installed = after.pages.find(p => p.id === pageId)
          ?.widgets.find(w => w.id === widgetId);
        if (!installed || !sameJsonValue(installed.options, plan.options) ||
            installed.customWidgetSettingsNormalizationIncomplete ||
            installed.customWidgetSettings?.widgetId !== approved.widgetId ||
            installed.customWidgetSettings?.access !== "none") {
          throw new Error("Native widget identity or initial zero access could not be verified.");
        }
        return { ...base, changed: true, persistedWidgetVerified: true,
          remoteCodeExecutionQualified: false, widget: projectPublicWidget(installed) };
      } catch (error) {
        throw new UiWriteVerificationError("install_trusted_widget",
          "Native trusted widget effect uncertain; inspect before retry: " +
          (error instanceof Error ? error.message : "unknown result"));
      }
    });
  }


  /** Change only a fully approved immutable widget revision before any data access. */
  async updateTrustedWidgetRevision(
    documentIdOrUrl: string, pageId: number, widgetId: number,
    previousTrustedKey: string, trustedKey: string, confirmExternalWidget: true
  ): Promise<unknown> {
    if (confirmExternalWidget !== true ||
        !Number.isSafeInteger(pageId) || pageId < 1 ||
        !Number.isSafeInteger(widgetId) || widgetId < 1) {
      throw new Error("Trusted widget revision requires confirmation and stable page/widget IDs.");
    }
    const registry = approvedWidgets(
      process.env.GIA_TRUSTED_CUSTOM_WIDGETS_JSON, process.env.GRIST_BASE_URL ?? ""
    );
    const previous = registry.find(entry => entry.key === previousTrustedKey);
    const next = registry.find(entry => entry.key === trustedKey);
    if (!previous || !next) throw new Error("Both widget revisions must be operator-approved.");
    return this.execute("update_trusted_widget_revision", documentIdOrUrl, 1, async id => {
      await this.inner.assertDocumentOwner(id);
      const read = async () => {
        const snapshot = await this.loadDocumentUi(id);
        assertCompleteUiSnapshot(snapshot);
        const widget = snapshot.pages.find(page => page.id === pageId)
          ?.widgets.find(candidate => candidate.id === widgetId);
        if (!widget) throw new Error("Native widget is absent from its intended page.");
        return widget;
      };
      const before = await read();
      const plan = planTrustedWidgetRevisionUpdate(before, previous, next);
      const result = {documentId:id,pageId,widgetId,previousTrustedKey,trustedKey};
      if (!plan.changed) return {...result,changed:false,persistedWidgetVerified:true};
      if (!sameJsonValue((await read()).options,before.options)) {
        throw new Error("Native widget changed before revision update; reconcile first.");
      }
      try {
        await this.uiActions.updatePageWidget(id,widgetId,{optionsJson:plan.optionsJson});
        const after = await read();
        if (!sameJsonValue(after.options,plan.options) ||
            after.customWidgetSettingsNormalizationIncomplete ||
            after.customWidgetSettings?.widgetId !== next.widgetId ||
            after.customWidgetSettings?.access !== "none") {
          throw new Error("Trusted widget revision postconditions not verified.");
        }
        return {...result,changed:true,persistedWidgetVerified:true,
          remoteCodeExecutionQualified:false,widget:projectPublicWidget(after)};
      } catch(error) {
        throw new UiWriteVerificationError("update_trusted_widget_revision",
          "Native widget revision effect uncertain; inspect before retry: " +
          (error instanceof Error ? error.message : "unknown result"));
      }
    });
  }

  async updatePageWidget(
    documentIdOrUrl: string,
    pageId: number,
    widgetId: number,
    update: PageWidgetUpdateInput
  ): Promise<unknown> {
    if (!Number.isInteger(pageId) || pageId < 1) {
      throw new Error("Grist page ID must be a positive integer.");
    }
    if (!Number.isInteger(widgetId) || widgetId < 1) {
      throw new Error("Grist widget ID must be a positive integer.");
    }
    if (
      update.title === undefined &&
      update.description === undefined &&
      update.chartType === undefined &&
      update.sort === undefined &&
      update.selectBy === undefined &&
      update.customWidgetSettings === undefined &&
      update.calendarConfig === undefined &&
      update.gridOptions === undefined &&
      update.visibleFields === undefined &&
      update.cardLayout === undefined &&
      update.filters === undefined
    ) {
      throw new Error("At least one widget UI field must be updated.");
    }
    if (update.visibleFields !== undefined && update.cardLayout !== undefined) {
      throw new Error(
        "visibleFields and cardLayout are separate bounded intentions; update visible fields first, then set the card layout."
      );
    }
    const grantsWidgetData = update.customWidgetSettings?.access !== undefined &&
      update.customWidgetSettings.access !== "none";
    if (grantsWidgetData && update.customWidgetSettings?.confirmDataAccess !== true) {
      throw new Error("Granting custom widget data access requires confirmDataAccess:true.");
    }

    return this.execute("update_page_widget", documentIdOrUrl, 1, async (id) => {
      const usesColumnSelectBy =
        update.selectBy !== undefined &&
        update.selectBy !== null &&
        (update.selectBy.sourceColumnId !== undefined ||
          update.selectBy.targetColumnId !== undefined);
      const tableResponse = await this.inner.listTables(id, {
        expandColumns:
          usesColumnSelectBy ||
          update.sort !== undefined ||
          update.customWidgetSettings !== undefined ||
          update.calendarConfig !== undefined ||
          update.visibleFields !== undefined ||
          update.cardLayout !== undefined ||
          update.filters !== undefined
      });
      const before = await this.loadDocumentUi(
        id,
        tableResponse,
        update.visibleFields !== undefined || update.cardLayout !== undefined,
        update.filters !== undefined
      );
      assertCompleteUiSnapshot(before);
      const page = before.pages.find((candidate) => candidate.id === pageId);
      if (!page) {
        throw new Error(`Grist page ${pageId} does not exist in document "${id}".`);
      }
      const target = page.widgets.find((candidate) => candidate.id === widgetId);
      if (!target) {
        throw new Error(`Grist widget ${widgetId} does not exist on page ${pageId}.`);
      }
      if (grantsWidgetData) {
        // Native Owner authority is mandatory even for an already granted level.
        await this.inner.assertDocumentOwner(id);
      }
      if (update.chartType !== undefined && target.type !== "chart") {
        throw new Error(`Grist widget ${widgetId} is not a chart widget.`);
      }
      if (update.calendarConfig !== undefined && target.type !== "calendar") {
        throw new Error(`Grist widget ${widgetId} is not a calendar widget.`);
      }
      if (
        update.cardLayout !== undefined &&
        target.type !== "single" &&
        target.type !== "detail"
      ) {
        throw new Error(
          `Grist widget ${widgetId} is not a Card or Card List widget.`
        );
      }
      if (
        update.cardLayout !== undefined &&
        target.cardLayoutNormalizationIncomplete
      ) {
        throw new Error(
          `Grist widget ${widgetId} has incomplete or unsupported current card-layout metadata; refusing to overwrite it.`
        );
      }

      const adapterUpdate: Parameters<GristUiActionsAdapter["updatePageWidget"]>[2] = {};
      const expectedTitle = update.title !== undefined ? update.title.trim() : undefined;
      if (expectedTitle !== undefined) {
        adapterUpdate.title = expectedTitle;
      }
      const expectedDescription =
        update.description !== undefined ? update.description.trim() : undefined;
      if (expectedDescription !== undefined) {
        adapterUpdate.description = expectedDescription;
      }
      const expectedChartType = update.chartType;
      if (expectedChartType !== undefined) {
        adapterUpdate.chartType = expectedChartType;
      }
      const expectedSortColRefs =
        update.sort !== undefined
          ? resolveWidgetSort(target, tableResponse, update.sort)
          : undefined;
      if (expectedSortColRefs !== undefined) {
        adapterUpdate.sortColRefs = expectedSortColRefs;
      }

      const expectedCalendarConfig =
        update.calendarConfig !== undefined
          ? resolveCalendarConfigUpdate(
              target,
              tableResponse,
              update.calendarConfig
            )
          : undefined;
      let expectedOptions =
        update.customWidgetSettings !== undefined
          ? resolveCustomWidgetSettingsUpdate(
              target,
              tableResponse,
              update.customWidgetSettings
            )
          : expectedCalendarConfig;
      if (update.gridOptions !== undefined) {
        expectedOptions = resolveGridOptionsUpdate(
          expectedOptions !== undefined
            ? { ...target, options: expectedOptions.options }
            : target,
          update.gridOptions
        );
      }
      if (expectedOptions !== undefined) {
        adapterUpdate.optionsJson = expectedOptions.optionsJson;
      }

      const expectedVisibleFields =
        update.visibleFields !== undefined
          ? resolveWidgetFieldsUpdate(
              target,
              tableResponse,
              before[SECTION_FIELDS_METADATA],
              update.visibleFields
            )
          : undefined;
      if (expectedVisibleFields !== undefined) {
        adapterUpdate.visibleFields = expectedVisibleFields;
      }
      const expectedCardLayout =
        update.cardLayout !== undefined
          ? resolveCardLayoutUpdate(
              target,
              tableResponse,
              before[SECTION_FIELDS_METADATA],
              update.cardLayout
            )
          : undefined;
      if (expectedCardLayout !== undefined) {
        adapterUpdate.cardLayoutJson = expectedCardLayout.layoutSpecJson;
      }
      const expectedFilters =
        update.filters !== undefined
          ? resolveWidgetFiltersUpdate(
              target,
              tableResponse,
              before[FILTERS_METADATA],
              update.filters
            )
          : undefined;
      if (expectedFilters !== undefined) {
        adapterUpdate.filters = expectedFilters;
      }

      let expectedSourceWidgetId: number | null | undefined;
      let expectedSourceColumnRef: number | undefined;
      let expectedTargetColumnRef: number | undefined;
      if (update.selectBy !== undefined) {
        if (update.selectBy === null) {
          adapterUpdate.selectBy = null;
          expectedSourceWidgetId = null;
        } else {
          const sourceWidgetId = update.selectBy.sourceWidgetId;
          if (!Number.isInteger(sourceWidgetId) || sourceWidgetId < 1) {
            throw new Error("Select-by source widget ID must be a positive integer.");
          }
          if (sourceWidgetId === widgetId) {
            throw new Error("A Grist widget cannot select itself.");
          }
          const source = page.widgets.find((candidate) => candidate.id === sourceWidgetId);
          if (!source) {
            throw new Error(`Select-by source widget ${sourceWidgetId} does not exist on page ${pageId}.`);
          }

          if (usesColumnSelectBy) {
            const resolved = resolveColumnSelectByAllowed(
              before,
              tableResponse,
              source,
              target,
              update.selectBy
            );
            adapterUpdate.selectBy = resolved;
            expectedSourceColumnRef = resolved.sourceColumnRef;
            expectedTargetColumnRef = resolved.targetColumnRef;
          } else {
            assertDirectSelectByAllowed(before, source, target);
            adapterUpdate.selectBy = { sourceSectionId: sourceWidgetId };
          }
          expectedSourceWidgetId = sourceWidgetId;
        }
      }

      await this.uiActions.updatePageWidget(id, widgetId, adapterUpdate);
      try {
        const afterTableResponse =
          update.customWidgetSettings !== undefined ||
          update.calendarConfig !== undefined ||
          update.visibleFields !== undefined ||
          update.cardLayout !== undefined ||
          update.filters !== undefined
            ? await this.inner.listTables(id, { expandColumns: true })
            : undefined;
        const after = await this.loadDocumentUi(
          id,
          afterTableResponse,
          update.visibleFields !== undefined || update.cardLayout !== undefined,
          update.filters !== undefined
        );
        assertCompleteUiSnapshot(after);
        const updatedPage = after.pages.find((candidate) => candidate.id === pageId);
        const widget = updatedPage?.widgets.find((candidate) => candidate.id === widgetId);
        if (!widget) {
          throw new Error(`Updated widget ${widgetId} was not found on re-read.`);
        }
        if (expectedTitle !== undefined && widget.title !== expectedTitle) {
          throw new Error(`Updated widget ${widgetId} did not match the requested title on re-read.`);
        }
        if (
          expectedDescription !== undefined &&
          (expectedDescription === ""
            ? widget.description !== undefined
            : widget.description !== expectedDescription)
        ) {
          throw new Error(`Updated widget ${widgetId} did not match the requested description on re-read.`);
        }
        if (
          expectedChartType !== undefined &&
          widget.chartType !== expectedChartType
        ) {
          throw new Error(`Updated widget ${widgetId} did not match the requested chart type on re-read.`);
        }
        if (
          expectedSortColRefs !== undefined &&
          !sameSortSpec(widget.sortColRefs, expectedSortColRefs)
        ) {
          throw new Error(`Updated widget ${widgetId} did not match the requested saved sort on re-read.`);
        }
        if (
          expectedOptions !== undefined &&
          !sameJsonValue(widget.options, expectedOptions.options)
        ) {
          throw new Error(
            `Updated widget ${widgetId} did not preserve the exact expected options on re-read.`
          );
        }
        if (
          expectedCalendarConfig !== undefined &&
          (widget.calendarConfigNormalizationIncomplete ||
            !sameCalendarConfig(
              widget.calendarConfig,
              expectedCalendarConfig.calendarConfig
            ))
        ) {
          throw new Error(
            `Updated widget ${widgetId} did not match the requested calendar configuration on re-read.`
          );
        }
        if (
          expectedVisibleFields !== undefined &&
          (widget.visibleFieldsNormalizationIncomplete ||
            !sameJsonValue(widget.visibleFields, expectedVisibleFields.expected))
        ) {
          throw new Error(
            `Updated widget ${widgetId} did not match the requested visible fields on re-read.`
          );
        }
        if (
          expectedCardLayout !== undefined &&
          (widget.cardLayoutNormalizationIncomplete ||
            !sameJsonValue(widget.cardLayout, expectedCardLayout.expectedLayout))
        ) {
          throw new Error(
            `Updated widget ${widgetId} did not match the requested card layout on re-read.`
          );
        }
        if (
          expectedFilters !== undefined &&
          (widget.filtersNormalizationIncomplete ||
            !sameJsonValue(widget.filters, expectedFilters.expected))
        ) {
          throw new Error(
            `Updated widget ${widgetId} did not match the requested persistent filters on re-read.`
          );
        }
        if (expectedSourceWidgetId === null && widget.selectBy !== undefined) {
          throw new Error(`Updated widget ${widgetId} still had a select-by link after clearing it.`);
        }
        if (
          typeof expectedSourceWidgetId === "number" &&
          (widget.selectBy?.sourceSectionId !== expectedSourceWidgetId ||
            widget.selectBy.sourceColumnRef !== expectedSourceColumnRef ||
            widget.selectBy.targetColumnRef !== expectedTargetColumnRef)
        ) {
          throw new Error(`Updated widget ${widgetId} did not match the requested select-by link on re-read.`);
        }
        return { documentId: id, pageId, widget: projectPublicWidget(widget) };
      } catch (error) {
        throw new UiWriteVerificationError(
          "update_page_widget",
          error instanceof Error ? error.message : "Updated widget could not be verified."
        );
      }
    });
  }

  async listTables(
    documentIdOrUrl: string,
    options: { expandColumns?: boolean } = {}
  ): Promise<unknown> {
    return this.execute("list_tables", documentIdOrUrl, undefined, async (id) =>
      projectPublicTables(await this.inner.listTables(id, options))
    );
  }

  async listColumns(
    documentIdOrUrl: string,
    tableId: string,
    options: { hidden?: boolean } = {}
  ): Promise<unknown> {
    return this.execute("list_columns", documentIdOrUrl, undefined, async (id) => {
      assertPublicTableId(tableId);
      return projectPublicColumns(await this.inner.listColumns(id, tableId, options));
    });
  }

  async queryRecords(
    documentIdOrUrl: string,
    tableId: string,
    options: QueryRecordsOptions = {}
  ): Promise<unknown> {
    return this.execute("query_records", documentIdOrUrl, undefined, (id) => {
      assertPublicTableId(tableId);
      return this.inner.queryRecords(id, tableId, options);
    });
  }

  async createRecords(
    documentIdOrUrl: string,
    tableId: string,
    records: NewGristRecord[]
  ): Promise<unknown> {
    return this.execute("create_records", documentIdOrUrl, records.length, (id) => {
      assertPublicTableId(tableId);
      return this.inner.createRecords(id, tableId, records);
    });
  }

  async updateRecords(
    documentIdOrUrl: string,
    tableId: string,
    records: UpdateGristRecord[]
  ): Promise<unknown> {
    return this.execute("update_records", documentIdOrUrl, records.length, (id) => {
      assertPublicTableId(tableId);
      return this.inner.updateRecords(id, tableId, records);
    });
  }

  async deleteRecords(
    documentIdOrUrl: string,
    tableId: string,
    recordIds: number[]
  ): Promise<unknown> {
    return this.execute("delete_records", documentIdOrUrl, recordIds.length, (id) => {
      assertPublicTableId(tableId);
      return this.inner.deleteRecords(id, tableId, recordIds);
    });
  }

  async createDocument(
    workspaceId: number,
    name: string
  ): Promise<unknown> {
    const definition = getOperation("create_document");
    const capability = getRequiredCapability(definition.name);
    const requestId = this.audit.nextRequestId();
    const started = Date.now();
    let createdDocumentId: string | undefined;
    try {
      await this.authorization.assertWorkspaceAllowed(
        this.principal,
        workspaceId,
        capability
      );
      createdDocumentId = await this.inner.createDocument(workspaceId, name);
      await this.verifyCreatedDocumentWorkspace(
        createdDocumentId,
        workspaceId,
        capability
      );
      this.audit.record({
        requestId,
        principal: this.principal.id,
        transport: this.principal.transport,
        operation: definition.name,
        capability,
        documentId: createdDocumentId,
        itemCount: 1,
        status: "success",
        durationMs: Date.now() - started
      });
      return {
        documentId: createdDocumentId,
        workspaceId,
        created: true,
        bootstrap: "empty",
        destinationMembershipVerified: true,
        creatorOwnershipIsNativeGristBehavior: true
      };
    } catch (error) {
      this.auditFailure(
        requestId,
        started,
        definition.name,
        capability,
        createdDocumentId,
        error,
        1
      );
      throw error;
    }
  }

  async copyDocument(
    sourceDocumentIdOrUrl: string,
    workspaceId: number,
    name: string
  ): Promise<unknown> {
    return this.copyDocumentToWorkspace(sourceDocumentIdOrUrl, workspaceId, name, false);
  }

  async copyDocumentAsTemplate(
    sourceDocumentIdOrUrl: string,
    workspaceId: number,
    name: string
  ): Promise<unknown> {
    return this.copyDocumentToWorkspace(sourceDocumentIdOrUrl, workspaceId, name, true);
  }

  private async copyDocumentToWorkspace(
    sourceDocumentIdOrUrl: string,
    workspaceId: number,
    name: string,
    asTemplate: boolean
  ): Promise<unknown> {
    const definition = getOperation(asTemplate ? "copy_document_as_template" : "copy_document");
    const capability = getRequiredCapability(definition.name);
    const requestId = this.audit.nextRequestId();
    const started = Date.now();
    let sourceDocumentId = sourceDocumentIdOrUrl;
    let createdDocumentId: string | undefined;
    try {
      await this.authorization.assertWorkspaceAllowed(
        this.principal,
        workspaceId,
        capability
      );
      sourceDocumentId = await this.authorization.assertDocumentAllowed(
        this.principal,
        sourceDocumentIdOrUrl,
        asTemplate ? "doc:read" : "doc:download"
      );
      if (!asTemplate) await this.inner.assertDocumentOwner(sourceDocumentId);
      createdDocumentId = asTemplate
        ? await this.inner.copyDocumentAsTemplate(sourceDocumentId, workspaceId, name)
        : await this.inner.copyDocument(sourceDocumentId, workspaceId, name);
      await this.verifyCreatedDocumentWorkspace(
        createdDocumentId,
        workspaceId,
        capability
      );
      this.audit.record({
        requestId,
        principal: this.principal.id,
        transport: this.principal.transport,
        operation: definition.name,
        capability,
        documentId: createdDocumentId,
        itemCount: 1,
        status: "success",
        durationMs: Date.now() - started
      });
      return {
        documentId: createdDocumentId,
        sourceDocumentId,
        workspaceId,
        created: true,
        bootstrap: asTemplate ? "template_copy" : "full_copy",
        asTemplate,
        destinationMembershipVerified: true,
        creatorOwnershipIsNativeGristBehavior: true,
        nativeCopyAuthorizationVerifiedByGrist: true,
        ...(!asTemplate ? { sourceOwnershipVerified: true } : {})
      };
    } catch (error) {
      this.auditFailure(
        requestId,
        started,
        definition.name,
        capability,
        createdDocumentId,
        error,
        1
      );
      throw error;
    }
  }

  async createTables(
    documentIdOrUrl: string,
    tables: GristTableSpec[]
  ): Promise<unknown> {
    const itemCount = tables.reduce(
      (count, table) => count + 1 + (table.columns?.length ?? 0),
      0
    );
    return this.execute("create_tables", documentIdOrUrl, itemCount, (id) => {
      for (const table of tables) {
        assertPublicTableId(table.id);
      }
      return this.inner.createTables(id, tables);
    });
  }

  async ensureOwnerSchemaGuard(documentIdOrUrl: string, confirmed: true): Promise<unknown> {
    if (confirmed !== true) throw new Error("Explicit Owner-only schema guard confirmation required.");
    return this.execute("ensure_owner_schema_guard", documentIdOrUrl, 1, async id => {
      await this.inner.assertDocumentOwner(id);
      const before = await this.loadAccessRulesSnapshot(id);
      const plan = planOwnerSchemaGuard(before);
      const base = { documentId: id, policy: "owner_only_schema" };
      if (plan.mode === "noop") {
        return { ...base, ...verifyOwnerSchemaGuard(before, before, plan) };
      }
      await this.uiActions.ensureOwnerSchemaGuard(id, plan);
      try {
        const after = await this.loadAccessRulesSnapshot(id);
        return { ...base, ...verifyOwnerSchemaGuard(before, after, plan) };
      } catch (error) {
        throw new AccessRuleWriteVerificationError(error instanceof Error
          ? error.message : "Native schema guard could not be verified.");
      }
    });
  }

  async grantDocumentUser(
    documentIdOrUrl: string,
    email: string,
    role: "viewers" | "editors"
  ): Promise<unknown> {
    assertIndividualGrantEmail(email);
    if (role !== "viewers" && role !== "editors") {
      throw new Error("Only individual viewer/editor grants are supported.");
    }
    return this.execute("grant_document_user", documentIdOrUrl, 1, async (id) => {
      await this.inner.assertDocumentOwner(id);
      const before = documentGrantSnapshot(await this.inner.listDocumentAccess(id));
      const target = before.users.find(user => user.email === email);
      // Grist's native share delta creates a home-db account for an unknown email.
      // A native Owner-visible org member with a stable user ID is the bounded
      // proof of an existing principal; never attempt an arbitrary invitation.
      if (!target) {
        throw new Error("Recipient is not an existing Owner-visible Grist document/org user; refusing account creation.");
      }
      if (target.access === role) {
        if (target.parentAccess !== null && target.parentAccess !== undefined) {
          throw new Error("Existing inherited document access is protected.");
        }
        return { documentId: id, role, changed: false, persistedGrantVerified: true,
          effectiveAclVerified: false };
      }
      if (target.access !== null || target.isMember !== true ||
          target.parentAccess !== null && target.parentAccess !== undefined) {
        throw new Error("Recipient must be a known org member without direct or inherited document access.");
      }
      // This documented native Grist user ID already exists, so no new Grist
      // account is created by the one-address document-scoped access delta.
      await this.inner.grantDocumentUser(id, email, role);
      try {
        const after = documentGrantSnapshot(await this.inner.listDocumentAccess(id));
        const granted = after.users.filter(user => user.email === email);
        const unrelated = (users: readonly DocumentGrantUser[]) =>
          users.filter(user => user.email !== email)
            .map(user => JSON.stringify(user)).sort();
        if (granted.length !== 1 || granted[0]?.access !== role ||
            granted[0]?.id !== target.id || granted[0]?.isMember !== true ||
            granted[0]?.parentAccess !== target.parentAccess ||
            before.maxInheritedRole !== after.maxInheritedRole ||
            JSON.stringify(unrelated(before.users)) !== JSON.stringify(unrelated(after.users))) {
          throw new Error("Grist document grant or unrelated grants changed unexpectedly.");
        }
        return { documentId: id, role, changed: true,
          persistedGrantVerified: true, effectiveAclVerified: false };
      } catch {
        throw new DocumentGrantVerificationError(
          "Document sharing was acknowledged but its native persisted grant could not be verified."
        );
      }
    });
  }

  /** Change only one confirmed, existing direct document role: never invite an unknown identity. */
  async changeDocumentUserRole(
    documentIdOrUrl: string, email: string,
    expectedRole: "viewers" | "editors", role: "viewers" | "editors",
    confirmRoleChange: true
  ): Promise<unknown> {
    assertIndividualGrantEmail(email);
    if (!(["viewers", "editors"] as const).includes(expectedRole) ||
        !(["viewers", "editors"] as const).includes(role) || expectedRole === role) {
      throw new Error("Role change requires distinct, exact viewer/editor prior and target roles.");
    }
    if (confirmRoleChange !== true) {
      throw new Error("Role change requires explicit confirmation.");
    }
    return this.execute("change_document_user_role", documentIdOrUrl, 1, async id => {
      await this.inner.assertDocumentOwner(id);
      const before = documentGrantSnapshot(await this.inner.listDocumentAccess(id));
      const target = before.users.find(user => user.email === email);
      if (!target || (target.parentAccess !== null && target.parentAccess !== undefined) ||
          (target.access !== "viewers" && target.access !== "editors")) {
        throw new Error("Target must have an existing direct, non-inherited viewer/editor role.");
      }
      if (target.access === role) {
        return {documentId: id, role, changed: false, persistedRoleVerified: true,
          effectiveAclVerified: false};
      }
      if (target.access !== expectedRole) {
        throw new Error("Target role differs from the expected previous direct role.");
      }
      try {
        // Existing known native user ID: one per-user delta, not a new invitation.
        await this.inner.grantDocumentUser(id, email, role);
        const after = documentGrantSnapshot(await this.inner.listDocumentAccess(id));
        const updated = after.users.find(user => user.email === email);
        const unrelated = (users: readonly DocumentGrantUser[]) => users
          .filter(user => user.email !== email).map(user => JSON.stringify(user)).sort();
        if (!updated || updated.id !== target.id || updated.access !== role ||
            updated.parentAccess !== target.parentAccess ||
            updated.isMember !== target.isMember ||
            before.maxInheritedRole !== after.maxInheritedRole ||
            !isDeepStrictEqual(unrelated(before.users), unrelated(after.users))) {
          throw new Error("Native Grist role change or unrelated access changed unexpectedly.");
        }
        return {documentId: id, role, changed: true, persistedRoleVerified: true,
          effectiveAclVerified: false};
      } catch (error) {
        throw new DocumentGrantVerificationError(
          "Native document role change may be partial or uncertain: " +
          (error instanceof Error ? error.message : "unknown result")
        );
      }
    });
  }

  async revokeDocumentUser(
    documentIdOrUrl: string, email: string,
    expectedRole: "viewers" | "editors", confirmRevocation: true
  ): Promise<unknown> {
    assertIndividualGrantEmail(email);
    if (expectedRole !== "viewers" && expectedRole !== "editors") {
      throw new Error("Revocation requires the exact prior direct viewer/editor role.");
    }
    if (confirmRevocation !== true) {
      throw new Error("Revocation requires explicit confirmation.");
    }
    return this.execute("revoke_document_user", documentIdOrUrl, 1, async id => {
      await this.inner.assertDocumentOwner(id);
      const before = documentGrantSnapshot(await this.inner.listDocumentAccess(id));
      const target = before.users.find(user => user.email === email);
      if (!target) {
        throw new Error("The target is not present in the native document access snapshot.");
      }
      if (target.parentAccess !== null && target.parentAccess !== undefined) {
        throw new Error("Inherited document access cannot be revoked by this action.");
      }
      if (target.access === null) {
        return { documentId: id, changed: false, persistedRevocationVerified: true,
          effectiveAclVerified: false };
      }
      if (target.access !== expectedRole) {
        throw new Error("Target direct access differs from the explicitly expected viewer/editor role.");
      }
      try {
        // Native Grist PermissionDelta maps an email to null to remove direct
        // access, never to delete a user or manipulate workspace membership.
        await this.inner.revokeDocumentUser(id, email);
        const after = documentGrantSnapshot(await this.inner.listDocumentAccess(id));
        const updated = after.users.find(user => user.email === email);
        const unrelated = (users: readonly DocumentGrantUser[]) =>
          users.filter(user => user.email !== email)
            .map(user => JSON.stringify(user)).sort();
        if ((updated && (updated.id !== target.id || updated.access !== null ||
              updated.parentAccess !== target.parentAccess)) ||
            before.maxInheritedRole !== after.maxInheritedRole ||
            !isDeepStrictEqual(unrelated(before.users), unrelated(after.users))) {
          throw new Error("Native Grist revocation or unrelated access changed unexpectedly.");
        }
        return { documentId: id, changed: true, persistedRevocationVerified: true,
          effectiveAclVerified: false };
      } catch (error) {
        throw new DocumentGrantVerificationError(
          "Native document revocation may be partial or uncertain: " +
          (error instanceof Error ? error.message : "unknown result")
        );
      }
    });
  }

  async changeAccessRuleGroup(
    documentIdOrUrl: string,
    target: AccessRuleTarget | AccessUserAttributeTarget,
    mode: "create" | "replace" | "delete",
    rules?: readonly AccessRuleInput[],
    definition?: AccessUserAttributeDefinitionInput
  ): Promise<unknown> {
    return this.execute("change_access_rule_group", documentIdOrUrl, 1, async (id) => {
      await this.inner.assertDocumentOwner(id);
      const before = await this.loadAccessRulesSnapshot(id);
      if ("userAttributeName" in target) {
        if (rules !== undefined) {
          throw new Error("User-attribute mutations do not accept access rules.");
        }
        const plan = resolveUserAttributeMutation(before, target, mode, definition);
        const base = { documentId: id, target, mode };
        if (plan.mode === "noop") {
          return { ...base, changed: false, persistedDefinitionVerified: true,
            effectiveEnforcementVerified: false };
        }
        await this.uiActions.mutateUserAttribute(id, plan);
        try {
          const after = await this.loadAccessRulesSnapshot(id);
          return { ...base, ...verifyUserAttributeMutation(before, after, plan) };
        } catch (error) {
          throw new AccessRuleWriteVerificationError(error instanceof Error
            ? error.message : "Native user-attribute write could not be verified.");
        }
      }
      if (definition !== undefined) {
        throw new Error("Ordinary access-rule group mutations do not accept a user-attribute definition.");
      }
      const plan = resolveAccessRuleMutation(before, target, mode, rules);

      if (plan.mode === "noop") {
        return {
          documentId: id,
          target:
            plan.target.columnIds.length === 0
              ? { tableId: plan.target.tableId }
              : { tableId: plan.target.tableId, columnIds: [...plan.target.columnIds] },
          mode,
          changed: false,
          ruleCount: plan.normalizedRules.length,
          persistedDefinitionVerified: true,
          effectiveEnforcementVerified: false
        };
      }

      await this.uiActions.mutateAccessRuleGroup(id, plan);
      try {
        const after = await this.loadAccessRulesSnapshot(id);
        const verification = verifyAccessRuleMutation(before, after, plan);
        return {
          documentId: id,
          target:
            plan.target.columnIds.length === 0
              ? { tableId: plan.target.tableId }
              : { tableId: plan.target.tableId, columnIds: [...plan.target.columnIds] },
          mode,
          ...verification
        };
      } catch (error) {
        throw new AccessRuleWriteVerificationError(
          error instanceof Error
            ? error.message
            : "Updated access-rule state could not be verified."
        );
      }
    });
  }

  async updateDocument(
    documentIdOrUrl: string,
    update: DocumentMetadataUpdateInput
  ): Promise<unknown> {
    return this.execute("update_document", documentIdOrUrl, 1, (id) =>
      this.inner.updateDocument(id, update)
    );
  }

  async updateTables(
    documentIdOrUrl: string,
    tables: GristTableUpdate[]
  ): Promise<unknown> {
    return this.execute("update_tables", documentIdOrUrl, tables.length, (id) => {
      assertPublicTableUpdates(tables);
      return this.inner.updateTables(id, tables);
    });
  }

  async deleteTable(documentIdOrUrl: string, tableId: string): Promise<unknown> {
    return this.execute("delete_table", documentIdOrUrl, 1, (id) => {
      assertPublicTableId(tableId);
      return this.inner.deleteTable(id, tableId);
    });
  }

  async createColumns(
    documentIdOrUrl: string,
    tableId: string,
    columns: GristColumnSpec[]
  ): Promise<unknown> {
    return this.execute("create_columns", documentIdOrUrl, columns.length, (id) => {
      assertPublicTableId(tableId);
      return this.inner.createColumns(id, tableId, columns);
    });
  }

  async updateColumns(
    documentIdOrUrl: string,
    tableId: string,
    columns: GristColumnUpdate[]
  ): Promise<unknown> {
    return this.execute("update_columns", documentIdOrUrl, columns.length, (id) => {
      assertPublicTableId(tableId);
      return this.inner.updateColumns(id, tableId, columns);
    });
  }

  async updateFormColumnOptions(
    documentIdOrUrl: string, tableId: string, columnId: string,
    update: FormColumnOptionsUpdateInput
  ): Promise<unknown> {
    return this.execute("update_form_column_options", documentIdOrUrl, 1, async (id) => {
      assertPublicTableId(tableId);
      if (!columnId.trim()) throw new Error("Form option update requires a stable column ID.");
      const read = async () => readFormColumnOptions(
        await this.inner.listColumns(id, tableId, { hidden: true }), columnId,
        this.inner.maxReadRecords > 0 ? this.inner.maxReadRecords : 5000
      );
      const before = await read();
      const plan = applyFormColumnOptions(before, update);
      const base = { documentId: id, tableId, columnId };
      if (!plan.changed) return { ...base, changed: false,
        persistedOptionsVerified: true, nativeFormRenderingQualified: false };
      await this.inner.updateColumns(id, tableId, [{
        id: columnId, fields: { widgetOptions: plan.widgetOptions }
      }]);
      try {
        if (!isDeepStrictEqual(await read(), plan.options)) {
          throw new Error("Native Form options differ from requested preserved state.");
        }
      } catch (error) {
        throw new SchemaWriteVerificationError("update_form_column_options",
          error instanceof Error ? error.message : "Form option post-read failed.");
      }
      return { ...base, changed: true,
        persistedOptionsVerified: true, nativeFormRenderingQualified: false };
    });
  }


  async updateDropdownCondition(
    documentIdOrUrl: string, tableId: string, columnId: string,
    condition: DropdownConditionInput | null
  ): Promise<unknown> {
    return this.execute("update_dropdown_condition", documentIdOrUrl, 1, async (id) => {
      assertPublicTableId(tableId);
      if (!columnId.trim()) throw new Error("Dropdown update requires a stable column ID.");
      const read = async () => {
        const [tables, columns] = await Promise.all([
          this.inner.listTables(id, { expandColumns: true }),
          this.inner.listColumns(id, tableId, { hidden: true })
        ]);
        return {
          options: readFormColumnOptions(columns, columnId,
            this.inner.maxReadRecords > 0 ? this.inner.maxReadRecords : 5000),
          condition: resolveExistingDropdownCondition(tables, tableId, columnId, condition)
        };
      };
      const before = await read();
      const plan = planDropdownConditionUpdate(before.options, before.condition);
      const base = { documentId: id, tableId, columnId };
      if (!plan.changed) return { ...base, changed: false,
        persistedOptionsVerified: true, nativeDropdownRenderingQualified: false };
      await this.inner.updateColumns(id, tableId, [{
        id: columnId, fields: { widgetOptions: plan.widgetOptions }
      }]);
      try {
        const after = await read();
        if (!isDeepStrictEqual(after.options, plan.options) ||
            !isDeepStrictEqual(after.condition, before.condition)) {
          throw new Error("Native dropdown options or reference schema differ from requested state.");
        }
      } catch (error) {
        throw new SchemaWriteVerificationError("update_dropdown_condition",
          error instanceof Error ? error.message : "Dropdown post-read failed.");
      }
      return { ...base, changed: true,
        persistedOptionsVerified: true, nativeDropdownRenderingQualified: false };
    });
  }

  async changeColumnStyleRule(
    documentIdOrUrl: string, tableId: string, columnId: string, input: ColumnStyleInput
  ): Promise<unknown> {
    return this.execute("style_rules", documentIdOrUrl, 1, async id => {
      assertPublicTableId(tableId);
      const limit = this.inner.maxReadRecords > 0 ? this.inner.maxReadRecords : 5000;
      const readSequence = async () => {
        const [tables, columns] = await Promise.all([
          this.inner.queryRecords(id, "_grist_Tables", { hidden: true, limit }),
          this.inner.queryRecords(id, "_grist_Tables_column", { hidden: true, limit })
        ]);
        return readNativeColumnStyleSequence(tables, columns, tableId, columnId, limit);
      };
      const before = await readSequence();
      // A multi-rule owner may change colors only for an existing unique formula.
      // Formula, native helper IDs, order and all unrelated column options are retained.
      if (before.rules.length > 1) {
        const plan = planExistingColumnStyleUpdate(
          before, input.conditionFormula, input.style
        );
        const base = { documentId: id, tableId, columnId };
        if (!plan.changed) return {
          ...base, changed: false, persistedStyleVerified: true
        };
        const latest = await readSequence();
        if (!isDeepStrictEqual(latest, before)) {
          throw new Error("Native conditional style state changed before update; reconcile first.");
        }
        try {
          await this.uiActions.updateColumnStyleOptions(
            id, before.ownerRef, plan.widgetOptions!
          );
          const after = await readSequence();
          const identity = (snapshot: typeof before) =>
            snapshot.rules.map(rule => ({ helperRef: rule.helperRef, formula: rule.formula }));
          if (after.ownerRef !== before.ownerRef ||
              !isDeepStrictEqual(identity(after), identity(before)) ||
              !isDeepStrictEqual(after.options, plan.options)) {
            throw new Error("Native conditional rule update did not preserve other rules.");
          }
          return { ...base, changed: true, persistedStyleVerified: true,
            styleRuleCount: after.rules.length };
        } catch (error) {
          throw new SchemaWriteVerificationError("style_rules",
            "Native multi-rule style update may be uncertain; inspect before retry: " +
            (error instanceof Error ? error.message : "unknown result"));
        }
      }
      const single = (snapshot: typeof before) => {
        if (snapshot.rules.length > 1) {
          throw new Error("Concurrent native multi-rule style change; reconcile first.");
        }
        const rule = snapshot.rules[0];
        return {
          ownerRef: snapshot.ownerRef,
          ...(rule ? { helperRef: rule.helperRef, formula: rule.formula } : {}),
          options: snapshot.options,
          existingStyle: rule?.style ?? {}
        };
      };
      const read = async () => single(await readSequence());
      const initial = single(before);
      const planned = planColumnStyle(initial, input);
      const base = { documentId: id, tableId, columnId };
      if (!planned.changed) return {
        ...base, changed: false, persistedStyleVerified: true
      };
      let state = initial;
      // Native AddEmptyRule creates and links a real conditional formula helper.
      // Re-read before the second action. A lost response is never replayed.
      if (state.helperRef === undefined) {
        try {
          const addedRef = await this.uiActions.addColumnStyleRule(id, tableId, state.ownerRef);
          state = await read();
          if (state.ownerRef !== initial.ownerRef || state.helperRef !== addedRef ||
              state.formula !== "") {
            throw new Error("Created native style helper is not uniquely linked.");
          }
        } catch (error) {
          throw new SchemaWriteVerificationError("style_rules",
            "Native rule creation may have occurred; inspect before retry: " +
            (error instanceof Error ? error.message : "unknown result"));
        }
      }
      if (state.helperRef === undefined) {
        throw new SchemaWriteVerificationError("style_rules", "Native helper unresolved.");
      }
      const next = planColumnStyle(state, input);
      try {
        await this.uiActions.writeColumnStyleRule(
          id, state.ownerRef, state.helperRef,
          input.conditionFormula, next.widgetOptions
        );
        const after = await read();
        if (after.ownerRef !== state.ownerRef || after.helperRef !== state.helperRef ||
            after.formula !== input.conditionFormula ||
            !isDeepStrictEqual(after.options, next.options)) {
          throw new Error("Conditional style formula, linkage or options not persisted.");
        }
      } catch (error) {
        throw new SchemaWriteVerificationError("style_rules",
          "Conditional style effect uncertain; inspect before replay: " +
          (error instanceof Error ? error.message : "unknown result"));
      }
      return { ...base, changed: true, persistedStyleVerified: true };
    });
  }

  async replaceColumnStyleFormula(
    documentIdOrUrl: string, tableId: string, columnId: string,
    previousFormula: string, conditionFormula: string
  ): Promise<unknown> {
    return this.execute("replace_style_formula", documentIdOrUrl, 1, async id => {
      assertPublicTableId(tableId);
      const limit = this.inner.maxReadRecords > 0 ? this.inner.maxReadRecords : 5000;
      const read = async () => {
        const [tables, columns] = await Promise.all([
          this.inner.queryRecords(id, "_grist_Tables", { hidden: true, limit }),
          this.inner.queryRecords(id, "_grist_Tables_column", { hidden: true, limit })
        ]);
        return readNativeColumnStyleSequence(tables, columns, tableId, columnId, limit);
      };
      const before = await read();
      const plan = planExistingStyleFormulaReplacement(
        before, previousFormula, conditionFormula
      );
      const base = { documentId: id, tableId, columnId };
      if (!plan.changed) {
        return { ...base, changed: false, persistedStyleVerified: true };
      }
      const latest = await read();
      if (!isDeepStrictEqual(latest, before)) {
        throw new Error("Native style state changed before formula write; reconcile first.");
      }
      try {
        // One native helper-only write, rather than an owner widgetOptions read/merge/write.
        await this.uiActions.updateColumnStyleFormula(id, plan.helperRef, conditionFormula);
        const after = await read();
        if (after.ownerRef !== before.ownerRef ||
            !isDeepStrictEqual(after.options, before.options) ||
            !isDeepStrictEqual(after.rules, plan.rules)) {
          throw new Error("Native style formula or preserved rules did not match postconditions.");
        }
        return { ...base, changed: true, persistedStyleVerified: true,
          styleRuleCount: after.rules.length };
      } catch (error) {
        throw new SchemaWriteVerificationError("replace_style_formula",
          "Conditional formula effect may be uncertain; inspect before retry: " +
          (error instanceof Error ? error.message : "unknown result"));
      }
    });
  }

  async appendColumnStyleRule(
    documentIdOrUrl: string, tableId: string, columnId: string, input: ColumnStyleInput
  ): Promise<unknown> {
    return this.execute("append_style_rule", documentIdOrUrl, 1, async id => {
      assertPublicTableId(tableId);
      const limit = this.inner.maxReadRecords > 0 ? this.inner.maxReadRecords : 5000;
      const read = async () => {
        const [tables, columns] = await Promise.all([
          this.inner.queryRecords(id, "_grist_Tables", { hidden: true, limit }),
          this.inner.queryRecords(id, "_grist_Tables_column", { hidden: true, limit })
        ]);
        return readNativeColumnStyleSequence(tables, columns, tableId, columnId, limit);
      };
      const before = await read();
      const plan = planAppendColumnStyleRule(before, input);
      const base = { documentId: id, tableId, columnId };
      if (!plan.changed) return { ...base, changed: false, persistedStyleVerified: true };
      const expectedOptions = plan.options!;
      const nativeOptions = plan.widgetOptions!;
      const unchangedRules = (after: typeof before) =>
        after.ownerRef === before.ownerRef &&
        isDeepStrictEqual(after.rules.slice(0, before.rules.length), before.rules);
      const nonRuleOptions = (options: Record<string, unknown>) => {
        const { rulesOptions: _rules, ...others } = options;
        return others;
      };
      try {
        const newHelperRef = await this.uiActions.addColumnStyleRule(id, tableId, before.ownerRef);
        const staged = await read();
        if (!unchangedRules(staged) ||
            staged.rules.length !== before.rules.length + 1 ||
            staged.rules.at(-1)?.helperRef !== newHelperRef ||
            staged.rules.at(-1)?.formula !== "" ||
            !isDeepStrictEqual(nonRuleOptions(staged.options), nonRuleOptions(before.options))) {
          throw new Error("Added native conditional helper did not preserve the original rules.");
        }
        await this.uiActions.writeColumnStyleRule(
          id, before.ownerRef, newHelperRef, input.conditionFormula, nativeOptions
        );
        const after = await read();
        if (!unchangedRules(after) ||
            after.rules.length !== before.rules.length + 1 ||
            after.rules.at(-1)?.helperRef !== newHelperRef ||
            after.rules.at(-1)?.formula !== input.conditionFormula ||
            !isDeepStrictEqual(after.rules.at(-1)?.style,
              (expectedOptions.rulesOptions as Record<string, unknown>[]).at(-1)) ||
            !isDeepStrictEqual(after.options, expectedOptions)) {
          throw new Error("Appended native conditional style or preserved state was not verified.");
        }
        return {
          ...base, changed: true, persistedStyleVerified: true,
          styleRuleCount: after.rules.length
        };
      } catch (error) {
        throw new SchemaWriteVerificationError("append_style_rule",
          "Native style append effect may be partial or uncertain; inspect before retry: " +
          (error instanceof Error ? error.message : "unknown result"));
      }
    });
  }

  /** Add one native raw-row conditional style, preserving column and visible-section styles. */
  async appendRowStyleRule(
    documentIdOrUrl: string, tableId: string, input: ColumnStyleInput
  ): Promise<unknown> {
    return this.execute("append_row_style_rule", documentIdOrUrl, 1, async id => {
      assertPublicTableId(tableId);
      const limit = this.inner.maxReadRecords > 0 ? this.inner.maxReadRecords : 5000;
      const read = async () => {
        const [tables, sections, columns] = await Promise.all([
          this.inner.queryRecords(id, "_grist_Tables", { hidden: true, limit }),
          this.inner.queryRecords(id, "_grist_Views_section", { hidden: true, limit }),
          this.inner.queryRecords(id, "_grist_Tables_column", { hidden: true, limit })
        ]);
        return readNativeRowStyleSequence(tables, sections, columns, tableId, limit);
      };
      const before = await read();
      const plan = planAppendColumnStyleRule(before, input);
      const base = { documentId: id, tableId };
      if (!plan.changed) return { ...base, changed: false, persistedStyleVerified: true };
      const expectedOptions = plan.options!;
      const nativeOptions = plan.widgetOptions!;
      const unchangedRules = (after: typeof before) =>
        after.ownerRef === before.ownerRef &&
        isDeepStrictEqual(after.rules.slice(0, before.rules.length), before.rules);
      const nonRuleOptions = (options: Record<string, unknown>) => {
        const { rulesOptions: _rules, ...others } = options;
        return others;
      };
      try {
        const newHelperRef = await this.uiActions.addRowStyleRule(id, tableId);
        const staged = await read();
        if (!unchangedRules(staged) ||
            staged.rules.length !== before.rules.length + 1 ||
            staged.rules.at(-1)?.helperRef !== newHelperRef ||
            staged.rules.at(-1)?.formula !== "" ||
            !isDeepStrictEqual(nonRuleOptions(staged.options), nonRuleOptions(before.options))) {
          throw new Error("Added native conditional helper did not preserve the original rules.");
        }
        await this.uiActions.writeRowStyleRule(
          id, before.ownerRef, newHelperRef, input.conditionFormula, nativeOptions
        );
        const after = await read();
        if (!unchangedRules(after) ||
            after.rules.length !== before.rules.length + 1 ||
            after.rules.at(-1)?.helperRef !== newHelperRef ||
            after.rules.at(-1)?.formula !== input.conditionFormula ||
            !isDeepStrictEqual(after.rules.at(-1)?.style,
              (expectedOptions.rulesOptions as Record<string, unknown>[]).at(-1)) ||
            !isDeepStrictEqual(after.options, expectedOptions)) {
          throw new Error("Appended native conditional style or preserved state was not verified.");
        }
        return {
          ...base, changed: true, persistedStyleVerified: true,
          styleRuleCount: after.rules.length
        };
      } catch (error) {
        throw new SchemaWriteVerificationError("append_row_style_rule",
          "Native row-style append effect may be partial or uncertain; inspect before retry: " +
          (error instanceof Error ? error.message : "unknown result"));
      }
    });
  }



  /** Reorder existing native column-style helpers and their paired colors only. */
  async reorderColumnStyleRules(
    documentIdOrUrl: string, tableId: string, columnId: string,
    orderedFormulas: readonly string[]
  ): Promise<unknown> {
    return this.execute("reorder_column_style_rules", documentIdOrUrl, 1, async id => {
      assertPublicTableId(tableId);
      const limit = this.inner.maxReadRecords > 0 ? this.inner.maxReadRecords : 5000;
      const read = async () => {
        const [tables, columns] = await Promise.all([
          this.inner.queryRecords(id, "_grist_Tables", { hidden: true, limit }),
          this.inner.queryRecords(id, "_grist_Tables_column", { hidden: true, limit })
        ]);
        return readNativeColumnStyleSequence(tables, columns, tableId, columnId, limit);
      };
      const before = await read();
      const plan = planReorderColumnStyleRules(before, orderedFormulas);
      const result = { documentId: id, tableId, columnId };
      if (!plan.changed) return { ...result, changed: false, persistedStyleVerified: true };
      if (!isDeepStrictEqual(await read(), before)) {
        throw new Error("Native column-style sequence changed before reorder; reconcile first.");
      }
      try {
        await this.uiActions.reorderColumnStyleRules(
          id, before.ownerRef, plan.refs!, plan.optionsJson!
        );
        const after = await read();
        if (after.ownerRef !== before.ownerRef ||
            !isDeepStrictEqual(after.rules, plan.rules) ||
            !isDeepStrictEqual(after.options, plan.options)) {
          throw new Error("Reordered column-style helpers or paired colors failed postconditions.");
        }
        return { ...result, changed: true, persistedStyleVerified: true,
          styleRuleCount: after.rules.length };
      } catch (error) {
        throw new SchemaWriteVerificationError("reorder_column_style_rules",
          "Native column-style reorder may be uncertain; inspect before retry: " +
          (error instanceof Error ? error.message : "unknown result"));
      }
    });
  }

  /** Change native row-style priority by exact existing formula order only. */
  async reorderRowStyleRules(
    documentIdOrUrl: string, tableId: string, orderedFormulas: readonly string[]
  ): Promise<unknown> {
    return this.execute("reorder_row_style_rules", documentIdOrUrl, 1, async id => {
      assertPublicTableId(tableId);
      const limit = this.inner.maxReadRecords > 0 ? this.inner.maxReadRecords : 5000;
      const read = async () => {
        const [tables, sections, columns] = await Promise.all([
          this.inner.queryRecords(id, "_grist_Tables", { hidden: true, limit }),
          this.inner.queryRecords(id, "_grist_Views_section", { hidden: true, limit }),
          this.inner.queryRecords(id, "_grist_Tables_column", { hidden: true, limit })
        ]);
        return readNativeRowStyleSequence(tables, sections, columns, tableId, limit);
      };
      const before = await read();
      const plan = planReorderRowStyleRules(before, orderedFormulas);
      const result = { documentId: id, tableId };
      if (!plan.changed) return { ...result, changed: false, persistedStyleVerified: true };
      if (!isDeepStrictEqual(await read(), before)) {
        throw new Error("Native row-style sequence changed before reorder; reconcile first.");
      }
      try {
        await this.uiActions.reorderRowStyleRules(
          id, before.ownerRef, plan.refs!, plan.optionsJson!
        );
        const after = await read();
        if (after.ownerRef !== before.ownerRef ||
            !isDeepStrictEqual(after.rules, plan.rules) ||
            !isDeepStrictEqual(after.options, plan.options)) {
          throw new Error("Reordered native helper references or paired colors failed postconditions.");
        }
        return { ...result, changed: true, persistedStyleVerified: true,
          styleRuleCount: after.rules.length };
      } catch (error) {
        throw new SchemaWriteVerificationError("reorder_row_style_rules",
          "Native row-style reorder may be uncertain; inspect before retry: " +
          (error instanceof Error ? error.message : "unknown result"));
      }
    });
  }

  /** Change colors of one existing native raw-row conditional style by exact formula. */
  async updateRowStyleRule(
    documentIdOrUrl: string, tableId: string, input: ColumnStyleInput
  ): Promise<unknown> {
    return this.execute("update_row_style_rule", documentIdOrUrl, 1, async id => {
      assertPublicTableId(tableId);
      const limit = this.inner.maxReadRecords > 0 ? this.inner.maxReadRecords : 5000;
      const read = async () => {
        const [tables, sections, columns] = await Promise.all([
          this.inner.queryRecords(id, "_grist_Tables", { hidden: true, limit }),
          this.inner.queryRecords(id, "_grist_Views_section", { hidden: true, limit }),
          this.inner.queryRecords(id, "_grist_Tables_column", { hidden: true, limit })
        ]);
        return readNativeRowStyleSequence(tables, sections, columns, tableId, limit);
      };
      const before = await read();
      const plan = planExistingColumnStyleUpdate(
        before, input.conditionFormula, input.style
      );
      const result = { documentId: id, tableId };
      if (!plan.changed) {
        return { ...result, changed: false, persistedStyleVerified: true };
      }
      if (!isDeepStrictEqual(await read(), before)) {
        throw new Error("Native row style changed before write; reconcile first.");
      }
      try {
        await this.uiActions.updateRowStyleOptions(id, before.ownerRef, plan.widgetOptions!);
        const after = await read();
        const identities = (snapshot: typeof before) =>
          snapshot.rules.map(rule => ({ helperRef: rule.helperRef, formula: rule.formula }));
        if (after.ownerRef !== before.ownerRef ||
            !isDeepStrictEqual(identities(after), identities(before)) ||
            !isDeepStrictEqual(after.options, plan.options)) {
          throw new Error("Native row style update did not preserve rule identities or options.");
        }
        return { ...result, changed: true, persistedStyleVerified: true,
          styleRuleCount: after.rules.length };
      } catch (error) {
        throw new SchemaWriteVerificationError("update_row_style_rule",
          "Native row-style update may be uncertain; inspect before retry: " +
          (error instanceof Error ? error.message : "unknown result"));
      }
    });
  }

  /** Update only a unique native row-style formula helper, not raw-section options. */
  async replaceRowStyleFormula(
    documentIdOrUrl: string, tableId: string,
    previousFormula: string, conditionFormula: string
  ): Promise<unknown> {
    return this.execute("replace_row_style_formula", documentIdOrUrl, 1, async id => {
      assertPublicTableId(tableId);
      const limit = this.inner.maxReadRecords > 0 ? this.inner.maxReadRecords : 5000;
      const read = async () => {
        const [tables, sections, columns] = await Promise.all([
          this.inner.queryRecords(id, "_grist_Tables", { hidden: true, limit }),
          this.inner.queryRecords(id, "_grist_Views_section", { hidden: true, limit }),
          this.inner.queryRecords(id, "_grist_Tables_column", { hidden: true, limit })
        ]);
        return readNativeRowStyleSequence(tables, sections, columns, tableId, limit);
      };
      const before = await read();
      const plan = planExistingStyleFormulaReplacement(
        before, previousFormula, conditionFormula
      );
      const result = { documentId: id, tableId };
      if (!plan.changed) {
        return { ...result, changed: false, persistedStyleVerified: true };
      }
      if (!isDeepStrictEqual(await read(), before)) {
        throw new Error("Native row-style state changed before formula write; reconcile first.");
      }
      try {
        // One verified native helper UpdateRecord; never overwrite raw-section options.
        await this.uiActions.updateColumnStyleFormula(id, plan.helperRef, conditionFormula);
        const after = await read();
        if (after.ownerRef !== before.ownerRef ||
            !isDeepStrictEqual(after.options, before.options) ||
            !isDeepStrictEqual(after.rules, plan.rules)) {
          throw new Error("Native row-style formula or preserved rules differ from postconditions.");
        }
        return { ...result, changed: true, persistedStyleVerified: true,
          styleRuleCount: after.rules.length };
      } catch (error) {
        throw new SchemaWriteVerificationError("replace_row_style_formula",
          "Native row-style formula effect may be uncertain; inspect before retry: " +
          (error instanceof Error ? error.message : "unknown result"));
      }
    });
  }

  async renameColumn(
    documentIdOrUrl: string,
    tableId: string,
    oldColumnId: string,
    newColumnId: string
  ): Promise<unknown> {
    return this.execute("rename_column", documentIdOrUrl, 1, (id) => {
      assertPublicTableId(tableId);
      return this.inner.renameColumn(id, tableId, oldColumnId, newColumnId);
    });
  }

  async deleteColumns(
    documentIdOrUrl: string,
    tableId: string,
    columnIds: string[]
  ): Promise<unknown> {
    return this.execute("delete_columns", documentIdOrUrl, columnIds.length, (id) => {
      assertPublicTableId(tableId);
      return this.inner.deleteColumns(id, tableId, columnIds);
    });
  }

  private async resolveTableRef(documentId: string, tableId: string): Promise<number> {
    assertPublicTableId(tableId);
    const raw = await this.inner.listTables(documentId);
    const root = raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
    const tables = Array.isArray(root?.tables) ? root.tables : [];
    for (const entry of tables) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
      const table = entry as Record<string, unknown>;
      if (table.id !== tableId) continue;
      const fields = table.fields !== null && typeof table.fields === "object" && !Array.isArray(table.fields)
        ? (table.fields as Record<string, unknown>)
        : null;
      const tableRef = fields?.tableRef;
      if (typeof tableRef === "number" && Number.isInteger(tableRef) && tableRef > 0) {
        return tableRef;
      }
      throw new Error(`Grist table "${tableId}" has no usable table reference.`);
    }
    throw new Error(`Grist table "${tableId}" does not exist in document "${documentId}".`);
  }

  private async loadAccessRulesSnapshot(
    documentId: string
  ): Promise<AccessRulesSnapshot> {
    const metadataLimit = this.inner.maxReadRecords > 0
      ? this.inner.maxReadRecords
      : 5000;
    const options = { limit: metadataLimit, hidden: true } as const;
    const [resources, rules, tables, columns] = await Promise.all([
      this.inner.queryRecords(documentId, "_grist_ACLResources", options),
      this.inner.queryRecords(documentId, "_grist_ACLRules", options),
      this.inner.queryRecords(documentId, "_grist_Tables", options),
      this.inner.queryRecords(documentId, "_grist_Tables_column", options)
    ]);
    if (
      metadataResponseReachedLimit(resources, metadataLimit) ||
      metadataResponseReachedLimit(rules, metadataLimit) ||
      metadataResponseReachedLimit(tables, metadataLimit) ||
      metadataResponseReachedLimit(columns, metadataLimit)
    ) {
      throw new Error(
        "Grist access-rule metadata reached the configured read limit and may be incomplete; refusing to inspect or mutate policy state."
      );
    }
    return normalizeAccessRulesSnapshot(resources, rules, tables, columns);
  }

  private async inspectNavigation(documentId: string): Promise<
    | { navigationPageIds: number[] }
    | { navigationNormalizationIncomplete: true }
  > {
    try {
      const snapshot = await this.loadPageOrderSnapshot(documentId);
      return { navigationPageIds: [...snapshot.visiblePageIds] };
    } catch {
      // Unavailable navigation state must not discard otherwise authorized inspection.
      // Reorder writes continue to use the strict snapshot loader directly.
      return { navigationNormalizationIncomplete: true };
    }
  }

  private async loadPageOrderSnapshot(
    documentId: string
  ): Promise<PageOrderSnapshot> {
    const metadataLimit = this.inner.maxReadRecords > 0
      ? this.inner.maxReadRecords
      : 5000;
    const options = { limit: metadataLimit, hidden: true } as const;
    const [pages, views, tables] = await Promise.all([
      this.inner.queryRecords(documentId, "_grist_Pages", options),
      this.inner.queryRecords(documentId, "_grist_Views", options),
      this.inner.queryRecords(documentId, "_grist_Tables", options)
    ]);
    if (
      metadataResponseReachedLimit(pages, metadataLimit) ||
      metadataResponseReachedLimit(views, metadataLimit) ||
      metadataResponseReachedLimit(tables, metadataLimit)
    ) {
      throw new Error(
        "Grist page-order metadata reached the configured read limit and may be incomplete; refusing to reorder navigation."
      );
    }
    return normalizePageOrderSnapshot(pages, views, tables);
  }

  private async loadDocumentUi(
    documentId: string,
    tableResponse?: unknown,
    includeWidgetFields = false,
    includeWidgetFilters = false
  ): Promise<CompletenessAwareDocumentUiContext> {
    const metadataLimit = this.inner.maxReadRecords > 0
      ? this.inner.maxReadRecords
      : 5000;
    const sectionFieldsPromise = includeWidgetFields
      ? this.inner.queryRecords(documentId, "_grist_Views_section_field", {
          limit: metadataLimit,
          hidden: true
        })
      : Promise.resolve(undefined);
    const filtersPromise = includeWidgetFilters
      ? this.inner.queryRecords(documentId, "_grist_Filters", {
          limit: metadataLimit,
          hidden: true
        })
      : Promise.resolve(undefined);
    const [tables, pages, views, sections, sectionFields, filters] = await Promise.all([
      tableResponse ?? this.inner.listTables(documentId),
      this.inner.queryRecords(documentId, "_grist_Pages", {
        limit: metadataLimit,
        hidden: true
      }),
      this.inner.queryRecords(documentId, "_grist_Views", {
        limit: metadataLimit,
        hidden: true
      }),
      this.inner.queryRecords(documentId, "_grist_Views_section", {
        limit: metadataLimit,
        hidden: true
      }),
      sectionFieldsPromise,
      filtersPromise
    ]);
    const context: CompletenessAwareDocumentUiContext = this.documentUi.build(
      documentId,
      tables,
      pages,
      views,
      sections,
      sectionFields,
      filters
    );
    if (sectionFields !== undefined) {
      context[SECTION_FIELDS_METADATA] = sectionFields;
    }
    if (filters !== undefined) {
      context[FILTERS_METADATA] = filters;
    }
    if (
      metadataResponseReachedLimit(pages, metadataLimit) ||
      metadataResponseReachedLimit(views, metadataLimit) ||
      metadataResponseReachedLimit(sections, metadataLimit) ||
      (sectionFields !== undefined &&
        metadataResponseReachedLimit(sectionFields, metadataLimit)) ||
      (filters !== undefined && metadataResponseReachedLimit(filters, metadataLimit))
    ) {
      context.metadataSnapshotIncomplete = true;
    }
    return context;
  }

  private async verifyCreatedDocumentWorkspace(
    documentId: string,
    workspaceId: number,
    capability: GristCapability
  ): Promise<void> {
    try {
      const documents = await this.authorization.listDocuments(
        this.principal,
        capability
      );
      const match = documents.find(({ document }) => {
        const candidates = [String(document.id)];
        if (document.urlId) candidates.push(document.urlId);
        return candidates.includes(documentId);
      });
      if (!match) {
        throw new Error("the created document is not present in current authorized discovery");
      }
      if (String(match.workspace.id) !== String(workspaceId)) {
        throw new Error(
          `the created document resolved to workspace "${String(match.workspace.id)}" instead of "${String(workspaceId)}"`
        );
      }
    } catch (error) {
      if (error instanceof DocumentBootstrapVerificationError) throw error;
      throw new DocumentBootstrapVerificationError(
        documentId,
        error instanceof Error
          ? error.message
          : "post-create destination membership could not be re-read"
      );
    }
  }

  private async execute(
    operation: string,
    documentIdOrUrl: string,
    itemCount: number | undefined,
    action: (documentId: string) => Promise<unknown>
  ): Promise<unknown> {
    const definition = getOperation(operation);
    const capability = getRequiredCapability(operation);
    const requestId = this.audit.nextRequestId();
    const started = Date.now();
    let documentId = documentIdOrUrl;
    try {
      documentId = await this.authorization.assertDocumentAllowed(
        this.principal,
        documentIdOrUrl,
        capability
      );
      const result = await action(documentId);
      this.audit.record({
        requestId,
        principal: this.principal.id,
        transport: this.principal.transport,
        operation: definition.name,
        capability,
        documentId,
        ...(itemCount !== undefined ? { itemCount } : {}),
        status: "success",
        durationMs: Date.now() - started
      });
      return result;
    } catch (error) {
      this.auditFailure(
        requestId,
        started,
        definition.name,
        capability,
        documentId,
        error,
        itemCount
      );
      throw error;
    }
  }

  private auditFailure(
    requestId: string,
    started: number,
    operation: string,
    capability: GristCapability,
    documentId: string | undefined,
    error: unknown,
    itemCount?: number
  ): void {
    this.audit.record({
      requestId,
      principal: this.principal.id,
      transport: this.principal.transport,
      operation,
      capability,
      ...(documentId ? { documentId } : {}),
      ...(itemCount !== undefined ? { itemCount } : {}),
      status: "error",
      durationMs: Date.now() - started,
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
  }
}
