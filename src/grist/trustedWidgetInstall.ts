import { isDeepStrictEqual } from "node:util";
import { isIP } from "node:net";
import { customViewOptions } from "./customWidgetSettings.js";

type Json = Record<string, unknown>;
export interface TrustedWidget {
  key: string; name: string; widgetId: string; revision: string; url: string;
}
const KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const VERSION = /^(?:v?[0-9]+\.[0-9]+\.[0-9]+|[0-9a-f]{40})$/;
const ID = /^[@A-Za-z0-9][@A-Za-z0-9._/-]{0,119}$/;
function obj(x: unknown): Json | null {
  return x !== null && typeof x === "object" && !Array.isArray(x) ? x as Json : null;
}

/** Only deployment operators can approve versioned remote origins, never MCP callers. */
export function approvedWidgets(raw: string | undefined, gristBase: string): TrustedWidget[] {
  if (!raw?.trim()) return [];
  if (raw.length > 8192) throw new Error("Trusted widget registry exceeds the maximum size.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; }
  catch { throw new Error("Trusted widget registry must be valid JSON."); }
  if (!Array.isArray(parsed) || parsed.length > 12) {
    throw new Error("Trusted widget registry must contain at most 12 entries.");
  }
  const host = new URL(gristBase).hostname;
  const keys = new Set<string>();
  return parsed.map((rawEntry): TrustedWidget => {
    const entry = obj(rawEntry);
    if (!entry || Object.keys(entry).some(k =>
      !["key","name","widgetId","revision","url"].includes(k)) ||
      typeof entry.key !== "string" || !KEY.test(entry.key) ||
      typeof entry.name !== "string" || !entry.name.trim() ||
      entry.name.length > 80 || /[<>\u0000-\u001f]/.test(entry.name) ||
      typeof entry.widgetId !== "string" || !ID.test(entry.widgetId) ||
      typeof entry.revision !== "string" || !VERSION.test(entry.revision) ||
      typeof entry.url !== "string" || entry.url.length > 1024) {
      throw new Error("Malformed operator-approved widget entry.");
    }
    if (keys.has(entry.key)) throw new Error("Duplicate trusted widget registry key.");
    keys.add(entry.key);
    let url: URL;
    try { url = new URL(entry.url); }
    catch { throw new Error("Trusted widget URL must be HTTPS."); }
    if (url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash || entry.url.includes("?") || entry.url.includes("#") ||
      url.hostname === host || !url.hostname.includes(".") ||
      url.hostname === "localhost" || url.hostname.endsWith(".localhost") ||
      isIP(url.hostname) !== 0 ||
      !url.pathname.split("/").some(s => s === entry.revision || s.startsWith(entry.revision + "."))) {
      throw new Error("Trusted widget URL must use separate HTTPS origin and versioned path.");
    }
    return {key:entry.key,name:entry.name,widgetId:entry.widgetId,
      revision:entry.revision,url:url.href};
  });
}

/** Native Grist customView writer: initial access is always none. */
export function planTrustedWidgetInstall(
  widget: {type:string;options?:unknown}, item: TrustedWidget
): {changed:boolean;options:Json;optionsJson:string} {
  if (widget.type !== "custom") throw new Error("Widget must be native Custom type.");
  const outer=obj(widget.options), old=customViewOptions(outer);
  if (!outer || !old) throw new Error("Native custom widget options are incomplete.");
  const widgetDef={name:item.name,widgetId:item.widgetId,url:item.url,
    accessLevel:"none",renderAfterReady:false};
  const identified=old.widgetId != null || old.widgetDef != null ||
    (typeof old.url === "string" && old.url.length > 0);
  if (identified) {
    if (old.widgetId === item.widgetId &&
      isDeepStrictEqual(old.widgetDef,widgetDef) &&
      (old.url === undefined || old.url === null) &&
      (old.pluginId === undefined || old.pluginId === "")) {
      return {changed:false,options:outer,optionsJson:JSON.stringify(outer)};
    }
    throw new Error("Custom widget identity is already protected.");
  }
  const emptyKeys=new Set(["widgetId","widgetDef","url","pluginId","access",
    "widgetOptions","columnsMapping","renderAfterReady"]);
  for(const [key,value] of Object.entries(old)) {
    if(!emptyKeys.has(key) ||
      (key==="access" && value!==undefined && value!==null && value!=="" && value!=="none") ||
      (key==="renderAfterReady" && value===true) ||
      (key!=="access" && key!=="renderAfterReady" &&
        value!==undefined && value!==null && value!=="")) {
      throw new Error("Existing custom widget settings are not blank.");
    }
  }
  const selected={widgetId:item.widgetId,widgetDef,pluginId:"",url:null,
    access:"none",widgetOptions:null,columnsMapping:null,renderAfterReady:false};
  const options:Json={...outer,customView:JSON.stringify(selected)};
  const optionsJson=JSON.stringify(options);
  if(optionsJson.length>8192)throw new Error("Trusted widget exceeds native size limit.");
  return {changed:true,options,optionsJson};
}
