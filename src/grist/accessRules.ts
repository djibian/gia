type JsonRecord = Record<string, unknown>;

export const MAX_ACCESS_RULES_PER_GROUP = 20;
export const MAX_ACCESS_RULE_COLUMNS = 50;

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
      kind: "match_user";
      operator: AccessRuleOperator;
      columnId: string;
      userProperty: AccessRuleUserProperty;
    };

export interface AccessRulePermissions {
  read: AccessPermissionValue;
  update: AccessPermissionValue;
  create?: AccessPermissionValue;
  delete?: AccessPermissionValue;
}

export interface AccessRuleInput {
  condition: AccessRuleCondition;
  permissions: AccessRulePermissions;
}

export interface AccessRuleTarget {
  tableId: string;
  columnIds?: readonly string[];
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
  permissions: Required<AccessRulePermissions>;
}

interface AccessRuleGroupState {
  target: Required<AccessRuleTarget>;
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
  target: Required<AccessRuleTarget>;
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
  return root.records.map((entry) => {
    const item = record(entry);
    const id = positiveInteger(item?.id);
    const fields = record(item?.fields);
    if (!id || !fields) {
      throw new Error(`Grist ${label} metadata is malformed or censored.`);
    }
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

function normalizeResourceTarget(resource: PersistedResource): Required<AccessRuleTarget> | null {
  const tableId = resource.tableId.trim();
  const colIds = resource.colIds.trim();
  if (!tableId || tableId === "*" || tableId.startsWith("_grist_")) return null;
  if (colIds === "*") return { tableId, columnIds: [] };
  if (!colIds) return null;
  return {
    tableId,
    columnIds: canonicalColumnIds(colIds.split(",").map((value) => value.trim()))
  };
}

function targetKey(target: Required<AccessRuleTarget>): string {
  return `${target.tableId}\u0000${target.columnIds.length === 0 ? "*" : target.columnIds.join(",")}`;
}

function sameTarget(a: Required<AccessRuleTarget>, b: Required<AccessRuleTarget>): boolean {
  return targetKey(a) === targetKey(b);
}

function typeCompatibleWithUserProperty(type: string, userProperty: AccessRuleUserProperty): boolean {
  if (userProperty === "UserID") return type === "Int" || type === "Numeric";
  if (userProperty === "IsLoggedIn") return type === "Bool";
  return type === "Text";
}

function parseCondition(
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

  const userMatch = /^rec\.([A-Za-z_][A-Za-z0-9_]*) (==|!=) user\.(Email|UserID|Name|UserRef|Origin|IsLoggedIn)$/.exec(
    formula
  );
  if (userMatch) {
    const columnId = userMatch[1]!;
    const operator = NATIVE_OP.get(userMatch[2]!);
    const userProperty = userMatch[3] as AccessRuleUserProperty;
    const column = table.columns.get(columnId);
    if (!operator || !column || !typeCompatibleWithUserProperty(column.type, userProperty)) {
      return undefined;
    }
    return { kind: "match_user", operator, columnId, userProperty };
  }

  return undefined;
}

function serializeCondition(condition: AccessRuleCondition, table: TableInfo): string {
  if (condition.kind === "everyone") return "";

  if (condition.kind === "user_access") {
    return `user.Access ${OP_NATIVE[condition.operator]} ${ROLE_NATIVE[condition.role]}`;
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
  return `rec.${condition.columnId} ${OP_NATIVE[condition.operator]} user.${condition.userProperty}`;
}

function emptyPermissions(): Required<AccessRulePermissions> {
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
): Required<AccessRulePermissions> | undefined {
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
): { normalized: Required<AccessRulePermissions>; text: string } {
  const normalized: Required<AccessRulePermissions> = {
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
  target: Required<AccessRuleTarget>
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
): Required<AccessRuleTarget> {
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
  target: Required<AccessRuleTarget>,
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
  target: Required<AccessRuleTarget>,
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
    if (rule.condition.kind === "everyone" && index !== rules.length - 1) {
      throw new Error("An everyone access rule must be the final rule in its group.");
    }
    const permission = serializePermissions(rule.permissions, target.columnIds.length > 0);
    const normalizedRule = { condition: rule.condition, permissions: permission.normalized };
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
