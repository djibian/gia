import assert from "node:assert/strict";
import test from "node:test";
import { readNativeColumnStyle, planColumnStyle } from "../src/grist/styleRules.js";

const tables = {records:[{id:1,fields:{tableId:"Items"}}]};
const columns = (rules: unknown, options: unknown, formula = "") => ({
  records:[
    {id:4,fields:{parentId:1,colId:"Name",rules,widgetOptions:options}},
    {id:6,fields:{parentId:1,colId:"gristHelper_ConditionalRule",type:"Any",
      isFormula:true,formula}}
  ]
});
const wanted = {conditionFormula:"$Qty > 2",style:{fillColor:"#123456"}};
test("Style creation and idempotent re-read preserve untargeted options", () => {
  const initial = readNativeColumnStyle(tables,columns(null,'{"formRequired":true}'),
    "Items","Name",20);
  const created = planColumnStyle(initial,wanted);
  assert.equal(created.changed,true);
  assert.deepEqual(JSON.parse(created.widgetOptions), {
    formRequired:true,rulesOptions:[{fillColor:"#123456"}]
  });
  const present = readNativeColumnStyle(tables,columns(["L",6],created.widgetOptions,"$Qty > 2"),
    "Items","Name",20);
  assert.equal(planColumnStyle(present,wanted).changed,false);
});
test("Style rules refuse malformed, multiple and ambiguous native helpers", () => {
  for(const rules of [["L",6,7],["L","6"],"not-a-list",["L",0]]) {
    assert.throws(()=>readNativeColumnStyle(tables,columns(rules,"{}"),
      "Items","Name",20));
  }
  assert.throws(()=>readNativeColumnStyle(tables,columns(["L",99],"{}"),
    "Items","Name",20));
  assert.throws(()=>readNativeColumnStyle(tables,columns(null,'{"rulesOptions":[{"fillColor":"red"}]}'),
    "Items","Name",20));
  assert.throws(()=>readNativeColumnStyle({records:[]},columns(null,"{}"),
    "Items","Name",20));
});
test("Style formulas and colors are bounded while ACL rules remain separate", () => {
  const state=readNativeColumnStyle(tables,columns(null,"{}"),"Items","Name",20);
  assert.throws(()=>planColumnStyle(state,{...wanted,conditionFormula:""}));
  assert.throws(()=>planColumnStyle(state,{...wanted,conditionFormula:"x".repeat(4100)}));
  assert.throws(()=>planColumnStyle(state,{...wanted,style:{fillColor:"javascript:1"}}));
  assert.throws(()=>planColumnStyle(state,{...wanted,style:{}}));
});
