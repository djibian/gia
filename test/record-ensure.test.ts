import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTextKeyRecordColumns, readUniqueTextKeyRecord, readUniqueTextKeyRecords
} from "../src/grist/recordEnsure.js";

const schema = { columns: [
  {id:"Name",fields:{type:"Text",isFormula:false}},
  {id:"Qty",fields:{type:"Int",isFormula:false}},
  {id:"Computed",fields:{type:"Text",isFormula:true}}
]};
const fields = {Name:"Synthetic-Seed",Qty:7};

test("native Text key schema is complete, writable and unambiguous", () => {
  assert.doesNotThrow(() => assertTextKeyRecordColumns(schema,"Name",fields));
  assert.throws(() => assertTextKeyRecordColumns(schema,"Qty",{Qty:"wrong"}),/Text/);
  assert.throws(() => assertTextKeyRecordColumns(schema,"Missing",fields),/Text/);
  assert.throws(() => assertTextKeyRecordColumns(schema,"Name",{...fields,Computed:"no"}),/writable/);
  assert.throws(() => assertTextKeyRecordColumns({columns:[...schema.columns,schema.columns[0]]},"Name",fields),/ambiguous/);
  assert.throws(() => assertTextKeyRecordColumns({columns:[]},"Name",fields),/missing/);
});

test("unique native row replay is a no-op only when every submitted field matches", () => {
  assert.equal(readUniqueTextKeyRecord({records:[]},fields),undefined);
  assert.equal(readUniqueTextKeyRecord({records:[{id:42,fields}]},fields),42);
  assert.throws(() => readUniqueTextKeyRecord({records:[{id:42,fields:{Name:fields.Name,Qty:8}}]},fields),/conflicts/);
  assert.throws(() => readUniqueTextKeyRecord({records:[
    {id:42,fields},{id:43,fields}
  ]},fields),/duplicate/);
  assert.throws(() => readUniqueTextKeyRecord({records:[{id:0,fields}]},fields),/identity/);
  assert.throws(() => readUniqueTextKeyRecord({records:[{id:42,fields:{Name:fields.Name}}]},fields),/conflicts/);
  assert.throws(() => readUniqueTextKeyRecord({records:null},fields),/missing/);
});

test("bounded native batch maps distinct Text keys and rejects conflicts and truncation", () => {
  const expected = [{fields:{Name:"A",Qty:2}},{fields:{Name:"B",Qty:3}}];
  const rows = {records:[{id:10,fields:{Name:"B",Qty:3}},{id:9,fields:{Name:"A",Qty:2}}]};
  assert.deepEqual(readUniqueTextKeyRecords(rows,"Name",expected,5),[9,10]);
  assert.deepEqual(readUniqueTextKeyRecords({records:[]},"Name",expected,5),[undefined,undefined]);
  assert.throws(() => readUniqueTextKeyRecords({records:[...rows.records,rows.records[0]]},
    "Name",expected,5),/duplicate|ambiguous/);
  assert.throws(() => readUniqueTextKeyRecords({records:[{id:15,fields:{Name:"A",Qty:5}}]},
    "Name",expected,5),/conflicts/);
  assert.throws(() => readUniqueTextKeyRecords({records:[{id:15,fields:{Name:"X",Qty:2}}]},
    "Name",expected,5),/unknown/);
  assert.throws(() => readUniqueTextKeyRecords({records:rows.records},"Name",expected,2),/truncated/);
});
