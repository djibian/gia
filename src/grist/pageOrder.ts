export const MAX_PAGE_ORDER_PAGES = 500;

type JsonRecord = Record<string, unknown>;

interface MetadataRecord {
  id: number;
  fields: JsonRecord;
}

interface ParsedPage {
  pageId: number;
  pageRecordId: number;
  indentation: number;
  pagePos: number;
  isCensored: boolean;
  isSpecial: boolean;
}

export interface PageOrderPageState extends ParsedPage {
  parentPageId: number | null;
}

export interface PageOrderSnapshot {
  pages: PageOrderPageState[];
  visiblePageIds: number[];
}

export interface PageOrderWrite {
  pageRecordId: number;
  pagePos: number;
}

export interface ResolvedPageOrderUpdate {
  updates: PageOrderWrite[];
  expected: PageOrderSnapshot;
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function metadataRecords(value: unknown, label: string): MetadataRecord[] {
  const root = record(value);
  if (!root || !Array.isArray(root.records)) {
    throw new Error(`Cannot resolve Grist page order: ${label} metadata is unavailable.`);
  }
  return root.records.map((entry) => {
    const item = record(entry);
    const id = positiveInteger(item?.id);
    const fields = record(item?.fields);
    if (!id || !fields) {
      throw new Error(`Cannot resolve Grist page order: malformed ${label} metadata.`);
    }
    return { id, fields };
  });
}

function withParents(pages: readonly ParsedPage[]): PageOrderPageState[] {
  const ordered = [...pages].sort(
    (a, b) => a.pagePos - b.pagePos || a.pageRecordId - b.pageRecordId
  );
  const positions = new Set<number>();
  const pageIds = new Set<number>();
  const pageRecordIds = new Set<number>();
  const stack: number[] = [];
  let previousIndentation = 0;

  return ordered.map((page, index) => {
    if (positions.has(page.pagePos)) {
      throw new Error(
        "Grist page navigation has duplicate page positions; refusing an ambiguous reorder."
      );
    }
    positions.add(page.pagePos);
    if (pageIds.has(page.pageId) || pageRecordIds.has(page.pageRecordId)) {
      throw new Error("Grist page navigation contains duplicate page identities.");
    }
    pageIds.add(page.pageId);
    pageRecordIds.add(page.pageRecordId);

    if (
      (index === 0 && page.indentation !== 0) ||
      (index > 0 && page.indentation > previousIndentation + 1)
    ) {
      throw new Error(
        "Grist page navigation has an unsupported indentation shape; refusing to infer hierarchy."
      );
    }
    const parentPageId =
      page.indentation === 0 ? null : (stack[page.indentation - 1] ?? null);
    if (page.indentation > 0 && parentPageId === null) {
      throw new Error(
        "Grist page navigation has an unresolved parent; refusing to infer hierarchy."
      );
    }
    stack[page.indentation] = page.pageId;
    stack.length = page.indentation + 1;
    previousIndentation = page.indentation;
    return { ...page, parentPageId };
  });
}

function visiblePageIds(pages: readonly PageOrderPageState[]): number[] {
  const candidates = pages.filter((page) => !page.isSpecial);
  const candidateById = new Map(candidates.map((page) => [page.pageId, page]));
  const menuParent = new Map<number, number | null>();

  candidates.forEach((page, index) => {
    if (page.indentation === 0) {
      menuParent.set(page.pageId, null);
      return;
    }
    let parent: number | null = null;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = candidates[cursor]!;
      if (candidate.indentation < page.indentation) {
        parent = candidate.pageId;
        break;
      }
    }
    menuParent.set(page.pageId, parent);
  });

  const hiddenMemo = new Map<number, boolean>();
  const hidden = (pageId: number, visiting = new Set<number>()): boolean => {
    const known = hiddenMemo.get(pageId);
    if (known !== undefined) return known;
    if (visiting.has(pageId)) {
      throw new Error("Grist page navigation contains a cyclic parent relation.");
    }
    const page = candidateById.get(pageId);
    if (!page) return true;
    visiting.add(pageId);
    const parentId = menuParent.get(pageId) ?? null;
    const value =
      page.isCensored ||
      (parentId !== null && hidden(parentId, visiting));
    visiting.delete(pageId);
    hiddenMemo.set(pageId, value);
    return value;
  };

  return candidates
    .filter((page) => !hidden(page.pageId))
    .map((page) => page.pageId);
}

function finalizeSnapshot(pages: readonly ParsedPage[]): PageOrderSnapshot {
  const withParent = withParents(pages);
  return {
    pages: withParent,
    visiblePageIds: visiblePageIds(withParent)
  };
}

/**
 * Normalize the persisted page tree and the page list that Grist exposes in
 * normal navigation. The adapter treats tutorial/doc-tour/hidden-table pages as
 * non-targetable and keeps their native positions untouched.
 */
export function normalizePageOrderSnapshot(
  pagesResponse: unknown,
  viewsResponse: unknown,
  tablesResponse: unknown
): PageOrderSnapshot {
  const pages = metadataRecords(pagesResponse, "page");
  const views = metadataRecords(viewsResponse, "view");
  const tables = metadataRecords(tablesResponse, "table");

  if (pages.length > MAX_PAGE_ORDER_PAGES) {
    throw new Error(
      `Grist page navigation exceeds the supported maximum of ${MAX_PAGE_ORDER_PAGES} pages.`
    );
  }

  const viewNames = new Map<number, string>();
  for (const view of views) {
    const rawName = view.fields.name;
    if (rawName !== undefined && typeof rawName !== "string") {
      throw new Error("Cannot resolve Grist page order: malformed view name metadata.");
    }
    viewNames.set(view.id, rawName ?? "");
  }

  const hiddenPrimaryViewIds = new Set<number>();
  for (const table of tables) {
    const primaryViewId = positiveInteger(table.fields.primaryViewId);
    if (!primaryViewId) continue;
    const tableId = table.fields.tableId;
    if (typeof tableId !== "string") {
      throw new Error(
        "Cannot resolve Grist page order: a table with a primary view has unavailable identity metadata."
      );
    }
    if (tableId.startsWith("GristHidden_")) {
      hiddenPrimaryViewIds.add(primaryViewId);
    }
  }

  const parsed = pages.map((page): ParsedPage => {
    const pageId = positiveInteger(page.fields.viewRef);
    const indentation = nonNegativeInteger(page.fields.indentation);
    const pagePos = finiteNumber(page.fields.pagePos);
    if (!pageId || indentation === undefined || pagePos === undefined) {
      throw new Error("Cannot resolve Grist page order: malformed page navigation metadata.");
    }
    if (!viewNames.has(pageId)) {
      throw new Error(
        `Cannot resolve Grist page order: view metadata for page ${pageId} is unavailable.`
      );
    }
    const name = viewNames.get(pageId)!;
    return {
      pageId,
      pageRecordId: page.id,
      indentation,
      pagePos,
      isCensored: name.length === 0,
      isSpecial:
        name === "GristDocTour" ||
        name === "GristDocTutorial" ||
        hiddenPrimaryViewIds.has(pageId)
    };
  });

  return finalizeSnapshot(parsed);
}

/**
 * Resolve a complete stable page-ID order by reusing the exact native pagePos
 * slots already occupied by currently visible pages. Untargeted/special rows
 * stay in place and every persisted page must keep the same parent.
 */
export function resolvePageOrderUpdate(
  current: PageOrderSnapshot,
  requestedPageIds: readonly number[]
): ResolvedPageOrderUpdate {
  if (requestedPageIds.length !== current.visiblePageIds.length) {
    throw new Error(
      "Page order must contain every currently visible Grist page exactly once."
    );
  }

  const requested = new Set<number>();
  const currentVisible = new Set(current.visiblePageIds);
  for (const pageId of requestedPageIds) {
    if (!Number.isInteger(pageId) || pageId < 1) {
      throw new Error("Page order IDs must be positive integers.");
    }
    if (requested.has(pageId)) {
      throw new Error(`Page order contains duplicate page ID ${pageId}.`);
    }
    if (!currentVisible.has(pageId)) {
      throw new Error(
        `Page order ID ${pageId} is not a currently visible Grist page.`
      );
    }
    requested.add(pageId);
  }

  const byPageId = new Map(current.pages.map((page) => [page.pageId, page]));
  const slots = current.visiblePageIds.map((pageId) => byPageId.get(pageId)!.pagePos);
  const newPositionByPageId = new Map<number, number>();
  requestedPageIds.forEach((pageId, index) => {
    newPositionByPageId.set(pageId, slots[index]!);
  });

  const expected = finalizeSnapshot(
    current.pages.map((page) => ({
      pageId: page.pageId,
      pageRecordId: page.pageRecordId,
      indentation: page.indentation,
      pagePos: newPositionByPageId.get(page.pageId) ?? page.pagePos,
      isCensored: page.isCensored,
      isSpecial: page.isSpecial
    }))
  );

  const currentParent = new Map(
    current.pages.map((page) => [page.pageId, page.parentPageId])
  );
  for (const page of expected.pages) {
    if (currentParent.get(page.pageId) !== page.parentPageId) {
      throw new Error(
        "Requested page order would change the existing page hierarchy; reorder only hierarchy-preserving sibling/subtree blocks."
      );
    }
  }

  if (
    expected.visiblePageIds.length !== requestedPageIds.length ||
    !expected.visiblePageIds.every((pageId, index) => pageId === requestedPageIds[index])
  ) {
    throw new Error(
      "Requested page order would change which pages are visible in navigation."
    );
  }

  const currentById = new Map(current.pages.map((page) => [page.pageId, page]));
  const updates: PageOrderWrite[] = expected.pages.flatMap((page) => {
    const before = currentById.get(page.pageId)!;
    return before.pagePos === page.pagePos
      ? []
      : [{ pageRecordId: page.pageRecordId, pagePos: page.pagePos }];
  });

  return { updates, expected };
}

export function samePageOrderSnapshot(
  actual: PageOrderSnapshot,
  expected: PageOrderSnapshot
): boolean {
  if (
    actual.visiblePageIds.length !== expected.visiblePageIds.length ||
    !actual.visiblePageIds.every(
      (pageId, index) => pageId === expected.visiblePageIds[index]
    ) ||
    actual.pages.length !== expected.pages.length
  ) {
    return false;
  }

  return actual.pages.every((page, index) => {
    const other = expected.pages[index];
    return (
      other !== undefined &&
      page.pageId === other.pageId &&
      page.pageRecordId === other.pageRecordId &&
      page.indentation === other.indentation &&
      page.pagePos === other.pagePos &&
      page.parentPageId === other.parentPageId &&
      page.isCensored === other.isCensored &&
      page.isSpecial === other.isSpecial
    );
  });
}
