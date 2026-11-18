import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { createDoc, createWorkspace } from "./application-fixtures.js";
import { applyActions, createTestApiKey, gristApi, recordsFrom } from "./grist-harness.js";
import {
  mutationObservation, openDisposableGrist, qualificationStatus,
  type DisposableGrist
} from "./authorization-qualification.js";

const surface = "api";
const scope = "disposable_synthetic_locked_reference_interleaving";
type WriteOperation = "create" | "update" | "delete";

export class ObservedLockFailure extends Error {}

function requireObserved(condition: unknown, stage: string): asserts condition {
  if (!condition) throw new ObservedLockFailure(stage);
}

export function lockFailureEvidence(error: unknown) {
  return error instanceof ObservedLockFailure
    ? { stage: error.message, status: "FAIL" as const }
    : { stage: "lock_interleaving_or_postcondition", status: "UNKNOWN" as const };
}

/** Both lanes participate. Lock acknowledgement precedes both competing writes. */
export async function runLockInterleaving<T>(stages: {
  lock: (signal: AbortSignal) => Promise<void>;
  contend: (signal: AbortSignal) => Promise<T>;
  migrate: (signal: AbortSignal) => Promise<void>;
}, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const signal = controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const locked = Promise.withResolvers<void>();
  const submitted = Promise.withResolvers<void>();
  const stopped = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("qualification_interleaving_aborted")), { once: true });
  });
  async function operator(): Promise<void> {
    await Promise.race([stages.lock(signal), stopped]);
    signal.throwIfAborted();
    locked.resolve();
    await Promise.race([submitted.promise, stopped]);
    signal.throwIfAborted();
    await Promise.race([stages.migrate(signal), stopped]);
  }
  async function contender(): Promise<T> {
    await Promise.race([locked.promise, stopped]);
    signal.throwIfAborted();
    const attempts = stages.contend(signal);
    submitted.resolve();
    return Promise.race([attempts, stopped]);
  }
  try {
    const [a, b] = await Promise.allSettled([
      operator().catch((error) => { controller.abort(); throw error; }),
      contender().catch((error) => { controller.abort(); throw error; })
    ]);
    if (a.status === "rejected" && a.reason instanceof ObservedLockFailure) throw a.reason;
    if (b.status === "rejected" && b.reason instanceof ObservedLockFailure) throw b.reason;
    if (a.status !== "fulfilled" || b.status !== "fulfilled" || signal.aborted) {
      throw new Error("qualification_interleaving_incomplete");
    }
    return b.value;
  } finally {
    clearTimeout(timer);
  }
}

async function setup({ baseUrl }: DisposableGrist) {
  const suffix = randomUUID();
  const editorEmail = `qualification-editor-${suffix}@example.invalid`;
  const owner = await createTestApiKey(baseUrl, `qualification-owner-${suffix}@example.invalid`, "Lock Owner");
  const editor = await createTestApiKey(baseUrl, editorEmail, "Lock Editor");
  const workspace = await createWorkspace(baseUrl, owner, "Disposable lock qualification");
  await gristApi(baseUrl, owner, `/api/workspaces/${workspace}/access`, {
    method: "PATCH", body: JSON.stringify({ delta: { users: { [editorEmail]: "editors" } } })
  });
  const document = await createDoc(baseUrl, owner, workspace, "Synthetic reference locking");
  await applyActions(baseUrl, owner, document, [
    ["AddTable", "Gate", [{ id: "Principal", type: "Text" }, { id: "Locked", type: "Bool" }]],
    ["AddTable", "Targets", [{ id: "Label", type: "Text" }]],
    ["AddTable", "References", [{ id: "Target", type: "Ref:Targets" }, { id: "Label", type: "Text" }]],
    ["AddRecord", "Gate", 1, { Principal: editorEmail, Locked: false }],
    ["AddRecord", "Targets", 1, { Label: "Retiring" }],
    ["AddRecord", "Targets", 2, { Label: "Preserve target" }],
    ["AddRecord", "References", 1, { Target: 1, Label: "Move this reference" }],
    ["AddRecord", "References", 2, { Target: 2, Label: "Original control" }],
    ["AddRecord", "_grist_ACLResources", -1, { tableId: "References", colIds: "*" }],
    ["AddRecord", "_grist_ACLResources", -2, { tableId: "*", colIds: "*" }],
    ["AddRecord", "_grist_ACLRules", null, {
      resource: -2, userAttributes: JSON.stringify({
        name: "LockPolicy", tableId: "Gate", lookupColId: "Principal", charId: "Email"
      })
    }],
    ["AddRecord", "_grist_ACLRules", null, {
      resource: -1, aclFormula: "user.Access == OWNER", permissionsText: "+RCUD"
    }],
    ["AddRecord", "_grist_ACLRules", null, {
      resource: -1,
      aclFormula: "user.LockPolicy.Locked == True and newRec.Target == 1", permissionsText: "-CU"
    }],
    ["AddRecord", "_grist_ACLRules", null, {
      resource: -1, aclFormula: "user.LockPolicy.Locked == True", permissionsText: "-D"
    }],
    ["AddRecord", "_grist_ACLRules", null, {
      resource: -1, aclFormula: "", permissionsText: "+RCUD"
    }],
    ["AddRecord", "_grist_ACLResources", -3, { tableId: "Gate", colIds: "*" }],
    ["AddRecord", "_grist_ACLRules", null, {
      resource: -3, aclFormula: "user.Access != OWNER", permissionsText: "-CUD"
    }]
  ]);
  return { owner, editor, document };
}

async function run(
  { baseUrl, version }: DisposableGrist,
  { owner, editor, document }: Awaited<ReturnType<typeof setup>>
): Promise<void> {
  const records = (table: string) => `/api/docs/${encodeURIComponent(document)}/tables/${table}/records`;
  const read = async (table: string, signal?: AbortSignal) =>
    recordsFrom(await gristApi(baseUrl, owner, records(table), signal ? { signal } : undefined));
  const write = (key: string, table: string, operation: WriteOperation, body: unknown, signal?: AbortSignal) =>
    fetch(new URL(records(table) + (operation === "delete" ? "/delete" : ""), baseUrl), {
      method: operation === "update" ? "PATCH" : "POST", redirect: "error",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000)
    });
  const acknowledge = async (result: Promise<Response>, stage: string) => {
    const response = await result;
    await response.arrayBuffer();
    requireObserved(response.status !== 403, stage);
    if (!response.ok) throw new Error("native_response_inconclusive");
  };
  const patch = (id: number, fields: Record<string, unknown>) => ({ records: [{ id, fields }] });

  // Observe the same editor's permitted writes before locking, including
  // creation of and update to an old-target reference and deletion of a row.
  await acknowledge(write(editor, "References", "create", {
    records: [{ fields: { Target: 1, Label: "Unlocked control" } }]
  }), "editor_create_control_denied");
  const unlocked = (await read("References")).find(({ fields }) => fields.Label === "Unlocked control");
  requireObserved(unlocked?.fields.Target === 1, "editor_create_control_missing");
  await acknowledge(write(editor, "References", "delete", [unlocked.id]), "editor_delete_control_denied");
  requireObserved((await read("References")).every(({ id }) => id !== unlocked.id), "editor_delete_control_missing");
  await acknowledge(write(editor, "References", "update", patch(2, { Target: 1 })),
    "editor_update_control_denied");
  requireObserved((await read("References")).find(({ id }) => id === 2)?.fields.Target === 1,
    "editor_update_control_missing");
  await acknowledge(write(editor, "References", "update", patch(2, { Target: 2, Label: "Preserve control" })),
    "editor_control_reset_denied");
  const originalRefs = await read("References");
  const originalControl = originalRefs.find(({ id }) => id === 2);
  requireObserved(originalControl?.fields.Target === 2 && originalControl.fields.Label === "Preserve control",
    "editor_control_reset_missing");
  console.log(JSON.stringify({ version, surface, scope, stage: "unlocked_editor_control", status: "PASS" }));
  const refused = await runLockInterleaving({
    lock: async (signal) => {
      await acknowledge(write(owner, "Gate", "update", patch(1, { Locked: true }), signal),
        "operator_lock_rejected");
      requireObserved((await read("Gate", signal))[0]?.fields.Locked === true, "operator_lock_unobserved");
    },
    contend: (signal) => Promise.all(([
      ["create", { records: [{ fields: { Target: 1, Label: "Rejected new reference" } }] }],
      ["update", patch(2, { Target: 1 })],
      ["delete", [1]]
    ] as const).map(async ([operation, body]) => {
      const response = await write(editor, "References", operation, body, signal);
      const error: unknown = response.status === 403
        ? (await response.json() as { error?: unknown }).error : await response.arrayBuffer();
      return { operation, status: response.status, error };
    })),
    migrate: async (signal) => {
      await acknowledge(write(owner, "References", "update", patch(1, { Target: 2 }), signal),
        "operator_migration_rejected");
    }
  });

  const migrated = await read("References");
  const moved = migrated.find(({ id }) => id === 1);
  const untouched = migrated.find(({ id }) => id === 2);
  const observedUnchanged = {
    create: migrated.length === originalRefs.length,
    update: isDeepStrictEqual(untouched, originalControl),
    delete: moved !== undefined
  };
  let allPassed = true;
  for (const { operation, status: httpStatus, error } of refused) {
    const unchanged = observedUnchanged[operation];
    const observed = mutationObservation(operation, httpStatus, error, !unchanged, unchanged);
    const status = qualificationStatus("deny", observed);
    console.log(JSON.stringify({ version, surface, scope, operation, expected: "deny",
      observed: observed.decision ?? "UNKNOWN", status }));
    if (status !== "PASS") allPassed = false;
  }
  const migratedStateValid = moved?.fields.Target === 2 && moved.fields.Label === "Move this reference" &&
    observedUnchanged.create && observedUnchanged.update;
  if (!allPassed || !migratedStateValid) {
    console.log(JSON.stringify({ version, surface, scope, stage: "retire_target",
      status: allPassed ? "FAIL" : "NOT_TESTED" }));
    process.exitCode = 1;
    return;
  }
  // Retire only after native refusals and preservation were independently
  // observed. Re-read both tables after deletion.
  await acknowledge(write(owner, "Targets", "delete", [1]), "operator_delete_rejected");
  const references = await read("References");
  const targets = await read("Targets");
  const gate = await read("Gate");
  const remaining = targets[0];
  const valid = isDeepStrictEqual(references, migrated) &&
    gate[0]?.fields.Locked === true &&
    targets.length === 1 && remaining?.id === 2 && remaining.fields.Label === "Preserve target" &&
    references.every(({ fields }) => fields.Target === remaining.id);
  console.log(JSON.stringify({ version, surface, scope, stage: "preserve_references", status: valid ? "PASS" : "FAIL" }));
  if (!valid) process.exitCode = 1;
}

async function main(): Promise<void> {
  let target: DisposableGrist;
  try {
    target = await openDisposableGrist(
      process.env.GIA_QUALIFICATION_CONTAINER ?? "", process.env.GRIST_COMPAT_VERSION ?? ""
    );
  } catch {
    console.log(JSON.stringify({ surface, scope, stage: "disposable_provenance", status: "NOT_TESTED" }));
    process.exitCode = 1;
    return;
  }
  const fixture = await setup(target).catch(() => undefined);
  if (!fixture) {
    console.log(JSON.stringify({ version: target.version, surface, scope,
      stage: "synthetic_fixture", status: "NOT_TESTED" }));
    process.exitCode = 1;
    return;
  }
  await run(target, fixture).catch((error: unknown) => {
    console.log(JSON.stringify({ version: target.version, surface, scope, ...lockFailureEvidence(error) }));
    process.exitCode = 1;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
