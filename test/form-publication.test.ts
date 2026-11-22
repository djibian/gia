import assert from "node:assert/strict";
import test from "node:test";
import { planFormPublication, planFormUnpublication, readNativeFormPageShare } from "../src/grist/formPublication.js";

test("Form publication changes only the two native flags and is idempotent", () => {
  const prepared = planFormPublication('{"form":true,"publish":false}');
  assert.equal(prepared.changed, true);
  assert.deepEqual(JSON.parse(prepared.shareOptions), { form: true, publish: true });
  const already = planFormPublication(prepared.shareOptions);
  assert.equal(already.changed, false);
  assert.equal(planFormPublication("").changed, true);
  assert.equal(planFormPublication(null).changed, true);
});

test("Form publication refuses incomplete, malformed and opaque native share settings", () => {
  for (const value of [
    undefined, {}, '{"form":true,"publish":"yes"}', '{"form":true,"publish":true,"access":"full"}',
    'not-json', '[]', 'null', '{"form":true,"publish":1}', "x".repeat(4097)
  ]) {
    assert.throws(() => planFormPublication(value));
  }
});

test("native Form publication requires a verified page-linked published share", () => {
  const pages = (ref: number) => ({ records: [{ id: 7, fields: { viewRef: 2, shareRef: ref } }] });
  const shares = { records: [{ id: 9, fields: {
    linkId: "synthetic-private-link", options: '{"publish":true}' }
  }] };
  assert.equal(readNativeFormPageShare(pages(0), shares, 7, 2, 50), "missing");
  assert.equal(readNativeFormPageShare(pages(9), shares, 7, 2, 50), "published");
  assert.throws(() => readNativeFormPageShare(pages(99), shares, 7, 2, 50));
  assert.throws(() => readNativeFormPageShare({ records: [...pages(9).records,
    { id: 8, fields: { viewRef: 4, shareRef: 9 } }] }, shares, 7, 2, 50));
  assert.throws(() => readNativeFormPageShare(pages(9), {records: [{
    id: 9, fields: {linkId:"bad", options:'{"publish":false}'}
  }]}, 7, 2, 50));
});

test("native Form unpublication changes only its two bounded flags and is idempotent", () => {
  const first = planFormUnpublication('{"form":true,"publish":true}');
  assert.deepEqual(JSON.parse(first.shareOptions), { form: true, publish: false });
  assert.equal(first.changed, true);
  assert.equal(planFormUnpublication(first.shareOptions).changed, false);
});

test("Form unpublication rejects opaque or incomplete settings before writing", () => {
  for (const raw of [undefined, "", null, "{}", '{"form":true}',
    '{"form":false,"publish":true}', '{"form":true,"publish":"yes"}',
    '{"form":true,"publish":true,"extra":1}', "not-json"]) {
    assert.throws(() => planFormUnpublication(raw));
  }
});
