import assert from "node:assert/strict";
import test from "node:test";
import type { AuditLogger } from "../src/audit/auditLogger.js";
import type { AuthorizationService } from "../src/auth/authorizationService.js";
import type { Principal } from "../src/auth/principal.js";
import { AuthorizedGristService } from "../src/grist/authorizedService.js";
import type { GristService } from "../src/grist/service.js";
import type { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";

function harness(opts: { denied?: boolean; corrupt?: boolean; type?: string; choices?: string[] } = {}) {
  let reads = 0, writes = 0;
  let raw = JSON.stringify({ choices: opts.choices ?? ["validé"], custom: { keep: true },
    choiceOptions: { "validé": { fillColor: "#12AB34" } }, formRequired: true });
  const inner = {
    maxReadRecords: 100,
    listColumns: async () => {
      reads++;
      return { columns: [{ id: "Status", fields: {
        type: opts.type ?? "Choice", isFormula: false,
        widgetOptions: opts.corrupt && writes ? "{}" : raw
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
    assertDocumentAllowed: async (_p: Principal, id: string) => {
      if (opts.denied) throw new Error("DENIED");
      return id;
    }
  } as unknown as AuthorizationService;
  const principal = { id: "synthetic", transport: "mcp",
    grants: [{ documentIds: ["doc"], workspaceIds: [],
      capabilities: ["doc.schema:write"] }]
  } as Principal;
  const audit = { nextRequestId: () => "req", record: () => undefined } as unknown as AuditLogger;
  return {
    service: new AuthorizedGristService(inner, auth, audit, principal, {} as GristUiActionsAdapter),
    current: () => ({ reads, writes, options: JSON.parse(raw) as Record<string, unknown> })
  };
}

test("authorized typed choice append preserves options and repeat is a no-op", async () => {
  const h = harness();
  const first = await h.service.appendChoiceOptions("doc", "Stages", "Status",
    ["en attente", "validé"]) as { changed: boolean; persistedOptionsVerified: boolean };
  assert.equal(first.changed, true);
  assert.equal(first.persistedOptionsVerified, true);
  assert.deepEqual(h.current().options, {
    choices: ["validé", "en attente"], custom: { keep: true },
    choiceOptions: { "validé": { fillColor: "#12AB34" } }, formRequired: true
  });
  const second = await h.service.appendChoiceOptions("doc", "Stages", "Status",
    ["en attente", "validé"]) as { changed: boolean };
  assert.equal(second.changed, false);
  assert.equal(h.current().writes, 1);
});

test("invalid type, metadata table and unauthorized access never write", async () => {
  const invalid = harness({ type: "Text" });
  await assert.rejects(invalid.service.appendChoiceOptions("doc", "Stages", "Status",
    ["validé"]), /Choice or ChoiceList/);
  assert.equal(invalid.current().writes, 0);
  const denied = harness({ denied: true });
  await assert.rejects(denied.service.appendChoiceOptions("doc", "Stages", "Status",
    ["validé"]), /DENIED/);
  assert.equal(denied.current().reads, 0);
  const h = harness();
  await assert.rejects(h.service.appendChoiceOptions("doc", "_grist_ACLRules", "Status",
    ["validé"]), /metadata tables/);
  assert.equal(h.current().writes, 0);
});

test("mismatching postread reports uncertain persistence instead of success", async () => {
  const h = harness({ corrupt: true });
  await assert.rejects(h.service.appendChoiceOptions("doc", "Stages", "Status",
    ["en attente"]), /may already have succeeded; do not retry/);
  assert.equal(h.current().writes, 1);
});


test("authorized choice color edit is idempotent and preserves every existing option", async () => {
  const h = harness();
  const result = await h.service.setChoiceColors("doc", "Stages", "Status",
    "validé", { textColor: "#FFFFFF" }) as { changed:boolean;persistedOptionsVerified:boolean };
  assert.equal(result.changed, true);
  assert.equal(result.persistedOptionsVerified, true);
  assert.deepEqual(h.current().options, {
    choices: ["validé"], custom: { keep: true },
    choiceOptions: { "validé": { fillColor: "#12AB34", textColor: "#FFFFFF" } },
    formRequired: true
  });
  const replay = await h.service.setChoiceColors("doc", "Stages", "Status",
    "validé", { textColor: "#FFFFFF" }) as { changed:boolean };
  assert.equal(replay.changed, false);
  assert.equal(h.current().writes, 1);
});

test("choice color permission, target and uncertain native postread fail closed", async () => {
  const denied = harness({ denied: true });
  await assert.rejects(denied.service.setChoiceColors("doc", "Stages", "Status",
    "validé", { fillColor: "#000000" }), /DENIED/);
  assert.equal(denied.current().reads, 0);
  const missing = harness();
  await assert.rejects(missing.service.setChoiceColors("doc", "Stages", "Status",
    "inconnu", { fillColor: "#000000" }), /existing native choice/);
  assert.equal(missing.current().writes, 0);
  const invalidType = harness({ type:"Text" });
  await assert.rejects(invalidType.service.setChoiceColors("doc", "Stages", "Status",
    "validé", { fillColor: "#000000" }), /Choice or ChoiceList/);
  assert.equal(invalidType.current().writes, 0);
  const corrupt = harness({ corrupt: true });
  await assert.rejects(corrupt.service.setChoiceColors("doc", "Stages", "Status",
    "validé", { textColor: "#FFFFFF" }), /may already have succeeded; do not retry/);
  assert.equal(corrupt.current().writes, 1);
});

test("Owner-visible choice reorder persists exact order, preserves colors and is idempotent", async () => {
  const h = harness({ choices: ["validé", "en attente", "refusé"] });
  const order = ["refusé", "validé", "en attente"];
  const changed = await h.service.reorderChoiceOptions(
    "doc", "Stages", "Status", order
  ) as {changed:boolean;persistedOptionsVerified:boolean;choices:string[]};
  assert.equal(changed.changed, true);
  assert.equal(changed.persistedOptionsVerified, true);
  assert.deepEqual(changed.choices, order);
  assert.deepEqual(h.current().options.choices, order);
  assert.deepEqual(h.current().options.choiceOptions, {
    "validé": { fillColor: "#12AB34" }
  });
  assert.equal(h.current().options.formRequired, true);
  const repeated = await h.service.reorderChoiceOptions(
    "doc", "Stages", "Status", order
  ) as {changed:boolean};
  assert.equal(repeated.changed, false);
  assert.equal(h.current().writes, 1);
});

test("choice reorder denies incomplete, unauthorized and uncertain native outcomes", async () => {
  const denied = harness({denied:true, choices:["validé","refusé"]});
  await assert.rejects(denied.service.reorderChoiceOptions("doc","Stages","Status",
    ["refusé","validé"]), /DENIED/);
  assert.equal(denied.current().reads, 0);
  const partial = harness({choices:["validé","refusé"]});
  await assert.rejects(partial.service.reorderChoiceOptions("doc","Stages","Status",
    ["refusé"]), /complete unique existing label set/);
  assert.equal(partial.current().writes, 0);
  const badType = harness({type:"Text", choices:["validé","refusé"]});
  await assert.rejects(badType.service.reorderChoiceOptions("doc","Stages","Status",
    ["refusé","validé"]), /Choice or ChoiceList/);
  assert.equal(badType.current().writes, 0);
  const corrupt = harness({corrupt:true, choices:["validé","refusé"]});
  await assert.rejects(corrupt.service.reorderChoiceOptions("doc","Stages","Status",
    ["refusé","validé"]), /may be uncertain/);
  assert.equal(corrupt.current().writes, 1);
});
