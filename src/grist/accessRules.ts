type JsonRecord = Record<string, unknown>;

export const MAX_ACCESS_RULES_PER_GROUP = 20;
export const MAX_ACCESS_RULE_COLUMNS = 50;
export const MAX_ACCESS_RULE_LINK_KEY_NAME_LENGTH = 100;
export const MAX_ACCESS_RULE_CONDITION_NODES = 20;
export const MAX_ACCESS_RULE_CONDITION_DEPTH = 4;
export const MAX_ACCESS_RULE_CONDITION_WIDTH = 6;
export const MAX_ACCESS_RULE_FORMULA_LENGTH = 2048;

export const ACCESS_RULE_USER_PROPERTIES = [
  "Email",
  "UserID",
  "Name",
  "UserRef",
  "Origin",
  "IsLoggedIn"
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
      kind: "match_boolean";
      operator: AccessRuleOperator;
      columnId: string;
      value: boolean;
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

export interface AccessRuleInput {
  condition: AccessRuleCondition;
  permissions: AccessRulePermissions;
}

export interface AccessRuleTarget {
  tableId: string;
  columnIds?: readonly string[] | undefined;
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

function parseLeafCondition(
  formula: string,
  table: TableInfo
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

function parseCondition(formula: string, table: TableInfo): AccessRuleCondition | undefined {
  if (formula === "") return { kind: "everyone" };
  if (formula.length > MAX_ACCESS_RULE_FORMULA_LENGTH) return undefined;
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
    return parseLeafCondition(value, table);
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
    condition.kind === "match_boolean") && condition.record === "newRec";
}

type AccessRuleLeafCondition = Exclude<AccessRuleCondition, { kind: "all" | "any" } | { kind: "not" }>;

function serializeLeafCondition(condition: AccessRuleLeafCondition, table: TableInfo): string {
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

  if (condition.kind === "match_boolean") {
    if (!SAFE_IDENTIFIER.test(condition.columnId) || typeof condition.value !== "boolean" ||
        table.columns.get(condition.columnId)?.type !== "Bool") {
      throw new Error("Boolean literal ACL predicates require an existing Bool column and a boolean value.");
    }
    return `${recordExpression(condition)} ${OP_NATIVE[condition.operator]} ${condition.value ? "True" : "False"}`;
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

function serializeCondition(condition: AccessRuleCondition, table: TableInfo): string {
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
    return serializeLeafCondition(node, table);
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

function isParsedFormulaAvailable(rule: PersistedRule): boolean {
  if (rule.aclFormula === "") return rule.aclFormulaParsed === "";
  if (!rule.aclFormulaParsed) return false;
  try {
    JSON.parse(rule.aclFormulaParsed);
    return true;
  } catch {
    return false;
  }
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
  table: TableInfo
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
    const condition = parseCondition(rule.aclFormula, table);
    const permissions = parsePermissions(rule.permissionsText, target.columnIds.length > 0);
    if (!condition || !permissions || !isParsedFormulaAvailable(rule)) {
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
  table: TableInfo
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
    const aclFormula = serializeCondition(rule.condition, table);
    const canonicalCondition = parseCondition(aclFormula, table);
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

  const rules: PersistedRule[] = metadataRecords(rulesResponse, "ACL rule").map((entry) => {
    const resourceId = positiveInteger(entry.fields.resource);
    if (!resourceId || !resourceIds.has(resourceId)) {
      throw new Error("Grist ACL rule metadata contains a dangling or unavailable resource reference.");
    }
    const rulePos =
      typeof entry.fields.rulePos === "number" && Number.isFinite(entry.fields.rulePos)
        ? entry.fields.rulePos
        : undefined;
    return {
      ...entry,
      resourceId,
      aclFormula: requiredString(entry.fields, "aclFormula", "ACL rule"),
      aclFormulaParsed: requiredString(entry.fields, "aclFormulaParsed", "ACL rule"),
      permissionsText: requiredString(entry.fields, "permissionsText", "ACL rule"),
      ...(rulePos !== undefined ? { rulePos } : {})
    };
  });

  const rulesByResource = new Map<number, PersistedRule[]>();
  for (const rule of rules) {
    const values = rulesByResource.get(rule.resourceId) ?? [];
    values.push(rule);
    rulesByResource.set(rule.resourceId, values);
  }

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

    groups.push(buildGroupState(resource, rulesByResource.get(resource.id) ?? [], table));
  }

  groups.sort((a, b) => targetKey(a.target).localeCompare(targetKey(b.target)));
  return { resources, rules, tables, groups, protectedPersistedGroupCount };
}

export function projectAccessRules(snapshot: AccessRulesSnapshot): unknown {
  return {
    policyState: "persisted",
    effectiveEnforcementVerified: false,
    protectedPersistedGroupCount: snapshot.protectedPersistedGroupCount,
    groups: snapshot.groups.map((group) => ({
      target:
        group.target.columnIds.length === 0
          ? { tableId: group.target.tableId }
          : { tableId: group.target.tableId, columnIds: [...group.target.columnIds] },
      editable: Boolean(group.normalizedRules),
      ...(group.normalizedRules
        ? { rules: group.normalizedRules }
        : { unsupportedReason: group.unsupportedReason ?? "Unsupported persisted ACL semantics." })
    })),
    note:
      "Gia exposes only persisted ordinary table/column groups that fit its bounded secret-safe subset. Defaults, special rules, schema-edit policy, memos, user attributes and opaque formulas are preserved but not exposed as editable content. Grist remains authoritative for effective enforcement."
  };
}

export function resolveAccessRuleMutation(
  snapshot: AccessRulesSnapshot,
  targetInput: AccessRuleTarget,
  mode: "create" | "replace" | "delete",
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

  if (!rulesInput) throw new Error("Create and replace access-rule mutations require rules.");
  const requested = normalizeRequestedRules(rulesInput, target, table);

  if (
    mode === "replace" &&
    existing?.normalizedRules &&
    sameNormalizedRules(existing.normalizedRules, requested.normalized)
  ) {
    return {
      mode: "noop",
      requestedMode: mode,
      target,
      resourceRecordId: existing.resourceRecordId,
      ruleRecordIds: [...existing.ruleRecordIds],
      rules: requested.writes,
      normalizedRules: requested.normalized,
      untargetedFingerprint: untargetedFingerprint(snapshot, target)
    };
  }

  return {
    mode,
    requestedMode: mode,
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
