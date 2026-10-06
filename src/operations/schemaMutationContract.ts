import * as z from "zod/v4";

/**
 * Stable model-facing table metadata that the bridge intentionally supports.
 * Internal Grist metadata fields remain server-side implementation details.
 */
export const tableMutationFieldsSchema = z
  .object({
    tableId: z.string().min(1).optional(),
    onDemand: z.boolean().optional()
  })
  .strict();

/**
 * Stable model-facing column metadata mirrored by public schema inspection.
 * Numeric engine references such as visibleCol/displayCol remain private.
 * visibleColumnId is the stable semantic replacement resolved server-side.
 */
export const columnMutationFieldsSchema = z
  .object({
    label: z.string().optional(),
    type: z.string().optional(),
    isFormula: z.boolean().optional(),
    formula: z.string().optional(),
    description: z.string().optional(),
    widgetOptions: z.string().optional(),
    visibleColumnId: z.string().trim().min(1).optional()
  })
  .strict();
