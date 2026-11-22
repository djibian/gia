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
  ["copy_document", "doc.schema:write"],
  ["create_tables", "doc.schema:write"],
  ["update_tables", "doc.schema:write"],
  ["delete_table", "doc.schema:write"],
  ["create_columns", "doc.schema:write"],
  ["update_columns", "doc.schema:write"],
  ["update_form_column_options", "doc.schema:write"],
  ["update_dropdown_condition", "doc.schema:write"],
  ["style_rules", "doc.schema:write"],
  ["append_style_rule", "doc.schema:write"],
  ["append_row_style_rule", "doc.schema:write"],
  ["update_row_style_rule", "doc.schema:write"],
  ["reorder_row_style_rules", "doc.schema:write"],
  ["reorder_column_style_rules", "doc.schema:write"],
  ["replace_row_style_formula", "doc.schema:write"],
  ["replace_style_formula", "doc.schema:write"],
  ["grant_document_user", "doc.schema:write"],
  ["revoke_document_user", "doc.schema:write"],
  ["change_document_user_role", "doc.schema:write"],
  ["rename_column", "doc.schema:write"],
  ["change_access_rule_group", "doc.schema:write"],
  ["ensure_owner_schema_guard", "doc.schema:write"],
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
  ["update_form_layout", "doc.schema:write"],
  ["publish_form", "doc.schema:write"],
  ["unpublish_form", "doc.schema:write"],
  ["update_page_widget", "doc.schema:write"],
  ["install_trusted_widget", "doc.schema:write"],
  ["update_trusted_widget_revision", "doc.schema:write"],
  ["update_form_field_options", "doc.schema:write"],
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
