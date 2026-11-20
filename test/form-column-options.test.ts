import assert from "node:assert/strict";
import test from "node:test";
import { applyFormColumnOptions, readFormColumnOptions } from "../src/grist/formColumnOptions.js";

const native = (options: unknown) => ({ columns: [
  { id: "Name", fields: { widgetOptions: options } },
  { id: "Status", fields: { widgetOptions: "{}" } }
] });

test("Form changes preserve opaque options, clear an override and are idempotent", () => {
  const before = readFormColumnOptions(native(JSON.stringify({
    dropdownCondition: { text: "choice.Status" }, rulesOptions: [{ color: "#123" }],
    formRequired: true, question: "Old"
  })), "Name", 100);
  const changed = applyFormColumnOptions(before, {
    question: "Contact name?", required: false, acceptFromUrl: true
  });
  assert.equal(changed.changed, true);
  assert.deepEqual(JSON.parse(changed.widgetOptions), {
    dropdownCondition: { text: "choice.Status" }, rulesOptions: [{ color: "#123" }],
    formRequired: false, question: "Contact name?", formAcceptFromUrl: true
  });
  assert.equal(applyFormColumnOptions(changed.options,
    { question: "Contact name?", required: false, acceptFromUrl: true }).changed, false);
  const cleared = applyFormColumnOptions(changed.options, { question: null });
  assert.equal(Object.hasOwn(cleared.options, "question"), false);
  assert.deepEqual(cleared.options.rulesOptions, [{ color: "#123" }]);
});

test("Form writes refuse incomplete, malformed, truncated and ambiguous metadata", () => {
  for (const response of [
    {}, native(null), native("[]"), native('{"invalid":'),
    native("x".repeat(16_385)),
    { columns: [{ id: "Name", fields: {} }, { id: "Name", fields: {} }] }
  ]) assert.throws(() => readFormColumnOptions(response, "Name", 100));
  assert.throws(() => readFormColumnOptions(native("{}"), "Missing", 100), /absent/);
  assert.throws(() => readFormColumnOptions(native("{}"), "Name", 2), /truncated/);
  assert.throws(() => applyFormColumnOptions({}, {}));
  assert.throws(() => applyFormColumnOptions({}, { question: "https://example.test" }));
  assert.throws(() => applyFormColumnOptions({}, { question: "bad@example.test" }));
  assert.throws(() => applyFormColumnOptions({ large: "x".repeat(16_383) }, { required: true }), /bound/);
});
