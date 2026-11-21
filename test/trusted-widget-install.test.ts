import assert from "node:assert/strict";
import test from "node:test";
import { approvedWidgets, planTrustedWidgetInstall } from "../src/grist/trustedWidgetInstall.js";

const base="https://grist.example.org";
const approved={key:"timeline",name:"Stages timeline",widgetId:"@test/timeline",
  revision:"v1.0.0",url:"https://widgets.example.org/timeline/v1.0.0/index.html"};
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
