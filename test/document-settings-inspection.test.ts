import assert from "node:assert/strict";
import test from "node:test";

import type { AccessPolicy } from "../src/grist/accessPolicy.js";
import { GristApiError, type GristClient } from "../src/grist/client.js";
import { GristService } from "../src/grist/service.js";

function service(readSettings: () => Promise<unknown>): GristService {
  const client = {
    getDocument: async () => ({ name: "Application", type: null }),
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
