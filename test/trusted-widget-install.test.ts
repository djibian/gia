import assert from "node:assert/strict";
import test from "node:test";
import { approvedWidgets, assertTrustedWidgetSelectBySource, matchesTrustedWidgetSelection,
  planTrustedWidgetInstall, planTrustedWidgetReferences,
  planTrustedWidgetRevisionUpdate } from "../src/grist/trustedWidgetInstall.js";

const base="https://grist.example.org";
const approved={key:"timeline",name:"Stages timeline",widgetId:"@test/timeline",
  revision:"v1.0.0",url:"https://widgets.example.org/timeline/v1.0.0/index.html"};

test("a trusted linking source must match an approved direct revision with data access", () => {
  assert.throws(() => approvedWidgets(JSON.stringify([{ ...approved, allowSelectBy: true }]), base));
  const item = approvedWidgets(JSON.stringify([{ ...approved, directUrl: true, allowSelectBy: true }]), base)[0]!;
  const installed = planTrustedWidgetInstall({ type: "custom", options: {} }, item);
  const view = JSON.parse(installed.options.customView as string);
  const widget = (patch: Record<string, unknown>) =>
    ({ type: "custom", options: { customView: JSON.stringify({ ...view, ...patch }) } });
  assert.throws(() => assertTrustedWidgetSelectBySource(widget({}), item));
  assert.throws(() => assertTrustedWidgetSelectBySource(widget({ access: "full", mode: "plugin" }), item));
  assert.throws(() => assertTrustedWidgetSelectBySource(widget({ access: "full", widgetId: approved.widgetId }), item));
  assert.doesNotThrow(() => assertTrustedWidgetSelectBySource(widget({ access: "read table" }), item));
});

test("direct trusted widgets pin the Grist frame URL without enabling catalog resolution", () => {
  const item = approvedWidgets(JSON.stringify([{ ...approved, directUrl: true }]), base)[0]!;
  const before = planTrustedWidgetInstall({ type: "custom", options: { theme: "dark" } }, item);
  const view = JSON.parse(before.options.customView as string);
  assert.equal(view.url, approved.url);
  assert.equal(view.widgetId, null);
  assert.equal(view.widgetDef, null);
  assert.equal(view.access, "none");
  assert.equal(matchesTrustedWidgetSelection(before.options, item), true);
  assert.equal(matchesTrustedWidgetSelection({ ...before.options,
    customView: JSON.stringify({ ...view, widgetDef: { widgetId: approved.widgetId } })
  }, item), false);
  assert.equal(planTrustedWidgetInstall({ type: "custom", options: before.options }, item).changed, false);
  const next = { ...item, revision: "v1.0.1", url: approved.url.replace("v1.0.0", "v1.0.1") };
  const revised = planTrustedWidgetRevisionUpdate({ type: "custom", options: before.options }, item, next);
  assert.equal(revised.changed, true);
  assert.equal(matchesTrustedWidgetSelection(revised.options, next), true);
  assert.equal(revised.options.theme, "dark");
  assert.throws(() => planTrustedWidgetRevisionUpdate({ type: "custom", options: before.options }, item, approved));
  assert.throws(() => approvedWidgets(JSON.stringify([item, {
    ...item, key: "other", widgetId: "@test/other",
    url: item.url.replace("widgets.example.org", "WIDGETS.EXAMPLE.ORG:443")
  }]), base), /Duplicate trusted direct widget URL/);
});

test("trusted reference option resolves only approved slots and preserves inactive widget metadata", () => {
  const manifest = { key: "config", version: 2, tableSlots: ["source", "lookup"],
    columnSlots: { name: "lookup" }, defaults: { display: { compact: true } } };
  const item = approvedWidgets(JSON.stringify([{ ...approved, referenceOption: manifest }]), base)[0]!;
  const initial = planTrustedWidgetInstall({ type: "custom", options: { theme: "dark" } }, item);
  const view = JSON.parse(initial.options.customView as string);
  const widget = { type: "custom", options: {
    ...initial.options, customView: JSON.stringify({ ...view, widgetOptions: { keep: "untouched" } })
  } };
  const references = { tables: { source: "People", lookup: "Cities" }, columns: { name: "Name" } };
  const native = { tables: [
    { id: "People", fields: { tableRef: 10 }, columns: [{ id: "Email", fields: { colRef: 50 } }] },
    { id: "Cities", fields: { tableRef: 11 }, columns: [{ id: "Name", fields: { colRef: 51 } }] }
  ] };
  const plan = planTrustedWidgetReferences(widget, item, references, native);
  assert.equal(plan.changed, true);
  assert.equal(plan.options.theme, "dark");
  assert.deepEqual(JSON.parse(plan.options.customView as string), {
    ...view, widgetOptions: { keep: "untouched", config: {
      display: { compact: true }, version: 2, tables: { source: 10, lookup: 11 },
      bindings: { name: { tableRef: 11, columnRef: 51 } }
    } }
  });
  assert.equal(planTrustedWidgetReferences({ ...widget, options: plan.options }, item, references, native).changed, false);
  assert.throws(() => planTrustedWidgetReferences(widget, item,
    { ...references, columns: { name: "Email" } }, native), /approved table/);
  assert.throws(() => planTrustedWidgetReferences(widget, item,
    { ...references, tables: { ...references.tables, third: "People" } }, native), /exactly/);
  assert.throws(() => planTrustedWidgetReferences({ ...widget, options: {
    ...widget.options, customView: JSON.stringify({ ...view, access: "full" })
  } }, item, references, native), /access none/);
  for (const altered of [{ mode: "plugin" }, { mode: null }, { sectionId: "internal" }]) {
    assert.throws(() => planTrustedWidgetReferences({ ...widget, options: {
      ...widget.options, customView: JSON.stringify({ ...view, ...altered })
    } }, item, references, native), /exact approved/);
  }
  for (const invalid of [
    { ...manifest, columnSlots: { name: "unregistered" } },
    { ...manifest, defaults: { display: { href: "https://example.org" } } },
    { ...manifest, defaults: { tables: {} } }
  ]) {
    assert.throws(() => approvedWidgets(JSON.stringify([{ ...approved, referenceOption: invalid }]), base));
  }
});
test("trusted registry requires distinct HTTPS versioned origin and defaults to deny",()=>{
  assert.deepEqual(approvedWidgets(undefined,base),[]);
  assert.deepEqual(approvedWidgets(JSON.stringify([approved]),base),[approved]);
  for(const entry of [
    {...approved,url:"https://grist.example.org/timeline/v1.0.0/index.html"},
    {...approved,url:"https://widgets.example.org/timeline/latest/index.html"},
    {...approved,url:"https://widgets.example.org/timeline/v1.0.0/index.html?token=x"},
    {...approved,url:"http://widgets.example.org/timeline/v1.0.0/index.html"},
    {...approved,revision:"latest"}
  ])assert.throws(()=>approvedWidgets(JSON.stringify([entry]),base));
  assert.throws(()=>approvedWidgets(JSON.stringify([approved,approved]),base));
});
test("trusted widget native selection keeps zero access and refuses identity replacement",()=>{
  const planned=planTrustedWidgetInstall({type:"custom",options:{}},approved);
  assert(planned.changed);
  const view=JSON.parse(planned.options.customView as string);
  assert.equal(view.widgetDef.url,approved.url);
  assert.equal(view.access,"none");
  assert.equal(planTrustedWidgetInstall({type:"custom",options:planned.options},approved).changed,false);
  assert.throws(()=>planTrustedWidgetInstall({type:"record",options:{}},approved));
  assert.throws(()=>planTrustedWidgetInstall({type:"custom",options:{customView:"invalid"}},approved));
  assert.throws(()=>planTrustedWidgetInstall({type:"custom",options:{customView:'{"access":"full"}'}},approved));
  assert.throws(()=>planTrustedWidgetInstall({type:"custom",options:{customView:'{"url":"https://other.example.org/"}'}},approved));
});

test("approved immutable revision update preserves state, replays safely and refuses data-bearing widgets",()=>{
  const next={...approved,key:"timeline2",revision:"v1.0.1",
    url:"https://widgets.example.org/timeline/v1.0.1/index.html"};
  const initial=planTrustedWidgetInstall({type:"custom",options:{theme:"dark"}},approved);
  const moved=planTrustedWidgetRevisionUpdate({type:"custom",options:initial.options},approved,next);
  assert(moved.changed);
  assert.equal(moved.options.theme,"dark");
  const selected=JSON.parse(moved.options.customView as string);
  assert.equal(selected.widgetDef.url,next.url);
  assert.equal(selected.access,"none");
  assert.equal(planTrustedWidgetRevisionUpdate({type:"custom",options:moved.options},approved,next).changed,false);
  assert.equal(planTrustedWidgetRevisionUpdate({type:"custom",options:moved.options},next,approved).changed,true);
  const mutated=(patch:Record<string,unknown>)=>({type:"custom",
    options:{...initial.options,customView:JSON.stringify({...JSON.parse(
      initial.options.customView as string),...patch})}});
  assert.throws(()=>planTrustedWidgetRevisionUpdate(mutated({access:"full"}),approved,next));
  assert.throws(()=>planTrustedWidgetRevisionUpdate(mutated({columnsMapping:{title:1}}),approved,next));
  assert.throws(()=>planTrustedWidgetRevisionUpdate(mutated({widgetOptions:{mode:"x"}}),approved,next));
  assert.throws(()=>planTrustedWidgetRevisionUpdate(mutated({widgetDef:{url:"https://evil.example/"}}),approved,next));
  assert.throws(()=>planTrustedWidgetRevisionUpdate({type:"card",options:initial.options},approved,next));
  assert.throws(()=>planTrustedWidgetRevisionUpdate({type:"custom",options:initial.options},approved,
    {...next,widgetId:"@other/widget"}));
  assert.throws(()=>planTrustedWidgetRevisionUpdate({type:"custom",options:initial.options},approved,
    {...next,url:"https://other.example.org/timeline/v1.0.1/index.html"}));
  assert.throws(()=>planTrustedWidgetRevisionUpdate({type:"custom",options:initial.options},approved,
    {...next,url:"https://widgets.example.org/other/v1.0.1/index.html"}));
});
