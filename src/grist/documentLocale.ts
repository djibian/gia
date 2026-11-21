import { isDeepStrictEqual } from "node:util";
type JsonRecord = Record<string, unknown>;
export const DOCUMENT_LOCALE_CHOICES = ["en-US", "fr-FR"] as const;
const MAX = 16_384;
function record(x: unknown): JsonRecord | undefined {
  return x !== null && typeof x === "object" && !Array.isArray(x) ? x as JsonRecord : undefined;
}
/** Private complete native settings cell; never project unknown sibling keys. */
export function readNativeDocumentSettings(response: unknown): JsonRecord {
  const rows = record(response)?.records;
  if (!Array.isArray(rows) || rows.length !== 1) throw Error("Native DocInfo snapshot incomplete.");
  const row = record(rows[0]);
  const raw = record(row?.fields)?.documentSettings;
  if (row?.id !== 1 || raw === undefined) throw Error("Native settings row unavailable.");
  if (raw === null || raw === "") return {};
  if (typeof raw !== "string" || raw.length > MAX) throw Error("Native settings opaque.");
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { throw Error("Native settings malformed."); }
  const settings = record(value);
  if (!settings || Object.keys(settings).length > 100) throw Error("Native settings unsupported.");
  if (Object.hasOwn(settings, "locale")) {
    const locale = settings.locale;
    if (typeof locale !== "string" || locale.length > 35 ||
      !/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$/.test(locale))
      throw Error("Existing locale malformed.");
    try { if (Intl.getCanonicalLocales(locale)[0] !== locale) throw Error(); }
    catch { throw Error("Existing locale unsupported."); }
  }
  return settings;
}
export function planDocumentLocaleUpdate(native: unknown, locale: string): {
  changed: boolean; expected: JsonRecord; documentSettings: string;
} {
  if (!DOCUMENT_LOCALE_CHOICES.some(c => c === locale)) throw Error("Unqualified locale.");
  const prior = readNativeDocumentSettings(native);
  const expected = { ...prior, locale };
  const documentSettings = JSON.stringify(expected);
  if (documentSettings.length > MAX) throw Error("Updated native settings over budget.");
  return { changed: !isDeepStrictEqual(prior, expected), expected, documentSettings };
}
