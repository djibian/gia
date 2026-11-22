import { isDeepStrictEqual } from "node:util";

type ShareOptions = { form?: boolean; publish?: boolean };
type JsonRecord = Record<string, unknown>;

/** Native shareOptions are intentionally private; accept only the two qualified form flags. */
function readNativeShareOptions(value: unknown): ShareOptions {
  if (value === undefined) throw new Error("Native Form sharing metadata is incomplete.");
  if (value === "" || value === null) return {};
  if (typeof value !== "string" || value.length > 4096) {
    throw new Error("Native Form sharing options are opaque; refusing publication.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(value) as unknown; }
  catch { throw new Error("Native Form sharing options are malformed."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Native Form sharing options are not an object.");
  }
  const raw = parsed as JsonRecord;
  if (Object.keys(raw).some(key => !["form", "publish"].includes(key)) ||
      Object.values(raw).some(flag => typeof flag !== "boolean")) {
    throw new Error("Native Form sharing options contain protected settings.");
  }
  return raw as ShareOptions;
}

/** Native Forms are public only when their page points to an active native _grist_Shares
 * row as well as the section flags. Never return the share's secret linkId. */
export function readNativeFormPageShare(
  pagesResponse: unknown, sharesResponse: unknown,
  pageRecordId: number, pageId: number, limit: number
): "missing" | "published" {
  const records = (response: unknown, label: string) => {
    const root = response !== null && typeof response === "object" && !Array.isArray(response)
      ? response as JsonRecord : undefined;
    const rows = root?.records;
    if (!Array.isArray(rows) || rows.length >= limit || !Number.isInteger(limit) || limit < 2) {
      throw new Error("Native Form " + label + " snapshot incomplete.");
    }
    const ids = new Set<number>();
    return rows.map(raw => {
      const entry = raw !== null && typeof raw === "object" && !Array.isArray(raw)
        ? raw as JsonRecord : undefined;
      const id = entry?.id;
      const fields = entry?.fields !== null && typeof entry?.fields === "object" &&
        !Array.isArray(entry?.fields) ? entry.fields as JsonRecord : undefined;
      if (typeof id !== "number" || !Number.isInteger(id) || id < 1 ||
          !fields || ids.has(id)) {
        throw new Error("Native Form " + label + " metadata malformed.");
      }
      ids.add(id);
      return { id, fields };
    });
  };
  const pages = records(pagesResponse, "page");
  const matching = pages.filter(row => row.id === pageRecordId && row.fields.viewRef === pageId);
  if (matching.length !== 1 ||
      pages.some(row => row.id !== pageRecordId && row.fields.viewRef === pageId)) {
    throw new Error("Native Form page identity is missing or ambiguous.");
  }
  const shareRef = matching[0]!.fields.shareRef;
  if (typeof shareRef !== "number" || !Number.isInteger(shareRef) || shareRef < 0) {
    throw new Error("Native Form page share reference is malformed.");
  }
  const shares = records(sharesResponse, "share");
  if (shareRef === 0) return "missing";
  if (pages.some(page => page.id !== pageRecordId && page.fields.shareRef === shareRef)) {
    throw new Error("Native Form page share is reused by another page.");
  }
  const share = shares.find(row => row.id === shareRef);
  if (!share || typeof share.fields.linkId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(share.fields.linkId)) {
    throw new Error("Native Form existing share is unresolved.");
  }
  const options = share.fields.options;
  if (typeof options !== "string" || options.length > 4096) {
    throw new Error("Native Form existing share options are opaque.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(options) as unknown; } catch { throw new Error("Native Form share options malformed."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      Object.keys(parsed).some(key => key !== "publish") ||
      (parsed as JsonRecord).publish !== true) {
    throw new Error("Existing native Form share requires separate, explicitly bounded handling.");
  }
  return "published";
}

/** Turn off one native Form's publication flag without altering its existing page share.
 * This does not attest revocation of Grist's separate public home-db share key. */
export function planFormUnpublication(raw: unknown): {
  shareOptions: string; changed: boolean;
} {
  const before = readNativeShareOptions(raw);
  if (before.form !== true || typeof before.publish !== "boolean") {
    throw new Error("Only an explicitly configured native Form can be unpublished.");
  }
  return {
    shareOptions: JSON.stringify({ form: true, publish: false }),
    changed: before.publish
  };
}

/** Only a separately confirmed, Owner-gated publication intention is writable. */
export function planFormPublication(raw: unknown): {
  shareOptions: string; expected: ShareOptions; changed: boolean;
} {
  const before = readNativeShareOptions(raw);
  const expected: ShareOptions = { ...before, form: true, publish: true };
  return {
    shareOptions: JSON.stringify(expected),
    expected,
    changed: !isDeepStrictEqual(before, expected)
  };
}
