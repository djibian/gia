import assert from "node:assert/strict";
import test from "node:test";
import { planDocumentLocaleUpdate, readNativeDocumentSettings } from "../src/grist/documentLocale.js";
const native = (value: unknown) => ({ records: [{ id: 1, fields: { documentSettings: value } }] });
test("locale updates preserve unprojected native settings and become no-ops", () => {
  const p = planDocumentLocaleUpdate(native('{"locale":"fr-FR","currency":"EUR","opaque":"synthetic"}'), "en-US");
  assert.equal(p.changed, true);
  assert.deepEqual(JSON.parse(p.documentSettings), { locale:"en-US",currency:"EUR",opaque:"synthetic" });
  assert.equal(planDocumentLocaleUpdate(native(p.documentSettings), "en-US").changed, false);
  assert.equal(planDocumentLocaleUpdate(native(""), "fr-FR").changed, true);
});
test("locale settings refuse malformed state and unqualified input", () => {
  for (const x of [undefined,"{","[]","null","23",'{"locale":12}','{"locale":"fr-fr"}',"x".repeat(16400)])
    assert.throws(() => readNativeDocumentSettings(native(x)));
  assert.throws(() => readNativeDocumentSettings({records:[]}));
  assert.throws(() => planDocumentLocaleUpdate(native("{}"), "de-DE"));
});
