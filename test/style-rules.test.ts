import assert from "node:assert/strict";
import test from "node:test";
import { readNativeColumnStyle, planColumnStyle, readNativeColumnStyleSequence,
  planAppendColumnStyleRule, planExistingColumnStyleUpdate,
  planExistingStyleFormulaReplacement, planReorderRowStyleRules, readNativeRowStyleSequence } from "../src/grist/styleRules.js";


test("Reordering existing raw-row styles preserves helper/color pairing and rejects lossy requests", () => {
  const before = {
    ownerRef: 9, options: { keep: "intact",
      rulesOptions: [{fillColor:"#123456"},{textColor:"#AABBCC"}] },
    rules: [
      {helperRef:6,formula:"$Qty > 0",style:{fillColor:"#123456"}},
      {helperRef:8,formula:"$Qty < 10",style:{textColor:"#AABBCC"}}
    ]
  };
  const plan = planReorderRowStyleRules(before, ["$Qty < 10", "$Qty > 0"]);
  assert(plan.changed);
  assert.deepEqual(plan.refs,[8,6]);
  assert.deepEqual(plan.options,{keep:"intact",rulesOptions:[
    {textColor:"#AABBCC"},{fillColor:"#123456"}]});
  assert.deepEqual(plan.rules,[before.rules[1],before.rules[0]]);
  const reordered = {...before, rules:plan.rules!, options:plan.options!};
  assert.deepEqual(planReorderRowStyleRules(reordered, ["$Qty < 10", "$Qty > 0"]),{changed:false});
  for (const order of [["$Qty > 0"],["$Qty > 0","$Qty > 0"],
    ["$Qty > 0","$Qty == 0"], ["$Qty > 0","$Qty < 10" + String.fromCharCode(0)]]) {
    assert.throws(()=>planReorderRowStyleRules(before,order));
  }
  assert.throws(()=>planReorderRowStyleRules({...before,rules:[
    before.rules[0]!,{...before.rules[1]!,formula:"$Qty > 0"}]},
    ["$Qty > 0","$Qty < 10"]));
  assert.throws(()=>planReorderRowStyleRules({...before,rules:[
    before.rules[0]!,{...before.rules[1]!,style:{}}]},
    ["$Qty < 10","$Qty > 0"]));
});

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


test("Replacement of an existing conditional formula preserves both helpers and styles", () => {
  const state = readNativeColumnStyleSequence(tables, {records:[
    {id:4,fields:{parentId:1,colId:"Name",rules:["L",6,8],
      widgetOptions:JSON.stringify({formRequired:true,rulesOptions:[
        {fillColor:"#123456"},{textColor:"#FFFFFF"}]})}},
    {id:6,fields:{parentId:1,colId:"gristHelper_ConditionalRule",type:"Any",
      isFormula:true,formula:"$Qty > 2"}},
    {id:8,fields:{parentId:1,colId:"gristHelper_ConditionalRule2",type:"Any",
      isFormula:true,formula:"$Qty < 0"}}
  ]}, "Items", "Name", 20);
  const planned = planExistingStyleFormulaReplacement(state,"$Qty > 2","$Qty > 3");
  assert.equal(planned.changed,true);
  assert.equal(planned.helperRef,6);
  assert.deepEqual(planned.rules,[
    {helperRef:6,formula:"$Qty > 3",style:{fillColor:"#123456"}},
    {helperRef:8,formula:"$Qty < 0",style:{textColor:"#FFFFFF"}}
  ]);
  assert.deepEqual(planExistingStyleFormulaReplacement(state,"$Qty > 2","$Qty > 2"),{
    changed:false,helperRef:6,rules:state.rules
  });
  assert.throws(()=>planExistingStyleFormulaReplacement(state,"$Qty == 0","$Qty > 3"),
    /absent or ambiguous/);
  assert.throws(()=>planExistingStyleFormulaReplacement(state,"$Qty > 2","$Qty < 0"),
    /already belongs/);
  assert.throws(()=>planExistingStyleFormulaReplacement(state,"$Qty > 2",""),
    /bounded, nonempty/);
  assert.throws(()=>planExistingStyleFormulaReplacement(state,"$Qty > 2","x".repeat(4097)),
    /bounded, nonempty/);
  const ambiguous = {...state,rules:[...state.rules,{helperRef:10,
    formula:"$Qty > 2",style:{fillColor:"#445566"}}]};
  assert.throws(()=>planExistingStyleFormulaReplacement(ambiguous,"$Qty > 2","$Qty > 3"),
    /absent or ambiguous/);
  const incomplete = {...state,rules:[{...state.rules[0]!,style:{}},state.rules[1]!]};
  assert.throws(()=>planExistingStyleFormulaReplacement(incomplete,"$Qty > 2","$Qty > 3"),
    /incomplete/);
});

test("Native raw section row rules use the table's verified raw view, not a page widget", () => {
  const rows = {records:[{id:1,fields:{tableId:"Items",rawViewSectionRef:31}}]};
  const rawSections = {records:[
    {id:31,fields:{tableRef:1,rules:["L",51],options:JSON.stringify({
      theme:"dark",rulesOptions:[{fillColor:"#334455"}]})}},
    {id:32,fields:{tableRef:1,rules:null,options:"{}"}}
  ]};
  const helpers = {records:[{id:51,fields:{parentId:1,
    colId:"gristHelper_RowConditionalRule",type:"Any",isFormula:true,formula:"$Qty > 2"}}]};
  const state = readNativeRowStyleSequence(rows,rawSections,helpers,"Items",20);
  assert.equal(state.ownerRef,31);
  assert.equal(state.rules[0]?.helperRef,51);
  assert.equal(planAppendColumnStyleRule(state,{
    conditionFormula:"$Qty > 2",style:{fillColor:"#334455"}
  }).changed,false);
  const added = planAppendColumnStyleRule(state,{
    conditionFormula:"$Qty < 0",style:{textColor:"#ABCDEF"}
  });
  assert.equal(added.changed,true);
  assert.deepEqual(added.options,{
    theme:"dark",rulesOptions:[{fillColor:"#334455"},{textColor:"#ABCDEF"}]
  });
});

test("Native row styling rejects missing, foreign and column-style helpers", () => {
  const rows = {records:[{id:1,fields:{tableId:"Items",rawViewSectionRef:31}}]};
  const valid = {records:[{id:31,fields:{tableRef:1,rules:["L",51],options:"{}"}}]};
  const helper = (parentId: number, colId: string) => ({records:[
    {id:51,fields:{parentId,colId,type:"Any",isFormula:true,formula:"$Qty > 2"}}
  ]});
  assert.throws(()=>readNativeRowStyleSequence(rows,valid,
    helper(1,"gristHelper_ConditionalRule"),"Items",20));
  assert.throws(()=>readNativeRowStyleSequence(rows,valid,
    helper(2,"gristHelper_RowConditionalRule"),"Items",20));
  assert.throws(()=>readNativeRowStyleSequence(rows,{records:[
    {id:31,fields:{tableRef:2,rules:["L",51],options:"{}"}}
  ]},helper(1,"gristHelper_RowConditionalRule"),"Items",20));
  assert.throws(()=>readNativeRowStyleSequence(rows,{records:[
    {id:31,fields:{tableRef:1,rules:["L",51,51],options:"{}"}}
  ]},helper(1,"gristHelper_RowConditionalRule"),"Items",20));
  assert.throws(()=>readNativeRowStyleSequence(rows,{records:[
    {id:31,fields:{tableRef:1,rules:["L",51],options:"{broken"}}
  ]},helper(1,"gristHelper_RowConditionalRule"),"Items",20));
});

test("Existing raw-row style colors can be changed by unique formula with identities intact", () => {
  const rows = {records:[{id:1,fields:{tableId:"Items",rawViewSectionRef:31}}]};
  const sections = {records:[{id:31,fields:{tableRef:1,rules:["L",51,52],
    options:JSON.stringify({theme:"dark",rulesOptions:[
      {fillColor:"#334455"},{textColor:"#FFFFFF"}]})}}]};
  const helpers = {records:[
    {id:51,fields:{parentId:1,colId:"gristHelper_RowConditionalRule",type:"Any",
      isFormula:true,formula:"$Qty > 2"}},
    {id:52,fields:{parentId:1,colId:"gristHelper_RowConditionalRule2",type:"Any",
      isFormula:true,formula:"$Qty < 0"}}
  ]};
  const state = readNativeRowStyleSequence(rows,sections,helpers,"Items",20);
  const plan = planExistingColumnStyleUpdate(state,"$Qty > 2",{fillColor:"#ABCDEF"});
  assert.equal(plan.changed,true);
  assert.deepEqual(plan.options,{theme:"dark",rulesOptions:[
    {fillColor:"#ABCDEF"},{textColor:"#FFFFFF"}]});
  assert.equal(state.rules[0]?.helperRef,51);
  assert.deepEqual(planExistingColumnStyleUpdate(state,"$Qty < 0",
    {textColor:"#FFFFFF"}),{changed:false});
  assert.throws(()=>planExistingColumnStyleUpdate(state,"$Qty == 0",
    {fillColor:"#123456"}),/absent or ambiguous/);
  assert.throws(()=>planExistingColumnStyleUpdate(state,"$Qty > 2",
    {fillColor:"red"}),/#RRGGBB/);
});


test("Replacing one native row formula retains raw-section options and sibling rule identities", () => {
  const rows = {records:[{id:1,fields:{tableId:"Items",rawViewSectionRef:31}}]};
  const sections = {records:[{id:31,fields:{tableRef:1,rules:["L",51,52],
    options:JSON.stringify({theme:"dark",rulesOptions:[
      {fillColor:"#334455"},{textColor:"#FFFFFF"}]})}}]};
  const helpers = {records:[
    {id:51,fields:{parentId:1,colId:"gristHelper_RowConditionalRule",type:"Any",
      isFormula:true,formula:"$Qty > 2"}},
    {id:52,fields:{parentId:1,colId:"gristHelper_RowConditionalRule2",type:"Any",
      isFormula:true,formula:"$Qty < 0"}}
  ]};
  const state = readNativeRowStyleSequence(rows,sections,helpers,"Items",20);
  const plan = planExistingStyleFormulaReplacement(state,"$Qty > 2","$Qty > 3");
  assert.equal(plan.changed,true);
  assert.equal(plan.helperRef,51);
  assert.deepEqual(plan.rules,[
    {helperRef:51,formula:"$Qty > 3",style:{fillColor:"#334455"}},
    {helperRef:52,formula:"$Qty < 0",style:{textColor:"#FFFFFF"}}
  ]);
  assert.deepEqual(planExistingStyleFormulaReplacement(state,"$Qty > 2","$Qty > 2"),
    {changed:false,helperRef:51,rules:state.rules});
  assert.throws(()=>planExistingStyleFormulaReplacement(state,"$Qty == 0","$Qty > 3"),
    /absent or ambiguous/);
  assert.throws(()=>planExistingStyleFormulaReplacement(state,"$Qty > 2","$Qty < 0"),
    /already belongs/);
  assert.throws(()=>planExistingStyleFormulaReplacement({...state,rules:[
    state.rules[0]!,{...state.rules[1]!,formula:"$Qty > 2"}
  ]},"$Qty > 2","$Qty > 3"),/absent or ambiguous/);
});
