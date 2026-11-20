import assert from "node:assert/strict";
import test from "node:test";
import { readFormFieldOptions, resolveFormFieldOptions } from "../src/grist/formFieldOptions.js";

const snapshot = (raw: unknown) => ({ records: [
  { id: 77, fields: { parentId: 5, colRef: 14, widgetOptions: raw } },
  { id: 78, fields: { parentId: 5, colRef: 15, widgetOptions: "{}" } }
] });

test("Form field override preserves unrelated native options and is repeatable", () => {
  const before = readFormFieldOptions(snapshot(JSON.stringify({
    question: "Old", dropdownCondition: { text: "choice.Class" }, customSetting: true
  })), 5, 77, 14, 100);
  const update = resolveFormFieldOptions(before, { question: "First name", required: true });
  assert.equal(update.changed, true);
  assert.deepEqual(update.options, {
    question: "First name", dropdownCondition: { text: "choice.Class" },
    customSetting: true, formRequired: true
  });
  assert.equal(resolveFormFieldOptions(update.options,
    { question: "First name", required: true }).changed, false);
  assert.equal(Object.hasOwn(resolveFormFieldOptions(update.options,
    { question: null }).options, "question"), false);
});

test("Form field options fail closed for incomplete identities and unsafe content", () => {
  for (const broken of [snapshot(null), snapshot("[]"), snapshot("{bad"),
    snapshot("x".repeat(16_385)), {records:[]}, {records:[
      {id:77,fields:{parentId:5,colRef:14}}, {id:77,fields:{parentId:5,colRef:14}}
    ]}]) assert.throws(() => readFormFieldOptions(broken, 5, 77, 14, 100));
  assert.throws(() => readFormFieldOptions(snapshot("{}"), 5, 77, 99, 100), /identity/);
  assert.throws(() => readFormFieldOptions(snapshot("{}"), 5, 77, 14, 2), /truncated/);
  assert.throws(() => resolveFormFieldOptions({}, {}));
  assert.throws(() => resolveFormFieldOptions({}, { question: "https://example.test/" }));
  assert.throws(() => resolveFormFieldOptions({}, { question: "me@example.test" }));
});
