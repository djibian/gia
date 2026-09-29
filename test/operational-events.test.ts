import assert from "node:assert/strict";
import test from "node:test";

import { OperationalEventLogger } from "../src/ops/operationalEvents.js";

test("emits only low-cardinality operational fields and monotonic process counters", () => {
  const lines: string[] = [];
  const logger = new OperationalEventLogger(
    (line) => lines.push(line),
    () => new Date("2026-09-29T07:00:00.000Z")
  );

  const first = logger.record("oauth_jwks_unavailable");
  const second = logger.record("oauth_jwks_unavailable");
  const other = logger.record("rate_limited");

  assert.deepEqual(first, {
    type: "grist.ops",
    timestamp: "2026-09-29T07:00:00.000Z",
    event: "oauth_jwks_unavailable",
    count: 1
  });
  assert.equal(second.count, 2);
  assert.equal(other.count, 1);
  assert.equal(lines.length, 3);

  for (const line of lines) {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed).sort(), [
      "count",
      "event",
      "timestamp",
      "type"
    ]);
    assert.equal("principal" in parsed, false);
    assert.equal("documentId" in parsed, false);
    assert.equal("requestId" in parsed, false);
    assert.equal("token" in parsed, false);
  }
});
