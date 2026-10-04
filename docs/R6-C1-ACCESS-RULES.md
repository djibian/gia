# R6 C1 — Bounded application-level access rules

Status: implementation candidate in R6.3.

## Product boundary

C1 adds a deliberately narrow semantic adapter for **persisted ordinary document ACL groups**. It is not a generic ACL editor and it does not add identity, user, group, organization, workspace/share, service-account or LinkKey administration.

The model-facing surface remains Gia MCP v2 with ten tools:

- `grist_inspect(action="access_rules")` inspects a normalized, data-minimized view;
- `grist_change_structure(action="access_rule_group")` creates, replaces or deletes exactly one ordinary table/column rule group.

Inspection uses Gia's local `doc:read` capability and mutation uses local `doc.schema:write`, but **both** require a fresh native Grist document metadata read proving `access === "owners"` before ACL metadata is read. Grist's own upstream Owner check remains authoritative; Gia never upgrades its principal or swaps credentials after a denial.

## Upstream provenance checked before implementation

Checked 2026-10-04 against exact current `gristlabs/grist-core` main:

- commit `72345cbe06cad2ddeee4a9db1e133d82f1fd2294`;
- `app/common/ACLPermissions.ts`: tri-state persisted permission bits, `R/U/C/D/S`, table-vs-column available bits and `all`/`none` aliases;
- `app/common/ACLRulesReader.ts`: persisted resources/rules, duplicate-resource rejection and virtual negative-ID share overlays;
- `app/common/ACLRuleCollection.ts`: ordered per-resource rule evaluation and built-in/default behavior;
- `app/client/aclui/AccessRules.ts`: native ACL editor semantics, supported user fields and separation of schema-edit/special rules;
- `sandbox/grist/acl.py` and `sandbox/grist/predicate_formula.py`: Grist-owned parsing/derivation of `aclFormulaParsed`;
- `app/server/lib/GranularAccess.ts`: native authority/enforcement path for deliberate ACL changes;
- `sandbox/grist/schema.py` / `app/common/schema.ts`: persisted `_grist_ACLResources` and `_grist_ACLRules` shape.

The Expert advisory `docs/expert/2026-10-04-r6-acl-document-boundaries-f0da0c8.md` was also consulted and remains CURRENT for C1. C1 follows its central constraints: local capabilities are necessary but not sufficient, a fresh native Grist Owner proof is mandatory before ACL metadata access, private row refs never become public identifiers, untargeted policy is preserved, opaque/sensitive policy is not normalized into writable model content, and post-write verification is explicitly limited to persisted definitions.

## Supported normalized subset

A public target is one stable table ID plus either:

- no `columnIds`: ordinary table rule group (`colIds="*"`);
- 1–50 stable, unique column IDs: ordinary column rule group.

C1 rejects metadata/special targets, missing tables/columns, duplicate stable targets and overlapping column resources.

Each group has 1–20 ordered rules. Permissions are explicit tri-state values:

- `allow`;
- `deny`;
- `unspecified`.

Table groups support `read/update/create/delete`. Column groups support only `read/update`. Native `all`/`none` aliases are intentionally not normalized because they include `S` and would blur the schema-edit boundary.

Only secret-safe conditions with no arbitrary literal input are writable:

- `everyone`;
- `user.Access ==|!= OWNER|EDITOR|VIEWER`;
- `rec.<stableColumnId> ==|!= user.<property>`, where property is one of `Email`, `UserID`, `Name`, `UserRef`, `Origin`, `IsLoggedIn` and the column type is compatible.

The bridge serializes these forms itself. Public input never contains native formula text, `aclFormulaParsed`, metadata record IDs or UserActions.

## Fail-closed preservation rules

Gia does **not** expose an existing group as editable when it contains any of the following:

- arbitrary/opaque condition syntax or literal-bearing conditions;
- `S`, `all` or `none` permissions;
- memo text;
- user-attribute definitions;
- legacy principals/permission fields;
- ambiguous/missing ordering;
- malformed or unavailable parsed predicate state.

Unsupported content is preserved internally and represented only by a generic unsupported reason. Formula text, memo text and other potentially sensitive values are not copied into the normalized response.

Defaults, `*SPECIAL`, schema-edit rules, seed/access-rules policy, user attributes and virtual share overlays are outside the writable C1 subset. Gia does not reproduce the Grist UI's “Enable Access Rules” initializer.

## Native write and postcondition

The semantic plan resolves the target resource/rule record IDs privately and emits only fixed bridge-owned actions against `_grist_ACLResources` and `_grist_ACLRules`:

- create: one resource + bounded rules;
- replace: remove only the selected group's persisted rules, keep its resource identity, then add the requested bounded rules;
- delete: remove only the selected group's rules and resource.

Grist derives `aclFormulaParsed`; Gia never accepts or writes a model-supplied parsed predicate.

Before write, Gia fingerprints **all untargeted persisted ACL rows**, including opaque fields, without exposing that content. After write it re-reads ACL resources, rules, tables and columns, refuses bounded-read truncation, verifies the requested normalized group exactly and verifies the untargeted fingerprint unchanged. Any post-write divergence is reported as an uncertainty that must not be blindly replayed or “restored” from the old snapshot.

A successful response intentionally states:

- `persistedDefinitionVerified: true`;
- `effectiveEnforcementVerified: false`.

The latter is essential: persisted ACL rows alone do not prove confidentiality or effective policy, especially while schema-edit/default/special policy may permit broader behavior.

## Explicit non-goals

C1 does not add:

- arbitrary ACL formula editing;
- a generic permission evaluator;
- raw metadata-table access;
- raw `/apply` or arbitrary UserActions;
- user/group/share/service-account management;
- LinkKey provisioning;
- user-attribute provisioning;
- general document-default or schema-edit editing;
- CAS/transaction claims that Grist does not provide.

Future expansion requires new roadmap evidence and a fresh review of upstream Grist ACL semantics.
