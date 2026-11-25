import type { AccessRulesSnapshot } from "./accessRules.js";

/** The single special native ACL policy allowed by the selected #295 scope. */
export const OWNER_SCHEMA_FORMULA = "user.Access != OWNER";
const SCHEMA_PERMISSION = "-S";
const PARSED = JSON.stringify([
  "NotEq", ["Attr", ["Name", "user"], "Access"], ["Name", "OWNER"]
]);
type NativeRule = AccessRulesSnapshot["rules"][number];
type NativeResource = AccessRulesSnapshot["resources"][number];

export interface OwnerSchemaGuardPlan {
  mode: "create" | "noop";
  defaultResourceId?: number;
  createDefaultResource: boolean;
  rulePos: number;
}

function userAttributeOnly(rule: NativeRule): boolean {
  const value = rule.fields.userAttributes;
  return typeof value === "string" && value.length > 0 &&
    rule.aclFormula === "" && rule.aclFormulaParsed === "" &&
    rule.permissionsText === "";
}

function canonicalNativePredicate(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.length > 4096) return false;
  try {
    // Grist serializes native parsed predicates with insignificant spaces.
    // The exact closed tree, not its JSON typography, defines this rule.
    return JSON.stringify(JSON.parse(raw) as unknown) === PARSED;
  } catch { return false; }
}

function exactGuard(rule: NativeRule): boolean {
  return rule.aclFormula === OWNER_SCHEMA_FORMULA &&
    rule.permissionsText === SCHEMA_PERMISSION &&
    canonicalNativePredicate(rule.aclFormulaParsed) &&
    Number.isFinite(rule.rulePos) && (rule.rulePos ?? 0) > 0 &&
    (rule.fields.userAttributes === "" ||
      rule.fields.userAttributes === null ||
      rule.fields.userAttributes === undefined) &&
    (rule.fields.memo === "" || rule.fields.memo === null ||
      rule.fields.memo === undefined) &&
    (rule.fields.permissions === 0 || rule.fields.permissions === undefined) &&
    (rule.fields.principals === "" || rule.fields.principals === undefined) &&
    (rule.fields.aclColumn === 0 || rule.fields.aclColumn === undefined);
}

function defaultPolicy(snapshot: AccessRulesSnapshot): {
  resource?: NativeResource;
  rules: NativeRule[];
  guard?: NativeRule;
} {
  const resources = snapshot.resources.filter(row =>
    row.tableId === "*" && row.colIds === "*");
  if (resources.length > 1) {
    throw new Error("Multiple native default ACL resources; refusing schema guard.");
  }
  const resource = resources[0];
  const rules = snapshot.rules.filter(rule => rule.resourceId === resource?.id);
  const guard = rules.find(exactGuard);
  // Native user-attribute definitions coexist with special schema policy.
  // Protect arbitrary defaults, unsupported special rules and partial metadata.
  if (rules.some(rule => rule !== guard && !userAttributeOnly(rule))) {
    throw new Error("Existing default ACL contains unsupported policy; refusing schema guard.");
  }
  if (rules.some(rule => !Number.isFinite(rule.rulePos) ||
      (rule.rulePos ?? 0) <= 0) ||
      new Set(rules.map(rule => rule.rulePos)).size !== rules.length) {
    throw new Error("Native default ACL order is ambiguous.");
  }
  // Rules must resolve to their stated default resource; orphan rules are
  // not permitted to masquerade as a clean default policy snapshot.
  if (snapshot.rules.some(rule =>
    rule.resourceId !== resource?.id && !snapshot.resources.some(res => res.id === rule.resourceId))) {
    throw new Error("Native ACL contains orphaned rules; refusing schema guard.");
  }
  return { ...(resource ? { resource } : {}), rules, ...(guard ? { guard } : {}) };
}

/** Fail closed unless the existing default policy can be preserved exactly. */
export function planOwnerSchemaGuard(snapshot: AccessRulesSnapshot): OwnerSchemaGuardPlan {
  const { resource, guard } = defaultPolicy(snapshot);
  if (guard) return {
    mode: "noop", defaultResourceId: resource!.id, createDefaultResource: false,
    rulePos: guard.rulePos!
  };
  // Grist allocates rulePos globally, even across unrelated resources.
  // A collision can turn an integer request into a fractional position.
  // Append beyond all existing finite positions, leaving every rule untouched.
  const rulePos = Math.floor(Math.max(0, ...snapshot.rules.map(rule => rule.rulePos ?? 0))) + 1;
  if (!Number.isSafeInteger(rulePos)) throw new Error("Native ACL position is exhausted.");
  return {
    mode: "create",
    ...(resource ? { defaultResourceId: resource.id } : {}),
    createDefaultResource: !resource,
    rulePos
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort()
      .map(key => JSON.stringify(key) + ":" + canonical(record[key])).join(",") + "}";
  }
  return JSON.stringify(value) ?? "undefined";
}

/** Prove one native guard added, or an exact no-op, with all other policy intact. */
export function verifyOwnerSchemaGuard(
  before: AccessRulesSnapshot, after: AccessRulesSnapshot, plan: OwnerSchemaGuardPlan
): { changed: boolean; persistedDefinitionVerified: true; effectiveEnforcementVerified: false } {
  const previous = defaultPolicy(before);
  const current = defaultPolicy(after);
  if (plan.mode === "noop") {
    if (canonical(before.resources) !== canonical(after.resources) ||
        canonical(before.rules) !== canonical(after.rules) || !previous.guard) {
      throw new Error("Idempotent schema guard state changed.");
    }
  } else {
    if (!current.guard || !current.resource ||
        current.guard.rulePos !== plan.rulePos || previous.guard ||
        (plan.defaultResourceId !== undefined &&
          current.resource.id !== plan.defaultResourceId)) {
      throw new Error("Native schema guard creation was not verified.");
    }
    const newRules = after.rules.filter(rule => !before.rules.some(old => old.id === rule.id));
    if (newRules.length !== 1 || newRules[0]!.id !== current.guard.id ||
        canonical(before.rules) !== canonical(after.rules.filter(rule => rule.id !== current.guard!.id))) {
      throw new Error("Native schema guard did not preserve other ACL rules.");
    }
    const newResources = after.resources.filter(resource =>
      !before.resources.some(old => old.id === resource.id));
    if (plan.createDefaultResource) {
      if (newResources.length !== 1 || newResources[0]!.id !== current.resource.id) {
        throw new Error("Native default schema guard resource not verified.");
      }
    } else if (newResources.length !== 0) {
      throw new Error("Unexpected native ACL resource added.");
    }
    if (canonical(before.resources) !== canonical(after.resources.filter(resource =>
      !newResources.some(created => created.id === resource.id)))) {
      throw new Error("Native schema guard changed other ACL resources.");
    }
  }
  return {
    changed: plan.mode === "create",
    persistedDefinitionVerified: true,
    effectiveEnforcementVerified: false
  };
}
