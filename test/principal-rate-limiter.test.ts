import assert from "node:assert/strict";
import test from "node:test";

import { PrincipalRateLimiter } from "../src/ops/principalRateLimiter.js";

test("limits principals independently and resets after the fixed window", () => {
  let now = 0;
  const limiter = new PrincipalRateLimiter(2, () => now);

  assert.deepEqual(limiter.consume("principal-a"), {
    allowed: true,
    remaining: 1,
    retryAfterSeconds: 0,
    firstRejectionInWindow: false
  });
  assert.deepEqual(limiter.consume("principal-a"), {
    allowed: true,
    remaining: 0,
    retryAfterSeconds: 0,
    firstRejectionInWindow: false
  });
  assert.deepEqual(limiter.consume("principal-a"), {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: 60,
    firstRejectionInWindow: true
  });
  assert.deepEqual(limiter.consume("principal-a"), {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: 60,
    firstRejectionInWindow: false
  });

  assert.deepEqual(limiter.consume("principal-b"), {
    allowed: true,
    remaining: 1,
    retryAfterSeconds: 0,
    firstRejectionInWindow: false
  });

  now = 60_000;
  assert.deepEqual(limiter.consume("principal-a"), {
    allowed: true,
    remaining: 1,
    retryAfterSeconds: 0,
    firstRejectionInWindow: false
  });
});

test("reports a bounded positive retry-after within the active window", () => {
  let now = 1_000;
  const limiter = new PrincipalRateLimiter(1, () => now);

  assert.equal(limiter.consume("principal").allowed, true);
  now = 30_500;
  assert.deepEqual(limiter.consume("principal"), {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: 31,
    firstRejectionInWindow: true
  });
});

test("rejects non-positive or non-integer limits", () => {
  assert.throws(() => new PrincipalRateLimiter(0), /positive integer/);
  assert.throws(() => new PrincipalRateLimiter(1.5), /positive integer/);
});
