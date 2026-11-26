import { isDeepStrictEqual } from "node:util";
import { isIP } from "node:net";
import { customViewOptions } from "./customWidgetSettings.js";
import { tableColumnMaps } from "./tableColumnMaps.js";

type Json = Record<string, unknown>;
export interface TrustedWidget {
  key: string; name: string; widgetId: string; url: string;
  revision?: string;
  referenceOption?: ReferenceOptionManifest;
  directUrl?: true;
  allowSelectBy?: true;
  allowReciprocalCursor?: true;
}
interface ReferenceOptionManifest {
  key: string;
  version: number;
  tableSlots: string[];
  columnSlots: Record<string, string>;
  defaults: Json;
}
export interface TrustedWidgetReferences {
  tables: Record<string, string>;
  columns: Record<string, string>;
}
const KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const VERSION = /^(?:v?[0-9]+\.[0-9]+\.[0-9]+|[0-9a-f]{40})$/;
const ID = /^[@A-Za-z0-9][@A-Za-z0-9._/-]*(?:#[A-Za-z0-9][A-Za-z0-9._-]*)?$/;
function obj(x: unknown): Json | null {
  return x !== null && typeof x === "object" && !Array.isArray(x) ? x as Json : null;
}

function isOptionKey(key: unknown): key is string {
  return typeof key === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) &&
    !/^(?:constructor|prototype)$|(?:token|secret|password|credential|api_?key|authorization)/i.test(key);
}

function safePreset(value: unknown, depth: number): boolean {
  if (typeof value === "string") {
    return value.length <= 160 && !/[<>\u0000-\u001f]|(?:https?|javascript|data|file):/i.test(value);
  }
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) <= 1_000_000;
  if (typeof value === "boolean" || value === null) return true;
  const group = obj(value);
  return depth > 0 && group !== null && Object.keys(group).length <= 12 &&
    Object.entries(group).every(([key, child]) => isOptionKey(key) && safePreset(child, depth - 1));
}

function readReferenceOption(raw: unknown): ReferenceOptionManifest {
  const entry = obj(raw);
  const slots = obj(entry?.columnSlots);
  const defaults = entry?.defaults === undefined ? {} : obj(entry.defaults);
  const version = entry?.version;
  const tableSlots: unknown = entry?.tableSlots;
  if (!entry || !isOptionKey(entry.key) || typeof version !== "number" ||
      !Number.isSafeInteger(version) || version < 1 || version > 9999 ||
      !Array.isArray(tableSlots) || tableSlots.length < 1 || tableSlots.length > 12 ||
      !tableSlots.every(isOptionKey) || new Set(tableSlots).size !== tableSlots.length ||
      !slots || Object.keys(slots).length < 1 || Object.keys(slots).length > 24 ||
      !Object.entries(slots).every(([key, table]) =>
        isOptionKey(key) && typeof table === "string" && tableSlots.includes(table)) ||
      !defaults || ["version", "tables", "bindings"].some(key => Object.hasOwn(defaults, key)) ||
      !safePreset(defaults, 3) || Object.keys(entry).some(key =>
        !["key", "version", "tableSlots", "columnSlots", "defaults"].includes(key))) {
    throw new Error("Malformed operator-approved widget reference option.");
  }
  return { key: entry.key, version, tableSlots, columnSlots: slots as Record<string, string>, defaults };
}

function approvedDefinition(item: TrustedWidget): Json {
  return {
    name: item.name, widgetId: item.widgetId, url: item.url,
    accessLevel: "none", renderAfterReady: false
  };
}

function isNativeUrlWidget(view: Json): boolean {
  return (view.mode === undefined || view.mode === "url") &&
    (view.sectionId == null || view.sectionId === "") &&
    (view.pluginId == null || view.pluginId === "");
}

function approvedSelection(item: TrustedWidget): Json {
  // Grist deliberately prefers a catalog lookup if either widget ID is present.
  return item.directUrl === true
    ? { widgetId: null, widgetDef: null, url: item.url }
    : { widgetId: item.widgetId, widgetDef: approvedDefinition(item), url: null };
}

export function matchesTrustedWidgetSelection(options: unknown, item: TrustedWidget): boolean {
  const view = customViewOptions(obj(options));
  if (!view || !isNativeUrlWidget(view)) return false;
  const selection = approvedSelection(item);
  return Object.entries(selection).every(([key, expected]) =>
    expected === null ? view[key] == null : isDeepStrictEqual(view[key], expected));
}

/** The deployment registry approves exact widget URLs, including maintained URLs. */
export function approvedWidgets(raw: string | undefined, gristBase: string): TrustedWidget[] {
  if (!raw?.trim()) return [];
  if (raw.length > 8192) throw new Error("Trusted widget registry exceeds the maximum size.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; }
  catch { throw new Error("Trusted widget registry must be valid JSON."); }
  if (!Array.isArray(parsed) || parsed.length > 12) {
    throw new Error("Trusted widget registry must contain at most 12 entries.");
  }
  const gristHost = new URL(gristBase).hostname;
  const keys = new Set<string>();
  const directUrls = new Set<string>();
  return parsed.map((rawEntry): TrustedWidget => {
    const entry = obj(rawEntry);
    if (!entry || Object.keys(entry).some(k =>
      !["key","name","widgetId","revision","url","referenceOption","directUrl","allowSelectBy","allowReciprocalCursor"].includes(k)) ||
      typeof entry.key !== "string" || !KEY.test(entry.key) ||
      typeof entry.name !== "string" || !entry.name.trim() ||
      entry.name.length > 80 || /[<>\u0000-\u001f]/.test(entry.name) ||
      typeof entry.widgetId !== "string" || entry.widgetId.length > 120 || !ID.test(entry.widgetId) ||
      (entry.revision !== undefined &&
        (typeof entry.revision !== "string" || !VERSION.test(entry.revision))) ||
      typeof entry.url !== "string" || entry.url.length > 1024 ||
      (entry.directUrl !== undefined && entry.directUrl !== true) ||
      (entry.allowSelectBy !== undefined && (entry.allowSelectBy !== true || entry.directUrl !== true)) ||
      (entry.allowReciprocalCursor !== undefined &&
        (entry.allowReciprocalCursor !== true || entry.allowSelectBy !== true || entry.directUrl !== true))) {
      throw new Error("Malformed operator-approved widget entry.");
    }
    if (keys.has(entry.key)) throw new Error("Duplicate trusted widget registry key.");
    keys.add(entry.key);
    let url: URL;
    try { url = new URL(entry.url); }
    catch { throw new Error("Trusted widget URL must be HTTPS."); }
    if (url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash || entry.url.includes("?") || entry.url.includes("#") ||
      url.hostname === gristHost || !url.hostname.includes(".") ||
      url.hostname === "localhost" || url.hostname.endsWith(".localhost") ||
      isIP(url.hostname) !== 0) {
      throw new Error("Trusted widget URL must use HTTPS on a host distinct from Grist, without credentials, query or fragment.");
    }
    if (entry.directUrl === true) {
      if (directUrls.has(url.href)) throw new Error("Duplicate trusted direct widget URL.");
      directUrls.add(url.href);
    }
    return {key:entry.key,name:entry.name,widgetId:entry.widgetId,
      url:url.href,
      ...(typeof entry.revision === "string" ? { revision: entry.revision } : {}),
      ...(entry.directUrl === true ? { directUrl: true } : {}),
      ...(entry.allowSelectBy === true ? { allowSelectBy: true } : {}),
      ...(entry.allowReciprocalCursor === true ? { allowReciprocalCursor: true } : {}),
      ...(entry.referenceOption === undefined ? {} : { referenceOption: readReferenceOption(entry.referenceOption) })};
  });
}

export function assertTrustedWidgetSelectBySource(
  widget: { type: string; options?: unknown }, item: TrustedWidget
): void {
  const view = customViewOptions(obj(widget.options));
  if (item.allowSelectBy !== true || item.directUrl !== true || widget.type !== "custom" ||
      (view?.access !== "read table" && view?.access !== "full") ||
      !matchesTrustedWidgetSelection(widget.options, item)) {
    throw new Error("Select-by requires an active, exactly matching widget approved as a linking source.");
  }
}

/** Native Grist customView writer: initial access is always none. */
export function planTrustedWidgetInstall(
  widget: {type:string;options?:unknown}, item: TrustedWidget
): {changed:boolean;options:Json;optionsJson:string} {
  if (widget.type !== "custom") throw new Error("Widget must be native Custom type.");
  const outer=obj(widget.options), old=customViewOptions(outer);
  if (!outer || !old) throw new Error("Native custom widget options are incomplete.");
  const identified=old.widgetId != null || old.widgetDef != null ||
    (typeof old.url === "string" && old.url.length > 0);
  if (identified) {
    if (matchesTrustedWidgetSelection(outer, item)) {
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
  const selected={...approvedSelection(item),pluginId:"",
    access:"none",widgetOptions:null,columnsMapping:null,renderAfterReady:false};
  const options:Json={...outer,customView:JSON.stringify(selected)};
  const optionsJson=JSON.stringify(options);
  if(optionsJson.length>8192)throw new Error("Trusted widget exceeds native size limit.");
  return {changed:true,options,optionsJson};
}

/** Configure one operator-declared option on an exact inactive widget selection. */
export function planTrustedWidgetReferences(
  widget: { type: string; options?: unknown },
  item: TrustedWidget,
  references: TrustedWidgetReferences,
  tablesResponse: unknown
): { changed: boolean; options: Json; optionsJson: string } {
  const manifest = item.referenceOption;
  const outer = obj(widget.options);
  const current = customViewOptions(outer);
  if (!manifest || widget.type !== "custom" || !outer || !current ||
      current.access !== "none" ||
      !matchesTrustedWidgetSelection(outer, item) ||
      current.renderAfterReady !== false) {
    throw new Error("Reference configuration requires the exact approved widget installed with access none.");
  }
  const exactSlots = (raw: unknown, expected: string[]): boolean => {
    const entries = obj(raw);
    return entries !== null && Object.keys(entries).length === expected.length &&
      expected.every(key => Object.hasOwn(entries, key) && typeof entries[key] === "string" &&
        /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(entries[key]));
  };
  if (!exactSlots(references.tables, manifest.tableSlots) ||
      !exactSlots(references.columns, Object.keys(manifest.columnSlots))) {
    throw new Error("Provide exactly the approved table and column slots with stable IDs.");
  }
  const nativeTables = obj(tablesResponse)?.tables;
  if (!Array.isArray(nativeTables) || nativeTables.length > 500) {
    throw new Error("Native widget reference table metadata is incomplete.");
  }
  const sourceTables = new Map(manifest.tableSlots.map(slot => {
    const tableId = references.tables[slot]!;
    const candidate = nativeTables.find(record => obj(record)?.id === tableId);
    const tableRef = obj(obj(candidate)?.fields)?.tableRef;
    if (typeof tableRef !== "number" || !Number.isSafeInteger(tableRef) || tableRef < 1) {
      throw new Error("A widget table slot does not resolve to complete native metadata.");
    }
    const columns = tableColumnMaps({ tableId, tableRef }, tablesResponse);
    if (!columns) throw new Error("A widget table slot does not resolve to complete native metadata.");
    return [slot, { tableRef, columns: columns.byId }];
  }));
  const tables = Object.fromEntries([...sourceTables].map(([slot, table]) => [slot, table.tableRef]));
  const bindings = Object.fromEntries(Object.entries(manifest.columnSlots).map(([slot, tableSlot]) => {
    const table = sourceTables.get(tableSlot)!;
    const columnRef = table.columns.get(references.columns[slot]!);
    if (!columnRef) throw new Error("A widget column slot does not resolve on its approved table slot.");
    return [slot, { tableRef: table.tableRef, columnRef }];
  }));
  const expected = { ...manifest.defaults, version: manifest.version, tables, bindings };
  const widgetOptions = obj(current.widgetOptions);
  if (current.widgetOptions != null && !widgetOptions) {
    throw new Error("Existing widget-owned options are opaque.");
  }
  if (isDeepStrictEqual(widgetOptions?.[manifest.key], expected)) {
    return { changed: false, options: outer, optionsJson: JSON.stringify(outer) };
  }
  const patched = { ...widgetOptions, [manifest.key]: expected };
  if (JSON.stringify(patched).length > 4096) throw new Error("Widget-owned options exceed the payload limit.");
  const options = { ...outer, customView: JSON.stringify({ ...current, widgetOptions: patched }) };
  return { changed: true, options, optionsJson: JSON.stringify(options) };
}

/** Replace an explicitly labeled revision with another approved revision of the
 * SAME widget, while access and all data-bearing settings are still blank. */
export function planTrustedWidgetRevisionUpdate(
  widget: {type:string;options?:unknown},
  previous: TrustedWidget, next: TrustedWidget
): {changed:boolean;options:Json;optionsJson:string} {
  if (widget.type !== "custom" || previous.widgetId !== next.widgetId ||
      previous.directUrl !== next.directUrl) {
    throw new Error("Trusted widget revision requires an existing Custom widget of the same identity.");
  }
  const slot = (item: TrustedWidget): string | null => {
    if (item.revision === undefined) return null;
    const revision = item.revision;
    const u = new URL(item.url);
    const parts = u.pathname.split("/");
    if (!parts.some(part => part === revision || part.startsWith(revision + "."))) return null;
    const path = parts.map(part => part === revision || part.startsWith(revision + ".")
      ? ":revision" + part.slice(revision.length) : part).join("/");
    return u.origin + path;
  };
  const previousSlot = slot(previous);
  if (previousSlot === null || previousSlot !== slot(next) ||
      (previous.revision === next.revision && previous.url !== next.url)) {
    throw new Error("Trusted widget revision must preserve the approved origin and asset path.");
  }
  const outer = obj(widget.options), old = customViewOptions(outer);
  if (!outer || !old) throw new Error("Native custom widget options are incomplete.");
  if ((old.access !== "none" && old.access !== undefined) ||
      old.columnsMapping != null || old.widgetOptions != null ||
      old.renderAfterReady !== false) {
    throw new Error("Trusted revision replacement requires zero access and empty widget state.");
  }
  if (matchesTrustedWidgetSelection(outer, next)) {
    return {changed:false,options:outer,optionsJson:JSON.stringify(outer)};
  }
  if (!matchesTrustedWidgetSelection(outer, previous)) {
    throw new Error("Current widget revision does not match the exact approved source.");
  }
  const options:Json = {...outer,customView:JSON.stringify({...old,...approvedSelection(next)})};
  const optionsJson=JSON.stringify(options);
  if (optionsJson.length>8192)throw new Error("Trusted widget revision exceeds native size limit.");
  return {changed:true,options,optionsJson};
}
