import assert from "node:assert/strict";
import test from "node:test";

import { AccessRuleWriteVerificationError } from "../src/grist/accessRules.js";
import { DocumentBootstrapVerificationError } from "../src/grist/authorizedService.js";
import { GristApiError } from "../src/grist/client.js";
import {
  PartialBatchError,
  SchemaWriteVerificationError
} from "../src/grist/service.js";
import { UiWriteVerificationError } from "../src/grist/uiActionsAdapter.js";
import { errorResult } from "../src/mcp/results.js";

function body(result: ReturnType<typeof errorResult>): Record<string, unknown> {
  const content = result.content[0];
  assert.equal(content?.type, "text");
  return JSON.parse(content.text) as Record<string, unknown>;
}

function assertNoStructuredErrorContent(result: ReturnType<typeof errorResult>): void {
  assert.equal("structuredContent" in result, false);
}

test("partial writes preserve completed work and forbid whole-operation retry", () => {
  const result = errorResult(
    new PartialBatchError("deleteColumns", 2, 4, 3, new Error("upstream failure"))
  );
  const parsed = body(result);

  assert.equal(parsed.code, "partial_write");
  assert.equal(parsed.operation, "deleteColumns");
  assert.equal(parsed.completedBatches, 2);
  assert.equal(parsed.completedItems, 4);
  assert.equal(parsed.failedBatch, 3);
  assert.equal(parsed.retryWholeOperation, false);
  assertNoStructuredErrorContent(result);
});

test("ambiguous UI writes preserve retryWholeOperation false and a created ID when known", () => {
  const result = errorResult(
    new UiWriteVerificationError("create_page", 17, "verification failed")
  );
  const parsed = body(result);

  assert.equal(parsed.code, "write_verification_failed");
  assert.equal(parsed.operation, "create_page");
  assert.equal(parsed.createdId, 17);
  assert.equal(parsed.retryWholeOperation, false);
  assertNoStructuredErrorContent(result);
});

test("projects schema result-normalization failure as an applied no-retry verification error", () => {
  const result = errorResult(
    new SchemaWriteVerificationError("rename_column", "Native result missing")
  );
  const parsed = body(result);

  assert.equal(parsed.code, "write_verification_failed");
  assert.equal(parsed.operation, "rename_column");
  assert.equal(parsed.effectState, "APPLIED");
  assert.equal(parsed.postconditionVerified, false);
  assert.equal(parsed.retryWholeOperation, false);
  assert.equal(JSON.stringify(parsed).includes("Native result missing"), false);
});

test("projects C1 verification uncertainty without exposing policy internals", () => {
  const result = errorResult(
    new AccessRuleWriteVerificationError("Persisted ACL postcondition differs")
  );
  const parsed = body(result);

  assert.equal(parsed.code, "write_verification_failed");
  assert.equal(parsed.operation, "access_rule_group");
  assert.equal(parsed.effectState, "UNCERTAIN");
  assert.equal(parsed.postconditionVerified, false);
  assert.equal(parsed.retryWholeOperation, false);
  assert.equal(JSON.stringify(parsed).includes("Persisted ACL postcondition differs"), false);
  assertNoStructuredErrorContent(result);
});

test("projects a known C8 created document ID as an applied effect with unverified postcondition", () => {
  const result = errorResult(
    new DocumentBootstrapVerificationError("doc-created-123", "membership re-read failed")
  );
  const parsed = body(result);

  assert.equal(parsed.code, "write_verification_failed");
  assert.equal(parsed.operation, "document_bootstrap");
  assert.equal(parsed.effectState, "APPLIED");
  assert.equal(parsed.postconditionVerified, false);
  assert.equal(parsed.createdDocumentId, "doc-created-123");
  assert.equal(parsed.retryWholeOperation, false);
  assert.equal(JSON.stringify(parsed).includes("membership re-read failed"), false);
  assertNoStructuredErrorContent(result);
});


test("upstream errors expose a stable category and status without leaking response bodies", () => {
  const secretBody = "upstream body that must stay server-side";
  const result = errorResult(
    new GristApiError("Grist API request failed with HTTP 500", 500, secretBody)
  );
  const parsed = body(result);

  assert.equal(parsed.code, "grist_upstream");
  assert.equal(parsed.status, 500);
  assert.equal(JSON.stringify(result).includes(secretBody), false);
  assertNoStructuredErrorContent(result);
});

test("other failures use the generic typed category", () => {
  const result = errorResult(new Error("invalid request"));
  const parsed = body(result);
  assert.equal(parsed.code, "operation_failed");
  assert.equal(parsed.error, "invalid request");
  assertNoStructuredErrorContent(result);
});
