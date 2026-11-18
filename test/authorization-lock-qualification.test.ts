import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { lockFailureEvidence, ObservedLockFailure, runLockInterleaving } from "../tools/authorization-lock-qualification.js";

test("contending and migrating writes both start after acknowledged lock", async () => {
  const timeline: string[] = [];
  const moveStarted = Promise.withResolvers<void>();
  const result = await runLockInterleaving({
    lock: async () => { timeline.push("lock-ack"); },
    contend: async () => {
      timeline.push("contender-submits");
      await moveStarted.promise;
      timeline.push("contender-settles");
      return "observed";
    },
    migrate: async () => {
      timeline.push("operator-migrates");
      moveStarted.resolve();
    }
  });
  assert.equal(result, "observed");
  assert.deepEqual(timeline, ["lock-ack", "contender-submits", "operator-migrates", "contender-settles"]);
});

test("lock error or timeout cannot release the contender or migration", async () => {
  for (const lock of [
    async () => { throw new Error("fixture lock rejected"); },
    async (signal: AbortSignal) => { await delay(1000, undefined, { signal }); },
    async () => new Promise<void>(() => {})
  ]) {
    const writes: string[] = [];
    await assert.rejects(() => runLockInterleaving({
      lock,
      contend: async () => { writes.push("contender"); },
      migrate: async () => { writes.push("migration"); }
    }, 20), /interleaving_incomplete/);
    assert.deepEqual(writes, []);
  }
});

test("an observed post-release mismatch aborts the other lane and remains FAIL", async () => {
  const failure = new ObservedLockFailure("operator_migration_unobserved");
  let contenderSignal: AbortSignal | undefined;
  const result = runLockInterleaving({
    lock: async () => {},
    contend: async (signal) => {
      contenderSignal = signal;
      await delay(1000, undefined, { signal });
    },
    migrate: async () => { throw failure; }
  });
  await assert.rejects(result, (error) => error === failure);
  assert.equal(contenderSignal?.aborted, true);
  assert.deepEqual(lockFailureEvidence(failure), {
    stage: "operator_migration_unobserved", status: "FAIL"
  });
  assert.deepEqual(lockFailureEvidence(new Error("timeout")), {
    stage: "lock_interleaving_or_postcondition", status: "UNKNOWN"
  });
});
