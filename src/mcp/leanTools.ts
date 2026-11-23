import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { configuredColumnSchema, dropdownConditionSchema } from "../grist/configuredColumns.js";

import {
  ACCESS_POLICY_OPERATIONS,
  ACCESS_RULE_USER_PROPERTIES,
  ACCESS_USER_ATTRIBUTE_PROPERTIES,
  MAX_ACCESS_RULE_COLUMNS,
  MAX_ACCESS_RULE_CONDITION_DEPTH,
  MAX_ACCESS_RULE_CONDITION_WIDTH,
  MAX_ACCESS_RULE_LINK_KEY_NAME_LENGTH,
  MAX_ACCESS_RULES_PER_GROUP
} from "../grist/accessRules.js";
import type { AccessRuleCondition } from "../grist/accessRules.js";
import type {
  AuthorizedGristService,
  PageWidgetUpdateInput
} from "../grist/authorizedService.js";
import {
  MAX_CARD_LAYOUT_NODES,
  type NormalizedCardLayoutNode
} from "../grist/cardLayout.js";
import { MAX_PAGE_ORDER_PAGES } from "../grist/pageOrder.js";
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
import { DOCUMENT_TIMEZONE_CHOICES } from "../grist/service.js";
import { DOCUMENT_LOCALE_CHOICES } from "../grist/documentLocale.js";
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
  columnCreationFieldsSchema,
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

function dictionarySchema<T extends z.ZodType>(valueSchema: T, minKeyLength = 0) {
  // Zod skips __proto__ before validating record keys. Reject the raw own key
  // first so an accepted mutation/filter can never silently lose an intention.
  return z.preprocess((value, context) => {
    if (value !== null && typeof value === "object" && Object.hasOwn(value, "__proto__")) {
      context.addIssue({ code: "custom", message: "Dictionary key __proto__ is unsupported.", path: ["__proto__"] });
      return z.NEVER;
    }
    return value;
  }, z.record(z.string().min(minKeyLength), valueSchema));
}

const documentIdSchema = z.string().trim().min(1);
const tableIdSchema = z.string().trim().min(1);
const columnIdSchema = z.string().trim().min(1);
const positiveIdSchema = z.number().int().positive();
const accessPermissionValueSchema = z.enum(["allow", "deny", "unspecified"]);
const accessRuleLinkKeyNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_ACCESS_RULE_LINK_KEY_NAME_LENGTH)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "LinkKey names must be safe identifiers.");
const accessRuleTargetSchema = z
  .object({
    tableId: tableIdSchema,
    columnIds: z
      .array(columnIdSchema)
      .min(1)
      .max(MAX_ACCESS_RULE_COLUMNS)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Access-rule target column IDs must be unique."
      )
      .optional()
  })
  .strict();

/** Synthetic equivalence classes, not LinkKey secrets or real record values. */
const syntheticSymbolSchema = z.object({
  kind: z.literal("symbol"), symbol: z.enum(["A", "B", "C", "D"])
}).strict();
const syntheticValueSchema = z.discriminatedUnion("kind", [
  syntheticSymbolSchema,
  z.object({ kind: z.literal("boolean"), value: z.boolean() }).strict(),
  z.object({ kind: z.literal("flag"), value: z.union([z.literal(0), z.literal(1)]) }).strict(),
  z.object({ kind: z.literal("empty_text") }).strict()
]);
const syntheticIdentifierSchema = z.string().min(1).max(100)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const uniqueSyntheticFields = <T extends { name: string }>(entries: T[]) =>
  new Set(entries.map((entry) => entry.name)).size === entries.length;
function syntheticFields<Name extends z.ZodType<string>, Value extends z.ZodType>(name: Name, value: Value) {
  return z.array(z.object({ name, value }).strict()).max(20)
    .refine((entries) => new Set(entries.map((entry) => (entry as unknown as { name: string }).name)).size === entries.length,
      "Synthetic field names must be unique.");
}
const syntheticScenarioSchema = z.object({
  role: z.enum(["owner", "editor", "viewer"]).optional(),
  user: syntheticFields(z.enum(ACCESS_RULE_USER_PROPERTIES), syntheticValueSchema).optional(),
  rec: syntheticFields(syntheticIdentifierSchema, syntheticValueSchema).optional(),
  newRec: syntheticFields(syntheticIdentifierSchema, syntheticValueSchema).optional(),
  // LinkKey scenario operands are symbolic letters only, never actual URL values.
  linkKeys: syntheticFields(accessRuleLinkKeyNameSchema, syntheticSymbolSchema).optional(),
  userAttributes: z.array(z.object({
    name: syntheticIdentifierSchema,
    fields: syntheticFields(syntheticIdentifierSchema, syntheticValueSchema)
  }).strict()).max(8).refine(uniqueSyntheticFields, "Synthetic attribute names must be unique.").optional()
}).strict();
const accessRuleSchemaIdentity = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("table"), tableId: tableIdSchema }).strict(),
  z.object({ kind: z.literal("column"), tableId: tableIdSchema, columnId: columnIdSchema }).strict()
]);
const accessPolicyCoverageSchema = z.object({
  target: accessRuleSchemaIdentity,
  operation: z.enum(ACCESS_POLICY_OPERATIONS),
  context: syntheticScenarioSchema.optional()
}).strict();

const accessRuleSimulationSchema = z.object({
  target: accessRuleTargetSchema,
  context: syntheticScenarioSchema
}).strict();

// Same access_rule_group action, closed alternate target; no additional MCP tool.
const accessUserAttributeTargetSchema = z.object({
  userAttributeName: accessRuleLinkKeyNameSchema
}).strict();
const accessUserAttributeDefinitionSchema = z.object({
  tableId: z.string().min(1).max(100).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  lookupColId: z.string().min(1).max(100).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("user_property"),
      property: z.enum(ACCESS_USER_ATTRIBUTE_PROPERTIES) }).strict(),
    z.object({ kind: z.literal("link_key"),
      name: accessRuleLinkKeyNameSchema }).strict()
  ])
}).strict();

const accessRuleLeafConditionVariants = [
  z.object({ kind: z.literal("everyone") }).strict(),
  z
    .object({
      kind: z.literal("user_access"),
      operator: z.enum(["equals", "not_equals"]),
      role: z.enum(["owner", "editor", "viewer"])
    })
    .strict(),
  z.object({
    kind: z.literal("user_access_membership"),
    operator: z.enum(["in", "not_in"]),
    roles: z.array(z.enum(["owner", "editor", "viewer"])).min(2).max(3)
      .refine((roles) => new Set(roles).size === roles.length, "Membership roles must be unique.")
  }).strict(),
  z.object({
    kind: z.literal("user_login_status"),
    operator: z.enum(["equals", "not_equals"]),
    value: z.boolean()
  }).strict(),
  z.object({
    kind: z.literal("user_attribute_flag"),
    attributeName: accessRuleLinkKeyNameSchema,
    attributeColumnId: z.string().min(1).max(100).regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
  }).strict(),
  z.object({
    kind: z.literal("record_in_user_attribute_ref_list"),
    operator: z.enum(["in", "not_in"]),
    columnId: z.string().min(1).max(100).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    attributeName: accessRuleLinkKeyNameSchema,
    attributeColumnId: z.string().min(1).max(100).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    record: z.literal("newRec").optional()
  }).strict(),
  z
    .object({
      kind: z.literal("match_user"),
      operator: z.enum(["equals", "not_equals"]),
      columnId: columnIdSchema,
      userProperty: z.enum(ACCESS_RULE_USER_PROPERTIES),
      record: z.literal("newRec").optional()
    })
    .strict(),
  z
    .object({
      kind: z.literal("match_link_key"),
      operator: z.enum(["equals", "not_equals"]),
      columnId: columnIdSchema,
      linkKeyName: accessRuleLinkKeyNameSchema,
      record: z.literal("newRec").optional()
    })
    .strict(),
  z.object({
    kind: z.literal("match_user_attribute"),
    operator: z.enum(["equals", "not_equals"]),
    columnId: z.string().min(1).max(100).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    attributeName: accessRuleLinkKeyNameSchema,
    attributeColumnId: z.string().min(1).max(100).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    record: z.literal("newRec").optional()
  }).strict(),
  z.object({
    kind: z.literal("match_boolean"),
    operator: z.enum(["equals", "not_equals"]),
    columnId: columnIdSchema,
    value: z.boolean(),
    record: z.literal("newRec").optional()
  }).strict(),
  z.object({
    kind: z.literal("match_integer_flag"),
    operator: z.enum(["equals", "not_equals"]),
    columnId: columnIdSchema,
    value: z.union([z.literal(0), z.literal(1)]),
    record: z.literal("newRec").optional()
  }).strict(),
  z.object({
    kind: z.literal("match_empty_text"),
    operator: z.enum(["equals", "not_equals"]),
    columnId: columnIdSchema,
    record: z.literal("newRec").optional()
  }).strict(),
  z.object({
    kind: z.literal("column_change"),
    operator: z.enum(["equals", "not_equals"]),
    columnId: columnIdSchema
  }).strict()
] as const;

// Preserve the existing finite Zod validators and give each depth a named,
// shared JSON Schema definition. Without these local $defs, the SDK inlines
// the same child under all/any/not at every level (exponential tools/list).
// The names are metadata for schema serialization, not extra runtime actions.
function boundedAccessRuleConditionSchema(depth: number): z.ZodType<AccessRuleCondition> {
  const metadata = { id: `GiaAccessRuleConditionDepth${depth}` };
  if (depth === 0) {
    return z.discriminatedUnion("kind", accessRuleLeafConditionVariants).meta(metadata);
  }
  const child = boundedAccessRuleConditionSchema(depth - 1);
  return z.discriminatedUnion("kind", [
    ...accessRuleLeafConditionVariants,
    z.object({
      kind: z.literal("all"),
      conditions: z.array(child).min(2).max(MAX_ACCESS_RULE_CONDITION_WIDTH)
    }).strict(),
    z.object({
      kind: z.literal("any"),
      conditions: z.array(child).min(2).max(MAX_ACCESS_RULE_CONDITION_WIDTH)
    }).strict(),
    z.object({
      kind: z.literal("not"),
      condition: child
    }).strict()
  ]).meta(metadata);
}

const accessRuleConditionSchema = boundedAccessRuleConditionSchema(MAX_ACCESS_RULE_CONDITION_DEPTH);
const accessRuleSchema = z
  .object({
    condition: accessRuleConditionSchema,
    permissions: z
      .object({
        read: accessPermissionValueSchema,
        update: accessPermissionValueSchema,
        create: accessPermissionValueSchema.optional(),
        delete: accessPermissionValueSchema.optional()
      })
      .strict()
  })
  .strict();

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

const customWidgetColumnsMappingSchema = dictionarySchema(customWidgetMappingValueSchema, 1)
  .refine(
    (value) => Object.keys(value).length <= MAX_CUSTOM_WIDGET_MAPPING_KEYS,
    `Custom widget mappings support at most ${MAX_CUSTOM_WIDGET_MAPPING_KEYS} keys.`
  );

const calendarConfigSchema = z
  .object({
    titleColumnId: columnIdSchema,
    startDateColumnId: columnIdSchema,
    endDateColumnId: columnIdSchema.optional(),
    allDayColumnId: columnIdSchema.optional(),
    typeColumnId: columnIdSchema.optional()
  })
  .strict();

const customWidgetOptionScalar = z.union([
  z.string().max(160),
  z.number().finite().min(-1_000_000).max(1_000_000),
  z.boolean()
]);
const customWidgetOptionValue = z.union([
  customWidgetOptionScalar,
  z.array(z.union([z.string().max(160),
    z.number().finite().min(-1_000_000).max(1_000_000)])).max(20),
  z.null()
]);
const customWidgetSettingsUpdateSchema = z
  .object({
    access: z.enum(["none", "read table", "full"]).optional(),
    confirmDataAccess: z.literal(true).optional(),
    columnsMapping: customWidgetColumnsMappingSchema.nullable().optional(),
    optionsPatch: dictionarySchema(customWidgetOptionValue, 1).optional()
  })
  .strict()
  .refine(
    (value) => value.access !== undefined || value.columnsMapping !== undefined ||
      value.optionsPatch !== undefined,
    "At least one of access, columnsMapping or optionsPatch must be supplied."
  )
  .refine(
    (value) => value.access === undefined || value.access === "none" ||
      value.confirmDataAccess === true,
    "Granting custom widget data access requires confirmDataAccess:true."
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

const cardLayoutNodeSchema: z.ZodType<NormalizedCardLayoutNode> = z.lazy(() =>
  z.union([
    z
      .object({
        kind: z.literal("field"),
        columnId: columnIdSchema,
        size: z.number().positive().optional()
      })
      .strict(),
    z
      .object({
        kind: z.literal("group"),
        children: z
          .array(cardLayoutNodeSchema)
          .min(1)
          .max(MAX_CARD_LAYOUT_NODES),
        size: z.number().positive().optional()
      })
      .strict()
  ])
);

const cardLayoutUpdateSchema = z
  .object({
    root: cardLayoutNodeSchema
  })
  .strict();

const pageLayoutUpdateSchema = z
  .object({
    root: pageLayoutNodeSchema,
    collapsedWidgetIds: z
      .array(positiveIdSchema)
      .max(MAX_NORMALIZED_LAYOUT_WIDGET_IDS)
      .optional()
  })
  .strict();

const formParagraphSchema = z.object({
  type: z.literal("paragraph"), text: z.string().max(300),
  alignment: z.enum(["left", "center", "right"]).optional()
}).strict();
const formFieldSchema = z.object({
  type: z.literal("field"), columnId: columnIdSchema
}).strict();
const formSectionSchema = z.object({
  type: z.literal("section"),
  children: z.array(z.discriminatedUnion("type", [formParagraphSchema, formFieldSchema]))
    .min(1).max(40)
}).strict();
const formSubmitSchema = z.object({ type: z.literal("submit") }).strict();
const formLayoutUpdateSchema = z.object({
  children: z.array(z.discriminatedUnion("type", [
    formParagraphSchema, formSectionSchema, formSubmitSchema
  ])).min(2).max(40),
  submitText: z.string().max(300).optional(),
  successText: z.string().max(300).optional(),
  anotherResponse: z.boolean().optional()
}).strict();

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
      calendarConfig: calendarConfigSchema.optional(),
      gridOptions: gridOptionsUpdateSchema.optional(),
      visibleFields: widgetVisibleFieldsSchema.optional(),
      cardLayout: cardLayoutUpdateSchema.optional(),
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
        value.calendarConfig !== undefined ||
        value.gridOptions !== undefined ||
        value.visibleFields !== undefined ||
        value.cardLayout !== undefined ||
        value.filters !== undefined,
      "At least one widget field must be supplied."
    )
    .refine(
      (value) =>
        !(value.visibleFields !== undefined && value.cardLayout !== undefined),
      "visibleFields and cardLayout must be updated in separate calls."
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
            ...(update.customWidgetSettings.confirmDataAccess === true
              ? { confirmDataAccess: true as const }
              : {}),
            ...(update.customWidgetSettings.columnsMapping !== undefined
              ? {
                  columnsMapping:
                    update.customWidgetSettings.columnsMapping
                }
              : {}),
            ...(update.customWidgetSettings.optionsPatch !== undefined
              ? { optionsPatch: update.customWidgetSettings.optionsPatch }
              : {})
          }
        }
      : {}),
    ...(update.calendarConfig !== undefined
      ? {
          calendarConfig: {
            titleColumnId: update.calendarConfig.titleColumnId,
            startDateColumnId: update.calendarConfig.startDateColumnId,
            ...(update.calendarConfig.endDateColumnId !== undefined
              ? { endDateColumnId: update.calendarConfig.endDateColumnId }
              : {}),
            ...(update.calendarConfig.allDayColumnId !== undefined
              ? { allDayColumnId: update.calendarConfig.allDayColumnId }
              : {}),
            ...(update.calendarConfig.typeColumnId !== undefined
              ? { typeColumnId: update.calendarConfig.typeColumnId }
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
    ...(update.cardLayout !== undefined
      ? { cardLayout: update.cardLayout }
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
    fields: dictionarySchema(z.unknown())
  }).strict();
  const updateRecordSchema = z.object({
    id: positiveIdSchema,
    fields: dictionarySchema(z.unknown())
  }).strict();
  const columnSpecSchema = z.object({
    id: columnIdSchema,
    fields: columnCreationFieldsSchema.optional()
  }).strict();
  const columnUpdateSchema = z.object({
    id: columnIdSchema,
    fields: columnMutationFieldsSchema
  }).strict();
  const tableSpecSchema = z.object({
    id: tableIdSchema,
    columns: boundedArray(columnSpecSchema, limits.maxSchemaItems)
  }).strict();
  const tableSeedSchema=z.object({
    id:tableIdSchema,
    columns:boundedArray(z.object({
      id:columnIdSchema,
      fields:z.object({type:z.union([
        z.enum(["Text","Numeric","Int","Bool","Date","Choice","ChoiceList"]),
        z.string().regex(/^(?:Ref|RefList):[A-Za-z][A-Za-z0-9_]*$/)
      ])}).strict()
    }).strict(),limits.maxSchemaItems)
  }).strict();
  const tableUpdateSchema = z.object({
    id: tableIdSchema,
    fields: tableMutationFieldsSchema
  }).strict();
  const documentNameSchema = z.string().trim().min(1).max(200);
  const documentUpdateSchema = z
    .object({
      name: documentNameSchema.optional(),
      type: z.enum(["normal", "template", "tutorial"]).optional(),
      timezone: z.enum(DOCUMENT_TIMEZONE_CHOICES).optional(),
      locale: z.enum(DOCUMENT_LOCALE_CHOICES).optional()
    })
    .strict()
    .refine(
      (value) => value.timezone !== undefined || value.locale !== undefined
        ? value.name === undefined && value.type === undefined &&
          !(value.timezone !== undefined && value.locale !== undefined)
        : value.name !== undefined || value.type !== undefined,
      "Supply locale or timezone separately, or name/type metadata."
    );

  server.registerTool(
    "grist_discover",
    {
      ...getLeanToolMetadata("grist_discover"),
      inputSchema: z.discriminatedUnion("action", [
        z.object({ action: z.literal("workspaces") }).strict(),
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
          case "workspaces":
            return textResult(await grist.listWorkspaces());
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
          .strict(),
        z
          .object({
            action: z.literal("access_rules"),
            documentId: documentIdSchema,
            schemaImpact: accessRuleSchemaIdentity.optional(),
            simulation: accessRuleSimulationSchema.optional(),
            policyCoverage: accessPolicyCoverageSchema.optional()
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
          case "access_rules":
            return textResult(await grist.inspectAccessRules(
              input.documentId, input.schemaImpact, input.simulation, input.policyCoverage
            ));
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
          filter: dictionarySchema(z.array(z.unknown())).optional(),
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
      inputSchema: z.union([
        z.object({
          documentId: documentIdSchema,
          tableId: tableIdSchema,
          records: boundedArray(newRecordSchema, limits.maxWriteRecords)
        }).strict(),
        z.object({
          action: z.literal("ensure_record"),
          documentId: documentIdSchema,
          tableId: tableIdSchema,
          keyColumnId: columnIdSchema,
          record: newRecordSchema
        }).strict()
      ])
    },
    async (input) => {
      try {
        if ("action" in input) {
          return textResult(await grist.ensureRecord(
            input.documentId, input.tableId, input.keyColumnId, input.record
          ));
        }
        return textResult(await grist.createRecords(
          input.documentId, input.tableId, input.records
        ));
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
            action: z.literal("create_document"),
            workspaceId: positiveIdSchema,
            name: documentNameSchema
          })
          .strict(),
        z
          .object({
            action: z.literal("copy_document_as_template"),
            sourceDocumentId: documentIdSchema,
            workspaceId: positiveIdSchema,
            name: documentNameSchema
          })
          .strict(),
        z
          .object({
            action: z.literal("copy_document"),
            sourceDocumentId: documentIdSchema,
            workspaceId: positiveIdSchema,
            name: documentNameSchema
          })
          .strict(),
        z
          .object({
            action: z.literal("create_tables"),
            documentId: documentIdSchema,
            tables: boundedArray(tableSpecSchema, limits.maxSchemaItems)
          })
          .strict(),
        z
          .object({
            action: z.literal("ensure_tables"),
            documentId: documentIdSchema,
            tables: boundedArray(tableSeedSchema,limits.maxSchemaItems)
          }).strict(),
        z
          .object({
            action: z.literal("ensure_columns"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            columns: boundedArray(z.object({
              id: columnIdSchema,
              fields: z.object({type: z.union([
                z.enum(["Text","Numeric","Int","Bool","Date","Choice","ChoiceList"]),
                z.enum(["DateTime:UTC","DateTime:Europe/Paris"]),
                z.string().regex(/^(?:Ref|RefList):[A-Za-z][A-Za-z0-9_]*$/)
              ])}).strict()
            }).strict(),limits.maxSchemaItems)
          }).strict(),
        z.object({
            action: z.literal("create_columns"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            columns: z.union([boundedArray(columnSpecSchema, limits.maxSchemaItems),
              boundedArray(configuredColumnSchema, limits.maxSchemaItems)])
          })
          .strict()
      ])
    },
    async (input) => {
      try {
        switch (input.action) {
          case "create_document":
            return textResult(
              await grist.createDocument(input.workspaceId, input.name)
            );
          case "copy_document_as_template":
            return textResult(
              await grist.copyDocumentAsTemplate(
                input.sourceDocumentId,
                input.workspaceId,
                input.name
              )
            );
          case "copy_document":
            return textResult(
              await grist.copyDocument(
                input.sourceDocumentId,
                input.workspaceId,
                input.name
              )
            );
          case "create_tables":
            return textResult(
              await grist.createTables(input.documentId, input.tables)
            );
          case "ensure_tables":
            return textResult(await grist.ensureTables(input.documentId,input.tables));
          case "ensure_columns":
            return textResult(await grist.ensureColumns(
              input.documentId,input.tableId,input.columns
            ));
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
            action: z.literal("update_document"),
            documentId: documentIdSchema,
            update: documentUpdateSchema
          })
          .strict(),
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
            action: z.literal("append_choice_options"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            columnId: columnIdSchema,
            values: z.array(z.string().min(1).max(120)
              .refine(value => value.trim() === value &&
                !/[\u0000-\u001f\u007f]/.test(value), "Plain bounded labels only."))
              .min(1).max(64)
              .refine(values => new Set(values).size === values.length, "Choice labels must be unique.")
          }).strict(),
        z
          .object({
            action: z.literal("set_choice_colors"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            columnId: columnIdSchema,
            label: z.string().min(1).max(120),
            colors: z.object({
              fillColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
              textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
            }).strict().refine(value => Object.keys(value).length > 0, "At least one color required.")
          }).strict(),
        z
          .object({
            action: z.literal("update_dropdown_condition"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            columnId: columnIdSchema,
            condition: dropdownConditionSchema.nullable()
          })
          .strict(),
        z
          .object({
            action: z.literal("style_rules"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            columnId: columnIdSchema,
            conditionFormula: z.string().min(1).max(4096),
            style: z.object({
              fillColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
              textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
            }).strict().refine(value => Object.keys(value).length > 0, "Supply at least one color.")
          })
          .strict(),
        z
          .object({
            action: z.literal("replace_style_formula"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            columnId: columnIdSchema,
            previousFormula: z.string().min(1).max(4096),
            conditionFormula: z.string().min(1).max(4096)
          })
          .strict(),
        z
          .object({
            action: z.literal("append_style_rule"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            columnId: columnIdSchema,
            conditionFormula: z.string().min(1).max(4096),
            style: z.object({
              fillColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
              textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
            }).strict().refine(value => Object.keys(value).length > 0, "Supply at least one color.")
          })
          .strict(),
        z
          .object({
            action: z.literal("append_row_style_rule"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            conditionFormula: z.string().min(1).max(4096),
            style: z.object({
              fillColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
              textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
            }).strict().refine(value => Object.keys(value).length > 0, "Supply at least one color.")
          })
          .strict(),
        z
          .object({
            action: z.literal("reorder_column_style_rules"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            columnId: columnIdSchema,
            orderedFormulas: z.array(z.string().min(1).max(4096)).min(2).max(8)
              .refine(value => new Set(value).size === value.length,
                "Column-style formulas must be unique.")
          })
          .strict(),
        z.object({
          action: z.literal("remove_column_style_rule"),
          documentId: documentIdSchema,
          tableId: tableIdSchema,
          columnId: columnIdSchema,
          conditionFormula: z.string().min(1).max(4096),
          confirmRemoveRule: z.literal(true)
        }).strict(),
        z.object({
          action: z.literal("remove_row_style_rule"),
          documentId: documentIdSchema,
          tableId: tableIdSchema,
          conditionFormula: z.string().min(1).max(4096),
          confirmRemoveRule: z.literal(true)
        }).strict(),
        z
          .object({
            action: z.literal("reorder_row_style_rules"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            orderedFormulas: z.array(z.string().min(1).max(4096)).min(2).max(8)
              .refine(value => new Set(value).size === value.length,
                "Row-style formulas must be unique.")
          })
          .strict(),
        z
          .object({
            action: z.literal("update_row_style_rule"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            conditionFormula: z.string().min(1).max(4096),
            style: z.object({
              fillColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
              textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
            }).strict().refine(value => Object.keys(value).length > 0, "Supply at least one color.")
          })
          .strict(),
        z
          .object({
            action: z.literal("replace_row_style_formula"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            previousFormula: z.string().min(1).max(4096),
            conditionFormula: z.string().min(1).max(4096)
          })
          .strict(),
        z
          .object({
            action: z.literal("change_document_user_role"),
            documentId: documentIdSchema,
            email: z.string().min(6).max(280),
            expectedRole: z.enum(["viewers", "editors"]),
            role: z.enum(["viewers", "editors"]),
            confirmRoleChange: z.literal(true)
          })
          .strict(),
        z
          .object({
            action: z.literal("revoke_document_user"),
            documentId: documentIdSchema,
            email: z.string().min(6).max(280),
            expectedRole: z.enum(["viewers", "editors"]),
            confirmRevocation: z.literal(true)
          })
          .strict(),
        z
          .object({
            action: z.literal("update_form_column_options"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            columnId: columnIdSchema,
            update: z.object({
              question: z.string().trim().min(1).max(300).nullable().optional(),
              required: z.boolean().optional(),
              acceptFromUrl: z.boolean().optional()
            }).strict().refine(value => Object.values(value).some(item => item !== undefined),
              "At least one Form option is required.")
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
          .strict(),
        z
          .object({
            action: z.literal("ensure_owner_schema_guard"),
            documentId: documentIdSchema,
            confirmSchemaRestriction: z.literal(true)
          })
          .strict(),
        z
          .object({
            action: z.literal("grant_document_user"),
            documentId: documentIdSchema,
            email: z.string().max(254),
            role: z.enum(["viewers", "editors"])
          })
          .strict(),
        z
          .object({
            action: z.literal("access_rule_group"),
            documentId: documentIdSchema,
            mode: z.enum(["create", "replace", "delete"]),
            target: z.union([accessRuleTargetSchema, accessUserAttributeTargetSchema]),
            rules: z.array(accessRuleSchema).min(1).max(MAX_ACCESS_RULES_PER_GROUP).optional(),
            definition: accessUserAttributeDefinitionSchema.optional()
          })
          .strict()
      ])
    },
    async (input) => {
      try {
        switch (input.action) {
          case "update_document":
            return textResult(
              await grist.updateDocument(input.documentId, {
                ...(input.update.name !== undefined
                  ? { name: input.update.name }
                  : {}),
                ...(input.update.type !== undefined
                  ? { type: input.update.type }
                  : {}),
                ...(input.update.timezone !== undefined
                  ? { timezone: input.update.timezone }
                  : {}),
                ...(input.update.locale !== undefined
                  ? { locale: input.update.locale }
                  : {})
              })
            );
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
          case "append_choice_options":
            return textResult(await grist.appendChoiceOptions(
              input.documentId, input.tableId, input.columnId, input.values
            ));
          case "set_choice_colors":
            return textResult(await grist.setChoiceColors(
              input.documentId, input.tableId, input.columnId, input.label, input.colors
            ));
          case "update_dropdown_condition":
            return textResult(await grist.updateDropdownCondition(
              input.documentId, input.tableId, input.columnId, input.condition
            ));
          case "style_rules":
            return textResult(await grist.changeColumnStyleRule(
              input.documentId, input.tableId, input.columnId, {
                conditionFormula: input.conditionFormula, style: input.style
              }
            ));
          case "replace_style_formula":
            return textResult(await grist.replaceColumnStyleFormula(
              input.documentId, input.tableId, input.columnId,
              input.previousFormula, input.conditionFormula
            ));
          case "append_style_rule":
            return textResult(await grist.appendColumnStyleRule(
              input.documentId, input.tableId, input.columnId, {
                conditionFormula: input.conditionFormula, style: input.style
              }
            ));
          case "append_row_style_rule":
            return textResult(await grist.appendRowStyleRule(
              input.documentId, input.tableId, {
                conditionFormula: input.conditionFormula, style: input.style
              }
            ));
          case "reorder_column_style_rules":
            return textResult(await grist.reorderColumnStyleRules(
              input.documentId, input.tableId, input.columnId, input.orderedFormulas
            ));
          case "remove_column_style_rule":
            return textResult(await grist.removeColumnStyleRule(
              input.documentId, input.tableId, input.columnId,
              input.conditionFormula, input.confirmRemoveRule
            ));
          case "remove_row_style_rule":
            return textResult(await grist.removeRowStyleRule(
              input.documentId, input.tableId, input.conditionFormula, input.confirmRemoveRule
            ));
          case "reorder_row_style_rules":
            return textResult(await grist.reorderRowStyleRules(
              input.documentId, input.tableId, input.orderedFormulas
            ));
          case "update_row_style_rule":
            return textResult(await grist.updateRowStyleRule(
              input.documentId, input.tableId, {
                conditionFormula: input.conditionFormula, style: input.style
              }
            ));
          case "replace_row_style_formula":
            return textResult(await grist.replaceRowStyleFormula(
              input.documentId, input.tableId,
              input.previousFormula, input.conditionFormula
            ));
          case "update_form_column_options":
            return textResult(await grist.updateFormColumnOptions(
              input.documentId, input.tableId, input.columnId, input.update
            ));
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
          case "ensure_owner_schema_guard":
            return textResult(await grist.ensureOwnerSchemaGuard(
              input.documentId, input.confirmSchemaRestriction
            ));
          case "change_document_user_role":
            return textResult(await grist.changeDocumentUserRole(
              input.documentId, input.email, input.expectedRole, input.role, input.confirmRoleChange
            ));
          case "revoke_document_user":
            return textResult(await grist.revokeDocumentUser(
              input.documentId, input.email, input.expectedRole, input.confirmRevocation
            ));
          case "grant_document_user":
            return textResult(await grist.grantDocumentUser(
              input.documentId, input.email, input.role
            ));
          case "access_rule_group":
            return textResult(
              await grist.changeAccessRuleGroup(
                input.documentId,
                input.target,
                input.mode,
                input.rules,
                input.definition
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
            action: z.literal("ensure_page"),
            documentId: documentIdSchema,
            tableId: tableIdSchema,
            name: z.string().trim().min(1).max(128)
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
          .strict(),
        z.object({
          action: z.literal("ensure_widget"),
          documentId: documentIdSchema,
          pageId: positiveIdSchema,
          tableId: tableIdSchema,
          type: z.enum(NATIVE_WIDGET_TYPES)
        }).strict(),
        z.object({
          action: z.literal("add_widgets"),
          documentId: documentIdSchema,
          pageId: positiveIdSchema,
          widgets: z.array(z.object({
            tableId: tableIdSchema,
            type: z.enum(NATIVE_WIDGET_TYPES)
          }).strict()).min(2).max(8)
        }).strict()
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
          case "ensure_page":
            return textResult(await grist.ensurePage(
              input.documentId, input.tableId, input.name
            ));
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
          case "ensure_widget":
            return textResult(await grist.ensurePageWidget(
              input.documentId, input.pageId, input.tableId, input.type
            ));
          case "add_widgets":
            return textResult(await grist.addPageWidgets(
              input.documentId, input.pageId, input.widgets
            ));
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
            action: z.literal("reorder_pages"),
            documentId: documentIdSchema,
            pageIds: z
              .array(positiveIdSchema)
              .min(1)
              .max(MAX_PAGE_ORDER_PAGES)
              .refine(
                (ids) => new Set(ids).size === ids.length,
                "Page IDs must be unique."
              )
          })
          .strict(),
        z.object({
          action: z.literal("nest_page"),
          documentId: documentIdSchema,
          pageId: positiveIdSchema,
          parentPageId: positiveIdSchema
        }).strict(),
        z.object({
          action: z.literal("unnest_page"),
          documentId: documentIdSchema,
          pageId: positiveIdSchema
        }).strict(),
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
            action: z.literal("update_form_layout"),
            documentId: documentIdSchema,
            pageId: positiveIdSchema,
            widgetId: positiveIdSchema,
            layout: formLayoutUpdateSchema
          })
          .strict(),
        z
          .object({
            action: z.literal("publish_form"),
            documentId: documentIdSchema,
            pageId: positiveIdSchema,
            widgetId: positiveIdSchema,
            confirmPublic: z.literal(true)
          })
          .strict(),
        z
          .object({
            action: z.literal("unpublish_form"),
            documentId: documentIdSchema,
            pageId: positiveIdSchema,
            widgetId: positiveIdSchema,
            confirmUnpublish: z.literal(true)
          })
          .strict(),
        z
          .object({
            action: z.literal("update_form_field_options"),
            documentId: documentIdSchema,
            pageId: positiveIdSchema,
            widgetId: positiveIdSchema,
            columnId: columnIdSchema,
            update: z.object({
              question: z.string().trim().min(1).max(300).nullable().optional(),
              required: z.boolean().optional(),
              acceptFromUrl: z.boolean().optional()
            }).strict().refine(value => Object.values(value).some(item => item !== undefined),
              "At least one Form field option is required.")
          })
          .strict(),
        z
          .object({
            action: z.literal("install_trusted_widget"),
            documentId: documentIdSchema,
            pageId: positiveIdSchema,
            widgetId: positiveIdSchema,
            trustedKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
            confirmExternalWidget: z.literal(true)
          })
          .strict(),
        z.object({
          action: z.literal("update_trusted_widget_revision"),
          documentId: documentIdSchema,
          pageId: positiveIdSchema,
          widgetId: positiveIdSchema,
          previousTrustedKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
          trustedKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
          confirmExternalWidget: z.literal(true)
        }).strict(),
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
          case "reorder_pages":
            return textResult(
              await grist.reorderPages(input.documentId, input.pageIds)
            );
          case "nest_page":
            return textResult(await grist.nestPage(
              input.documentId, input.pageId, input.parentPageId
            ));
          case "unnest_page":
            return textResult(await grist.unnestPage(
              input.documentId, input.pageId
            ));
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
          case "update_form_layout":
            return textResult(await grist.updateFormLayout(
              input.documentId, input.pageId, input.widgetId, input.layout
            ));
          case "publish_form":
            return textResult(await grist.publishForm(
              input.documentId, input.pageId, input.widgetId, input.confirmPublic
            ));
          case "unpublish_form":
            return textResult(await grist.unpublishForm(
              input.documentId, input.pageId, input.widgetId, input.confirmUnpublish
            ));
          case "update_form_field_options":
            return textResult(await grist.updateFormFieldOptions(
              input.documentId, input.pageId, input.widgetId,
              input.columnId, input.update
            ));
          case "install_trusted_widget":
            return textResult(await grist.installTrustedWidget(
              input.documentId, input.pageId, input.widgetId,
              input.trustedKey, input.confirmExternalWidget
            ));
          case "update_trusted_widget_revision":
            return textResult(await grist.updateTrustedWidgetRevision(
              input.documentId, input.pageId, input.widgetId,
              input.previousTrustedKey, input.trustedKey, input.confirmExternalWidget
            ));
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
        return textResult(leanToolHelp(tools, limits));
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
