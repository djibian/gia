import assert from "node:assert/strict";
import test from "node:test";

import type { AccessPolicy } from "../src/grist/accessPolicy.js";
import type { GristClient } from "../src/grist/client.js";
import { GristService, PartialBatchError } from "../src/grist/service.js";

function service(
  maxReadRecords = 1000,
  maxWriteRecords = 100,
  writeBatchRecords = 2,
  maxSchemaItems = 10,
  overrides: Record<string, unknown> = {}
) {
  const observed: unknown[] = [];
  const client = {
    queryRecords: async (documentId: string, tableId: string, options: unknown) => {
      observed.push({ action: "query", documentId, tableId, options });
      return { records: [] };
    },
    createRecords: async (documentId: string, tableId: string, records: unknown) => {
      observed.push({ action: "create", documentId, tableId, records });
      return { records: [] };
    },
    updateRecords: async (documentId: string, tableId: string, records: unknown) => {
      observed.push({ action: "update", documentId, tableId, records });
      return null;
    },
    deleteRecords: async (documentId: string, tableId: string, recordIds: unknown) => {
      observed.push({ action: "delete", documentId, tableId, recordIds });
      return null;
    },
    listTables: async () => ({ tables: [] }),
    listColumns: async (documentId: string, tableId: string, options: unknown) => {
      observed.push({ action: "listColumns", documentId, tableId, options });
      return { columns: [] };
    },
    createTables: async (documentId: string, tables: unknown) => {
      observed.push({ action: "createTables", documentId, tables });
      return { tables: [] };
    },
    updateTables: async (documentId: string, tables: unknown) => {
      observed.push({ action: "updateTables", documentId, tables });
      return null;
    },
    createColumns: async (documentId: string, tableId: string, columns: unknown) => {
      observed.push({ action: "createColumns", documentId, tableId, columns });
      return { columns: [] };
    },
    updateColumns: async (documentId: string, tableId: string, columns: unknown) => {
      observed.push({ action: "updateColumns", documentId, tableId, columns });
      return null;
    },
    deleteColumn: async (documentId: string, tableId: string, columnId: string) => {
      observed.push({ action: "deleteColumn", documentId, tableId, columnId });
      return null;
    },
    applyUserActions: async (documentId: string, actions: unknown) => {
      observed.push({ action: "apply", documentId, actions });
      const first = Array.isArray(actions) && Array.isArray(actions[0]) ? actions[0] : undefined;
      return first?.[0] === "RenameColumn"
        ? { actionNum: 1, retValues: [first[3]] }
        : { actionNum: 1 };
    },
    ...overrides
  } as unknown as GristClient;
  const accessPolicy = {
    assertDocumentAllowed: async (documentId: string) => documentId,
    listAllowedDocuments: async () => []
  } as unknown as AccessPolicy;

  return {
    grist: new GristService(client, accessPolicy, {
      maxReadRecords,
      maxWriteRecords,
      writeBatchRecords,
      maxSchemaItems
    }),
    observed
  };
}

test("ensure_columns creates only missing seeds and preserves later columns",async()=>{
  const existing=new Map<string,{ref:number;type:string}>([
    ["Name",{ref:20,type:"Text"}],
    ["Custom",{ref:21,type:"Int"}]
  ]);
  let writes=0;
  const specs=[
    {id:"Name",fields:{type:"Text"}},
    {id:"StartDate",fields:{type:"Date"}}
  ];
  const {grist}=service(1000,100,2,20,{
    listColumns:async()=>({columns:[...existing].map(([id,meta])=>({
      id,fields:{colRef:meta.ref,type:meta.type}
    }))}),
    createColumns:async(_doc:string,_table:string,missing:typeof specs)=>{
      writes++;
      assert.deepEqual(missing,[specs[1]]);
      existing.set("StartDate",{ref:22,type:"Date"});
      return {columns:[{id:"StartDate"}]};
    }
  });
  const first=await grist.ensureColumns("doc","Stage",specs) as Record<string,unknown>;
  assert.equal(first.changed,true);assert.equal(first.persistedSchemaVerified,true);
  assert.deepEqual(first.columns,[{id:"Name",created:false},{id:"StartDate",created:true}]);
  const second=await grist.ensureColumns("doc","Stage",specs) as Record<string,unknown>;
  assert.equal(second.changed,false);assert.equal(writes,1);
  await assert.rejects(()=>grist.ensureColumns("doc","Stage",[
    {id:"Name",fields:{type:"Bool"}},
    {id:"MustNotExist",fields:{type:"Text"}}
  ]),/conflicts/);
  assert.equal(writes,1);assert.equal(existing.has("MustNotExist"),false);
});

test("ensure_columns fails closed on invalid and ambiguous seeds",async()=>{
  let writes=0,reads=0;
  const {grist}=service(1000,100,2,20,{
    listColumns:async()=>{reads++;return {columns:[]};},
    createColumns:async()=>{writes++;return {columns:[{id:"Flag"}]};}
  });
  const invalid=[
    [{id:"Flag",fields:{type:"Silly"}}],
    [{id:"Flag",fields:{type:"Bool",label:"extra"}}],
    [{id:"Flag"}],
    [{id:"Flag",fields:{type:"Bool"}},{id:"Flag",fields:{type:"Int"}}]
  ];
  for(const specs of invalid){
    await assert.rejects(()=>grist.ensureColumns("doc","Stage",specs),
      /type|Column IDs/);
  }
  assert.equal(reads,0);assert.equal(writes,0);
  await assert.rejects(()=>grist.ensureColumns("doc","Stage",[
    {id:"Flag",fields:{type:"Bool"}}
  ]),/do not retry.*blindly/);
  assert.equal(writes,1);
  const ambiguous=service(1000,100,2,20,{
    listColumns:async()=>({columns:[{
      id:"Existing",fields:{colRef:0,type:"Text"}
    }]}),
    createColumns:async()=>{writes++;return {columns:[{id:"Flag"}]};}
  });
  await assert.rejects(()=>ambiguous.grist.ensureColumns("doc","Stage",[
    {id:"Flag",fields:{type:"Bool"}}
  ]),/identity\/type/);
  assert.equal(writes,1);
});

test("ensure_columns creates and reuses formula seeds without changing prior state", async () => {
  const stored=new Map<string,{ref:number;type:string;isFormula:boolean;formula:string}>([
    ["Base",{ref:30,type:"Numeric",isFormula:false,formula:""}]
  ]);
  const input=[{id:"Double",fields:{type:"Numeric",isFormula:true,formula:"$Base * 2"}}];
  let writes=0;
  const {grist}=service(1000,100,2,20,{
    listColumns:async()=>({columns:[...stored].map(([id,meta])=>({
      id,fields:{colRef:meta.ref,type:meta.type,isFormula:meta.isFormula,formula:meta.formula}
    }))}),
    createColumns:async(_doc:string,_table:string,missing:typeof input)=>{
      writes++;assert.deepEqual(missing,input);
      stored.set("Double",{ref:31,type:"Numeric",isFormula:true,formula:"$Base * 2"});
      return {columns:[{id:"Double"}]};
    }
  });
  const made=await grist.ensureColumns("doc","Stage",input) as {
    changed:boolean;persistedSchemaVerified:boolean;columns:Array<{id:string;created:boolean}>
  };
  assert(made.changed&&made.persistedSchemaVerified);
  assert.deepEqual(made.columns,[{id:"Double",created:true}]);
  const repeated=await grist.ensureColumns("doc","Stage",input) as {changed:boolean};
  assert.equal(repeated.changed,false);assert.equal(writes,1);
  await assert.rejects(()=>grist.ensureColumns("doc","Stage",[
    {id:"Double",fields:{type:"Numeric",isFormula:true,formula:"$Base * 3"}},
    {id:"MustNotCreate",fields:{type:"Numeric"}}
  ]),/conflicts/);
  // A legacy type-only seed checks the native type but does not assert formula intent.
  const typeOnly=await grist.ensureColumns("doc","Stage",[
    {id:"Double",fields:{type:"Numeric"}}
  ]) as {changed:boolean};
  assert.equal(typeOnly.changed,false);
  assert.equal(stored.has("MustNotCreate"),false);assert.equal(writes,1);
});

test("ensure_columns explicitly seeds non-formula Choice and refuses formula conflicts", async () => {
  const stored=new Map<string,{ref:number;type:string;isFormula:boolean;formula:string}>([
    ["Computed",{ref:30,type:"Choice",isFormula:true,formula:"'A'"}]
  ]);
  const writable=[{id:"Status",fields:{type:"Choice",isFormula:false}}];
  let writes=0;
  const {grist}=service(1000,100,2,20,{
    listColumns:async()=>({columns:[...stored].map(([id,fields])=>({
      id,fields:{colRef:fields.ref,type:fields.type,isFormula:fields.isFormula,
        formula:fields.formula}
    }))}),
    createColumns:async(_doc:string,_table:string,missing:typeof writable)=>{
      writes++;assert.deepEqual(missing,writable);
      stored.set("Status",{ref:31,type:"Choice",isFormula:false,formula:""});
      return {columns:[{id:"Status"}]};
    }
  });
  const first=await grist.ensureColumns("doc","Stages",writable) as {
    changed:boolean;persistedSchemaVerified:boolean
  };
  assert.equal(first.changed,true);assert.equal(first.persistedSchemaVerified,true);
  const replay=await grist.ensureColumns("doc","Stages",writable) as {changed:boolean};
  assert.equal(replay.changed,false);assert.equal(writes,1);
  await assert.rejects(()=>grist.ensureColumns("doc","Stages",[
    {id:"Computed",fields:{type:"Choice",isFormula:false}},
    {id:"Missing",fields:{type:"Text"}}
  ]),/conflicts/);
  assert.equal(writes,1);assert.equal(stored.has("Missing"),false);
  const legacy=await grist.ensureColumns("doc","Stages",[
    {id:"Computed",fields:{type:"Choice"}}
  ]) as {changed:boolean};
  assert.equal(legacy.changed,false);
});

test("ensure_columns refuses missing and malformed formula seeds before native reads", async () => {
  let reads=0,writes=0;
  const {grist}=service(1000,100,2,20,{
    listColumns:async()=>{reads++;return {columns:[]};},
    createColumns:async()=>{writes++;return {columns:[]};}
  });
  for(const fields of [
    {type:"Numeric",isFormula:true},
    {type:"Numeric",isFormula:true,formula:""},
    {type:"Numeric",isFormula:true,formula:"   "},
    {type:"Numeric",isFormula:true,formula:"a".repeat(4097)},
    {type:"Numeric",isFormula:false,formula:"$Base"},
    {type:"Numeric",isFormula:false,widgetOptions:"{}"},
    {type:"Numeric",isFormula:true,formula:"$Base",label:"unrelated"}
  ]) {
    await assert.rejects(()=>grist.ensureColumns("doc","Stage",[
      {id:"Computed",fields}
    ]),/type|formula/);
  }
  assert.equal(reads,0);assert.equal(writes,0);
});

test("service forwards richer read options and enforces configured maximum", async () => {
  const { grist, observed } = service(1000, 100);
  await grist.queryRecords("doc", "Table1", {
    sort: "Nom,-Date",
    limit: 999,
    hidden: true,
    cellFormat: "typed"
  });

  assert.deepEqual(observed, [
    {
      action: "query",
      documentId: "doc",
      tableId: "Table1",
      options: {
        sort: "Nom,-Date",
        limit: 999,
        hidden: true,
        cellFormat: "typed"
      }
    }
  ]);

  await assert.rejects(
    () => grist.queryRecords("doc", "Table1", { limit: 1001 }),
    /exceeds configured maximum 1000/
  );
});

test("large writes are split into sequential internal batches", async () => {
  const { grist, observed } = service(1000, 10, 2);
  const result = await grist.createRecords("doc", "Table1", [
    { fields: { n: 1 } },
    { fields: { n: 2 } },
    { fields: { n: 3 } },
    { fields: { n: 4 } },
    { fields: { n: 5 } }
  ]);

  assert.equal((result as { batches: number }).batches, 3);
  assert.deepEqual(
    observed.map((entry: any) => entry.records.length),
    [2, 2, 1]
  );
});

test("partial batch failure reports already applied items and forbids blind retry", async () => {
  let calls = 0;
  const { grist } = service(1000, 10, 2, 10, {
    createRecords: async () => {
      calls += 1;
      if (calls === 2) throw new Error("upstream failure");
      return { records: [] };
    }
  });

  await assert.rejects(
    () =>
      grist.createRecords("doc", "Table1", [
        { fields: { n: 1 } },
        { fields: { n: 2 } },
        { fields: { n: 3 } }
      ]),
    (error: unknown) => {
      assert.ok(error instanceof PartialBatchError);
      assert.equal(error.operation, "createRecords");
      assert.equal(error.completedBatches, 1);
      assert.equal(error.completedItems, 2);
      assert.equal(error.failedBatch, 2);
      assert.match(error.message, /Do not retry the whole operation blindly/);
      return true;
    }
  );
});

test("delete requires unique positive IDs and batches them", async () => {
  const { grist, observed } = service(1000, 10, 2);
  await grist.deleteRecords("doc", "Table1", [1, 2, 3]);
  assert.deepEqual(
    observed.map((entry: any) => entry.recordIds),
    [[1, 2], [3]]
  );

  await assert.rejects(
    () => grist.deleteRecords("doc", "Table1", [1, 1]),
    /must be unique/
  );
  await assert.rejects(
    () => grist.deleteRecords("doc", "Table1", [0]),
    /positive integers/
  );
});

test("renameColumn and deleteTable emit only fixed targeted Grist actions", async () => {
  const { grist, observed } = service();

  await grist.renameColumn("doc", "People", "FullName", "Name");
  await grist.deleteTable("doc", "OldTable");

  assert.deepEqual(observed, [
    {
      action: "apply",
      documentId: "doc",
      actions: [["RenameColumn", "People", "FullName", "Name"]]
    },
    {
      action: "apply",
      documentId: "doc",
      actions: [["RemoveTable", "OldTable"]]
    }
  ]);
});

test("schema operations support formula/type/widget metadata and enforce guardrail", async () => {
  const { grist, observed } = service(1000, 100, 20, 2);

  await grist.createColumns("doc", "People", [
    { id: "Score", fields: { type: "Int", label: "Score" } },
    {
      id: "DoubleScore",
      fields: {
        type: "Int",
        isFormula: true,
        formula: "$Score * 2",
        widgetOptions: "{}"
      }
    }
  ]);

  assert.equal((observed[0] as any).action, "createColumns");
  await assert.rejects(
    () =>
      grist.createColumns("doc", "People", [
        { id: "A" },
        { id: "B" },
        { id: "C" }
      ]),
    /Schema item count 3 exceeds configured maximum 2/
  );
});

test("createTables counts tables and nested columns against one schema guardrail", async () => {
  const { grist } = service(1000, 100, 20, 3);

  await assert.rejects(
    () =>
      grist.createTables("doc", [
        { id: "A", columns: [{ id: "A1" }, { id: "A2" }] },
        { id: "B" }
      ]),
    /Schema item count 4 exceeds configured maximum 3/
  );
});

test("deleteColumns requires explicit unique column IDs", async () => {
  const { grist, observed } = service();
  await grist.deleteColumns("doc", "People", ["OldA", "OldB"]);
  assert.deepEqual(
    observed.map((entry: any) => entry.columnId),
    ["OldA", "OldB"]
  );

  await assert.rejects(
    () => grist.deleteColumns("doc", "People", ["OldA", "OldA"]),
    /Column IDs must be unique/
  );
});

test("zero limits mean unlimited bridge-side guardrails", async () => {
  const { grist } = service(0, 0, 200, 0);
  await grist.queryRecords("doc", "Table1", { limit: 100000 });
  await grist.createRecords(
    "doc",
    "Table1",
    Array.from({ length: 1000 }, (_, i) => ({ fields: { i } }))
  );
  await grist.createColumns(
    "doc",
    "Table1",
    Array.from({ length: 500 }, (_, i) => ({ id: `C${i}` }))
  );
});


test("table creation refuses missing or empty columns before any native write", async () => {
  const { grist, observed } = service();
  await assert.rejects(() => grist.createTables("doc", [{ id: "Missing" }]), /at least one column/);
  await assert.rejects(() => grist.createTables("doc", [{ id: "Empty", columns: [] }]), /at least one column/);
  await assert.rejects(() => grist.createTables("doc", [
    { id: "Valid", columns: [{ id: "Name" }] }, { id: "Invalid" }
  ]), /at least one column/);
  assert.deepEqual(observed, []);
  await grist.createTables("doc", [{ id: "Valid", columns: [{ id: "Name", fields: { type: "Text" } }] }]);
  assert.deepEqual(observed, [{ action: "createTables", documentId: "doc",
    tables: [{ id: "Valid", columns: [{ id: "Name", fields: { type: "Text" } }] }] }]);
});

test("column creation refuses ignored native metadata before any table or column write", async () => {
  const { grist, observed } = service();
  const good = { id: "Name", fields: { type: "Text", label: "Display", isFormula: false, formula: "", widgetOptions: "{}" } };
  const rejected = [
    { id: "Description", fields: { description: "Would silently disappear" } },
    { id: "Reference", fields: { type: "Ref:People", visibleColumnId: "Name" } }
  ];
  for (const bad of rejected) {
    await assert.rejects(
      () => grist.createTables("doc", [{ id: "First", columns: [good] }, { id: "Bad", columns: [bad] }]),
      /Unsupported column creation fields/
    );
    await assert.rejects(() => grist.createColumns("doc", "People", [good, bad]),
      /Unsupported column creation fields/);
  }
  assert.deepEqual(observed, []);
  await grist.createTables("doc", [{ id: "Created", columns: [good] }]);
  await grist.createColumns("doc", "People", [good]);
  assert.deepEqual(observed, [
    { action: "createTables", documentId: "doc", tables: [{ id: "Created", columns: [good] }] },
    { action: "createColumns", documentId: "doc", tableId: "People", columns: [good] }
  ]);
});


test("ensure_tables reconciles typed seeds and ignores later extra columns",async()=>{
  const spec=[{id:"Stages",columns:[{id:"Contact",fields:{type:"Date"}}]},
    {id:"Enseignants",columns:[{id:"Nom",fields:{type:"Text"}}]}];
  let calls=0;
  const data=new Map<string,{ref:number;columns:Array<{id:string;fields:{colRef:number;type:string}}>}>(
    [["Stages",{ref:2,columns:[{id:"Contact",fields:{colRef:20,type:"Date"}},
      {id:"Extra",fields:{colRef:21,type:"Text"}}]}]]
  );
  const {grist}=service(1000,100,2,20,{
    listTables:async()=>({tables:Array.from(data,([id,t])=>({
      id,fields:{tableRef:t.ref},columns:t.columns
    }))}),
    createTables:async(_id:string,missing:typeof spec)=>{
      calls++;assert.deepEqual(missing.map(t=>t.id),["Enseignants"]);
      data.set("Enseignants",{ref:3,columns:[{id:"Nom",fields:{colRef:30,type:"Text"}}]});
      return {tables:[{id:"Enseignants"}]};
    }
  });
  const first=await grist.ensureTables("doc",spec) as Record<string,unknown>;
  assert.equal(first.changed,true);
  assert.equal(first.persistedSchemaVerified,true);
  assert.deepEqual(first.tables,[{id:"Stages",created:false},{id:"Enseignants",created:true}]);
  const second=await grist.ensureTables("doc",spec) as Record<string,unknown>;
  assert.equal(second.changed,false);assert.equal(calls,1);
  await assert.rejects(()=>grist.ensureTables("doc",[
    {id:"Stages",columns:[{id:"Contact",fields:{type:"Text"}}]},
    {id:"Other",columns:[{id:"Name",fields:{type:"Text"}}]}
  ]),/conflicting/);
  assert.equal(calls,1);
});

test("ensure_tables validates the complete batch before writes and fails closed on uncertain state",async()=>{
  let writes=0,reads=0;
  const {grist}=service(1000,100,2,10,{
    listTables:async()=>{reads++;return {tables:[]};},
    createTables:async()=>{writes++;return {tables:[{id:"Stages"}]};}
  });
  for(const malformed of [
    [{id:"Stages",columns:[{id:"Date",fields:{type:"Invalid"}}]}],
    [{id:"Stages",columns:[{id:"Date",fields:{type:"Date",label:"Extra"}}]}],
    [{id:"Stages",columns:[]}],
    [{id:"Stages",columns:[{id:"Date",fields:{type:"Date"}}]},
      {id:"Stages",columns:[{id:"Name",fields:{type:"Text"}}]}]
  ]){
    await assert.rejects(()=>grist.ensureTables("doc",malformed),/type|column|Table IDs|needs/);
  }
  assert.equal(reads,0);assert.equal(writes,0);
  const valid=[{id:"Stages",columns:[{id:"Date",fields:{type:"Date"}}]}];
  await assert.rejects(()=>grist.ensureTables("doc",valid),/do not retry.*blindly/);
  assert.equal(writes,1);
  const bad=service(1000,100,2,10,{
    listTables:async()=>({tables:[{id:"Other",fields:{tableRef:1},
      columns:[{id:"Name",fields:{type:"Text",colRef:0}}]}]}),
    createTables:async()=>{writes++;return {tables:[{id:"Stages"}]};}
  });
  await assert.rejects(()=>bad.grist.ensureTables("doc",valid),/identity|metadata/);
  assert.equal(writes,1);
});
