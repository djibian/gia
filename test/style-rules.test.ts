import assert from "node:assert/strict";
import test from "node:test";
import { readNativeColumnStyle, planColumnStyle, readNativeColumnStyleSequence,
  planAppendColumnStyleRule, planExistingColumnStyleUpdate } from "../src/grist/styleRules.js";

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

test("Bounded append preserves ordered native style helpers and avoids duplicate rules", () => {
  const two = {records:[
    {id:4,fields:{parentId:1,colId:"Name",rules:["L",6,8],
      widgetOptions:JSON.stringify({formRequired:true,rulesOptions:[
        {fillColor:"#123456"},{textColor:"#FFFFFF"}]})}},
    {id:6,fields:{parentId:1,colId:"gristHelper_ConditionalRule",type:"Any",
      isFormula:true,formula:"$Qty > 2"}},
    {id:8,fields:{parentId:1,colId:"gristHelper_ConditionalRule2",type:"Any",
      isFormula:true,formula:"$Qty < 0"}}
  ]};
  const initial = readNativeColumnStyleSequence(tables,two,"Items","Name",20);
  assert.equal(initial.rules.length,2);
  assert.throws(()=>readNativeColumnStyle(tables,two,"Items","Name",20));
  const duplicate = planAppendColumnStyleRule(initial,{
    conditionFormula:"$Qty > 2",style:{fillColor:"#123456"}
  });
  assert.deepEqual(duplicate,{changed:false});
  const result = planAppendColumnStyleRule(initial,{
    conditionFormula:"$Qty == 0",style:{fillColor:"#AABBCC"}
  });
  assert.equal(result.changed,true);
  assert.deepEqual(result.options,{
    formRequired:true,rulesOptions:[
      {fillColor:"#123456"},{textColor:"#FFFFFF"},{fillColor:"#AABBCC"}
    ]
  });
  assert.throws(()=>planAppendColumnStyleRule(initial,{
    conditionFormula:"$Qty > 2",style:{textColor:"#123456"}
  }));
  assert.throws(()=>planAppendColumnStyleRule(initial,{
    conditionFormula:"$Qty == 0",style:{fillColor:"red"}
  }));
});

test("Style append rejects malformed, opaque and unfinished native rule sequences", () => {
  const malformed = columns(["L",6], JSON.stringify({rulesOptions:[{fillColor:"bad"}]}), "$Qty > 2");
  assert.throws(()=>readNativeColumnStyleSequence(tables,malformed,"Items","Name",20));
  const pending = readNativeColumnStyleSequence(
    tables,columns(["L",6],"{}",""),"Items","Name",20);
  assert.throws(()=>planAppendColumnStyleRule(pending,wanted));
  assert.throws(()=>readNativeColumnStyleSequence(
    tables,columns(["L",6,6],"{}"),"Items","Name",20));
});

test("Existing multi-rule style update changes one matching formula, preserving other rules", () => {
  const two = {records:[
    {id:4,fields:{parentId:1,colId:"Name",rules:["L",6,8],
      widgetOptions:JSON.stringify({formRequired:true,rulesOptions:[
        {fillColor:"#123456"},{textColor:"#FFFFFF"}]})}},
    {id:6,fields:{parentId:1,colId:"gristHelper_ConditionalRule",type:"Any",
      isFormula:true,formula:"$Qty > 2"}},
    {id:8,fields:{parentId:1,colId:"gristHelper_ConditionalRule2",type:"Any",
      isFormula:true,formula:"$Qty < 0"}}
  ]};
  const sequence = readNativeColumnStyleSequence(tables,two,"Items","Name",20);
  const changed = planExistingColumnStyleUpdate(sequence,"$Qty > 2",{fillColor:"#ABCDEF"});
  assert.equal(changed.changed,true);
  assert.deepEqual(changed.options,{
    formRequired:true,rulesOptions:[{fillColor:"#ABCDEF"},{textColor:"#FFFFFF"}]
  });
  assert.deepEqual(planExistingColumnStyleUpdate(sequence,"$Qty < 0",
    {textColor:"#FFFFFF"}),{changed:false});
  assert.throws(()=>planExistingColumnStyleUpdate(sequence,"$Qty == 0",
    {fillColor:"#AABBCC"}),/absent or ambiguous/);
  assert.throws(()=>planExistingColumnStyleUpdate(sequence,"$Qty > 2",
    {fillColor:"red"}));
  const duplicate = { ...sequence, rules: [...sequence.rules, {
    helperRef:10,formula:"$Qty > 2",style:{fillColor:"#112233"}
  }] };
  assert.throws(()=>planExistingColumnStyleUpdate(duplicate,"$Qty > 2",
    {fillColor:"#ABCDEF"}),/absent or ambiguous/);
});

