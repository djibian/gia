import { isDeepStrictEqual } from "node:util";
import { columnCreationFieldsSchema } from "../operations/schemaMutationContract.js";
import { planConfiguredColumns } from "./configuredColumns.js";
import { AccessPolicy } from "./accessPolicy.js";
import {
  GristApiError,
  GristClient,
  isUncertainGristEffect,
  type GristColumnSpec,
  type GristColumnUpdate,
  type GristDocumentSummary,
  type GristDocumentUpdate,
  type GristTableSpec,
  type GristTableUpdate,
  type NewGristRecord,
  type UpdateGristRecord
} from "./client.js";
import {
  hasReferenceDisplayUpdates,
  resolveReferenceDisplayMutation,
  verifyReferenceDisplayMutation
} from "./referenceDisplay.js";

export type PublicDocumentType = "normal" | "template" | "tutorial";

export const DOCUMENT_TIMEZONE_CHOICES = ["UTC", "Europe/Paris"] as const;
import { planDocumentLocaleUpdate, readNativeDocumentSettings } from "./documentLocale.js";

export interface DocumentMetadataUpdateInput {
  name?: string;
  type?: PublicDocumentType;
  timezone?: string;
  locale?: string;
}

export interface PublicDocumentMetadata {
  id: string;
  name: string;
  type: PublicDocumentType;
}

interface PublicDocumentSettings {
  status: "supported" | "protected" | "incomplete";
  locale?: string;
  timezone?: string;
}

export interface GristServiceOptions {
  maxReadRecords: number;
  maxWriteRecords: number;
  writeBatchRecords: number;
  maxSchemaItems: number;
}

export interface QueryRecordsOptions {
  filter?: Record<string, unknown[]>;
  sort?: string;
  limit?: number;
  hidden?: boolean;
  cellFormat?: "normal" | "typed";
}

export class PartialBatchError extends Error {
  constructor(
    public readonly operation: string,
    public readonly completedBatches: number,
    public readonly completedItems: number,
    public readonly failedBatch: number,
    public readonly cause: unknown,
    public readonly confirmedResults: unknown[] = [],
    public readonly failedItems: number = 0,
    public readonly remainingBatches: number = 0,
    public readonly remainingItems: number = 0
  ) {
    super(
      `${operation} partially completed: ${completedItems} item(s) were already applied in ${completedBatches} batch(es) before batch ${failedBatch} failed. Do not retry the whole operation blindly.`
    );
    this.name = "PartialBatchError";
  }
}

export class SchemaWriteVerificationError extends Error {
  constructor(
    public readonly operation: string,
    message: string
  ) {
    super(
      `${message} The schema write may already have succeeded; do not retry the whole operation blindly.`
    );
    this.name = "SchemaWriteVerificationError";
  }
}

export class UncertainWriteError extends Error {
  constructor(
    public readonly operation: string,
    public readonly completedBatches: number,
    public readonly completedItems: number,
    public readonly uncertainBatch: number,
    public readonly uncertainItems: number,
    public readonly remainingBatches: number,
    public readonly remainingItems: number,
    public readonly confirmedResults: unknown[],
    public readonly cause: unknown
  ) {
    super(
      `${operation} has an uncertain write outcome for batch ${uncertainBatch}. Do not retry the whole operation until the uncertain effect is reconciled.`
    );
    this.name = "UncertainWriteError";
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function batchedResult(results: unknown[]): unknown {
  if (results.length === 1) return results[0];
  return {
    batches: results.length,
    results
  };
}

function countRemainingItems<T>(batches: readonly T[][], index: number): number {
  return batches
    .slice(index + 1)
    .reduce((count, batch) => count + batch.length, 0);
}

type JsonRecord = Record<string, unknown>;
type CreatedIdKind = "string" | "positiveInteger";

function jsonRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function validCreatedId(value: unknown, kind: CreatedIdKind): value is string | number {
  if (kind === "string") return typeof value === "string" && value.length > 0;
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeDocumentType(value: unknown): PublicDocumentType {
  if (value === undefined || value === null) return "normal";
  if (value === "template" || value === "tutorial") return value;
  throw new Error("Grist returned an unsupported document type.");
}

function projectDocumentMetadata(
  documentId: string,
  document: GristDocumentSummary
): PublicDocumentMetadata {
  if (typeof document.name !== "string" || !document.name.trim()) {
    throw new Error("Grist document name metadata is unavailable.");
  }
  return {
    id: documentId,
    name: document.name,
    type: normalizeDocumentType(document.type)
  };
}

function nativeTimezone(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_+/-]{0,63}$/.test(value)) return undefined;
  try {
    const resolved = new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
    if (value.toLowerCase() === resolved.toLowerCase() && value !== resolved) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function projectDocumentSettings(response: unknown): PublicDocumentSettings {
  const records = jsonRecord(response)?.records;
  const row = Array.isArray(records) && records.length === 1 ? jsonRecord(records[0]) : null;
  const fields = row?.id === 1 ? jsonRecord(row.fields) : null;
  if (!fields) return { status: "incomplete" };

  let locale: string | undefined;
  const stored = fields.documentSettings;
  if (typeof stored === "string" && stored.length <= 16_384) {
    try {
      const candidate = jsonRecord(JSON.parse(stored))?.locale;
      if (typeof candidate === "string" && /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$/.test(candidate) &&
          Intl.getCanonicalLocales(candidate)[0] === candidate) locale = candidate;
    } catch {
      // Native settings may be malformed; report only independently identified fields.
    }
  }

  const timezone = nativeTimezone(fields.timezone);
  return {
    status: locale && timezone ? "supported" : "incomplete",
    ...(locale ? { locale } : {}),
    ...(timezone ? { timezone } : {})
  };
}

function projectCreatedItems(
  response: unknown,
  collection: "tables" | "columns" | "records",
  expectedCount: number,
  idKind: CreatedIdKind
): unknown {
  const root = jsonRecord(response);
  const rawItems = root && Array.isArray(root[collection]) ? root[collection] : [];
  let incomplete = root === null || !Array.isArray(root?.[collection]);
  const items: Array<{ id: string | number }> = [];

  for (const value of rawItems) {
    const item = jsonRecord(value);
    const id = item?.id;
    if (!validCreatedId(id, idKind)) {
      incomplete = true;
      continue;
    }
    items.push({ id });
  }

  if (rawItems.length !== expectedCount || items.length !== expectedCount) {
    incomplete = true;
  }

  return {
    [collection]: items,
    ...(incomplete ? { resultNormalizationIncomplete: true } : {})
  };
}

function schemaIdentities(
  response: unknown,
  collection: "tables" | "columns"
): { byId: Map<string, number>; byRef: Map<number, string> } {
  const values = jsonRecord(response)?.[collection];
  if (!Array.isArray(values)) throw new Error("Schema identity metadata is unavailable.");
  const byId = new Map<string, number>();
  const byRef = new Map<number, string>();
  for (const value of values) {
    const item = jsonRecord(value);
    const id = item?.id;
    const ref = jsonRecord(item?.fields)?.[collection === "tables" ? "tableRef" : "colRef"];
    if (
      typeof id !== "string" || !id.trim() ||
      typeof ref !== "number" || !Number.isInteger(ref) || ref <= 0 ||
      byId.has(id) || byRef.has(ref)
    ) {
      throw new Error("Schema identity metadata is incomplete or ambiguous; refusing to guess IDs.");
    }
    byId.set(id, ref);
    byRef.set(ref, id);
  }
  return { byId, byRef };
}


/** Complete native per-table column snapshot, including generated hidden columns. */
function typedColumnSeedSnapshot(raw: unknown): Map<string,{ref:number;type:string}> {
  const values=jsonRecord(raw)?.columns;
  if (!Array.isArray(values) || values.length > 5000) {
    throw new Error("Native expanded column metadata is unavailable or exceeds the limit.");
  }
  const result=new Map<string,{ref:number;type:string}>();
  const refs=new Set<number>();
  for(const entry of values){
    const item=jsonRecord(entry), fields=jsonRecord(item?.fields);
    const id=item?.id,ref=fields?.colRef,type=fields?.type;
    if(typeof id!=="string"||!id||result.has(id)||
       typeof ref!=="number"||!Number.isSafeInteger(ref)||ref<1||refs.has(ref)||
       typeof type!=="string"||!type) {
      throw new Error("Native column identity/type is incomplete or ambiguous.");
    }
    result.set(id,{ref,type});refs.add(ref);
  }
  return result;
}

function targetSchemaRefs(byId: Map<string, number>, ids: string[]): number[] {
  return ids.map((id) => {
    const ref = byId.get(id);
    if (ref === undefined) throw new Error(`Schema target "${id}" is unavailable.`);
    return ref;
  });
}

async function resultingSchemaIds(
  operation: string,
  collection: "tables" | "columns",
  refs: number[],
  read: () => Promise<unknown>
): Promise<string[]> {
  try {
    const { byRef } = schemaIdentities(await read(), collection);
    return refs.map((ref) => {
      const id = byRef.get(ref);
      if (id === undefined) throw new Error("Updated schema identity is unavailable.");
      return id;
    });
  } catch {
    throw new SchemaWriteVerificationError(operation, "The resulting stable schema IDs could not be verified.");
  }
}

export class GristService {
  private assertCreationColumnFields(column: GristColumnSpec): void {
    if (column.fields !== undefined && !columnCreationFieldsSchema.safeParse(column.fields).success) {
      throw new Error("Unsupported column creation fields. Apply description or visibleColumnId through update_columns after creation.");
    }
  }

  constructor(
    private readonly client: GristClient,
    private readonly accessPolicy: AccessPolicy,
    private readonly options: GristServiceOptions
  ) {}

  get maxReadRecords(): number {
    return this.options.maxReadRecords;
  }

  get maxWriteRecords(): number {
    return this.options.maxWriteRecords;
  }

  get writeBatchRecords(): number {
    return this.options.writeBatchRecords;
  }

  get maxSchemaItems(): number {
    return this.options.maxSchemaItems;
  }

  async createDocument(
    workspaceId: number,
    name: string
  ): Promise<string> {
    this.assertWorkspaceId(workspaceId);
    await this.accessPolicy.assertWorkspaceAllowed(workspaceId);
    const documentName = this.normalizeDocumentName(name);
    try {
      return await this.client.createDocument(workspaceId, documentName);
    } finally {
      this.accessPolicy.invalidate();
    }
  }

  async copyDocument(
    sourceDocumentIdOrUrl: string,
    workspaceId: number,
    name: string
  ): Promise<string> {
    return this.copyDocumentToWorkspace(sourceDocumentIdOrUrl, workspaceId, name, false);
  }

  async copyDocumentAsTemplate(
    sourceDocumentIdOrUrl: string,
    workspaceId: number,
    name: string
  ): Promise<string> {
    return this.copyDocumentToWorkspace(sourceDocumentIdOrUrl, workspaceId, name, true);
  }

  private async copyDocumentToWorkspace(
    sourceDocumentIdOrUrl: string,
    workspaceId: number,
    name: string,
    asTemplate: boolean
  ): Promise<string> {
    this.assertWorkspaceId(workspaceId);
    const sourceDocumentId = await this.accessPolicy.assertDocumentAllowed(
      sourceDocumentIdOrUrl
    );
    await this.accessPolicy.assertWorkspaceAllowed(workspaceId);
    const documentName = this.normalizeDocumentName(name);
    try {
      return await (asTemplate
        ? this.client.copyDocumentAsTemplate(sourceDocumentId, workspaceId, documentName)
        : this.client.copyDocument(sourceDocumentId, workspaceId, documentName));
    } finally {
      this.accessPolicy.invalidate();
    }
  }

  async listDocumentAccess(documentIdOrUrl: string): Promise<unknown> {
    const id = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    return this.client.listDocumentAccess(id);
  }

  async grantDocumentUser(
    documentIdOrUrl: string, email: string, role: "viewers" | "editors"
  ): Promise<unknown> {
    const id = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    return this.client.grantDocumentUser(id, email, role);
  }

  async revokeDocumentUser(
    documentIdOrUrl: string, email: string
  ): Promise<unknown> {
    const id = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    return this.client.revokeDocumentUser(id, email);
  }

  async assertDocumentOwner(documentIdOrUrl: string): Promise<void> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    const document = await this.client.getDocument(documentId);
    if (document.access !== "owners") {
      throw new Error(
        "Grist document owner access is required for this operation."
      );
    }
  }

  async getDocumentMetadata(
    documentIdOrUrl: string
  ): Promise<PublicDocumentMetadata & { settings: PublicDocumentSettings }> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    const [document, settings] = await Promise.all([
      this.client.getDocument(documentId),
      this.readDocumentSettings(documentId)
    ]);
    return { ...projectDocumentMetadata(documentId, document), settings };
  }

  private async readDocumentSettings(documentId: string): Promise<PublicDocumentSettings> {
    try {
      const response = await this.client.queryRecords(documentId, "_grist_DocInfo", {
        limit: 2,
        hidden: true
      });
      return projectDocumentSettings(response);
    } catch (error) {
      if (error instanceof GristApiError && error.status === 403) return { status: "protected" };
      if (error instanceof GristApiError && error.status === 404) return { status: "incomplete" };
      throw error;
    }
  }

  async updateDocument(
    documentIdOrUrl: string,
    update: DocumentMetadataUpdateInput
  ): Promise<unknown> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    if (update.locale !== undefined) {
      if (update.name !== undefined || update.type !== undefined || update.timezone !== undefined)
        throw Error("Send locale separately from other metadata.");
      return this.updateDocumentLocale(documentId, update.locale);
    }
    if (update.timezone !== undefined) {
      if (update.name !== undefined || update.type !== undefined) {
        throw new Error("Send a timezone update separately from a name or type update.");
      }
      return this.updateDocumentTimezone(documentId, update.timezone);
    }
    if (update.name === undefined && update.type === undefined) {
      throw new Error("At least one document metadata field must be updated.");
    }

    const requestedName =
      update.name !== undefined ? this.normalizeDocumentName(update.name) : undefined;
    if (
      update.type !== undefined &&
      !(["normal", "template", "tutorial"] as const).includes(update.type)
    ) {
      throw new Error(`Unsupported document type "${String(update.type)}".`);
    }

    const before = projectDocumentMetadata(
      documentId,
      await this.client.getDocument(documentId)
    );
    const expected: PublicDocumentMetadata = {
      id: documentId,
      name: requestedName ?? before.name,
      type: update.type ?? before.type
    };
    if (before.name === expected.name && before.type === expected.type) {
      return { document: before, changed: false };
    }

    const nativeUpdate: GristDocumentUpdate = {};
    if (requestedName !== undefined) nativeUpdate.name = requestedName;
    if (update.type !== undefined) {
      nativeUpdate.type = update.type === "normal" ? null : update.type;
    }

    await this.client.updateDocument(documentId, nativeUpdate);
    try {
      const after = projectDocumentMetadata(
        documentId,
        await this.client.getDocument(documentId)
      );
      if (
        after.id !== expected.id ||
        after.name !== expected.name ||
        after.type !== expected.type
      ) {
        throw new Error("Document metadata did not match the requested state.");
      }
      return { document: after, changed: true };
    } catch (error) {
      throw new SchemaWriteVerificationError(
        "update_document",
        error instanceof Error
          ? error.message
          : "Updated document metadata could not be verified."
      );
    }
  }

  private async updateDocumentLocale(documentId: string, locale: string): Promise<unknown> {
    const read = () => this.client.queryRecords(documentId, "_grist_DocInfo", {
      limit: 2, hidden: true
    });
    const before = await read();
    const plan = planDocumentLocaleUpdate(before, locale);
    if (!plan.changed) return { documentId,
      settings: projectDocumentSettings(before), changed: false };
    await this.client.applyUserActions(documentId, [
      ["UpdateRecord", "_grist_DocInfo", 1, { documentSettings: plan.documentSettings }]
    ]);
    try {
      const afterNative = await read();
      if (!isDeepStrictEqual(readNativeDocumentSettings(afterNative), plan.expected))
        throw Error("Native settings preservation failed.");
      const settings = projectDocumentSettings(afterNative);
      if (settings.locale !== locale) throw Error("Locale postcondition failed.");
      return { documentId, settings, changed: true };
    } catch {
      throw new SchemaWriteVerificationError("update_document",
        "Native locale post-state uncertain; do not blindly replay.");
    }
  }

  private async updateDocumentTimezone(documentId: string, value: string): Promise<unknown> {
    const timezone = DOCUMENT_TIMEZONE_CHOICES.find(choice => choice === value);
    if (!timezone) throw new Error("Timezone must be UTC or Europe/Paris for the qualified native settings update.");
    const before = await this.readDocumentSettings(documentId);
    if (!before.timezone) throw new Error("Current Grist timezone metadata is unavailable.");
    if (before.timezone === timezone) return { documentId, settings: before, changed: false };

    await this.client.applyUserActions(documentId, [
      ["UpdateRecord", "_grist_DocInfo", 1, { timezone }]
    ]);
    try {
      const after = await this.readDocumentSettings(documentId);
      if (after.timezone !== timezone) throw new Error("Timezone postcondition not met.");
      return { documentId, settings: after, changed: true };
    } catch {
      throw new SchemaWriteVerificationError("update_document", "The Grist timezone could not be verified.");
    }
  }

  async listTables(
    documentIdOrUrl: string,
    options: { expandColumns?: boolean } = {}
  ): Promise<unknown> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    return this.client.listTables(documentId, options);
  }

  async createTables(
    documentIdOrUrl: string,
    tables: GristTableSpec[]
  ): Promise<unknown> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    const schemaItems = tables.reduce(
      (count, table) => count + 1 + (table.columns?.length ?? 0),
      0
    );
    this.assertSchemaCount(schemaItems);
    this.assertUniqueStrings(tables.map((table) => table.id), "Table IDs");
    for (const table of tables) {
      this.assertIdentifier(table.id, "Table ID");
      if (!Array.isArray(table.columns) || table.columns.length === 0) {
        throw new Error("Each new table requires at least one column.");
      }
      this.assertUniqueStrings(table.columns.map((column) => column.id), "Column IDs");
      for (const column of table.columns) {
        this.assertIdentifier(column.id, "Column ID");
        this.assertCreationColumnFields(column);
      }
    }
    const result = await this.client.createTables(documentId, tables);
    return projectCreatedItems(result, "tables", tables.length, "string");
  }

  async updateTables(
    documentIdOrUrl: string,
    tables: GristTableUpdate[]
  ): Promise<unknown> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    this.assertSchemaCount(tables.length);
    this.assertUniqueStrings(tables.map((table) => table.id), "Table IDs");
    for (const table of tables) this.assertIdentifier(table.id, "Table ID");
    const targetTableIds = tables.map((table) => table.id);
    const before = schemaIdentities(await this.client.listTables(documentId), "tables");
    const refs = targetSchemaRefs(before.byId, targetTableIds);
    await this.client.updateTables(documentId, tables);
    const tableIds = await resultingSchemaIds("update_tables", "tables", refs, () => this.client.listTables(documentId));
    return {
      targetTableIds,
      updatedTables: targetTableIds.map((targetTableId, index) => ({ targetTableId, tableId: tableIds[index]! })),
      updated: true
    };
  }

  async deleteTable(documentIdOrUrl: string, tableId: string): Promise<unknown> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    this.assertIdentifier(tableId, "Table ID");
    await this.client.applyUserActions(documentId, [["RemoveTable", tableId]]);
    return { tableId, deleted: true };
  }

  async listColumns(
    documentIdOrUrl: string,
    tableId: string,
    options: { hidden?: boolean } = {}
  ): Promise<unknown> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    this.assertIdentifier(tableId, "Table ID");
    return this.client.listColumns(documentId, tableId, options);
  }

  async createColumns(
    documentIdOrUrl: string,
    tableId: string,
    columns: GristColumnSpec[]
  ): Promise<unknown> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    this.assertIdentifier(tableId, "Table ID");
    this.assertSchemaCount(columns.length);
    this.assertUniqueStrings(columns.map((column) => column.id), "Column IDs");
    if (columns.some(column => "configuration" in column)) {
      const read = () => this.client.listTables(documentId, { expandColumns: true });
      const missing = planConfiguredColumns(await read(), tableId, columns);
      if (missing.length > 0) {
        const response = await this.client.createColumns(documentId, tableId, missing);
        const created = projectCreatedItems(response, "columns", missing.length, "string");
        try {
          const result = jsonRecord(created);
          const actualIds = (result?.columns as { id: string }[]).map(column => column.id);
          if (result?.resultNormalizationIncomplete ||
              actualIds.some((id, index) => id !== missing[index]?.id) ||
              planConfiguredColumns(await read(), tableId, columns).length !== 0) {
            throw new Error("Native configured column identity or options did not match.");
          }
        } catch (error) {
          throw new UncertainWriteError("create_columns", 0, 0, 1, missing.length, 0, 0,
            [created], error);
        }
      }
      return { columns: columns.map(({ id }) => ({ id })), changed: missing.length > 0,
        persistedOptionsVerified: true };
    }
    for (const column of columns) {
      this.assertIdentifier(column.id, "Column ID");
      this.assertCreationColumnFields(column);
    }
    const result = await this.client.createColumns(documentId, tableId, columns);
    return projectCreatedItems(result, "columns", columns.length, "string");
  }


  /** Reconcile typed columns after their owning table exists; preserve all prior IDs. */
  async ensureColumns(
    documentIdOrUrl:string, tableId:string, columns:GristColumnSpec[]
  ):Promise<unknown>{
    const documentId=await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    this.assertIdentifier(tableId,"Table ID");
    this.assertSchemaCount(columns.length);
    this.assertUniqueStrings(columns.map(c=>c.id),"Column IDs");
    const allowed=/^(?:Text|Numeric|Int|Bool|Date|DateTime:(?:UTC|Europe\/Paris)|Choice|ChoiceList|(?:Ref|RefList):[A-Za-z][A-Za-z0-9_]*)$/;
    for(const column of columns) {
      this.assertIdentifier(column.id,"Column ID");
      if(!column.fields||Object.keys(column.fields).length!==1||
        typeof column.fields.type!=="string"||!allowed.test(column.fields.type)) {
        throw new Error("Column seeds require only one explicit supported type.");
      }
    }
    const read=()=>this.client.listColumns(documentId,tableId,{hidden:true});
    const before=typedColumnSeedSnapshot(await read());
    const missing=columns.filter(column=>{
      const stored=before.get(column.id);
      if(stored&&stored.type!==column.fields?.type)
        throw new Error("Existing column seed conflicts with the requested type.");
      return !stored;
    });
    if(!missing.length)return {tableId,columns:columns.map(c=>({id:c.id,created:false})),
      changed:false,persistedSchemaVerified:true};
    if(!isDeepStrictEqual(before,typedColumnSeedSnapshot(await read()))) {
      throw new Error("Native column metadata changed before creation; reconcile first.");
    }
    try {
      const created=projectCreatedItems(
        await this.client.createColumns(documentId,tableId,missing),
        "columns",missing.length,"string"
      ) as {columns:{id:string}[];resultNormalizationIncomplete?:boolean};
      if(created.resultNormalizationIncomplete||
         created.columns.some((c,i)=>c.id!==missing[i]?.id)) {
        throw new Error("Native column creation returned incomplete or changed stable IDs.");
      }
      const after=typedColumnSeedSnapshot(await read());
      for(const [id,saved] of before){
        if(!isDeepStrictEqual(after.get(id),saved))
          throw new Error("Prior native column identity or type changed.");
      }
      for(const column of columns){
        if(after.get(column.id)?.type!==column.fields?.type) {
          throw new Error("New native column seed could not be verified.");
        }
      }
      const ids=new Set(missing.map(c=>c.id));
      return {tableId,columns:columns.map(c=>({id:c.id,created:ids.has(c.id)})),
        changed:true,persistedSchemaVerified:true};
    }catch(error){
      throw new SchemaWriteVerificationError("ensure_columns",
        "Native column creation was attempted but the outcome is uncertain: "+
        (error instanceof Error?error.message:"unknown effect"));
    }
  }

  async updateColumns(
    documentIdOrUrl: string,
    tableId: string,
    columns: GristColumnUpdate[]
  ): Promise<unknown> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    this.assertIdentifier(tableId, "Table ID");
    this.assertSchemaCount(columns.length);
    this.assertUniqueStrings(columns.map((column) => column.id), "Column IDs");
    for (const column of columns) this.assertIdentifier(column.id, "Column ID");
    const targetColumnIds = columns.map((column) => column.id);
    const read = () => this.client.listColumns(documentId, tableId, { hidden: true });

    if (hasReferenceDisplayUpdates(columns)) {
      const beforeTables = await this.client.listTables(documentId, {
        expandColumns: true
      });
      const plan = resolveReferenceDisplayMutation(
        beforeTables,
        tableId,
        columns
      );
      await this.client.applyUserActions(documentId, plan.actions);
      try {
        const [afterTables, afterColumns] = await Promise.all([
          this.client.listTables(documentId, { expandColumns: true }),
          this.client.listColumns(documentId, tableId, { hidden: true })
        ]);
        verifyReferenceDisplayMutation(
          afterTables,
          afterColumns,
          tableId,
          plan.plans
        );
        const columnIds = await resultingSchemaIds(
          "update_columns",
          "columns",
          plan.targetColumnRefs,
          read
        );
        return {
          tableId,
          targetColumnIds,
          updatedColumns: targetColumnIds.map((targetColumnId, index) => ({
            targetColumnId,
            columnId: columnIds[index]!,
            ...(typeof columns[index]!.fields.visibleColumnId === "string"
              ? { visibleColumnId: columns[index]!.fields.visibleColumnId }
              : {})
          })),
          updated: true
        };
      } catch (error) {
        if (error instanceof SchemaWriteVerificationError) throw error;
        throw new SchemaWriteVerificationError(
          "update_columns",
          error instanceof Error
            ? error.message
            : "Updated relation display metadata could not be verified."
        );
      }
    }

    const before = schemaIdentities(await read(), "columns");
    const refs = targetSchemaRefs(before.byId, targetColumnIds);
    await this.client.updateColumns(documentId, tableId, columns);
    const columnIds = await resultingSchemaIds("update_columns", "columns", refs, read);
    return {
      tableId,
      targetColumnIds,
      updatedColumns: targetColumnIds.map((targetColumnId, index) => ({ targetColumnId, columnId: columnIds[index]! })),
      updated: true
    };
  }

  async renameColumn(
    documentIdOrUrl: string,
    tableId: string,
    oldColumnId: string,
    newColumnId: string
  ): Promise<unknown> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    this.assertIdentifier(tableId, "Table ID");
    this.assertIdentifier(oldColumnId, "Old column ID");
    this.assertIdentifier(newColumnId, "New column ID");
    if (oldColumnId === newColumnId) {
      throw new Error("New column ID must differ from the current column ID.");
    }
    const response = await this.client.applyUserActions(documentId, [
      ["RenameColumn", tableId, oldColumnId, newColumnId]
    ]);
    const root = jsonRecord(response);
    const retValues = root && Array.isArray(root.retValues) ? root.retValues : undefined;
    const actualColumnId =
      retValues?.length === 1 &&
      typeof retValues[0] === "string" &&
      retValues[0].length > 0
        ? retValues[0]
        : undefined;
    if (!actualColumnId) {
      throw new SchemaWriteVerificationError(
        "rename_column",
        "Grist RenameColumn did not return the resulting stable column ID."
      );
    }
    return {
      tableId,
      oldColumnId,
      newColumnId: actualColumnId,
      renamed: true
    };
  }

  async deleteColumns(
    documentIdOrUrl: string,
    tableId: string,
    columnIds: string[]
  ): Promise<unknown> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    this.assertIdentifier(tableId, "Table ID");
    this.assertSchemaCount(columnIds.length);
    this.assertUniqueStrings(columnIds, "Column IDs");
    for (const columnId of columnIds) this.assertIdentifier(columnId, "Column ID");

    await this.executeBatches(
      "deleteColumns",
      columnIds.map((columnId) => [columnId]),
      async (batch) => {
        await this.client.deleteColumn(documentId, tableId, batch[0]!);
        return { columnIds: [batch[0]!] };
      }
    );
    return { tableId, columnIds, deleted: true };
  }

  async queryRecords(
    documentIdOrUrl: string,
    tableId: string,
    options: QueryRecordsOptions = {}
  ): Promise<unknown> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    const requestedLimit = options.limit ?? this.defaultReadLimit();
    this.assertReadLimit(requestedLimit);

    return this.client.queryRecords(documentId, tableId, {
      ...(options.filter ? { filter: options.filter } : {}),
      ...(options.sort ? { sort: options.sort } : {}),
      limit: requestedLimit,
      ...(options.hidden !== undefined ? { hidden: options.hidden } : {}),
      ...(options.cellFormat ? { cellFormat: options.cellFormat } : {})
    });
  }

  async createRecords(
    documentIdOrUrl: string,
    tableId: string,
    records: NewGristRecord[]
  ): Promise<unknown> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    this.assertWriteCount(records.length);
    return this.executeBatches(
      "createRecords",
      chunk(records, this.options.writeBatchRecords),
      async (batch) => {
        const result = await this.client.createRecords(documentId, tableId, batch);
        return projectCreatedItems(result, "records", batch.length, "positiveInteger");
      }
    );
  }

  async updateRecords(
    documentIdOrUrl: string,
    tableId: string,
    records: UpdateGristRecord[]
  ): Promise<unknown> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    this.assertWriteCount(records.length);
    await this.executeBatches(
      "updateRecords",
      chunk(records, this.options.writeBatchRecords),
      async (batch) => {
        await this.client.updateRecords(documentId, tableId, batch);
        return { recordIds: batch.map((record) => record.id) };
      }
    );
    return {
      tableId,
      recordIds: records.map((record) => record.id),
      updated: true
    };
  }

  async deleteRecords(
    documentIdOrUrl: string,
    tableId: string,
    recordIds: number[]
  ): Promise<unknown> {
    const documentId = await this.accessPolicy.assertDocumentAllowed(documentIdOrUrl);
    this.assertRecordIds(recordIds);
    this.assertWriteCount(recordIds.length);
    await this.executeBatches(
      "deleteRecords",
      chunk(recordIds, this.options.writeBatchRecords),
      async (batch) => {
        await this.client.deleteRecords(documentId, tableId, batch);
        return { recordIds: [...batch] };
      }
    );
    return { tableId, recordIds, deleted: true };
  }

  private async executeBatches<T>(
    operation: string,
    batches: T[][],
    execute: (batch: T[]) => Promise<unknown>
  ): Promise<unknown> {
    const results: unknown[] = [];
    let completedItems = 0;

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index]!;
      try {
        results.push(await execute(batch));
        completedItems += batch.length;
      } catch (error) {
        const remainingBatches = batches.length - index - 1;
        const remainingItems = countRemainingItems(batches, index);
        if (isUncertainGristEffect(error)) {
          throw new UncertainWriteError(
            operation,
            index,
            completedItems,
            index + 1,
            batch.length,
            remainingBatches,
            remainingItems,
            [...results],
            error
          );
        }
        if (index === 0) throw error;
        throw new PartialBatchError(
          operation,
          index,
          completedItems,
          index + 1,
          error,
          [...results],
          batch.length,
          remainingBatches,
          remainingItems
        );
      }
    }

    return batchedResult(results);
  }

  private defaultReadLimit(): number {
    if (this.options.maxReadRecords === 0) return 50;
    return Math.min(50, this.options.maxReadRecords);
  }

  private assertReadLimit(limit: number): void {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("Read limit must be a positive integer.");
    }
    if (this.options.maxReadRecords > 0 && limit > this.options.maxReadRecords) {
      throw new Error(
        `Read limit ${limit} exceeds configured maximum ${this.options.maxReadRecords}.`
      );
    }
  }

  private assertWriteCount(count: number): void {
    if (count < 1) {
      throw new Error("At least one record is required.");
    }
    if (this.options.maxWriteRecords > 0 && count > this.options.maxWriteRecords) {
      throw new Error(
        `Write count ${count} exceeds configured maximum ${this.options.maxWriteRecords}.`
      );
    }
  }

  private assertSchemaCount(count: number): void {
    if (count < 1) {
      throw new Error("At least one schema item is required.");
    }
    if (this.options.maxSchemaItems > 0 && count > this.options.maxSchemaItems) {
      throw new Error(
        `Schema item count ${count} exceeds configured maximum ${this.options.maxSchemaItems}.`
      );
    }
  }

  private assertWorkspaceId(workspaceId: number): void {
    if (!Number.isInteger(workspaceId) || workspaceId < 1) {
      throw new Error("Workspace ID must be a positive integer.");
    }
  }

  private normalizeDocumentName(value: string): string {
    const name = value.trim();
    if (!name) throw new Error("Document name must not be empty.");
    if (name.length > 200) {
      throw new Error("Document name must not exceed 200 characters.");
    }
    return name;
  }

  private assertIdentifier(value: string, label: string): void {
    if (!value.trim()) throw new Error(`${label} must not be empty.`);
  }

  private assertUniqueStrings(values: string[], label: string): void {
    if (new Set(values).size !== values.length) {
      throw new Error(`${label} must be unique.`);
    }
  }

  private assertRecordIds(recordIds: number[]): void {
    if (recordIds.some((id) => !Number.isInteger(id) || id < 1)) {
      throw new Error("Record IDs must be positive integers.");
    }
    if (new Set(recordIds).size !== recordIds.length) {
      throw new Error("Record IDs must be unique.");
    }
  }
}
