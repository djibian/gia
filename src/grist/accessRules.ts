type JsonRecord = Record<string, unknown>;

export const MAX_ACCESS_RULES_PER_GROUP = 20;
export const MAX_ACCESS_RULE_COLUMNS = 50;
export const MAX_ACCESS_RULE_LINK_KEY_NAME_LENGTH = 100;
export const MAX_ACCESS_RULE_CONDITION_NODES = 20;
export const MAX_ACCESS_RULE_CONDITION_DEPTH = 4;
export const MAX_ACCESS_RULE_CONDITION_WIDTH = 6;
export const MAX_ACCESS_RULE_FORMULA_LENGTH = 2048;
const MAX_NATIVE_ACL_AST_LENGTH = 65536;

export const ACCESS_RULE_USER_PROPERTIES = [
  "Email",
  "UserID",
  "Name",
  "UserRef",
  "Origin",
  "IsLoggedIn"
] as const;

export const ACCESS_USER_ATTRIBUTE_PROPERTIES = [
  ...ACCESS_RULE_USER_PROPERTIES, "Access", "SessionID"
] as const;

export type AccessRuleUserProperty = (typeof ACCESS_RULE_USER_PROPERTIES)[number];
export type AccessRuleOperator = "equals" | "not_equals";
export type AccessRuleRole = "owner" | "editor" | "viewer";
export type AccessPermissionValue = "allow" | "deny" | "unspecified";

export type AccessRuleCondition =
  | { kind: "everyone" }
  | {
      kind: "user_access";
      operator: AccessRuleOperator;
      role: AccessRuleRole;
    }
  | {
      kind: "user_access_membership";
      operator: "in" | "not_in";
      roles: AccessRuleRole[];
    }
  | {
      kind: "user_login_status";
      operator: AccessRuleOperator;
      value: boolean;
    }
  | {
      kind: "user_attribute_flag";
      attributeName: string;
      attributeColumnId: string;
    }
  | {
      kind: "record_in_user_attribute_ref_list";
      operator: "in" | "not_in";
      columnId: string;
      attributeName: string;
      attributeColumnId: string;
      record?: "newRec" | undefined;
    }
  | {
      kind: "match_user";
      operator: AccessRuleOperator;
      columnId: string;
      userProperty: AccessRuleUserProperty;
      record?: "newRec" | undefined;
    }
  | {
      kind: "match_link_key";
      operator: AccessRuleOperator;
      columnId: string;
      linkKeyName: string;
      record?: "newRec" | undefined;
    }
  | {
      kind: "match_user_attribute";
      operator: AccessRuleOperator;
      columnId: string;
      attributeName: string;
      attributeColumnId: string;
      record?: "newRec" | undefined;
    }
  | {
      kind: "match_boolean";
      operator: AccessRuleOperator;
      columnId: string;
      value: boolean;
      record?: "newRec" | undefined;
    }
  | {
      kind: "match_integer_flag";
      operator: AccessRuleOperator;
      columnId: string;
      value: 0 | 1;
      record?: "newRec" | undefined;
    }
  | {
      kind: "match_empty_text";
      operator: AccessRuleOperator;
      columnId: string;
      record?: "newRec" | undefined;
    }
  | {
      kind: "column_change";
      operator: AccessRuleOperator;
      columnId: string;
    }
  | { kind: "all"; conditions: AccessRuleCondition[] }
  | { kind: "any"; conditions: AccessRuleCondition[] }
  | { kind: "not"; condition: AccessRuleCondition };

export interface AccessRulePermissions {
  read: AccessPermissionValue;
  update: AccessPermissionValue;
  create?: AccessPermissionValue | undefined;
  delete?: AccessPermissionValue | undefined;
}

export interface ResolvedAccessRulePermissions {
  read: AccessPermissionValue;
  update: AccessPermissionValue;
  create: AccessPermissionValue;
  delete: AccessPermissionValue;
}

export const ACCESS_POLICY_OPERATIONS = ["read", "create", "update", "delete"] as const;
export interface AccessPolicyCoverageRequest {
  target: AccessRuleSchemaImpactTarget;
  operation: (typeof ACCESS_POLICY_OPERATIONS)[number];
  context?: AccessRuleSyntheticContext | undefined;
}

export interface AccessRuleInput {
  condition: AccessRuleCondition;
  permissions: AccessRulePermissions;
}

export interface AccessRuleTarget {
  tableId: string;
  columnIds?: readonly string[] | undefined;
}

export type AccessRuleSchemaImpactTarget =
  | { kind: "table"; tableId: string }
  | { kind: "column"; tableId: string; columnId: string };

/** Closed invented values, never real cell values, LinkKeys or identifiers. */
export type AccessRuleSyntheticValue =
  | { kind: "symbol"; symbol: "A" | "B" | "C" | "D" }
  | { kind: "boolean"; value: boolean }
  | { kind: "flag"; value: 0 | 1 }
  | { kind: "empty_text" };

export interface AccessRuleSyntheticField {
  name: string;
  value: AccessRuleSyntheticValue;
}

export interface AccessRuleSyntheticContext {
  role?: AccessRuleRole | undefined;
  user?: readonly AccessRuleSyntheticField[] | undefined;
  rec?: readonly AccessRuleSyntheticField[] | undefined;
  newRec?: readonly AccessRuleSyntheticField[] | undefined;
  linkKeys?: readonly AccessRuleSyntheticField[] | undefined;
  userAttributes?: readonly { name: string; fields: readonly AccessRuleSyntheticField[] }[] | undefined;
}

export interface AccessRuleSimulationRequest {
  target: AccessRuleTarget;
  context: AccessRuleSyntheticContext;
}

/** Closed structural mutation of a native Grist user-attribute definition. */
export interface AccessUserAttributeTarget {
  userAttributeName: string;
}
export interface AccessUserAttributeDefinitionInput {
  tableId: string;
  lookupColId: string;
  source:
    | { kind: "user_property"; property: (typeof ACCESS_USER_ATTRIBUTE_PROPERTIES)[number] }
    | { kind: "link_key"; name: string };
}
export interface AccessUserAttributeMutationPlan {
  mode: "create" | "replace" | "delete" | "noop";
  requestedMode: "create" | "replace" | "delete";
  name: string;
  targetRuleId?: number;
  defaultResourceId?: number;
  createDefaultResource: boolean;
  rulePos: number;
  /** Server-generated trusted native JSON, never supplied as arbitrary text by MCP. */
  nativeDefinition?: string;
}

export interface ResolvedAccessRuleTarget {
  tableId: string;
  columnIds: readonly string[];
}

interface MetadataRecord {
  id: number;
  fields: JsonRecord;
}

interface PersistedResource extends MetadataRecord {
  tableId: string;
  colIds: string;
}

interface PersistedRule extends MetadataRecord {
  resourceId: number;
  aclFormula: string;
  aclFormulaParsed: string;
  permissionsText: string;
  rulePos?: number;
}

interface TableColumn {
  id: string;
  type: string;
}

interface TableInfo {
  id: string;
  recordId: number;
  columns: Map<string, TableColumn>;
}

interface UserAttributeReferenceContext {
  readonly tables: Map<string, TableInfo>;
  readonly names: ReadonlyMap<string, string>;
}

export interface NormalizedAccessRule {
  condition: AccessRuleCondition;
  permissions: ResolvedAccessRulePermissions;
}

interface AccessRuleGroupState {
  target: ResolvedAccessRuleTarget;
  resourceRecordId: number;
  ruleRecordIds: number[];
  normalizedRules?: NormalizedAccessRule[];
  unsupportedReason?: string;
}

export interface AccessRulesSnapshot {
  resources: PersistedResource[];
  rules: PersistedRule[];
  tables: Map<string, TableInfo>;
  groups: AccessRuleGroupState[];
  protectedPersistedGroupCount: number;
}

export type AccessRuleMutationMode = "create" | "replace" | "delete" | "noop";
export type AccessRuleMutationIntent = "create" | "ensure" | "replace" | "delete";

export interface AccessRulePersistedWrite {
  aclFormula: string;
  permissionsText: string;
  rulePos: number;
}

export class AccessRuleWriteVerificationError extends Error {
  constructor(message: string) {
    super(
      `${message} The access-rule write may already have succeeded; do not retry the whole operation blindly.`
    );
    this.name = "AccessRuleWriteVerificationError";
  }
}

export interface AccessRuleMutationPlan {
  mode: AccessRuleMutationMode;
  requestedMode: Exclude<AccessRuleMutationMode, "noop">;
  target: ResolvedAccessRuleTarget;
  resourceRecordId?: number;
  ruleRecordIds: number[];
  rules: AccessRulePersistedWrite[];
  normalizedRules: NormalizedAccessRule[];
  untargetedFingerprint: string;
}

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ROLE_NATIVE: Record<AccessRuleRole, string> = {
  owner: "OWNER",
  editor: "EDITOR",
  viewer: "VIEWER"
};
const NATIVE_ROLE = new Map(Object.entries(ROLE_NATIVE).map(([key, value]) => [value, key as AccessRuleRole]));
const OP_NATIVE: Record<AccessRuleOperator, string> = {
  equals: "==",
  not_equals: "!="
};
const NATIVE_OP = new Map(Object.entries(OP_NATIVE).map(([key, value]) => [value, key as AccessRuleOperator]));
const ROLE_ORDER: AccessRuleRole[] = ["owner", "editor", "viewer"];

// A small closed set is the only supported membership operand. Sort so
// permutations normalize to the same model-visible policy.
function normalizeRoleMembers(input: unknown): AccessRuleRole[] | undefined {
  if (!Array.isArray(input) || input.length < 2 || input.length > 3 ||
      new Set(input).size !== input.length ||
      input.some((value) => typeof value !== "string" || !ROLE_ORDER.includes(value as AccessRuleRole))) {
    return undefined;
  }
  return ROLE_ORDER.filter((role) => input.includes(role));
}
const TABLE_PERMISSION_BITS = ["C", "R", "U", "D"] as const;
const COLUMN_PERMISSION_BITS = ["R", "U"] as const;

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

function metadataRecords(response: unknown, label: string): MetadataRecord[] {
  const root = record(response);
  if (!root || !Array.isArray(root.records)) {
    throw new Error(`Grist ${label} metadata is unavailable or censored.`);
  }
  const seenIds = new Set<number>();
  return root.records.map((entry) => {
    const item = record(entry);
    const id = positiveInteger(item?.id);
    const fields = record(item?.fields);
    if (!id || !fields || seenIds.has(id)) {
      throw new Error(`Grist ${label} metadata is malformed or censored.`);
    }
    seenIds.add(id);
    return { id, fields };
  });
}

function requiredString(fields: JsonRecord, key: string, label: string): string {
  const value = fields[key];
  if (typeof value !== "string") {
    throw new Error(`Grist ${label} metadata is incomplete or censored: ${key} is unavailable.`);
  }
  return value;
}

/**
 * Grist may persist a native user-attribute definition with SQL NULL for both
 * aclFormula and permissionsText. Only the unique default (*, *) resource may
 * use this representation. Keep the original field values for preservation
 * fingerprints; the empty strings below are for semantic inspection only.
 *
 * Never apply this normalization to ordinary permission rules or to missing,
 * malformed or partially populated ACL metadata.
 */
function isNativeNullUserAttributeRule(
  fields: JsonRecord,
  resourceId: number,
  defaultResourceId: number | undefined
): boolean {
  if (defaultResourceId === undefined || resourceId !== defaultResourceId ||
      fields.aclFormula !== null || fields.permissionsText !== null ||
      fields.aclFormulaParsed !== "" ||
      typeof fields.rulePos !== "number" || !Number.isFinite(fields.rulePos) ||
      fields.rulePos <= 0 ||
      typeof fields.userAttributes !== "string" ||
      fields.userAttributes.length === 0 || fields.userAttributes.length > 4096) {
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fields.userAttributes);
  } catch {
    return false;
  }
  const definition = record(parsed);
  return Boolean(definition &&
    Object.keys(definition).every((key) =>
      ["name", "tableId", "lookupColId", "charId"].includes(key)) &&
    ["name", "tableId", "lookupColId", "charId"].every((key) =>
      typeof definition[key] === "string"));
}

function canonicalColumnIds(columnIds: readonly string[]): string[] {
  if (columnIds.length === 0) throw new Error("Access-rule columnIds must not be empty.");
  if (columnIds.length > MAX_ACCESS_RULE_COLUMNS) {
    throw new Error(`Access-rule groups support at most ${MAX_ACCESS_RULE_COLUMNS} target columns.`);
  }
  const normalized = columnIds.map((value) => value.trim());
  if (normalized.some((value) => !value)) {
    throw new Error("Access-rule column IDs must not be empty.");
  }
  const unique = new Set(normalized);
  if (unique.size !== normalized.length) {
    throw new Error("Access-rule column IDs must be unique.");
  }
  return [...unique].sort();
}

function normalizeResourceTarget(resource: PersistedResource): ResolvedAccessRuleTarget | null {
  const tableId = resource.tableId.trim();
  const colIds = resource.colIds.trim();
  if (!tableId || tableId.startsWith("*") || tableId.startsWith("_grist_")) return null;
  if (colIds === "*") return { tableId, columnIds: [] };
  if (!colIds) return null;
  return {
    tableId,
    columnIds: canonicalColumnIds(colIds.split(",").map((value) => value.trim()))
  };
}

function targetKey(target: ResolvedAccessRuleTarget): string {
  return `${target.tableId}\u0000${target.columnIds.length === 0 ? "*" : target.columnIds.join(",")}`;
}

function sameTarget(a: ResolvedAccessRuleTarget, b: ResolvedAccessRuleTarget): boolean {
  return targetKey(a) === targetKey(b);
}

function typeCompatibleWithUserProperty(type: string, userProperty: AccessRuleUserProperty): boolean {
  if (userProperty === "UserID") return type === "Int" || type === "Numeric";
  if (userProperty === "IsLoggedIn") return type === "Bool";
  return type === "Text";
}

function typeCompatibleWithLinkKey(type: string): boolean {
  return type === "Text" || type === "Any";
}

// Comparing the same column before and after a proposed update needs no literals
// and cannot expose a credential or arbitrary cell value in model-visible policy.
const COLUMN_CHANGE_TYPES = new Set(["Text", "Choice", "Int", "Numeric", "Bool"]);

function validLinkKeyName(value: string): boolean {
  return (
    value.length <= MAX_ACCESS_RULE_LINK_KEY_NAME_LENGTH &&
    SAFE_IDENTIFIER.test(value)
  );
}

// Only verified unambiguous native definitions may enter editable ACL formulas.
function userAttributeReferenceContext(snapshot: AccessRulesSnapshot): UserAttributeReferenceContext {
  const view = projectUserAttributes(snapshot);
  return {
    tables: snapshot.tables,
    names: new Map(view.protectedDefinitionCount === 0
      ? view.definitions.filter(d => d.editable).map(d => [d.name, d.tableId] as const)
      : [])
  };
}

// No opaque values or loose cross-type coercions; native Ref values are row IDs.
function comparableUserAttributeField(
  table: TableInfo,
  columnId: string,
  attributeName: string,
  attributeColumnId: string,
  context?: UserAttributeReferenceContext
): boolean {
  const lookupTableId = context?.names.get(attributeName);
  // A native record id is meaningful only within its own table.
  if (columnId === "id") return attributeColumnId === "id" && lookupTableId === table.id;
  const recordType = table.columns.get(columnId)?.type;
  if (!lookupTableId || !recordType) return false;
  if (attributeColumnId === "id") return recordType === `Ref:${lookupTableId}`;
  const attributeType = context?.tables.get(lookupTableId)?.columns.get(attributeColumnId)?.type;
  if (!attributeType) return false;
  if (["Text", "Choice"].includes(recordType) &&
      ["Text", "Choice"].includes(attributeType)) return true;
  if (recordType.startsWith("Ref:") || attributeType.startsWith("Ref:")) {
    return recordType.startsWith("Ref:") && recordType === attributeType;
  }
  return recordType === attributeType && ["Int", "Numeric", "Bool"].includes(recordType);
}

function userAttributeColumnType(
  attributeName: string,
  attributeColumnId: string,
  context?: UserAttributeReferenceContext
): string | undefined {
  if (!validLinkKeyName(attributeName) || !SAFE_IDENTIFIER.test(attributeColumnId)) return undefined;
  const sourceTable = context?.names.get(attributeName);
  return sourceTable ? context?.tables.get(sourceTable)?.columns.get(attributeColumnId)?.type : undefined;
}

function matchesUserAttributeRefList(
  table: TableInfo,
  columnId: string,
  attributeName: string,
  attributeColumnId: string,
  context?: UserAttributeReferenceContext
): boolean {
  if (!SAFE_IDENTIFIER.test(columnId)) return false;
  const target = columnId === "id" ? table.id : table.columns.get(columnId)?.type?.match(/^Ref:(.+)$/)?.[1];
  if (!target || !context?.tables.has(target)) return false;
  return userAttributeColumnType(attributeName, attributeColumnId, context) === "RefList:" + target;
}

function parseLeafCondition(
  formula: string,
  table: TableInfo,
  attributes?: UserAttributeReferenceContext
): AccessRuleCondition | undefined {
  if (formula === "") return { kind: "everyone" };

  const roleMatch = /^user\.Access (==|!=) (OWNER|EDITOR|VIEWER)$/.exec(formula);
  if (roleMatch) {
    const operator = NATIVE_OP.get(roleMatch[1]!);
    const role = NATIVE_ROLE.get(roleMatch[2]!);
    if (!operator || !role) return undefined;
    return { kind: "user_access", operator, role };
  }

  const rolesMatch = /^user\.Access (in|not in) \[((?:OWNER|EDITOR|VIEWER)(?:, (?:OWNER|EDITOR|VIEWER)){1,2})\]$/.exec(formula);
  if (rolesMatch) {
    const roles = normalizeRoleMembers(
      rolesMatch[2]!.split(", ").map((native) => NATIVE_ROLE.get(native))
    );
    if (!roles) return undefined;
    return {
      kind: "user_access_membership",
      operator: rolesMatch[1] === "in" ? "in" : "not_in",
      roles
    };
  }

  // This native boolean user property is non-secret and independent of row state.
  // Accept both equivalent operand orders, never arbitrary user properties.
  const loginMatch = /^user\.IsLoggedIn (==|!=) (True|False)$/.exec(formula);
  const reverseLoginMatch = /^(True|False) (==|!=) user\.IsLoggedIn$/.exec(formula);
  if (loginMatch || reverseLoginMatch) {
    const operator = NATIVE_OP.get(loginMatch ? loginMatch[1]! : reverseLoginMatch![2]!);
    if (!operator) return undefined;
    const literal = loginMatch ? loginMatch[2]! : reverseLoginMatch![1]!;
    return { kind: "user_login_status", operator, value: literal === "True" };
  }

  const flag = /^user\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(formula);
  if (flag && userAttributeColumnType(flag[1]!, flag[2]!, attributes) === "Bool") {
    return { kind: "user_attribute_flag", attributeName: flag[1]!, attributeColumnId: flag[2]! };
  }
  const member = /^(rec|newRec)\.([A-Za-z_][A-Za-z0-9_]*) (in|not in) user\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(formula);
  if (member && matchesUserAttributeRefList(table, member[2]!, member[4]!, member[5]!, attributes)) {
    return {
      kind: "record_in_user_attribute_ref_list", operator: member[3] === "in" ? "in" : "not_in",
      columnId: member[2]!, attributeName: member[4]!, attributeColumnId: member[5]!,
      ...(member[1] === "newRec" ? { record: "newRec" as const } : {})
    };
  }

  const userMatch = /^(rec|newRec)\.([A-Za-z_][A-Za-z0-9_]*) (==|!=) user\.(Email|UserID|Name|UserRef|Origin|IsLoggedIn)$/.exec(
    formula
  );
  if (userMatch) {
    const recordScope = userMatch[1]!;
    const columnId = userMatch[2]!;
    const operator = NATIVE_OP.get(userMatch[3]!);
    const userProperty = userMatch[4] as AccessRuleUserProperty;
    const column = table.columns.get(columnId);
    if (!operator || !column || !typeCompatibleWithUserProperty(column.type, userProperty)) {
      return undefined;
    }
    return {
      kind: "match_user", operator, columnId, userProperty,
      ...(recordScope === "newRec" ? { record: "newRec" as const } : {})
    };
  }

  // A native user attribute is a lookup row: user.<attribute>.<field> or .id.
  // Reverse operand order is normalized to the same closed condition.
  const attributeMatch =
    /^(rec|newRec)\.([A-Za-z_][A-Za-z0-9_]*) (==|!=) user\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(formula);
  const reverseAttributeMatch =
    /^user\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*) (==|!=) (rec|newRec)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(formula);
  // Native LinkKey.<name> is a distinct built-in branch, never a user attribute.
  if ((attributeMatch && attributeMatch[4] !== "LinkKey") ||
      (reverseAttributeMatch && reverseAttributeMatch[1] !== "LinkKey")) {
    const recordScope = attributeMatch ? attributeMatch[1]! : reverseAttributeMatch![4]!;
    const columnId = attributeMatch ? attributeMatch[2]! : reverseAttributeMatch![5]!;
    const operator = NATIVE_OP.get(attributeMatch ? attributeMatch[3]! : reverseAttributeMatch![3]!);
    const attributeName = attributeMatch ? attributeMatch[4]! : reverseAttributeMatch![1]!;
    const attributeColumnId = attributeMatch ? attributeMatch[5]! : reverseAttributeMatch![2]!;
    if (!operator || !validLinkKeyName(attributeName) ||
        !SAFE_IDENTIFIER.test(attributeColumnId) ||
        (columnId === "id" && recordScope !== "rec") ||
        !comparableUserAttributeField(table, columnId, attributeName, attributeColumnId, attributes)) {
      return undefined;
    }
    return {
      kind: "match_user_attribute", operator, columnId, attributeName, attributeColumnId,
      ...(recordScope === "newRec" ? { record: "newRec" as const } : {})
    };
  }

  const linkKeyMatch =
    /^(rec|newRec)\.([A-Za-z_][A-Za-z0-9_]*) (==|!=) user\.LinkKey\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(
      formula
    );
  const reverseLinkKeyMatch =
    /^user\.LinkKey\.([A-Za-z_][A-Za-z0-9_]*) (==|!=) (rec|newRec)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(
      formula
    );
  if (linkKeyMatch || reverseLinkKeyMatch) {
    const recordScope = linkKeyMatch ? linkKeyMatch[1]! : reverseLinkKeyMatch![3]!;
    const columnId = linkKeyMatch ? linkKeyMatch[2]! : reverseLinkKeyMatch![4]!;
    const operator = NATIVE_OP.get(
      linkKeyMatch ? linkKeyMatch[3]! : reverseLinkKeyMatch![2]!
    );
    const linkKeyName = linkKeyMatch ? linkKeyMatch[4]! : reverseLinkKeyMatch![1]!;
    const column = table.columns.get(columnId);
    if (
      !operator ||
      !column ||
      !validLinkKeyName(linkKeyName) ||
      !typeCompatibleWithLinkKey(column.type)
    ) {
      return undefined;
    }
    return {
      kind: "match_link_key", operator, columnId, linkKeyName,
      ...(recordScope === "newRec" ? { record: "newRec" as const } : {})
    };
  }

  // Boolean literals are the first non-secret literal subset. Match exact native
  // spellings and existing Bool columns; never parse arbitrary formula text.
  const boolMatch = /^(rec|newRec)\.([A-Za-z_][A-Za-z0-9_]*) (==|!=) (True|False)$/.exec(formula);
  const reverseBoolMatch = /^(True|False) (==|!=) (rec|newRec)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(formula);
  if (boolMatch || reverseBoolMatch) {
    const recordScope = boolMatch ? boolMatch[1]! : reverseBoolMatch![3]!;
    const columnId = boolMatch ? boolMatch[2]! : reverseBoolMatch![4]!;
    const operator = NATIVE_OP.get(boolMatch ? boolMatch[3]! : reverseBoolMatch![2]!);
    const literal = boolMatch ? boolMatch[4]! : reverseBoolMatch![1]!;
    if (!operator || table.columns.get(columnId)?.type !== "Bool") return undefined;
    return {
      kind: "match_boolean", operator, columnId, value: literal === "True",
      ...(recordScope === "newRec" ? { record: "newRec" as const } : {})
    };
  }

  // A finite non-secret numeric literal subset: Int flags 0/1 only.
  // Other numeric constants (including potential IDs/secrets) remain opaque.
  const flagMatch = /^(rec|newRec)\.([A-Za-z_][A-Za-z0-9_]*) (==|!=) (0|1)$/.exec(formula);
  const reverseFlagMatch = /^(0|1) (==|!=) (rec|newRec)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(formula);
  if (flagMatch || reverseFlagMatch) {
    const recordScope = flagMatch ? flagMatch[1]! : reverseFlagMatch![3]!;
    const columnId = flagMatch ? flagMatch[2]! : reverseFlagMatch![4]!;
    const operator = NATIVE_OP.get(flagMatch ? flagMatch[3]! : reverseFlagMatch![2]!);
    const literal = flagMatch ? flagMatch[4]! : reverseFlagMatch![1]!;
    if (!operator || table.columns.get(columnId)?.type !== "Int") return undefined;
    return {
      kind: "match_integer_flag", operator, columnId, value: literal === "0" ? 0 : 1,
      ...(recordScope === "newRec" ? { record: "newRec" as const } : {})
    };
  }

  // Exact empty text is the only admitted string literal; nonempty values
  // and their possible secrets remain opaque and non-editable.
  const emptyMatch = /^(rec|newRec)\.([A-Za-z_][A-Za-z0-9_]*) (==|!=) (\x27\x27|\x22\x22)$/.exec(formula);
  const reverseEmptyMatch = /^(\x27\x27|\x22\x22) (==|!=) (rec|newRec)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(formula);
  if (emptyMatch || reverseEmptyMatch) {
    const recordScope = emptyMatch ? emptyMatch[1]! : reverseEmptyMatch![3]!;
    const columnId = emptyMatch ? emptyMatch[2]! : reverseEmptyMatch![4]!;
    const operator = NATIVE_OP.get(emptyMatch ? emptyMatch[3]! : reverseEmptyMatch![2]!);
    if (!operator || table.columns.get(columnId)?.type !== "Text") return undefined;
    return {
      kind: "match_empty_text", operator, columnId,
      ...(recordScope === "newRec" ? { record: "newRec" as const } : {})
    };
  }

  // A small typed update predicate: old and proposed values of one stable column.
  // Both native operand orders normalize to a single model-facing representation.
  const changeMatch = /^(rec|newRec)\.([A-Za-z_][A-Za-z0-9_]*) (==|!=) (rec|newRec)\.\2$/.exec(formula);
  if (changeMatch && changeMatch[1] !== changeMatch[4]) {
    const columnId = changeMatch[2]!;
    const operator = NATIVE_OP.get(changeMatch[3]!);
    const column = table.columns.get(columnId);
    if (!operator || !column || !COLUMN_CHANGE_TYPES.has(column.type)) return undefined;
    return { kind: "column_change", operator, columnId };
  }

  return undefined;
}

// Recognize only balanced boolean grouping around the already-typed leaf grammar.
// Unsupported formulas (including literal-bearing or function-call expressions)
// remain protected rather than becoming editable policy.
function withoutOuterParens(value: string): string {
  let result = value.trim();
  while (result.startsWith("(") && result.endsWith(")")) {
    let depth = 0;
    let enclosed = true;
    for (let i = 0; i < result.length; i++) {
      if (result[i] === "(") depth++;
      if (result[i] === ")") {
        depth--;
        if (depth === 0 && i !== result.length - 1) enclosed = false;
        if (depth < 0) return result;
      }
    }
    if (!enclosed || depth !== 0) break;
    result = result.slice(1, -1).trim();
  }
  return result;
}

function splitTopLevel(value: string, operator: " and " | " or "): string[] | undefined {
  let depth = 0;
  let start = 0;
  const parts: string[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "(") depth++;
    else if (value[i] === ")") {
      depth--;
      if (depth < 0) return undefined;
    }
    if (depth === 0 && value.startsWith(operator, i)) {
      parts.push(value.slice(start, i).trim());
      i += operator.length - 1;
      start = i + 1;
    }
  }
  if (depth !== 0 || !parts.length) return undefined;
  parts.push(value.slice(start).trim());
  return parts;
}

function parseCondition(
  formula: string,
  table: TableInfo,
  attributes?: UserAttributeReferenceContext,
  maxLength = MAX_ACCESS_RULE_FORMULA_LENGTH
): AccessRuleCondition | undefined {
  if (formula === "") return { kind: "everyone" };
  if (formula.length > maxLength) return undefined;
  const budget = { nodes: 0 };
  function parse(source: string, depth: number): AccessRuleCondition | undefined {
    if (++budget.nodes > MAX_ACCESS_RULE_CONDITION_NODES || depth > MAX_ACCESS_RULE_CONDITION_DEPTH) {
      return undefined;
    }
    const value = withoutOuterParens(source);
    if (!value) return undefined;
    for (const [delimiter, kind] of [
      [" or ", "any"],
      [" and ", "all"]
    ] as const) {
      const parts = splitTopLevel(value, delimiter);
      if (parts) {
        if (parts.length < 2 || parts.length > MAX_ACCESS_RULE_CONDITION_WIDTH) return undefined;
        const conditions = parts.map((part) => parse(part, depth + 1));
        if (conditions.some((part) => !part || part.kind === "everyone")) return undefined;
        return { kind, conditions: conditions as AccessRuleCondition[] };
      }
    }
    if (value.startsWith("not ")) {
      const condition = parse(value.slice(4), depth + 1);
      if (!condition || condition.kind === "everyone") return undefined;
      return { kind: "not", condition };
    }
    return parseLeafCondition(value, table, attributes);
  }
  return parse(formula, 0);
}

function recordExpression(condition: { columnId: string; record?: "newRec" | undefined }): string {
  if (condition.record !== undefined && condition.record !== "newRec") {
    throw new Error("Unsupported ACL record context; only default rec or explicit newRec is allowed.");
  }
  return `${condition.record ?? "rec"}.${condition.columnId}`;
}

function usesColumnChange(condition: AccessRuleCondition): boolean {
  if (condition.kind === "all" || condition.kind === "any") {
    return condition.conditions.some(usesColumnChange);
  }
  if (condition.kind === "not") return usesColumnChange(condition.condition);
  return condition.kind === "column_change";
}

function usesNewRec(condition: AccessRuleCondition): boolean {
  if (condition.kind === "all" || condition.kind === "any") {
    return condition.conditions.some(usesNewRec);
  }
  if (condition.kind === "not") return usesNewRec(condition.condition);
  if (condition.kind === "column_change") return true;
  return (condition.kind === "match_user" || condition.kind === "match_link_key" ||
    condition.kind === "record_in_user_attribute_ref_list" ||
    condition.kind === "match_user_attribute" ||
    condition.kind === "match_boolean" || condition.kind === "match_integer_flag" ||
    condition.kind === "match_empty_text") &&
    condition.record === "newRec";
}

type AccessRuleLeafCondition = Exclude<AccessRuleCondition, { kind: "all" | "any" } | { kind: "not" }>;

function serializeLeafCondition(
  condition: AccessRuleLeafCondition,
  table: TableInfo,
  attributes?: UserAttributeReferenceContext
): string {
  if (condition.kind === "everyone") return "";

  if (condition.kind === "user_access") {
    return `user.Access ${OP_NATIVE[condition.operator]} ${ROLE_NATIVE[condition.role]}`;
  }

  if (condition.kind === "user_access_membership") {
    const roles = normalizeRoleMembers(condition.roles);
    if (!roles || (condition.operator !== "in" && condition.operator !== "not_in")) {
      throw new Error("Role membership requires two or three distinct built-in Grist roles.");
    }
    return `user.Access ${condition.operator === "in" ? "in" : "not in"} [${roles.map((role) => ROLE_NATIVE[role]).join(", ")}]`;
  }

  if (condition.kind === "user_login_status") {
    if ((condition.operator !== "equals" && condition.operator !== "not_equals") ||
        typeof condition.value !== "boolean") {
      throw new Error("User login ACL predicate requires a supported operator and a boolean value.");
    }
    return `user.IsLoggedIn ${OP_NATIVE[condition.operator]} ${condition.value ? "True" : "False"}`;
  }

  if (condition.kind === "user_attribute_flag") {
    if (userAttributeColumnType(condition.attributeName, condition.attributeColumnId, attributes) !== "Bool") {
      throw new Error("User-attribute flags require a verified definition and a native Bool column.");
    }
    return `user.${condition.attributeName}.${condition.attributeColumnId}`;
  }
  if (condition.kind === "record_in_user_attribute_ref_list") {
    if ((condition.operator !== "in" && condition.operator !== "not_in") ||
        !matchesUserAttributeRefList(table, condition.columnId, condition.attributeName,
          condition.attributeColumnId, attributes)) {
      throw new Error("User-attribute list membership requires a stable record ID or Ref and a RefList targeting the same table.");
    }
    const operator = condition.operator === "in" ? "in" : "not in";
    return recordExpression(condition) + " " + operator + " user." +
      condition.attributeName + "." + condition.attributeColumnId;
  }

  if (condition.kind === "match_boolean") {
    if (!SAFE_IDENTIFIER.test(condition.columnId) || typeof condition.value !== "boolean" ||
        table.columns.get(condition.columnId)?.type !== "Bool") {
      throw new Error("Boolean literal ACL predicates require an existing Bool column and a boolean value.");
    }
    return `${recordExpression(condition)} ${OP_NATIVE[condition.operator]} ${condition.value ? "True" : "False"}`;
  }

  if (condition.kind === "match_integer_flag") {
    if (!SAFE_IDENTIFIER.test(condition.columnId) ||
        table.columns.get(condition.columnId)?.type !== "Int" ||
        (condition.operator !== "equals" && condition.operator !== "not_equals") ||
        (condition.value !== 0 && condition.value !== 1)) {
      throw new Error("Integer-flag ACL predicates require an existing Int column and exact 0/1 values.");
    }
    return `${recordExpression(condition)} ${OP_NATIVE[condition.operator]} ${condition.value}`;
  }

  if (condition.kind === "match_empty_text") {
    if (!SAFE_IDENTIFIER.test(condition.columnId) ||
        table.columns.get(condition.columnId)?.type !== "Text" ||
        (condition.operator !== "equals" && condition.operator !== "not_equals")) {
      throw new Error("Empty-text ACL predicates require an existing Text column and equality/inequality.");
    }
    return `${recordExpression(condition)} ${OP_NATIVE[condition.operator]} ''`;
  }

  if (condition.kind === "column_change") {
    if (!SAFE_IDENTIFIER.test(condition.columnId)) {
      throw new Error("Column-change ACL predicates require one safe stable column ID.");
    }
    const column = table.columns.get(condition.columnId);
    if (!column || !COLUMN_CHANGE_TYPES.has(column.type)) {
      throw new Error("Column-change ACL predicates require an existing Text, Choice, Int, Numeric or Bool column.");
    }
    return `rec.${condition.columnId} ${OP_NATIVE[condition.operator]} newRec.${condition.columnId}`;
  }

  if (condition.kind === "match_user_attribute") {
    if (!validLinkKeyName(condition.attributeName) ||
        !SAFE_IDENTIFIER.test(condition.attributeColumnId) ||
        !SAFE_IDENTIFIER.test(condition.columnId) ||
        (condition.columnId === "id" && condition.record === "newRec") ||
        (condition.operator !== "equals" && condition.operator !== "not_equals") ||
        !comparableUserAttributeField(
          table, condition.columnId, condition.attributeName, condition.attributeColumnId, attributes
        )) {
      throw new Error("User-attribute ACL match requires a verified definition and comparable stable fields.");
    }
    return `${recordExpression(condition)} ${OP_NATIVE[condition.operator]} user.${condition.attributeName}.${condition.attributeColumnId}`;
  }

  if (condition.kind === "match_link_key") {
    if (!validLinkKeyName(condition.linkKeyName)) {
      throw new Error(
        `LinkKey name "${condition.linkKeyName}" is not supported in the bounded access-rule condition subset.`
      );
    }
    if (!SAFE_IDENTIFIER.test(condition.columnId)) {
      throw new Error(
        `Column ID "${condition.columnId}" is not supported in the bounded access-rule condition subset.`
      );
    }
    const column = table.columns.get(condition.columnId);
    if (!column) {
      throw new Error(
        `Column "${condition.columnId}" does not exist in table "${table.id}".`
      );
    }
    if (!typeCompatibleWithLinkKey(column.type)) {
      throw new Error(
        `Column "${condition.columnId}" type "${column.type}" is not compatible with a LinkKey comparison in the bounded access-rule subset.`
      );
    }
    return `${recordExpression(condition)} ${OP_NATIVE[condition.operator]} user.LinkKey.${condition.linkKeyName}`;
  }

  if (!SAFE_IDENTIFIER.test(condition.columnId)) {
    throw new Error(
      `Column ID "${condition.columnId}" is not supported in the bounded access-rule condition subset.`
    );
  }
  const column = table.columns.get(condition.columnId);
  if (!column) {
    throw new Error(
      `Column "${condition.columnId}" does not exist in table "${table.id}".`
    );
  }
  if (!typeCompatibleWithUserProperty(column.type, condition.userProperty)) {
    throw new Error(
      `Column "${condition.columnId}" type "${column.type}" is not compatible with user.${condition.userProperty} in the bounded access-rule subset.`
    );
  }
  return `${recordExpression(condition)} ${OP_NATIVE[condition.operator]} user.${condition.userProperty}`;
}

function serializeCondition(
  condition: AccessRuleCondition,
  table: TableInfo,
  attributes?: UserAttributeReferenceContext
): string {
  const budget = { nodes: 0 };
  function serialize(node: AccessRuleCondition, depth: number): string {
    if (++budget.nodes > MAX_ACCESS_RULE_CONDITION_NODES || depth > MAX_ACCESS_RULE_CONDITION_DEPTH) {
      throw new Error("Access-rule condition tree exceeds the finite node/depth bound.");
    }
    if (node.kind === "all" || node.kind === "any") {
      if (!Array.isArray(node.conditions) ||
          node.conditions.length < 2 ||
          node.conditions.length > MAX_ACCESS_RULE_CONDITION_WIDTH) {
        throw new Error("Composite ACL conditions require 2-6 bounded children.");
      }
      return node.conditions.map((child) => {
        if (child.kind === "everyone") {
          throw new Error("Everyone is not an ACL boolean subcondition.");
        }
        return "(" + serialize(child, depth + 1) + ")";
      }).join(node.kind === "all" ? " and " : " or ");
    }
    if (node.kind === "not") {
      if (node.condition.kind === "everyone") {
        throw new Error("Everyone is not an ACL boolean subcondition.");
      }
      return "not (" + serialize(node.condition, depth + 1) + ")";
    }
    return serializeLeafCondition(node, table, attributes);
  }
  const native = serialize(condition, 0);
  if (native.length > MAX_ACCESS_RULE_FORMULA_LENGTH) {
    throw new Error("Access-rule condition exceeds the finite native formula bound.");
  }
  return native;
}

function emptyPermissions(): ResolvedAccessRulePermissions {
  return {
    read: "unspecified",
    update: "unspecified",
    create: "unspecified",
    delete: "unspecified"
  };
}

function parsePermissions(
  permissionsText: string,
  columnScope: boolean
): ResolvedAccessRulePermissions | undefined {
  if (!permissionsText || permissionsText === "all" || permissionsText === "none") {
    return undefined;
  }
  const allowedBits = new Set<string>(columnScope ? COLUMN_PERMISSION_BITS : TABLE_PERMISSION_BITS);
  const result = emptyPermissions();
  let state: AccessPermissionValue | null = null;
  const seen = new Set<string>();

  for (const ch of permissionsText) {
    if (ch === "+") {
      state = "allow";
      continue;
    }
    if (ch === "-") {
      state = "deny";
      continue;
    }
    if (!state || !allowedBits.has(ch) || seen.has(ch)) return undefined;
    seen.add(ch);
    if (ch === "R") result.read = state;
    else if (ch === "U") result.update = state;
    else if (ch === "C") result.create = state;
    else if (ch === "D") result.delete = state;
  }

  if (seen.size === 0) return undefined;
  return result;
}

function serializePermissions(
  input: AccessRulePermissions,
  columnScope: boolean
): { normalized: ResolvedAccessRulePermissions; text: string } {
  const normalized: ResolvedAccessRulePermissions = {
    read: input.read,
    update: input.update,
    create: input.create ?? "unspecified",
    delete: input.delete ?? "unspecified"
  };

  const values = Object.values(normalized);
  if (values.some((value) => value !== "allow" && value !== "deny" && value !== "unspecified")) {
    throw new Error("Access-rule permissions contain an unsupported value.");
  }
  if (columnScope && (normalized.create !== "unspecified" || normalized.delete !== "unspecified")) {
    throw new Error("Column access-rule groups support only read and update permissions.");
  }

  const bitValues: Array<[string, AccessPermissionValue]> = columnScope
    ? [["R", normalized.read], ["U", normalized.update]]
    : [
        ["C", normalized.create],
        ["R", normalized.read],
        ["U", normalized.update],
        ["D", normalized.delete]
      ];

  const allow = bitValues.filter(([, value]) => value === "allow").map(([bit]) => bit).join("");
  const deny = bitValues.filter(([, value]) => value === "deny").map(([bit]) => bit).join("");
  if (!allow && !deny) {
    throw new Error("Each access rule must set at least one permission to allow or deny.");
  }
  return {
    normalized,
    text: `${allow ? `+${allow}` : ""}${deny ? `-${deny}` : ""}`
  };
}

// Render only typed operands of the closed Gia subset. Bound attribute chains
// independently of the predicate tree and never interpolate arbitrary literals.
function nativeAclOperand(node: unknown, remainingAttributes = 2): string | undefined {
  if (!Array.isArray(node)) return undefined;
  const [kind, value, field] = node;
  if (node.length === 2 && kind === "Name" &&
      typeof value === "string" &&
      (value === "user" || value === "rec" || value === "newRec" || NATIVE_ROLE.has(value))) {
    return value;
  }
  if (node.length === 2 && kind === "Const" && remainingAttributes === 2) {
    if (value === true) return "True";
    if (value === false) return "False";
    if (value === 0 || value === 1) return String(value);
    if (value === "") return "''";
  }
  if (node.length === 3 && kind === "Attr" && remainingAttributes > 0 &&
      typeof field === "string" && SAFE_IDENTIFIER.test(field) && field === field.trim()) {
    const owner = nativeAclOperand(value, remainingAttributes - 1);
    if (owner !== undefined) return `${owner}.${field}`;
  }
  return undefined;
}

function nativeAclRoleList(node: unknown): string | undefined {
  if (!Array.isArray(node) || node[0] !== "List" || node.length < 3 || node.length > 4) {
    return undefined;
  }
  const roles = node.slice(1).map((role) => nativeAclOperand(role));
  if (roles.some((role) => role === undefined || !NATIVE_ROLE.has(role))) return undefined;
  return `[${roles.join(", ")}]`;
}

function matchesNativeAclCondition(
  raw: string,
  condition: AccessRuleCondition,
  table: TableInfo,
  attributes: UserAttributeReferenceContext
): boolean {
  if (condition.kind === "everyone") return raw === "";
  if (!raw || raw.length > MAX_NATIVE_ACL_AST_LENGTH) return false;

  let nodes = 0;
  function render(node: unknown, depth: number): string | undefined {
    if (++nodes > MAX_ACCESS_RULE_CONDITION_NODES || depth > MAX_ACCESS_RULE_CONDITION_DEPTH ||
        !Array.isArray(node)) return undefined;
    const kind: unknown = node[0];
    if (kind === "Not" && node.length === 2) {
      const child = render(node[1], depth + 1);
      if (child !== undefined) return `not (${child})`;
    }
    if ((kind === "And" || kind === "Or") && node.length >= 3 &&
        node.length <= MAX_ACCESS_RULE_CONDITION_WIDTH + 1) {
      const children = node.slice(1).map((child) => render(child, depth + 1));
      if (children.every((child) => child !== undefined)) {
        // Keep native composition and evaluation order, including same-kind nesting.
        return children.map((child) => `(${child})`).join(kind === "And" ? " and " : " or ");
      }
    }
    if (node.length === 3 && (kind === "Eq" || kind === "NotEq" || kind === "In" || kind === "NotIn")) {
      const left = nativeAclOperand(node[1]);
      const right = kind === "In" || kind === "NotIn"
        ? nativeAclRoleList(node[2]) ?? nativeAclOperand(node[2]) : nativeAclOperand(node[2]);
      if (left !== undefined && right !== undefined) {
        const operator = { Eq: "==", NotEq: "!=", In: "in", NotIn: "not in" }[kind];
        return `${left} ${operator} ${right}`;
      }
    }
    if (kind === "Attr") return nativeAclOperand(node);
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  const formula = render(parsed, 0);
  if (formula === undefined) return false;
  // Parentheses introduced by rendering are bounded by the native node count.
  const native = parseCondition(formula, table, attributes,
    MAX_ACCESS_RULE_FORMULA_LENGTH + 2 * MAX_ACCESS_RULE_CONDITION_NODES);
  return native !== undefined && stableJson(native) === stableJson(condition);
}

function unsupportedLegacyFields(fields: JsonRecord): boolean {
  const permissions = fields.permissions;
  const principals = fields.principals;
  const aclColumn = fields.aclColumn;
  const userAttributes = fields.userAttributes;
  const memo = fields.memo;
  return (
    (permissions !== undefined && permissions !== 0) ||
    (principals !== undefined && principals !== "") ||
    (aclColumn !== undefined && aclColumn !== 0) ||
    (userAttributes !== undefined && userAttributes !== "") ||
    (memo !== undefined && memo !== "")
  );
}

function buildGroupState(
  resource: PersistedResource,
  rules: PersistedRule[],
  table: TableInfo,
  attributes: UserAttributeReferenceContext
): AccessRuleGroupState {
  const target = normalizeResourceTarget(resource);
  if (!target) {
    throw new Error("Internal error: attempted to normalize a protected ACL resource as an editable group.");
  }
  const ordered = [...rules].sort((a, b) => {
    if (a.rulePos !== undefined && b.rulePos !== undefined && a.rulePos !== b.rulePos) {
      return a.rulePos - b.rulePos;
    }
    return a.id - b.id;
  });

  if (ordered.length === 0) {
    return {
      target,
      resourceRecordId: resource.id,
      ruleRecordIds: [],
      unsupportedReason: "This persisted resource has no rules and is not safe to rewrite automatically."
    };
  }

  const positions = ordered.map((rule) => rule.rulePos);
  if (positions.some((value) => value === undefined) || new Set(positions).size !== positions.length) {
    return {
      target,
      resourceRecordId: resource.id,
      ruleRecordIds: ordered.map((rule) => rule.id),
      unsupportedReason: "Rule ordering is ambiguous or incomplete."
    };
  }

  const normalizedRules: NormalizedAccessRule[] = [];
  for (const [index, rule] of ordered.entries()) {
    if (unsupportedLegacyFields(rule.fields)) {
      return {
        target,
        resourceRecordId: resource.id,
        ruleRecordIds: ordered.map((entry) => entry.id),
        unsupportedReason:
          "This group contains memo, user-attribute, legacy, schema-edit or other unsupported persisted semantics."
      };
    }
    const condition = parseCondition(rule.aclFormula, table, attributes);
    const permissions = parsePermissions(rule.permissionsText, target.columnIds.length > 0);
    if (!condition || !permissions ||
        !matchesNativeAclCondition(rule.aclFormulaParsed, condition, table, attributes)) {
      return {
        target,
        resourceRecordId: resource.id,
        ruleRecordIds: ordered.map((entry) => entry.id),
        unsupportedReason:
          "This group uses a condition or permission form outside Gia's bounded secret-safe ACL subset."
      };
    }
    if (usesNewRec(condition) &&
        (permissions.read !== "unspecified" || permissions.delete !== "unspecified")) {
      return {
        target,
        resourceRecordId: resource.id,
        ruleRecordIds: ordered.map((entry) => entry.id),
        unsupportedReason: "newRec rules can only control row creation or update in Gia's bounded subset."
      };
    }
    if (usesColumnChange(condition) && permissions.create !== "unspecified") {
      return {
        target,
        resourceRecordId: resource.id,
        ruleRecordIds: ordered.map((entry) => entry.id),
        unsupportedReason: "Column-change predicates can only control updates, not row creation."
      };
    }
    if (condition.kind === "everyone" && index !== ordered.length - 1) {
      return {
        target,
        resourceRecordId: resource.id,
        ruleRecordIds: ordered.map((entry) => entry.id),
        unsupportedReason: "An unconditional rule is not the final rule in this group."
      };
    }
    normalizedRules.push({ condition, permissions });
  }

  return {
    target,
    resourceRecordId: resource.id,
    ruleRecordIds: ordered.map((rule) => rule.id),
    normalizedRules
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return `{${Object.keys(source)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(source[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function untargetedFingerprint(
  snapshot: AccessRulesSnapshot,
  target: ResolvedAccessRuleTarget
): string {
  const excludedResourceIds = new Set(
    snapshot.resources
      .filter((resource) => {
        const normalized = normalizeResourceTarget(resource);
        return normalized ? sameTarget(normalized, target) : false;
      })
      .map((resource) => resource.id)
  );
  return stableJson({
    resources: snapshot.resources
      .filter((resource) => !excludedResourceIds.has(resource.id))
      .map((resource) => ({ id: resource.id, fields: resource.fields }))
      .sort((a, b) => a.id - b.id),
    rules: snapshot.rules
      .filter((rule) => !excludedResourceIds.has(rule.resourceId))
      .map((rule) => ({ id: rule.id, fields: rule.fields }))
      .sort((a, b) => a.id - b.id)
  });
}

function normalizeRequestedTarget(
  snapshot: AccessRulesSnapshot,
  target: AccessRuleTarget
): ResolvedAccessRuleTarget {
  const tableId = target.tableId.trim();
  if (!tableId || tableId === "*" || tableId.startsWith("_grist_")) {
    throw new Error("Access-rule targets must name one ordinary Grist table.");
  }
  const table = snapshot.tables.get(tableId);
  if (!table) throw new Error(`Table "${tableId}" does not exist in the current document.`);

  const columnIds = target.columnIds === undefined ? [] : canonicalColumnIds(target.columnIds);
  for (const columnId of columnIds) {
    if (!SAFE_IDENTIFIER.test(columnId)) {
      throw new Error(
        `Column ID "${columnId}" is not supported by the bounded access-rule condition subset.`
      );
    }
    if (!table.columns.has(columnId)) {
      throw new Error(`Column "${columnId}" does not exist in table "${tableId}".`);
    }
  }
  return { tableId, columnIds };
}

function assertNoColumnOverlap(
  snapshot: AccessRulesSnapshot,
  target: ResolvedAccessRuleTarget,
  ignoreResourceId?: number
): void {
  if (target.columnIds.length === 0) return;
  const requested = new Set(target.columnIds);
  for (const group of snapshot.groups) {
    if (
      group.resourceRecordId === ignoreResourceId ||
      group.target.tableId !== target.tableId ||
      group.target.columnIds.length === 0
    ) {
      continue;
    }
    if (group.target.columnIds.some((columnId) => requested.has(columnId))) {
      throw new Error(
        `Column access-rule target overlaps existing resource ${group.target.tableId}[${group.target.columnIds.join(", ")}]; refusing an ambiguous policy mutation.`
      );
    }
  }
}

function normalizeRequestedRules(
  rules: readonly AccessRuleInput[],
  target: ResolvedAccessRuleTarget,
  table: TableInfo,
  attributes: UserAttributeReferenceContext
): { writes: AccessRulePersistedWrite[]; normalized: NormalizedAccessRule[] } {
  if (rules.length < 1 || rules.length > MAX_ACCESS_RULES_PER_GROUP) {
    throw new Error(
      `Access-rule groups require 1-${MAX_ACCESS_RULES_PER_GROUP} ordered rules.`
    );
  }

  const writes: AccessRulePersistedWrite[] = [];
  const normalized: NormalizedAccessRule[] = [];
  const seen = new Set<string>();
  for (const [index, rule] of rules.entries()) {
    const aclFormula = serializeCondition(rule.condition, table, attributes);
    const canonicalCondition = parseCondition(aclFormula, table, attributes);
    if (!canonicalCondition) {
      throw new Error("Access-rule condition cannot be normalized into the bounded native subset.");
    }
    if (rule.condition.kind === "everyone" && index !== rules.length - 1) {
      throw new Error("An everyone access rule must be the final rule in its group.");
    }
    const permission = serializePermissions(rule.permissions, target.columnIds.length > 0);
    if (usesNewRec(canonicalCondition) &&
        (permission.normalized.read !== "unspecified" ||
         permission.normalized.delete !== "unspecified")) {
      throw new Error("newRec ACL conditions may only grant or deny row create/update permissions.");
    }
    if (usesColumnChange(canonicalCondition) && permission.normalized.create !== "unspecified") {
      throw new Error("Column-change ACL predicates may only grant or deny update permissions.");
    }
    const normalizedRule = { condition: canonicalCondition, permissions: permission.normalized };
    const key = stableJson(normalizedRule);
    if (seen.has(key)) throw new Error("Duplicate access rules are not allowed in one group.");
    seen.add(key);
    normalized.push(normalizedRule);
    writes.push({
      aclFormula,
      permissionsText: permission.text,
      rulePos: index + 1
    });
  }
  return { writes, normalized };
}

function sameNormalizedRules(
  a: readonly NormalizedAccessRule[],
  b: readonly NormalizedAccessRule[]
): boolean {
  return stableJson(a) === stableJson(b);
}

export function normalizeAccessRulesSnapshot(
  resourcesResponse: unknown,
  rulesResponse: unknown,
  tablesResponse: unknown,
  columnsResponse: unknown
): AccessRulesSnapshot {
  const tableRecords = metadataRecords(tablesResponse, "table");
  const columnRecords = metadataRecords(columnsResponse, "column");
  const tables = new Map<string, TableInfo>();
  const tableByRecordId = new Map<number, TableInfo>();

  for (const entry of tableRecords) {
    const tableId = requiredString(entry.fields, "tableId", "table").trim();
    if (!tableId) throw new Error("Grist table metadata contains an empty table ID.");
    if (tables.has(tableId)) throw new Error("Grist table metadata has ambiguous stable IDs.");
    const table: TableInfo = {
      id: tableId,
      recordId: entry.id,
      columns: new Map()
    };
    tables.set(tableId, table);
    tableByRecordId.set(entry.id, table);
  }

  for (const entry of columnRecords) {
    const parentId = positiveInteger(entry.fields.parentId);
    const columnId = requiredString(entry.fields, "colId", "column").trim();
    const type = requiredString(entry.fields, "type", "column").trim();
    if (!parentId || !columnId || !type) {
      throw new Error("Grist column metadata is incomplete or censored.");
    }
    const table = tableByRecordId.get(parentId);
    if (!table) throw new Error("Grist column metadata refers to an unknown table.");
    if (table.columns.has(columnId)) throw new Error("Grist column metadata has ambiguous stable IDs.");
    table.columns.set(columnId, { id: columnId, type });
  }

  const resources: PersistedResource[] = metadataRecords(resourcesResponse, "ACL resource").map(
    (entry) => ({
      ...entry,
      tableId: requiredString(entry.fields, "tableId", "ACL resource"),
      colIds: requiredString(entry.fields, "colIds", "ACL resource")
    })
  );
  const resourceIds = new Set(resources.map((resource) => resource.id));
  const defaults = resources.filter((resource) =>
    resource.tableId === "*" && resource.colIds === "*");
  const defaultResourceId = defaults.length === 1 ? defaults[0]!.id : undefined;

  const rules: PersistedRule[] = metadataRecords(rulesResponse, "ACL rule").map((entry) => {
    const resourceId = positiveInteger(entry.fields.resource);
    if (!resourceId || !resourceIds.has(resourceId)) {
      throw new Error("Grist ACL rule metadata contains a dangling or unavailable resource reference.");
    }
    const rulePos =
      typeof entry.fields.rulePos === "number" && Number.isFinite(entry.fields.rulePos)
        ? entry.fields.rulePos
        : undefined;
    const nativeNullAttribute = isNativeNullUserAttributeRule(
      entry.fields, resourceId, defaultResourceId
    );
    return {
      ...entry,
      resourceId,
      aclFormula: nativeNullAttribute ? "" : requiredString(entry.fields, "aclFormula", "ACL rule"),
      aclFormulaParsed: requiredString(entry.fields, "aclFormulaParsed", "ACL rule"),
      permissionsText: nativeNullAttribute ? "" : requiredString(entry.fields, "permissionsText", "ACL rule"),
      ...(rulePos !== undefined ? { rulePos } : {})
    };
  });

  const rulesByResource = new Map<number, PersistedRule[]>();
  for (const rule of rules) {
    const values = rulesByResource.get(rule.resourceId) ?? [];
    values.push(rule);
    rulesByResource.set(rule.resourceId, values);
  }

  const attributes = userAttributeReferenceContext({
    resources, rules, tables, groups: [], protectedPersistedGroupCount: 0
  });
  const groups: AccessRuleGroupState[] = [];
  let protectedPersistedGroupCount = 0;
  const seenTargets = new Set<string>();
  const columnClaims = new Map<string, Set<string>>();

  for (const resource of resources) {
    const target = normalizeResourceTarget(resource);
    if (!target) {
      protectedPersistedGroupCount++;
      continue;
    }
    const table = tables.get(target.tableId);
    if (!table) {
      throw new Error(
        `Grist ACL resource ${resource.id} refers to missing table "${target.tableId}".`
      );
    }
    for (const columnId of target.columnIds) {
      if (!table.columns.has(columnId)) {
        throw new Error(
          `Grist ACL resource ${resource.id} refers to missing column "${target.tableId}.${columnId}".`
        );
      }
    }

    const key = targetKey(target);
    if (seenTargets.has(key)) {
      throw new Error("Duplicate ACL resources resolve to the same stable table/column target.");
    }
    seenTargets.add(key);

    if (target.columnIds.length > 0) {
      const claimed = columnClaims.get(target.tableId) ?? new Set<string>();
      for (const columnId of target.columnIds) {
        if (claimed.has(columnId)) {
          throw new Error(
            `Overlapping ACL column resources exist for "${target.tableId}.${columnId}".`
          );
        }
        claimed.add(columnId);
      }
      columnClaims.set(target.tableId, claimed);
    }

    groups.push(buildGroupState(resource, rulesByResource.get(resource.id) ?? [], table, attributes));
  }

  groups.sort((a, b) => targetKey(a.target).localeCompare(targetKey(b.target)));
  return { resources, rules, tables, groups, protectedPersistedGroupCount };
}

// Native Grist stores user-attribute definitions in _grist_ACLRules on the
// default (*, *) resource. This read-only projection deliberately exposes
// structural identifiers, never attribute values, raw JSON or ACL formulas.
function reservedUserAttributeName(name: string): boolean {
  // Grist ignores definitions whose name is already present on its ACL User.
  return ACCESS_USER_ATTRIBUTE_PROPERTIES.some((property) => property === name) ||
    ["LinkKey", "ShareRef", "Type", "toJSON", "toUserInfo", "_toObject"].includes(name) ||
    name in Object.prototype;
}

function projectUserAttributes(snapshot: AccessRulesSnapshot): {
  definitions: Array<{
    name: string;
    tableId: string;
    lookupColId: string;
    source: { kind: "user_property"; property: string } | { kind: "link_key"; name: string };
    editable: boolean;
  }>;
  protectedDefinitionCount: number;
} {
  const defaults = snapshot.resources.filter((r) => r.tableId === "*" && r.colIds === "*");
  const defaultId = defaults.length === 1 ? defaults[0]!.id : undefined;
  const entries: Array<{
    name: string;
    tableId: string;
    lookupColId: string;
    source: { kind: "user_property"; property: string } | { kind: "link_key"; name: string };
    position: number;
    id: number;
  }> = [];
  let protectedDefinitionCount = 0;
  const builtInSources = new Set<string>(ACCESS_USER_ATTRIBUTE_PROPERTIES);

  for (const rule of snapshot.rules) {
    const raw = rule.fields.userAttributes;
    if (raw === undefined || raw === null || raw === "") continue;
    if (typeof raw !== "string" || raw.length > 4096 ||
        rule.resourceId !== defaultId || !rule.rulePos ||
        rule.aclFormula !== "" || rule.aclFormulaParsed !== "" ||
        rule.permissionsText !== "") {
      protectedDefinitionCount++;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      protectedDefinitionCount++;
      continue;
    }
    const definition = record(parsed);
    if (!definition ||
        Object.keys(definition).some((key) =>
          !["name", "tableId", "lookupColId", "charId"].includes(key))) {
      protectedDefinitionCount++;
      continue;
    }
    const { name, tableId, lookupColId, charId } = definition;
    if (typeof name !== "string" || name.length > MAX_ACCESS_RULE_LINK_KEY_NAME_LENGTH ||
        !SAFE_IDENTIFIER.test(name) || reservedUserAttributeName(name) ||
        typeof tableId !== "string" || !SAFE_IDENTIFIER.test(tableId) ||
        tableId.startsWith("_grist_") ||
        typeof lookupColId !== "string" || !SAFE_IDENTIFIER.test(lookupColId) ||
        !snapshot.tables.get(tableId)?.columns.has(lookupColId) ||
        typeof charId !== "string") {
      protectedDefinitionCount++;
      continue;
    }
    let source: { kind: "user_property"; property: string } |
      { kind: "link_key"; name: string };
    if (builtInSources.has(charId)) {
      source = { kind: "user_property", property: charId };
    } else if (charId.startsWith("LinkKey.") &&
        validLinkKeyName(charId.slice("LinkKey.".length))) {
      source = { kind: "link_key", name: charId.slice("LinkKey.".length) };
    } else {
      protectedDefinitionCount++;
      continue;
    }
    entries.push({
      name, tableId, lookupColId, source,
      position: rule.rulePos, id: rule.id
    });
  }

  // Duplicate user-attribute names are ambiguous even if their native row IDs
  // differ. Protect all occurrences rather than choosing an arbitrary winner.
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
  const unique = entries.filter((entry) => {
    if (counts.get(entry.name) === 1) return true;
    protectedDefinitionCount++;
    return false;
  });
  unique.sort((a, b) => a.position - b.position || a.id - b.id);
  return {
    // Structural mutability only: the caller still needs doc.schema:write and
    // fresh native Owner authority to use the separate mutation action.
    definitions: unique.map(({ name, tableId, lookupColId, source }) => ({
      name, tableId, lookupColId, source,
      editable: protectedDefinitionCount === 0 && defaults.length === 1
    })),
    protectedDefinitionCount
  };
}

// Only extract names from the closed normalized AST. Never inspect an opaque
// persisted formula or infer effective permissions from these references.
function projectGroupDependencies(rules: readonly NormalizedAccessRule[]): {
  coverage: "supported_rules";
  recordColumnIds: string[];
  newRecordColumnIds: string[];
  userProperties: string[];
  linkKeyNames: string[];
  userAttributeFields: Array<{ attributeName: string; attributeColumnId: string }>;
} {
  const recordColumnIds = new Set<string>();
  const newRecordColumnIds = new Set<string>();
  const userProperties = new Set<string>();
  const linkKeyNames = new Set<string>();
  const userAttributeFields = new Map<string, { attributeName: string; attributeColumnId: string }>();
  function visit(condition: AccessRuleCondition): void {
    if (condition.kind === "all" || condition.kind === "any") {
      condition.conditions.forEach(visit);
      return;
    }
    if (condition.kind === "not") {
      visit(condition.condition);
      return;
    }
    switch (condition.kind) {
      case "everyone":
        return;
      case "user_access":
      case "user_access_membership":
        userProperties.add("Access");
        return;
      case "user_login_status":
        userProperties.add("IsLoggedIn");
        return;
      case "user_attribute_flag": {
        const { attributeName, attributeColumnId } = condition;
        userAttributeFields.set(JSON.stringify([attributeName, attributeColumnId]), {
          attributeName, attributeColumnId
        });
        return;
      }
      case "column_change":
        recordColumnIds.add(condition.columnId);
        newRecordColumnIds.add(condition.columnId);
        return;
      default:
        (condition.record === "newRec" ? newRecordColumnIds : recordColumnIds)
          .add(condition.columnId);
        if (condition.kind === "match_user") {
          userProperties.add(condition.userProperty);
        } else if (condition.kind === "match_link_key") {
          linkKeyNames.add(condition.linkKeyName);
        } else if (condition.kind === "match_user_attribute" || condition.kind === "record_in_user_attribute_ref_list") {
          const field = { attributeName: condition.attributeName,
            attributeColumnId: condition.attributeColumnId };
          userAttributeFields.set(JSON.stringify([field.attributeName, field.attributeColumnId]), field);
        }
    }
  }
  rules.forEach(rule => visit(rule.condition));
  return {
    coverage: "supported_rules",
    recordColumnIds: [...recordColumnIds].sort(),
    newRecordColumnIds: [...newRecordColumnIds].sort(),
    userProperties: [...userProperties].sort(),
    linkKeyNames: [...linkKeyNames].sort(),
    userAttributeFields: [...userAttributeFields.values()].sort((a, b) =>
      a.attributeName.localeCompare(b.attributeName) ||
      a.attributeColumnId.localeCompare(b.attributeColumnId))
  };
}


type AccessRuleLintDiagnostic =
  | { code: "shadowed_same_condition_permission"; certainty: "proven";
      ruleIndex: number; earlierRuleIndex: number;
      permission: "read" | "update" | "create" | "delete" }
  | { code: "link_key_web_acceptance_unverified"; certainty: "warning" };

// Grist uses the first applicable rule for each permission within a group.
// An earlier identical typed condition deciding the same permission therefore
// masks that permission in a later rule; unrelated predicates are not compared.
function projectGroupDiagnostics(
  rules: readonly NormalizedAccessRule[],
  containsLinkKey: boolean
): AccessRuleLintDiagnostic[] {
  const diagnostics: AccessRuleLintDiagnostic[] = [];
  const firstDecision = new Map<string, number>();
  const permissions = ["read", "update", "create", "delete"] as const;
  rules.forEach((rule, index) => {
    const condition = stableJson(rule.condition);
    for (const permission of permissions) {
      if (rule.permissions[permission] === "unspecified") continue;
      const key = JSON.stringify([condition, permission]);
      const earlierRuleIndex = firstDecision.get(key);
      if (earlierRuleIndex !== undefined) {
        diagnostics.push({
          code: "shadowed_same_condition_permission", certainty: "proven",
          ruleIndex: index + 1, earlierRuleIndex, permission
        });
      } else {
        firstDecision.set(key, index + 1);
      }
    }
  });
  if (containsLinkKey) {
    diagnostics.push({ code: "link_key_web_acceptance_unverified", certainty: "warning" });
  }
  return diagnostics;
}

export function projectAccessRules(snapshot: AccessRulesSnapshot): unknown {
  const userAttributes = projectUserAttributes(snapshot);
  const linkKeyDrivenAttributes = new Set(userAttributes.definitions
    .filter((attribute) => attribute.source.kind === "link_key")
    .map((attribute) => attribute.name));
  return {
    policyState: "persisted",
    effectiveEnforcementVerified: false,
    protectedPersistedGroupCount: snapshot.protectedPersistedGroupCount,
    userAttributes,
    groups: snapshot.groups.map((group) => {
      const dependencies = group.normalizedRules
        ? projectGroupDependencies(group.normalizedRules)
        : { coverage: "unknown" as const };
      return {
        target:
          group.target.columnIds.length === 0
            ? { tableId: group.target.tableId }
            : { tableId: group.target.tableId, columnIds: [...group.target.columnIds] },
        editable: Boolean(group.normalizedRules),
        dependencies,
        // null means unknown coverage, never a positive lint result.
        diagnostics: group.normalizedRules
          ? projectGroupDiagnostics(group.normalizedRules,
            dependencies.coverage === "supported_rules" &&
              (dependencies.linkKeyNames.length > 0 ||
                dependencies.userAttributeFields.some((field) =>
                  linkKeyDrivenAttributes.has(field.attributeName))))
          : null,
        ...(group.normalizedRules
          ? { rules: group.normalizedRules }
          : { unsupportedReason: group.unsupportedReason ?? "Unsupported persisted ACL semantics." })
      };
    }),
    note:
      "Gia exposes only bounded persisted ordinary table/column groups and structurally verified user-attribute definitions (writable only through the separate bounded access-rule mutation target when supported). Defaults, special rules, schema-edit policy, memos, unsupported user attributes and opaque formulas remain protected. Grist remains authoritative for effective enforcement."
  };
}


/** Read-only structural dependency probe, not a prediction of native schema rewrites. */
export function projectAccessRuleSchemaImpact(
  snapshot: AccessRulesSnapshot,
  target: AccessRuleSchemaImpactTarget
): unknown {
  if (!target.tableId || target.tableId.startsWith("_grist_") ||
      !snapshot.tables.has(target.tableId)) {
    throw new Error("Schema-impact target must be an existing ordinary table.");
  }
  if (target.kind === "column" &&
      !snapshot.tables.get(target.tableId)!.columns.has(target.columnId)) {
    throw new Error("Schema-impact target column does not exist in the selected table.");
  }

  const attributes = projectUserAttributes(snapshot);
  const definitions = new Map(attributes.definitions.map((item) => [item.name, item]));
  const affectedUserAttributes = attributes.definitions
    .filter((item) => item.tableId === target.tableId &&
      (target.kind === "table" || item.lookupColId === target.columnId))
    .map((item) => ({
      name: item.name,
      reason: target.kind === "table" ? "source_table" : "lookup_column"
    }));
  const affectedGroups: Array<{
    target: { tableId: string; columnIds?: string[] };
    reasons: Array<"resource_target" | "record_condition" | "user_attribute_reference">;
    conditionCoverage: "supported_rules" | "unknown";
  }> = [];
  let protectedOrdinaryGroupCount = 0;

  for (const group of snapshot.groups) {
    const reasons: Array<"resource_target" | "record_condition" | "user_attribute_reference"> = [];
    if (group.target.tableId === target.tableId &&
        (target.kind === "table" || group.target.columnIds.includes(target.columnId))) {
      reasons.push("resource_target");
    }
    if (!group.normalizedRules) {
      protectedOrdinaryGroupCount++;
    } else {
      const dependencies = projectGroupDependencies(group.normalizedRules);
      if (group.target.tableId === target.tableId &&
          (target.kind === "table"
            ? dependencies.recordColumnIds.length > 0 || dependencies.newRecordColumnIds.length > 0
            : dependencies.recordColumnIds.includes(target.columnId) ||
              dependencies.newRecordColumnIds.includes(target.columnId))) {
        reasons.push("record_condition");
      }
      if (dependencies.userAttributeFields.some((field) => {
        const definition = definitions.get(field.attributeName);
        return definition?.tableId === target.tableId &&
          (target.kind === "table" || definition.lookupColId === target.columnId ||
            field.attributeColumnId === target.columnId);
      })) {
        reasons.push("user_attribute_reference");
      }
    }
    if (reasons.length) {
      affectedGroups.push({
        target: group.target.columnIds.length === 0
          ? { tableId: group.target.tableId }
          : { tableId: group.target.tableId, columnIds: [...group.target.columnIds] },
        reasons,
        conditionCoverage: group.normalizedRules ? "supported_rules" : "unknown"
      });
    }
  }

  return {
    target,
    referenceOnly: true,
    affectedGroups,
    affectedUserAttributes,
    unknownCoverage: {
      protectedOrdinaryGroupCount,
      protectedOtherPolicyResourceCount: snapshot.protectedPersistedGroupCount,
      protectedUserAttributeDefinitionCount: attributes.protectedDefinitionCount
    },
    note: "Only known structural references are reported. Protected or opaque policy may also depend on this schema identity. Native rename/delete effects, effective enforcement and confidentiality are not predicted or verified."
  };
}


/** Classify persisted policy components for an ordinary data operation. */
export function projectAccessPolicyCoverage(
  snapshot: AccessRulesSnapshot,
  { target, operation, context }: AccessPolicyCoverageRequest
): unknown {
  const { tableId, columnIds } = normalizeRequestedTarget(snapshot, {
    tableId: target.tableId,
    ...(target.kind === "column" ? { columnIds: [target.columnId] } : {})
  });
  const rowOperation = operation === "create" || operation === "delete";
  if (target.kind === "column" && (rowOperation || target.columnId.startsWith("gristHelper_"))) {
    return {
      target, operation, persistedStatus: "UNSUPPORTED", nativeQualification: "NOT_TESTED",
      ...(context ? { expectedDecision: { decision: "UNSUPPORTED" } } : {})
    };
  }

  const groups = snapshot.groups.filter((group) =>
    group.target.tableId === tableId &&
    (group.target.columnIds.length === 0 ||
      (!rowOperation && (columnIds.length === 0 ||
        group.target.columnIds.includes(columnIds[0]!)))));
  const ordinaryGroups = groups.map((group) => ({
    target: group.target,
    status: group.normalizedRules ? "SUPPORTED" : "PROTECTED"
  }));
  const references = new Set(groups.flatMap((group) => {
    const rules = group.normalizedRules?.filter((rule) => rule.permissions[operation] !== "unspecified") ?? [];
    return projectGroupDependencies(rules).userAttributeFields.map((field) => field.attributeName);
  }));
  const attributes = projectUserAttributes(snapshot);
  const defaults = snapshot.resources.filter((resource) =>
    resource.tableId === "*" && resource.colIds === "*");
  const defaultIds = new Set(defaults.map((resource) => resource.id));
  // Structurally validated attribute rows share the default resource but do
  // not define default permissions. Opaque definitions are counted separately.
  const protectedDefaults = defaults.length > 1 || snapshot.rules.some((rule) =>
    defaultIds.has(rule.resourceId) &&
    (!rule.fields.userAttributes || rule.aclFormula !== "" || rule.aclFormulaParsed !== "" ||
      rule.permissionsText !== "" || rule.fields.permissions || rule.fields.principals || rule.fields.aclColumn));
  // Grist deliberately skips the old blank resource seeded by its initial
  // document schema. Preserve it but do not count it as ordinary policy.
  const ignoredLegacyResourceCount = snapshot.resources.filter((resource) =>
    resource.tableId === "" && resource.colIds === "").length;
  const otherProtectedResourceCount =
    snapshot.protectedPersistedGroupCount - defaults.length - ignoredLegacyResourceCount;

  const incomplete = protectedDefaults || otherProtectedResourceCount > 0 ||
    attributes.protectedDefinitionCount > 0 || ordinaryGroups.some((group) => group.status === "PROTECTED");
  const expectedDecision = context && (incomplete
    ? { decision: "UNKNOWN", reason: "protected_policy" }
    : expectedAccessDecision(snapshot, tableId, target.kind, operation, groups, context));

  return {
    target,
    operation,
    persistedStatus: incomplete ? "UNKNOWN" : "SUPPORTED",
    ordinaryGroups,
    userAttributes: {
      supportedReferences: attributes.definitions.filter((item) => item.editable && references.has(item.name))
        .map((item) => item.name).sort(),
      protectedDefinitionCount: attributes.protectedDefinitionCount
    },
    defaultPolicy: {
      persisted: protectedDefaults ? "PROTECTED" : "ABSENT",
      builtInFallback: "SUPPORTED"
    },
    otherProtectedResourceCount,
    ignoredLegacyResourceCount,
    nativeQualification: "NOT_TESTED",
    ...(expectedDecision ? { expectedDecision } : {})
  };
}

type SyntheticTruth = "true" | "false" | "unknown";

function syntheticFieldValue(
  fields: readonly AccessRuleSyntheticField[] | undefined,
  name: string
): AccessRuleSyntheticValue | undefined {
  return fields?.find((item) => item.name === name)?.value;
}

function syntheticComparison(
  left: AccessRuleSyntheticValue | undefined,
  right: AccessRuleSyntheticValue | undefined,
  operator: AccessRuleOperator
): SyntheticTruth {
  if (!left || !right) return "unknown";
  let equal: boolean;
  if (left.kind === "symbol" && right.kind === "symbol") {
    equal = left.symbol === right.symbol;
  } else if (left.kind === "boolean" && right.kind === "boolean") {
    equal = left.value === right.value;
  } else if (left.kind === "flag" && right.kind === "flag") {
    equal = left.value === right.value;
  } else if (left.kind === "empty_text" && right.kind === "empty_text") {
    equal = true;
  } else if ((left.kind === "empty_text" && right.kind === "symbol") ||
             (left.kind === "symbol" && right.kind === "empty_text")) {
    equal = false;
  } else {
    // Never guess native coercions or equality between incompatible kinds.
    return "unknown";
  }
  return (operator === "equals" ? equal : !equal) ? "true" : "false";
}

// Synthetic equivalence classes still represent native typed values. Reject
// impossible scenarios by treating mismatched operands as absent/unknown.
function compatibleSyntheticValue(value: AccessRuleSyntheticValue, nativeType: string | undefined): boolean {
  if (nativeType === "Text" || nativeType === "Choice" || nativeType === "Any") {
    return value.kind === "symbol" || value.kind === "empty_text";
  }
  if (nativeType === "Bool") return value.kind === "boolean";
  if (nativeType === "Int" || nativeType === "Numeric") return value.kind === "flag";
  if (nativeType?.startsWith("Ref:")) return value.kind === "symbol";
  return false;
}

function compatibleSyntheticFields(
  fields: readonly AccessRuleSyntheticField[] | undefined,
  nativeTypeFor: (name: string) => string | undefined
): readonly AccessRuleSyntheticField[] | undefined {
  return fields?.filter((field) => compatibleSyntheticValue(field.value, nativeTypeFor(field.name)));
}

function typedSyntheticContext(
  snapshot: AccessRulesSnapshot,
  tableId: string,
  context: AccessRuleSyntheticContext
): AccessRuleSyntheticContext {
  const table = snapshot.tables.get(tableId);
  const attributes = new Map(projectUserAttributes(snapshot).definitions
    .filter((definition) => definition.editable)
    .map((definition) => [definition.name, definition.tableId] as const));
  const recordType = (name: string) => table?.columns.get(name)?.type;
  return {
    ...context,
    rec: compatibleSyntheticFields(context.rec, recordType),
    newRec: compatibleSyntheticFields(context.newRec, recordType),
    user: compatibleSyntheticFields(context.user, (name) =>
      name === "IsLoggedIn" ? "Bool" : name === "UserID" ? "Int" :
        ACCESS_RULE_USER_PROPERTIES.includes(name as AccessRuleUserProperty) ? "Text" : undefined),
    userAttributes: context.userAttributes?.map((attribute) => {
      const sourceTableId = attributes.get(attribute.name);
      return {
        name: attribute.name,
        fields: compatibleSyntheticFields(attribute.fields, (name) => {
          if (!sourceTableId) return undefined;
          return name === "id" ? `Ref:${sourceTableId}` :
            snapshot.tables.get(sourceTableId)?.columns.get(name)?.type;
        }) ?? []
      };
    })
  };
}

function syntheticCondition(
  condition: AccessRuleCondition,
  context: AccessRuleSyntheticContext
): SyntheticTruth {
  if (condition.kind === "all" || condition.kind === "any") {
    const answers = condition.conditions.map((item) => syntheticCondition(item, context));
    if (condition.kind === "all") {
      if (answers.includes("false")) return "false";
      return answers.includes("unknown") ? "unknown" : "true";
    }
    if (answers.includes("true")) return "true";
    return answers.includes("unknown") ? "unknown" : "false";
  }
  if (condition.kind === "not") {
    const answer = syntheticCondition(condition.condition, context);
    return answer === "unknown" ? answer : answer === "true" ? "false" : "true";
  }
  if (condition.kind === "everyone") return "true";
  if (condition.kind === "user_access") {
    if (!context.role) return "unknown";
    const equals = context.role === condition.role;
    return (condition.operator === "equals" ? equals : !equals) ? "true" : "false";
  }
  if (condition.kind === "user_access_membership") {
    if (!context.role) return "unknown";
    const includes = condition.roles.includes(context.role);
    return (condition.operator === "in" ? includes : !includes) ? "true" : "false";
  }
  if (condition.kind === "user_login_status") {
    return syntheticComparison(
      syntheticFieldValue(context.user, "IsLoggedIn"),
      { kind: "boolean", value: condition.value }, condition.operator);
  }
  if (condition.kind === "user_attribute_flag") {
    const fields = context.userAttributes?.find(item => item.name === condition.attributeName)?.fields;
    const flag = syntheticFieldValue(fields, condition.attributeColumnId);
    return flag?.kind === "boolean" ? (flag.value ? "true" : "false") : "unknown";
  }
  // Synthetic contexts represent single operands only. A missing list
  // is not evidence that Grist evaluates a membership test to false.
  if (condition.kind === "record_in_user_attribute_ref_list") return "unknown";

  const fromRecord = (columnId: string, useNewRec = false) =>
    syntheticFieldValue(useNewRec ? context.newRec : context.rec, columnId);
  if (condition.kind === "column_change") {
    return syntheticComparison(fromRecord(condition.columnId),
      fromRecord(condition.columnId, true), condition.operator);
  }
  const value = fromRecord(condition.columnId, condition.record === "newRec");
  if (condition.kind === "match_boolean") {
    return syntheticComparison(value,
      { kind: "boolean", value: condition.value }, condition.operator);
  }
  if (condition.kind === "match_integer_flag") {
    return syntheticComparison(value,
      { kind: "flag", value: condition.value }, condition.operator);
  }
  if (condition.kind === "match_empty_text") {
    return syntheticComparison(value, { kind: "empty_text" }, condition.operator);
  }
  if (condition.kind === "match_user") {
    return syntheticComparison(value,
      syntheticFieldValue(context.user, condition.userProperty), condition.operator);
  }
  if (condition.kind === "match_link_key") {
    return syntheticComparison(value,
      syntheticFieldValue(context.linkKeys, condition.linkKeyName), condition.operator);
  }
  const fields = context.userAttributes?.find(
    (item) => item.name === condition.attributeName)?.fields;
  return syntheticComparison(value,
    syntheticFieldValue(fields, condition.attributeColumnId), condition.operator);
}

type PolicyOperation = AccessPolicyCoverageRequest["operation"];

function firstSimulatedPermission(
  rules: readonly NormalizedAccessRule[],
  matches: readonly SyntheticTruth[],
  operation: PolicyOperation
): { decision: AccessPermissionValue | "unknown"; ruleIndex?: number } {
  for (const [index, rule] of rules.entries()) {
    const permission = rule.permissions[operation];
    const match = matches[index]!;
    if (permission === "unspecified" || match === "false") continue;
    return { decision: match === "unknown" ? "unknown" : permission, ruleIndex: index + 1 };
  }
  return { decision: "unspecified" };
}

/** Theoretical evaluation of ordinary policy for an explicit synthetic scenario. */
function expectedAccessDecision(
  snapshot: AccessRulesSnapshot,
  tableId: string,
  targetKind: AccessRuleSchemaImpactTarget["kind"],
  operation: PolicyOperation,
  groups: readonly AccessRuleGroupState[],
  context: AccessRuleSyntheticContext
): unknown {
  if (!context.role || (operation === "create" && context.rec !== undefined) ||
      (operation === "delete" && context.newRec !== undefined)) {
    return { decision: "UNKNOWN", reason: "incomplete_or_inapplicable_context" };
  }
  // Native C/D evaluates both row operands against the same proposed/current row.
  const inputs = typedSyntheticContext(snapshot, tableId, {
    ...context,
    ...(operation === "create" ? { rec: context.newRec } : {}),
    ...(operation === "delete" ? { newRec: context.rec } : {})
  });
  const trace = [];
  // Ordinary Grist viewers cannot send row writes, regardless of the ACL bits.
  if (operation !== "read" && context.role === "viewer") {
    return { decision: "deny", trace: [{ source: "nominal_document_role" }] };
  }

  const evaluatedGroups = groups.map((group) => {
    const rules = group.normalizedRules!;
    const outcome = firstSimulatedPermission(rules, rules.map((rule) =>
      rule.permissions[operation] === "unspecified" ? "false" : syntheticCondition(rule.condition, inputs)),
    operation);
    return { target: group.target, ...outcome };
  });
  const tableRule = evaluatedGroups.find((group) => group.target.columnIds.length === 0);
  const columnRules = evaluatedGroups.filter((group) => group.target.columnIds.length > 0);
  const tableDecision = tableRule && tableRule.decision !== "unspecified" ? tableRule.decision : "allow";
  const tableTrace = tableRule && tableRule.decision !== "unspecified"
    ? { source: "table", ...tableRule }
    : { source: "built_in_default", decision: "allow" };

  if (targetKind === "column") {
    const columnRule = columnRules[0];
    const result = columnRule && columnRule.decision !== "unspecified"
      ? { source: "column", ...columnRule }
      : tableTrace;
    return result.decision === "unknown"
      ? { decision: "UNKNOWN", reason: "missing_synthetic_operand", trace: [result] }
      : { decision: result.decision, trace: [result] };
  }

  trace.push(tableTrace);
  for (const columnRule of columnRules) {
    if (columnRule.decision !== "unspecified") trace.push({ source: "column", ...columnRule });
  }
  if (trace.some((step) => step.decision === "unknown")) {
    return { decision: "UNKNOWN", reason: "missing_synthetic_operand", trace };
  }
  if (trace.some((step) => step.decision !== tableDecision)) {
    return { decision: "UNKNOWN", reason: "mixed_columns", trace };
  }
  return { decision: tableDecision, trace };
}

/**
 * Explain exactly one supported ordinary group under invented, closed values.
 * Unknown inputs and opaque policy stay unknown. Never infer native authority.
 */
export function projectAccessRuleSimulation(
  snapshot: AccessRulesSnapshot,
  request: AccessRuleSimulationRequest
): unknown {
  const target = normalizeRequestedTarget(snapshot, request.target);
  const group = snapshot.groups.find((item) => sameTarget(item.target, target));
  const disclaimer =
    "Invented symbolic scenario for one ordinary group only. This is not native Grist enforcement, full policy precedence, a security test, a LinkKey web test, or confidentiality verification. Missing synthetic inputs and protected policy are unknown.";
  if (!group?.normalizedRules) {
    return {
      target: target.columnIds.length ? target : { tableId: target.tableId },
      simulated: true,
      nativeEnforcementVerified: false,
      confidentialityVerified: false,
      status: group ? "protected_group" : "no_explicit_group",
      ruleMatches: null,
      permissionDecisions: null,
      note: disclaimer
    };
  }
  const context = typedSyntheticContext(snapshot, target.tableId, request.context);
  const ruleMatches = group.normalizedRules.map((rule, index) => ({
    ruleIndex: index + 1,
    match: syntheticCondition(rule.condition, context)
  }));
  const matches = ruleMatches.map((rule) => rule.match);
  const permissionDecisions = Object.fromEntries(
    ACCESS_POLICY_OPERATIONS.map((permission) => [
      permission, firstSimulatedPermission(group.normalizedRules!, matches, permission)
    ])
  );
  return {
    target: target.columnIds.length ? target : { tableId: target.tableId },
    simulated: true,
    nativeEnforcementVerified: false,
    confidentialityVerified: false,
    status: "supported_group",
    ruleMatches,
    permissionDecisions,
    note: disclaimer
  };
}

export function resolveAccessRuleMutation(
  snapshot: AccessRulesSnapshot,
  targetInput: AccessRuleTarget,
  mode: AccessRuleMutationIntent,
  rulesInput?: readonly AccessRuleInput[]
): AccessRuleMutationPlan {
  const target = normalizeRequestedTarget(snapshot, targetInput);
  const existing = snapshot.groups.find((group) => sameTarget(group.target, target));
  const table = snapshot.tables.get(target.tableId)!;

  if (mode === "create" && existing) {
    throw new Error("An access-rule group already exists for this stable table/column target.");
  }
  if ((mode === "replace" || mode === "delete") && !existing) {
    throw new Error("No access-rule group exists for this stable table/column target.");
  }
  if (existing && !existing.normalizedRules) {
    throw new Error(
      "The selected access-rule group contains unsupported or sensitive persisted semantics and cannot be modified by Gia."
    );
  }

  assertNoColumnOverlap(snapshot, target, existing?.resourceRecordId);

  if (mode === "delete") {
    if (rulesInput !== undefined) {
      throw new Error("Delete access-rule mutations do not accept a replacement rules list.");
    }
    return {
      mode,
      requestedMode: mode,
      target,
      resourceRecordId: existing!.resourceRecordId,
      ruleRecordIds: [...existing!.ruleRecordIds],
      rules: [],
      normalizedRules: [],
      untargetedFingerprint: untargetedFingerprint(snapshot, target)
    };
  }

  if (!rulesInput) throw new Error("Create, ensure and replace access-rule mutations require rules.");
  const requested = normalizeRequestedRules(
    rulesInput, target, table, userAttributeReferenceContext(snapshot)
  );

  if (
    (mode === "replace" || mode === "ensure") &&
    existing?.normalizedRules &&
    sameNormalizedRules(existing.normalizedRules, requested.normalized)
  ) {
    return {
      mode: "noop",
      requestedMode: "replace",
      target,
      resourceRecordId: existing.resourceRecordId,
      ruleRecordIds: [...existing.ruleRecordIds],
      rules: requested.writes,
      normalizedRules: requested.normalized,
      untargetedFingerprint: untargetedFingerprint(snapshot, target)
    };
  }
  if (mode === "ensure" && existing) {
    throw new Error("The existing access-rule group differs from the requested definition.");
  }

  const writeMode = mode === "ensure" ? "create" : mode;
  return {
    mode: writeMode,
    requestedMode: writeMode,
    target,
    ...(existing ? { resourceRecordId: existing.resourceRecordId } : {}),
    ruleRecordIds: existing ? [...existing.ruleRecordIds] : [],
    rules: requested.writes,
    normalizedRules: requested.normalized,
    untargetedFingerprint: untargetedFingerprint(snapshot, target)
  };
}

export function verifyAccessRuleMutation(
  before: AccessRulesSnapshot,
  after: AccessRulesSnapshot,
  plan: AccessRuleMutationPlan
): {
  changed: boolean;
  ruleCount: number;
  persistedDefinitionVerified: true;
  effectiveEnforcementVerified: false;
} {
  if (plan.untargetedFingerprint !== untargetedFingerprint(before, plan.target)) {
    throw new Error("Internal access-rule verification state changed before mutation.");
  }
  if (plan.untargetedFingerprint !== untargetedFingerprint(after, plan.target)) {
    throw new Error(
      "Untargeted persisted access-rule state changed during the mutation; the requested write may have succeeded, but the complete preservation postcondition is uncertain."
    );
  }

  const actual = after.groups.find((group) => sameTarget(group.target, plan.target));
  if (plan.requestedMode === "delete") {
    if (actual) {
      throw new Error(
        "The target access-rule group is still present after deletion; the write may have partially succeeded."
      );
    }
    return {
      changed: true,
      ruleCount: 0,
      persistedDefinitionVerified: true,
      effectiveEnforcementVerified: false
    };
  }

  if (!actual?.normalizedRules) {
    throw new Error(
      "The target access-rule group cannot be normalized after the write; persisted definition verification failed."
    );
  }
  if (!sameNormalizedRules(actual.normalizedRules, plan.normalizedRules)) {
    throw new Error(
      "The target access-rule group differs from the requested normalized definition after the write."
    );
  }
  if (plan.requestedMode === "replace" && plan.resourceRecordId !== actual.resourceRecordId) {
    throw new Error("Replacing an access-rule group unexpectedly changed its resource identity.");
  }

  return {
    changed: plan.mode !== "noop",
    ruleCount: actual.normalizedRules.length,
    persistedDefinitionVerified: true,
    effectiveEnforcementVerified: false
  };
}

/**
 * Native Grist stores a parsed Python predicate AST with each persisted ACL
 * formula.  Detect dependencies from that syntax tree instead of matching
 * formula typography: "user . Mentor" is a valid native user.Mentor lookup.
 * Refuse deletion on missing/malformed or dynamic syntax whose dependencies
 * cannot be established.  Never include formula text in a model-facing error.
 */
function nativeUserAttributeReferences(rule: PersistedRule, targetName: string): Set<string> {
  if (rule.aclFormula === "") {
    if (rule.aclFormulaParsed !== "") {
      throw new Error("Native ACL predicate metadata is inconsistent; refusing user-attribute deletion.");
    }
    return new Set();
  }
  if (!rule.aclFormulaParsed || rule.aclFormulaParsed.length > MAX_NATIVE_ACL_AST_LENGTH) {
    throw new Error("Native ACL predicate metadata is missing or oversized; refusing user-attribute deletion.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rule.aclFormulaParsed);
  } catch {
    throw new Error("Native ACL predicate metadata is malformed; refusing user-attribute deletion.");
  }
  const names = new Set<string>();
  let visited = 0;
  const binary = new Set([
    "Add", "Sub", "Mult", "Div", "Mod", "Eq", "NotEq", "Lt", "LtE", "Gt",
    "GtE", "Is", "IsNot", "In", "NotIn"
  ]);
  function inspect(node: unknown): void {
    if (++visited > 4096 || !Array.isArray(node) || typeof node[0] !== "string") {
      throw new Error("Native ACL predicate is incomplete; refusing user-attribute deletion.");
    }
    const [kind, ...args] = node;
    if (kind === "Name") {
      if (args.length !== 1 || typeof args[0] !== "string" || args[0] === "user") {
        // A bare user object may feed an unsupported dynamic attribute lookup.
        throw new Error("Native ACL user dependency is ambiguous; refusing user-attribute deletion.");
      }
      return;
    }
    if (kind === "Const") {
      if (args.length !== 1 || (args[0] !== null &&
          typeof args[0] !== "string" && typeof args[0] !== "number" &&
          typeof args[0] !== "boolean")) {
        throw new Error("Native ACL constant is malformed; refusing user-attribute deletion.");
      }
      return;
    }
    if (kind === "Attr") {
      if (args.length !== 2 || typeof args[1] !== "string") {
        throw new Error("Native ACL attribute is malformed; refusing user-attribute deletion.");
      }
      const owner = args[0];
      if (Array.isArray(owner) && owner.length === 2 &&
          owner[0] === "Name" && owner[1] === "user") {
        names.add(args[1]);
      } else {
        inspect(owner);
      }
      return;
    }
    if (kind === "Comment") {
      if (args.length !== 2 || typeof args[1] !== "string") {
        throw new Error("Native ACL comment is malformed; refusing user-attribute deletion.");
      }
      inspect(args[0]);
      return;
    }
    if (kind === "Not" && args.length === 1) {
      inspect(args[0]);
      return;
    }
    if (binary.has(kind) && args.length === 2) {
      inspect(args[0]);
      inspect(args[1]);
      return;
    }
    if (((kind === "And" || kind === "Or") && args.length >= 2) ||
        kind === "List") {
      args.forEach(inspect);
      return;
    }
    // Call and unknown native nodes may conceal dynamic access to user.<name>.
    throw new Error("Native ACL predicate is outside the safe dependency subset; refusing user-attribute deletion.");
  }
  inspect(parsed);
  // Also fail closed when the raw formula plainly names the selected attribute
  // but stored parsed metadata disagrees (e.g. a stale/censored parsed field).
  if (new RegExp(`\\buser\\s*\\.\\s*${targetName}\\b`).test(rule.aclFormula) &&
      !names.has(targetName)) {
    throw new Error("Native ACL predicate metadata disagrees with its formula; refusing deletion.");
  }
  return names;
}

/** Native user attributes are rows of _grist_ACLRules, not identity/share administration. */
export function resolveUserAttributeMutation(
  snapshot: AccessRulesSnapshot,
  target: AccessUserAttributeTarget,
  mode: AccessRuleMutationIntent,
  definition?: AccessUserAttributeDefinitionInput
): AccessUserAttributeMutationPlan {
  const name = target.userAttributeName;
  if (typeof name !== "string" || name.length > MAX_ACCESS_RULE_LINK_KEY_NAME_LENGTH ||
      !SAFE_IDENTIFIER.test(name) || reservedUserAttributeName(name)) {
    throw new Error("User attribute name must be a bounded, non-reserved stable identifier.");
  }
  // A selected name must not collide with any opaque/ambiguous native definition.
  // Refusing *all* writes in that case is intentional: even a different name
  // could shadow a malformed rule or alter native resolution order.
  const inspected = projectUserAttributes(snapshot);
  if (inspected.protectedDefinitionCount !== 0) {
    throw new Error("Native user-attribute definitions are unsupported or ambiguous; refusing mutation.");
  }
  const defaultResources = snapshot.resources.filter(r => r.tableId === "*" && r.colIds === "*");
  if (defaultResources.length > 1) {
    throw new Error("Multiple default ACL resources; refusing user-attribute mutation.");
  }
  const existing = inspected.definitions.find(d => d.name === name);
  if (mode === "create" && existing) {
    throw new Error("A native user attribute already exists with this name.");
  }
  if ((mode === "replace" || mode === "delete") && !existing) {
    throw new Error("The selected native user attribute does not exist.");
  }
  if (mode === "delete" && definition !== undefined) {
    throw new Error("Delete user-attribute mutations do not accept a definition.");
  }
  if (mode !== "delete" && definition === undefined) {
    throw new Error("Create, ensure and replace user-attribute mutations require a typed definition.");
  }
  if (definition !== undefined) {
    const { tableId, lookupColId, source } = definition;
    if (!SAFE_IDENTIFIER.test(tableId) || tableId.startsWith("_grist_") ||
        !SAFE_IDENTIFIER.test(lookupColId) ||
        !snapshot.tables.get(tableId)?.columns.has(lookupColId)) {
      throw new Error("User-attribute lookup must name an existing ordinary table and stable column.");
    }
    if (!source || (source.kind !== "user_property" && source.kind !== "link_key")) {
      throw new Error("User-attribute source must be a supported typed user property or LinkKey name.");
    }
    if (source.kind === "user_property" &&
        !ACCESS_USER_ATTRIBUTE_PROPERTIES.includes(source.property)) {
      throw new Error("User-attribute source property is unsupported.");
    }
    if (source.kind === "link_key" && !validLinkKeyName(source.name)) {
      throw new Error("User-attribute LinkKey name is not a bounded safe identifier.");
    }
  }
  const selected = existing
    ? snapshot.rules.filter(rule => {
        const raw = rule.fields.userAttributes;
        if (typeof raw !== "string") return false;
        try { return record(JSON.parse(raw))?.name === name; } catch { return false; }
      })
    : [];
  if (existing && (selected.length !== 1 || selected[0]!.resourceId !== defaultResources[0]?.id)) {
    throw new Error("User-attribute native row identity is ambiguous.");
  }
  // Preserve even opaque ACL conditions whose native parsed syntax references
  // the attribute; refuse uncertain/dynamic dependency metadata entirely.
  if (mode === "delete") {
    for (const rule of snapshot.rules) {
      if (nativeUserAttributeReferences(rule, name).has(name)) {
        throw new Error("An existing ACL condition references this attribute; delete its dependencies first.");
      }
    }
  }
  const defaultResourceId = defaultResources[0]?.id;
  // Native Grist may assign fractional rule positions when inserting rows.
  // Existing definitions do not allocate a new position on replay, replace
  // or delete. A new definition is appended after all current default rules.
  let rulePos = selected[0]?.rulePos ?? 1;
  if (!existing) {
    const positions = snapshot.rules
      .filter(rule => rule.resourceId === defaultResourceId)
      .map(rule => rule.rulePos ?? 0);
    rulePos = Math.floor(Math.max(0, ...positions)) + 1;
    if (!Number.isSafeInteger(rulePos) || rulePos < 1) {
      throw new Error("Cannot allocate a finite native user-attribute rule position.");
    }
  }
  const charId = definition?.source.kind === "user_property"
    ? definition.source.property
    : definition?.source.kind === "link_key"
      ? `LinkKey.${definition.source.name}`
      : undefined;
  const nativeDefinition = definition === undefined ? undefined : JSON.stringify({
    name, tableId: definition.tableId, lookupColId: definition.lookupColId, charId
  });
  const selectedRuleId = selected[0]?.id;
  const existingNative = selected[0]?.fields.userAttributes;
  const sameDefinition = existing && definition && existing.tableId === definition.tableId &&
    existing.lookupColId === definition.lookupColId && stableJson(existing.source) === stableJson(definition.source);
  if (mode === "ensure" && existing && !sameDefinition) {
    throw new Error("The existing native user attribute differs from the requested definition.");
  }
  const unchanged = mode === "ensure" ? sameDefinition :
    mode === "replace" && existingNative === nativeDefinition;
  // An ACL dependency may rely on the lookup table/field. Do not silently
  // rebind an attribute with dependent policies, even when the target is typed.
  if (mode === "replace" && !unchanged) {
    for (const rule of snapshot.rules) {
      if (nativeUserAttributeReferences(rule, name).has(name)) {
        throw new Error("ACL conditions reference this user attribute; remove dependencies before replacing it.");
      }
    }
  }
  const writeMode = mode === "ensure" ? (existing ? "replace" : "create") : mode;
  return {
    mode: unchanged ? "noop" : writeMode,
    requestedMode: writeMode,
    name,
    ...(selectedRuleId === undefined ? {} : { targetRuleId: selectedRuleId }),
    ...(defaultResourceId === undefined ? {} : { defaultResourceId }),
    createDefaultResource: writeMode === "create" && defaultResourceId === undefined,
    rulePos,
    ...(nativeDefinition === undefined ? {} : { nativeDefinition })
  };
}

function otherAclRows(snapshot: AccessRulesSnapshot, skipRuleId?: number): string {
  return stableJson(snapshot.rules
    .filter(rule => rule.id !== skipRuleId)
    .map(rule => ({ id: rule.id, fields: rule.fields }))
    .sort((a, b) => a.id - b.id));
}
function aclResources(snapshot: AccessRulesSnapshot, skipResourceId?: number): string {
  return stableJson(snapshot.resources
    .filter(resource => resource.id !== skipResourceId)
    .map(resource => ({ id: resource.id, fields: resource.fields }))
    .sort((a, b) => a.id - b.id));
}

export function verifyUserAttributeMutation(
  before: AccessRulesSnapshot,
  after: AccessRulesSnapshot,
  plan: AccessUserAttributeMutationPlan
): { changed: boolean; persistedDefinitionVerified: true; effectiveEnforcementVerified: false } {
  const original = plan.targetRuleId === undefined
    ? undefined : before.rules.find(r => r.id === plan.targetRuleId);
  if ((plan.requestedMode === "create") === Boolean(original)) {
    throw new Error("Internal user-attribute pre-state is inconsistent.");
  }
  const afterInspection = projectUserAttributes(after);
  if (afterInspection.protectedDefinitionCount !== 0) {
    throw new Error("Native user-attribute definitions became opaque or ambiguous after write.");
  }
  const current = afterInspection.definitions.filter(def => def.name === plan.name);
  if (plan.requestedMode === "delete" ? current.length !== 0 : current.length !== 1) {
    throw new Error("Native user-attribute postcondition does not match the requested mode.");
  }
  const afterDefault = after.resources.filter(r => r.tableId === "*" && r.colIds === "*");
  if (afterDefault.length !== 1 && (plan.requestedMode !== "delete" || plan.defaultResourceId !== undefined)) {
    throw new Error("Native default ACL resource postcondition could not be verified.");
  }
  if (plan.createDefaultResource) {
    const created = afterDefault[0];
    if (!created || before.resources.some(r => r.id === created.id) ||
        aclResources(before) !== aclResources(after, created.id)) {
      throw new Error("Untargeted ACL resources changed while creating the default resource.");
    }
  } else if (aclResources(before) !== aclResources(after)) {
    throw new Error("Untargeted ACL resources changed during user-attribute mutation.");
  }
  let actualId: number | undefined;
  if (plan.requestedMode === "create") {
    const newRules = after.rules.filter(rule => !before.rules.some(r => r.id === rule.id));
    if (newRules.length !== 1 || newRules[0]!.fields.userAttributes !== plan.nativeDefinition ||
        newRules[0]!.resourceId !== afterDefault[0]?.id) {
      throw new Error("Created native user-attribute row could not be uniquely verified.");
    }
    actualId = newRules[0]!.id;
  } else if (plan.requestedMode === "replace") {
    const afterRow = after.rules.find(r => r.id === plan.targetRuleId);
    if (!afterRow || afterRow.fields.userAttributes !== plan.nativeDefinition ||
        stableJson({ ...original!.fields, userAttributes: plan.nativeDefinition }) !==
        stableJson(afterRow.fields)) {
      throw new Error("Replaced native user-attribute row identity/content was not preserved.");
    }
    actualId = plan.targetRuleId;
  } else if (after.rules.some(r => r.id === plan.targetRuleId)) {
    throw new Error("Deleted native user-attribute row remains present.");
  }
  if (otherAclRows(before, plan.targetRuleId) !== otherAclRows(after, actualId)) {
    throw new Error("Untargeted persisted ACL rules changed during user-attribute mutation.");
  }
  return {
    changed: plan.mode !== "noop",
    persistedDefinitionVerified: true,
    effectiveEnforcementVerified: false
  };
}
