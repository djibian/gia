import type { GristCapability } from "../auth/principal.js";

const OPERATION_CAPABILITIES = new Map<string, GristCapability>([
  ["list_documents", "doc:read"],
  ["list_workspaces", "doc:read"],
  ["list_tables", "doc:read"],
  ["list_columns", "doc:read"],
  ["query_records", "doc:read"],
  ["create_records", "doc:write"],
  ["update_records", "doc:write"],
  ["delete_records", "doc:write"],
  ["create_document", "doc.schema:write"],
  ["update_document", "doc.schema:write"],
  ["copy_document_as_template", "doc.schema:write"],
  ["create_tables", "doc.schema:write"],
  ["update_tables", "doc.schema:write"],
  ["delete_table", "doc.schema:write"],
  ["create_columns", "doc.schema:write"],
  ["update_columns", "doc.schema:write"],
  ["rename_column", "doc.schema:write"],
  ["change_access_rule_group", "doc.schema:write"],
  ["delete_columns", "doc.schema:write"],
  ["inspect_access_rules", "doc:read"],
  ["inspect_document", "doc:read"],
  ["get_pages", "doc:read"],
  ["get_page_widgets", "doc:read"],
  ["create_page", "doc.schema:write"],
  ["add_page_widget", "doc.schema:write"],
  ["rename_page", "doc.schema:write"],
  ["reorder_pages", "doc.schema:write"],
  ["update_page_layout", "doc.schema:write"],
  ["update_page_widget", "doc.schema:write"],
  ["delete_page", "doc.schema:write"],
  ["delete_page_widget", "doc.schema:write"],
]);

export function getOperation(name: string): { name: string; capability: GristCapability } {
  const capability = OPERATION_CAPABILITIES.get(name);
  if (!capability) throw new Error(`Unknown operation "${name}".`);
  return { name, capability };
}

export function getRequiredCapability(name: string): GristCapability {
  return getOperation(name).capability;
}
