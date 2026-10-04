import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type {
  AuthorizedGristService,
  PageWidgetUpdateInput
} from "../grist/authorizedService.js";
import { GRIST_CHART_TYPES } from "../grist/chartTypes.js";
import {
  MAX_CUSTOM_WIDGET_MAPPED_COLUMNS,
  MAX_CUSTOM_WIDGET_MAPPING_KEYS
} from "../grist/customWidgetSettings.js";
import { GRID_ROW_NUMBER_MODES } from "../grist/gridOptions.js";
import {
  MAX_NORMALIZED_LAYOUT_NODES,
  MAX_NORMALIZED_LAYOUT_WIDGET_IDS,
  type NormalizedPageLayoutNode
} from "../grist/pageLayout.js";
import { MAX_SUMMARY_GROUP_BY_COLUMNS } from "../grist/summaryTables.js";
import { NATIVE_WIDGET_TYPES } from "../grist/uiActionsAdapter.js";
import {
  MAX_WIDGET_SORT_COLUMNS,
  WIDGET_SORT_DIRECTIONS
} from "../grist/widgetSort.js";
import {
  MAX_WIDGET_FIELD_WIDTH,
  MAX_WIDGET_VISIBLE_FIELDS
} from "../grist/widgetFields.js";
import {
  MAX_WIDGET_FILTERS,
  MAX_WIDGET_FILTER_VALUES
} from "../grist/widgetFilters.js";
import {
  columnMutationFieldsSchema,
  tableMutationFieldsSchema
} from "../operations/schemaMutationContract.js";
import { getLeanToolMetadata, leanToolHelp } from "./leanRegistry.js";
import { errorResult, textResult } from "./results.js";

export interface LeanToolLimits {
  maxReadRecords: number;
  maxWriteRecords: number;
  maxSchemaItems: number;
}

function boundedPositiveInt(max: number, defaultValue: number) {
  let schema = z.number().int().min(1);
  if (max > 0) schema = schema.max(max);
  return schema.default(defaultValue);
}

function boundedArray<T extends z.ZodType>(schema: T, max: number) {
  let result = z.array(schema).min(1);
  if (max > 0) result = result.max(max);
  return result;
}

const documentIdSchema = z.string().trim().min(1);
const tableIdSchema = z.string().trim().min(1);
const columnIdSchema = z.string().trim().min(1);
const positiveIdSchema = z.number().int().positive();

const widgetSortSchema = z
  .array(
    z
      .object({
        columnId: columnIdSchema,
        direction: z.enum(WIDGET_SORT_DIRECTIONS),
        emptyLast: z.boolean().optional(),
        naturalSort: z.boolean().optional(),
        orderByChoice: z.boolean().optional()
      })
      .strict()
  )
  .max(MAX_WIDGET_SORT_COLUMNS);

const customWidgetMappingValueSchema = z.union([
  columnIdSchema,
  z.array(columnIdSchema).max(MAX_CUSTOM_WIDGET_MAPPED_COLUMNS),
  z.null()
]);

const customWidgetColumnsMappingSchema = z
  .record(z.string().min(1), customWidgetMappingValueSchema)
  .refine(
    (value) => Object.keys(value).length <= MAX_CUSTOM_WIDGET_MAPPING_KEYS,
    `Custom widget mappings support at most ${MAX_CUSTOM_WIDGET_MAPPING_KEYS} keys.`
  );

const customWidgetSettingsUpdateSchema = z
  .object({
    access: z.enum(["none", "read table", "full"]).optional(),
    columnsMapping: customWidgetColumnsMappingSchema.nullable().optional()
  })
  .strict()
  .refine(
    (value) => value.access !== undefined || value.columnsMapping !== undefined,
    "At least one of access or columnsMapping must be supplied."
  );

const widgetVisibleFieldsSchema = z
  .array(
    z
      .object({
        columnId: columnIdSchema,
        width: z.number().int().min(1).max(MAX_WIDGET_FIELD_WIDTH).optional()
      })
      .strict()
  )
  .max(MAX_WIDGET_VISIBLE_FIELDS)
  .refine(
    (fields) => new Set(fields.map((field) => field.columnId)).size === fields.length,
    "Widget visible field column IDs must be unique."
  );


const widgetFilterValueSchema = z.union([
  z.string().max(10000),
  z.number().finite(),
  z.boolean(),
  z.null()
]);

const widgetFilterUpdateSchema = z
  .array(
    z.discriminatedUnion("mode", [
      z
        .object({
          columnId: columnIdSchema,
          mode: z.literal("include"),
          values: z.array(widgetFilterValueSchema).max(MAX_WIDGET_FILTER_VALUES),
          pinned: z.boolean().optional()
        })
        .strict(),
      z
        .object({
          columnId: columnIdSchema,
          mode: z.literal("exclude"),
          values: z.array(widgetFilterValueSchema).max(MAX_WIDGET_FILTER_VALUES),
          pinned: z.boolean().optional()
        })
        .strict(),
      z
        .object({
          columnId: columnIdSchema,
          mode: z.literal("range"),
          min: z.number().finite().optional(),
          max: z.number().finite().optional(),
          pinned: z.boolean().optional()
        })
        .strict()
        .refine(
          (value) =>
            (value.min !== undefined || value.max !== undefined) &&
            (value.min === undefined || value.max === undefined || value.min <= value.max),
          "Range filters require at least one bound and min must not exceed max."
        ),
      z
        .object({
          columnId: columnIdSchema,
          mode: z.literal("remove")
        })
        .strict()
    ])
  )
  .min(1)
  .max(MAX_WIDGET_FILTERS)
  .refine(
    (filters) =>
      new Set(filters.map((filter) => filter.columnId)).size === filters.length,
    "Widget filter column IDs must be unique within one update."
  );

const gridOptionsUpdateSchema = z
  .object({
    verticalGridlines: z.boolean().optional(),
    horizontalGridlines: z.boolean().optional(),
    zebraStripes: z.boolean().optional(),
    rowNumbers: z.enum(GRID_ROW_NUMBER_MODES).optional()
  })
  .strict()
  .refine(
    (value) =>
      value.verticalGridlines !== undefined ||
      value.horizontalGridlines !== undefined ||
      value.zebraStripes !== undefined ||
      value.rowNumbers !== undefined,
    "At least one grid display option must be supplied."
  );

const pageLayoutNodeSchema: z.ZodType<NormalizedPageLayoutNode> = z.lazy(() =>
  z.union([
    z
      .object({
        kind: z.literal("widget"),
        widgetId: positiveIdSchema,
        size: z.number().nonnegative().optional()
      })
      .strict(),
    z
      .object({
        kind: z.literal("group"),
        children: z
          .array(pageLayoutNodeSchema)
          .min(1)
          .max(MAX_NORMALIZED_LAYOUT_NODES),
        size: z.number().nonnegative().optional()
      })
      .strict()
  ])
);

const pageLayoutUpdateSchema = z
  .object({
    root: pageLayoutNodeSchema,
    collapsedWidgetIds: z
      .array(positiveIdSchema)
      .max(MAX_NORMALIZED_LAYOUT_WIDGET_IDS)
      .optional()
  })
  .strict();

function widgetUpdateSchema() {
  return z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      chartType: z.enum(GRIST_CHART_TYPES).optional(),
      sort: widgetSortSchema.nullable().optional(),
      selectBy: z
        .object({
          sourceWidgetId: positiveIdSchema,
          sourceColumnId: columnIdSchema.optional(),
          targetColumnId: columnIdSchema.optional()
        })
        .strict()
        .nullable()
        .optional(),
      customWidgetSettings: customWidgetSettingsUpdateSchema.optional(),
      gridOptions: gridOptionsUpdateSchema.optional(),
      visibleFields: widgetVisibleFieldsSchema.optional(),
      filters: widgetFilterUpdateSchema.optional()
    })
    .strict()
    .refine(
      (value) =>
        value.title !== undefined ||
        value.description !== undefined ||
        value.chartType !== undefined ||
        value.sort !== undefined ||
        value.selectBy !== undefined ||
        value.customWidgetSettings !== undefined ||
        value.gridOptions !== undefined ||
        value.visibleFields !== undefined ||
        value.filters !== undefined,
      "At least one widget field must be supplied."
    );
}

function normalizeWidgetUpdate(
  update: z.infer<ReturnType<typeof widgetUpdateSchema>>
): PageWidgetUpdateInput {
  return {
    ...(update.title !== undefined ? { title: update.title } : {}),
    ...(update.description !== undefined
      ? { description: update.description }
      : {}),
    ...(update.chartType !== undefined ? { chartType: update.chartType } : {}),
    ...(update.sort !== undefined ? { sort: update.sort } : {}),
    ...(update.selectBy !== undefined ? { selectBy: update.selectBy } : {}),
    ...(update.customWidgetSettings !== undefined
      ? {
          customWidgetSettings: {
            ...(update.customWidgetSettings.access !== undefined
              ? { access: update.customWidgetSettings.access }
              : {}),
            ...(update.customWidgetSettings.columnsMapping !== undefined
              ? {
                  columnsMapping:
                    update.customWidgetSettings.columnsMapping
                }
              : {})
          }
        }
      : {}),
    ...(update.gridOptions !== undefined
      ? {
          gridOptions: {
            ...(update.gridOptions.verticalGridlines !== undefined
              ? { verticalGridlines: update.gridOptions.verticalGridlines }
              : {}),
            ...(update.gridOptions.horizontalGridlines !== undefined
              ? { horizontalGridlines: update.gridOptions.horizontalGridlines }
              : {}),
            ...(update.gridOptions.zebraStripes !== undefined
              ? { zebraStripes: update.gridOptions.zebraStripes }
              : {}),
            ...(update.gridOptions.rowNumbers !== undefined
              ? { rowNumbers: update.gridOptions.rowNumbers }
              : {})
          }
        }
      : {}),
    ...(update.visibleFields !== undefined
      ? {
          visibleFields: update.visibleFields.map((field) => ({
            columnId: field.columnId,
            ...(field.width !== undefined ? { width: field.width } : {})
          }))
        }
      : {}),
    ...(update.filters !== undefined
      ? {
          filters: update.filters.map((filter) => {
            if (filter.mode === "remove") {
              return { columnId: filter.columnId, mode: "remove" as const };
            }
            if (filter.mode === "range") {
              return {
                columnId: filter.columnId,
                mode: "range" as const,
                ...(filter.min !== undefined ? { min: filter.min } : {}),
                ...(filter.max !== undefined ? { max: filter.max } : {}),
                ...(filter.pinned !== undefined ? { pinned: filter.pinned } : {})
              };
            }
            return {
              columnId: filter.columnId,
              mode: filter.mode,
              values: [...filter.values],
              ...(filter.pinned !== undefined ? { pinned: filter.pinned } : {})
            };
          })
        }
      : {})
  };
}

export function registerLeanTools(
  server: McpServer,
  grist: AuthorizedGristService,
  limits: LeanToolLimits
): void {
  const newRecordSchema = z.object({
    fields: z.record(z.string(), z.unknown())
  });
  const updateRecordSchema = z.object({
    id: positiveIdSchema,
    fields: z.record(z.string(), z.unknown())
  });
  const columnSpecSchema = z.object({
    id: columnIdSchema,
    fields: columnMutationFieldsSchema.optional()
  });
  const columnUpdateSchema = z.object({
    id: columnIdSchema,
    fields: columnMutationFieldsSchema
  });
  const tableSpecSchema = z.object({
    id: tableIdSchema,
    columns: boundedArray(columnSpecSchema, limits.maxSchemaItems).optional()
  });
  const tableUpdateSchema = z.object({
    id: tableIdSchema,
    fields: tableMutationFieldsSchema
  });

  server.registerTool(
    "grist_discover",
    {
      ...getLeanToolMetadata("grist_discover"),
      inputSchema: z.discriminatedUnion("action", [
        z.object({ action: z.literal("documents") }).strict(),
        z
          .object({
            action: z.literal("tables"),
            documentId: documentIdSchema,
            expandColumns: z.boolean().default(false)
          })
          .strict(),
        z
          .object({
            action: z.literal("columns"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            hidden: z.boolean().default(false)
          })
          .strict()
      ])
    },
    async (input) => {
      try {
        switch (input.action) {
          case "documents":
            return textResult(await grist.listDocuments());
          case "tables":
            return textResult(
              await grist.listTables(input.documentId, {
                expandColumns: input.expandColumns
              })
            );
          case "columns":
            return textResult(
              await grist.listColumns(input.documentId, input.tableId, {
                hidden: input.hidden
              })
            );
        }
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "grist_inspect",
    {
      ...getLeanToolMetadata("grist_inspect"),
      inputSchema: z.discriminatedUnion("action", [
        z
          .object({
            action: z.literal("document"),
            documentId: documentIdSchema
          })
          .strict(),
        z
          .object({
            action: z.literal("pages"),
            documentId: documentIdSchema
          })
          .strict(),
        z
          .object({
            action: z.literal("page_widgets"),
            documentId: documentIdSchema,
            pageId: positiveIdSchema
          })
          .strict()
      ])
    },
    async (input) => {
      try {
        switch (input.action) {
          case "document":
            return textResult(await grist.inspectDocument(input.documentId));
          case "pages":
            return textResult(await grist.getPages(input.documentId));
          case "page_widgets":
            return textResult(
              await grist.getPageWidgets(input.documentId, input.pageId)
            );
        }
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "grist_query",
    {
      ...getLeanToolMetadata("grist_query"),
      inputSchema: z
        .object({
          documentId: documentIdSchema,
          tableId: tableIdSchema,
          filter: z.record(z.string(), z.array(z.unknown())).optional(),
          sort: z.string().min(1).optional(),
          limit: boundedPositiveInt(
            limits.maxReadRecords,
            limits.maxReadRecords > 0
              ? Math.min(50, limits.maxReadRecords)
              : 50
          ),
          hidden: z.boolean().optional(),
          cellFormat: z.enum(["normal", "typed"]).optional()
        })
        .strict()
    },
    async ({ documentId, tableId, filter, sort, limit, hidden, cellFormat }) => {
      try {
        return textResult(
          await grist.queryRecords(documentId, tableId, {
            ...(filter ? { filter } : {}),
            ...(sort ? { sort } : {}),
            limit,
            ...(hidden !== undefined ? { hidden } : {}),
            ...(cellFormat ? { cellFormat } : {})
          })
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "grist_add_records",
    {
      ...getLeanToolMetadata("grist_add_records"),
      inputSchema: z
        .object({
          documentId: documentIdSchema,
          tableId: tableIdSchema,
          records: boundedArray(newRecordSchema, limits.maxWriteRecords)
        })
        .strict()
    },
    async ({ documentId, tableId, records }) => {
      try {
        return textResult(await grist.createRecords(documentId, tableId, records));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "grist_change_records",
    {
      ...getLeanToolMetadata("grist_change_records"),
      inputSchema: z.discriminatedUnion("action", [
        z
          .object({
            action: z.literal("update"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            records: boundedArray(updateRecordSchema, limits.maxWriteRecords)
          })
          .strict(),
        z
          .object({
            action: z.literal("delete"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            recordIds: boundedArray(
              positiveIdSchema,
              limits.maxWriteRecords
            ).refine(
              (ids) => new Set(ids).size === ids.length,
              "Record IDs must be unique."
            )
          })
          .strict()
      ])
    },
    async (input) => {
      try {
        switch (input.action) {
          case "update":
            return textResult(
              await grist.updateRecords(
                input.documentId,
                input.tableId,
                input.records
              )
            );
          case "delete":
            return textResult(
              await grist.deleteRecords(
                input.documentId,
                input.tableId,
                input.recordIds
              )
            );
        }
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "grist_add_structure",
    {
      ...getLeanToolMetadata("grist_add_structure"),
      inputSchema: z.discriminatedUnion("action", [
        z
          .object({
            action: z.literal("create_tables"),
            documentId: documentIdSchema,
            tables: boundedArray(tableSpecSchema, limits.maxSchemaItems)
          })
          .strict(),
        z
          .object({
            action: z.literal("create_columns"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            columns: boundedArray(columnSpecSchema, limits.maxSchemaItems)
          })
          .strict()
      ])
    },
    async (input) => {
      try {
        switch (input.action) {
          case "create_tables":
            return textResult(
              await grist.createTables(input.documentId, input.tables)
            );
          case "create_columns":
            return textResult(
              await grist.createColumns(
                input.documentId,
                input.tableId,
                input.columns
              )
            );
        }
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "grist_change_structure",
    {
      ...getLeanToolMetadata("grist_change_structure"),
      inputSchema: z.discriminatedUnion("action", [
        z
          .object({
            action: z.literal("update_tables"),
            documentId: documentIdSchema,
            tables: boundedArray(tableUpdateSchema, limits.maxSchemaItems)
          })
          .strict(),
        z
          .object({
            action: z.literal("delete_table"),
            documentId: documentIdSchema,
            tableId: tableIdSchema
          })
          .strict(),
        z
          .object({
            action: z.literal("update_columns"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            columns: boundedArray(columnUpdateSchema, limits.maxSchemaItems)
          })
          .strict(),
        z
          .object({
            action: z.literal("rename_column"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            oldColumnId: columnIdSchema,
            newColumnId: columnIdSchema
          })
          .strict(),
        z
          .object({
            action: z.literal("delete_columns"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            columnIds: boundedArray(
              columnIdSchema,
              limits.maxSchemaItems
            ).refine(
              (ids) => new Set(ids).size === ids.length,
              "Column IDs must be unique."
            )
          })
          .strict()
      ])
    },
    async (input) => {
      try {
        switch (input.action) {
          case "update_tables":
            return textResult(
              await grist.updateTables(input.documentId, input.tables)
            );
          case "delete_table":
            return textResult(
              await grist.deleteTable(input.documentId, input.tableId)
            );
          case "update_columns":
            return textResult(
              await grist.updateColumns(
                input.documentId,
                input.tableId,
                input.columns
              )
            );
          case "rename_column":
            return textResult(
              await grist.renameColumn(
                input.documentId,
                input.tableId,
                input.oldColumnId,
                input.newColumnId
              )
            );
          case "delete_columns":
            return textResult(
              await grist.deleteColumns(
                input.documentId,
                input.tableId,
                input.columnIds
              )
            );
        }
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "grist_add_ui",
    {
      ...getLeanToolMetadata("grist_add_ui"),
      inputSchema: z.discriminatedUnion("action", [
        z
          .object({
            action: z.literal("create_page"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            name: z.string().trim().min(1)
          })
          .strict(),
        z
          .object({
            action: z.literal("add_widget"),
            documentId: documentIdSchema,
            pageId: positiveIdSchema,
            tableId: tableIdSchema,
            type: z.enum(NATIVE_WIDGET_TYPES),
            groupByColumnIds: z
              .array(columnIdSchema)
              .max(MAX_SUMMARY_GROUP_BY_COLUMNS)
              .refine(
                (ids) => new Set(ids).size === ids.length,
                "Summary group-by column IDs must be unique."
              )
              .optional()
          })
          .strict()
      ])
    },
    async (input) => {
      try {
        switch (input.action) {
          case "create_page":
            return textResult(
              await grist.createPage(
                input.documentId,
                input.tableId,
                input.name
              )
            );
          case "add_widget":
            return textResult(
              await grist.addPageWidget(
                input.documentId,
                input.pageId,
                input.tableId,
                input.type,
                input.groupByColumnIds
              )
            );
        }
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "grist_change_ui",
    {
      ...getLeanToolMetadata("grist_change_ui"),
      inputSchema: z.discriminatedUnion("action", [
        z
          .object({
            action: z.literal("rename_page"),
            documentId: documentIdSchema,
            pageId: positiveIdSchema,
            name: z.string().trim().min(1)
          })
          .strict(),
        z
          .object({
            action: z.literal("delete_page"),
            documentId: documentIdSchema,
            pageId: positiveIdSchema
          })
          .strict(),
        z
          .object({
            action: z.literal("delete_widget"),
            documentId: documentIdSchema,
            pageId: positiveIdSchema,
            widgetId: positiveIdSchema
          })
          .strict(),
        z
          .object({
            action: z.literal("update_layout"),
            documentId: documentIdSchema,
            pageId: positiveIdSchema,
            layout: pageLayoutUpdateSchema
          })
          .strict(),
        z
          .object({
            action: z.literal("update_widget"),
            documentId: documentIdSchema,
            pageId: positiveIdSchema,
            widgetId: positiveIdSchema,
            update: widgetUpdateSchema()
          })
          .strict()
      ])
    },
    async (input) => {
      try {
        switch (input.action) {
          case "rename_page":
            return textResult(
              await grist.renamePage(
                input.documentId,
                input.pageId,
                input.name
              )
            );
          case "delete_page":
            return textResult(
              await grist.deletePage(input.documentId, input.pageId)
            );
          case "delete_widget":
            return textResult(
              await grist.deletePageWidget(
                input.documentId,
                input.pageId,
                input.widgetId
              )
            );
          case "update_layout":
            return textResult(
              await grist.updatePageLayout(
                input.documentId,
                input.pageId,
                input.layout
              )
            );
          case "update_widget":
            return textResult(
              await grist.updatePageWidget(
                input.documentId,
                input.pageId,
                input.widgetId,
                normalizeWidgetUpdate(input.update)
              )
            );
        }
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "grist_help",
    {
      ...getLeanToolMetadata("grist_help"),
      inputSchema: z
        .object({
          tools: z.array(z.string().trim().min(1)).max(10).optional()
        })
        .strict()
    },
    async ({ tools }) => {
      try {
        return textResult(leanToolHelp(tools));
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
