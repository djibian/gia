import assert from "node:assert/strict";
import test from "node:test";

import type { AccessPolicy } from "../src/grist/accessPolicy.js";
import { GristApiError, GristTransportError, type GristClient } from "../src/grist/client.js";
import { GristService, SchemaWriteVerificationError } from "../src/grist/service.js";

function service(
  readSettings: () => Promise<unknown>,
  applyActions?: (id: string, actions: unknown[][]) => Promise<unknown>
): GristService {
  const client = {
    getDocument: async () => ({ name: "Application", type: null }),
    applyUserActions: applyActions,
    queryRecords: async (id: string, table: string, options: unknown) => {
      assert.equal(id, "synthetic");
      assert.equal(table, "_grist_DocInfo");
      assert.deepEqual(options, { limit: 2, hidden: true });
      return readSettings();
    }
  } as unknown as GristClient;
  const access = { assertDocumentAllowed: async () => "synthetic" } as unknown as AccessPolicy;
  return new GristService(client, access, {
    maxReadRecords: 100, maxWriteRecords: 100, writeBatchRecords: 50, maxSchemaItems: 50
  });
}

test("document inspection projects only native locale and timezone", async () => {
  const app = service(async () => ({
    records: [{ id: 1, fields: {
      documentSettings: '{"locale":"fr-FR","opaque":"synthetic-secret"}',
      timezone: "Europe/Paris"
    } }]
  }));
  assert.deepEqual(await app.getDocumentMetadata("synthetic"), {
    id: "synthetic", name: "Application", type: "normal",
    settings: { status: "supported", locale: "fr-FR", timezone: "Europe/Paris" }
  });
});

function nativeSettings(timezone: string) {
  return { records: [{ id: 1, fields: { documentSettings: '{"locale":"fr-FR"}', timezone } }] };
}

test("timezone update writes one metadata cell and repeated execution is a no-op", async () => {
  let timezone = "UTC";
  let writes = 0;
  const app = service(async () => nativeSettings(timezone), async (id, actions) => {
    assert.equal(id, "synthetic");
    assert.deepEqual(actions, [["UpdateRecord", "_grist_DocInfo", 1, { timezone: "Europe/Paris" }]]);
    timezone = "Europe/Paris";
    writes++;
  });
  const expected = {
    documentId: "synthetic",
    settings: { status: "supported", locale: "fr-FR", timezone: "Europe/Paris" }
  };
  assert.deepEqual(await app.updateDocument("synthetic", { timezone: "Europe/Paris" }), {
    ...expected, changed: true
  });
  assert.deepEqual(await app.updateDocument("synthetic", { timezone: "Europe/Paris" }), {
    ...expected, changed: false
  });
  assert.equal(writes, 1);
});

test("timezone update refuses malformed and mixed inputs and never replays ambiguous writes", async () => {
  const untouched = service(async () => assert.fail("Must reject before reading native metadata"));
  await assert.rejects(() => untouched.updateDocument("synthetic", { timezone: "europe/paris" }), /valid IANA/);
  await assert.rejects(() => untouched.updateDocument("synthetic", { timezone: "UTC", name: "Mixed" }), /separately/);
  const uncertain = new GristTransportError("lost acknowledgement", "UNCERTAIN");
  let writes = 0;
  const ambiguous = service(async () => nativeSettings("UTC"), async () => {
    writes++;
    throw uncertain;
  });
  await assert.rejects(() => ambiguous.updateDocument("synthetic", { timezone: "Europe/Paris" }), uncertain);
  assert.equal(writes, 1);
  const stale = service(async () => nativeSettings("UTC"), async () => undefined);
  await assert.rejects(() => stale.updateDocument("synthetic", { timezone: "Europe/Paris" }),
    SchemaWriteVerificationError);
});

test("document inspection retains independently readable settings and reports protected state", async () => {
  const incomplete = service(async () => ({
    records: [{ id: 1, fields: { documentSettings: '{', timezone: "UTC" } }]
  }));
  assert.deepEqual((await incomplete.getDocumentMetadata("synthetic")).settings,
    { status: "incomplete", timezone: "UTC" });
  const protectedSettings = service(async () => {
    throw new GristApiError("synthetic private native message", 403);
  });
  assert.deepEqual((await protectedSettings.getDocumentMetadata("synthetic")).settings,
    { status: "protected" });
  const duplicateSettings = service(async () => ({ records: [{ id: 1 }, { id: 1 }] }));
  assert.deepEqual((await duplicateSettings.getDocumentMetadata("synthetic")).settings,
    { status: "incomplete" });
});
