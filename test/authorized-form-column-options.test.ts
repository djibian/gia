import assert from "node:assert/strict";
import test from "node:test";
import type { AuditLogger } from "../src/audit/auditLogger.js";
import type { AuthorizationService } from "../src/auth/authorizationService.js";
import type { Principal } from "../src/auth/principal.js";
import { AuthorizedGristService } from "../src/grist/authorizedService.js";
import type { GristService } from "../src/grist/service.js";
import type { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";

function harness(options: { postReadCorrupt?: boolean; denied?: boolean } = {}) {
  let reads = 0;
  let writes = 0;
  let raw = JSON.stringify({
    dropdownCondition: { text: "choice.Status == 'active'" }, question: "Old", custom: 9
  });
  const inner = {
    maxReadRecords: 100,
    listColumns: async () => {
      reads++;
      return { columns: [{ id: "Name", fields: {
        widgetOptions: options.postReadCorrupt && writes > 0 ? "{}" : raw
      } }] };
    },
    updateColumns: async (_doc: string, _table: string,
      columns: Array<{ id: string; fields: { widgetOptions: string } }>) => {
      writes++;
      raw = columns[0]!.fields.widgetOptions;
      return { updated: true };
    }
  } as unknown as GristService;
  const auth = {
    assertDocumentAllowed: async (_principal: Principal, id: string) => {
      if (options.denied) throw new Error("DENIED");
      return id;
    }
  } as unknown as AuthorizationService;
  const principal = {
    id: "synthetic", transport: "mcp",
    grants: [{ documentIds: ["doc"], workspaceIds: [],
      capabilities: ["doc.schema:write"] }]
  } as Principal;
  const audit = { nextRequestId: () => "req", record: () => undefined } as unknown as AuditLogger;
  return {
    service: new AuthorizedGristService(inner, auth, audit, principal,
      {} as GristUiActionsAdapter),
    counters: () => ({ reads, writes, options: JSON.parse(raw) as Record<string, unknown> })
  };
}

test("authorized Form update persists one column and returns verified no-op on replay", async () => {
  const h = harness();
  const first = await h.service.updateFormColumnOptions("doc", "People", "Name",
    { question: "Contact?", required: true }) as { changed: boolean; persistedOptionsVerified: boolean };
  assert.equal(first.changed, true);
  assert.equal(first.persistedOptionsVerified, true);
  assert.deepEqual(h.counters().options, {
    dropdownCondition: { text: "choice.Status == 'active'" },
    question: "Contact?", custom: 9, formRequired: true
  });
  const second = await h.service.updateFormColumnOptions("doc", "People", "Name",
    { question: "Contact?", required: true }) as { changed: boolean };
  assert.equal(second.changed, false);
  assert.equal(h.counters().writes, 1);
});

test("authorization or invalid target refuses Form write", async () => {
  const denied = harness({ denied: true });
  await assert.rejects(denied.service.updateFormColumnOptions("doc", "People", "Name",
    { required: true }), /DENIED/);
  assert.equal(denied.counters().reads, 0);
  const h = harness();
  await assert.rejects(h.service.updateFormColumnOptions("doc", "_grist_ACLRules", "Name",
    { required: true }), /metadata tables/);
  assert.equal(h.counters().writes, 0);
});

test("failed postcondition is uncertain and does not claim no-effect", async () => {
  const h = harness({ postReadCorrupt: true });
  await assert.rejects(
    h.service.updateFormColumnOptions("doc", "People", "Name", { required: true }),
    /may already have succeeded; do not retry/
  );
  assert.equal(h.counters().writes, 1);
});
