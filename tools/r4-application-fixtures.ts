import {
  applyActions,
  assertThat,
  callTool,
  containsValue,
  countKeyValue,
  createTestApiKey,
  gristApi
} from "./r4-harness.js";

export const OWNER_EMAIL = "r4-owner@getgrist.com";
export const TEACHER_A_EMAIL = "r4-teacher-a@getgrist.com";
export const TEACHER_B_EMAIL = "r4-teacher-b@getgrist.com";

export interface FixtureContext {
  baseUrl: string;
  ownerKey: string;
  workspaceId: number;
  genericDocId: string;
  stageDocId: string;
  ccfDocId: string;
  teacherAKey: string;
  teacherBKey: string;
}

async function createDoc(baseUrl: string, apiKey: string, workspaceId: number, name: string): Promise<string> {
  const value = await gristApi(baseUrl, apiKey, `/api/workspaces/${workspaceId}/docs`, {
    method: "POST",
    body: JSON.stringify({ name })
  });
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown; urlId?: unknown }).id ?? (value as { urlId?: unknown }).urlId;
    if ((typeof id === "string" || typeof id === "number") && String(id)) return String(id);
  }
  throw new Error(`document_create_invalid:${name}`);
}

export async function setupFixtures(baseUrl: string): Promise<FixtureContext> {
  const ownerKey = await createTestApiKey(baseUrl, OWNER_EMAIL, "R4 Owner");
  const teacherAKey = await createTestApiKey(baseUrl, TEACHER_A_EMAIL, "R4 Teacher A");
  const teacherBKey = await createTestApiKey(baseUrl, TEACHER_B_EMAIL, "R4 Teacher B");

  const orgs = await gristApi(baseUrl, ownerKey, "/api/orgs");
  assertThat(Array.isArray(orgs) && orgs.length > 0, "no_test_org");
  const orgId = (orgs[0] as { id?: unknown }).id;
  assertThat(typeof orgId === "number" || typeof orgId === "string", "org_id_missing");
  const workspace = await gristApi(
    baseUrl,
    ownerKey,
    `/api/orgs/${encodeURIComponent(String(orgId))}/workspaces`,
    { method: "POST", body: JSON.stringify({ name: "R4 Applications" }) }
  );
  assertThat(typeof workspace === "number", "workspace_create_invalid");
  const workspaceId = workspace;

  await gristApi(baseUrl, ownerKey, `/api/workspaces/${workspaceId}/access`, {
    method: "PATCH",
    body: JSON.stringify({
      delta: {
        users: {
          [TEACHER_A_EMAIL]: "editors",
          [TEACHER_B_EMAIL]: "editors"
        }
      }
    })
  });

  const genericDocId = await createDoc(baseUrl, ownerKey, workspaceId, "R4 Existing Generic");
  const stageDocId = await createDoc(baseUrl, ownerKey, workspaceId, "R4 Synthetic Stage Tracking");
  const ccfDocId = await createDoc(baseUrl, ownerKey, workspaceId, "R4 Synthetic CCF");

  await applyActions(baseUrl, ownerKey, genericDocId, [
    ["AddTable", "Inventory", [
      { id: "Item", type: "Text" },
      { id: "Qty", type: "Int" },
      { id: "HumanNote", type: "Text" }
    ]],
    ["AddRecord", "Inventory", 1, { Item: "Cable", Qty: 2, HumanNote: "priority marker" }],
    ["AddRecord", "Inventory", 2, { Item: "Adapter", Qty: 8, HumanNote: "leave-me" }],
    ["AddTable", "HumanSettings", [
      { id: "Key", type: "Text" },
      { id: "Value", type: "Text" }
    ]],
    ["AddRecord", "HumanSettings", 1, { Key: "layout-marker", Value: "human-config-v1" }]
  ]);

  await applyActions(baseUrl, ownerKey, stageDocId, [
    ["AddTable", "Teachers", [
      { id: "Name", type: "Text" },
      { id: "Email", type: "Text" }
    ]],
    ["AddRecord", "Teachers", 1, { Name: "Enseignant A (synthetique)", Email: TEACHER_A_EMAIL }],
    ["AddRecord", "Teachers", 2, { Name: "Enseignant B (synthetique)", Email: TEACHER_B_EMAIL }],
    ["AddTable", "Stages", [
      { id: "Student", type: "Text" },
      { id: "Suivi_par", type: "Ref:Teachers" },
      { id: "TeacherEmail", type: "Text" },
      { id: "Type_contact", type: "Text" },
      { id: "Commentaire", type: "Text" }
    ]],
    ["AddRecord", "Stages", 1, {
      Student: "Eleve Alpha (synthetique)", Suivi_par: 1,
      TeacherEmail: TEACHER_A_EMAIL, Type_contact: "Appel",
      Commentaire: "Trace synthetique A"
    }],
    ["AddRecord", "Stages", 2, {
      Student: "Eleve Beta (synthetique)", Suivi_par: 2,
      TeacherEmail: TEACHER_B_EMAIL, Type_contact: "", Commentaire: ""
    }],
    ["AddRecord", "_grist_ACLResources", -1, { tableId: "Stages", colIds: "*" }],
    ["AddRecord", "_grist_ACLRules", null, {
      resource: -1, aclFormula: "user.Access == OWNER", permissionsText: "all"
    }],
    ["AddRecord", "_grist_ACLRules", null, {
      resource: -1, aclFormula: "user.Email == rec.TeacherEmail", permissionsText: "all"
    }],
    ["AddRecord", "_grist_ACLRules", null, {
      resource: -1, aclFormula: "", permissionsText: "none"
    }]
  ]);

  await applyActions(baseUrl, ownerKey, ccfDocId, [
    ["AddTable", "Informations", [
      { id: "Titre", type: "Text" }, { id: "Contenu", type: "Text" }
    ]],
    ["AddRecord", "Informations", 1, {
      Titre: "Mission", Contenu: "Donnees pedagogiques synthetiques"
    }],
    ["AddTable", "Reponses", [
      { id: "Rubrique", type: "Text" }, { id: "Reponse", type: "Text" }
    ]],
    ["AddRecord", "Reponses", 1, { Rubrique: "Cadrage", Reponse: "Saisie humaine a preserver" }],
    ["AddRecord", "Reponses", 2, { Rubrique: "Qualite", Reponse: "" }],
    ["AddRecord", "Reponses", 3, { Rubrique: "Analyse statistique", Reponse: "" }],
    ["AddRecord", "Reponses", 4, { Rubrique: "Decision", Reponse: "" }]
  ]);

  return {
    baseUrl, ownerKey, workspaceId, genericDocId, stageDocId, ccfDocId, teacherAKey, teacherBKey
  };
}

export async function mcpColumns(bridge: string, documentId: string, tableId: string): Promise<unknown> {
  return callTool(bridge, "grist_discover", { action: "columns", documentId, tableId });
}

export async function mcpPages(bridge: string, documentId: string): Promise<unknown> {
  return callTool(bridge, "grist_inspect", { action: "pages", documentId });
}

export async function mcpQuery(bridge: string, documentId: string, tableId: string): Promise<unknown> {
  return callTool(bridge, "grist_query", { documentId, tableId, limit: 50 });
}

export async function ensureColumn(
  bridge: string,
  documentId: string,
  tableId: string,
  columnId: string,
  fields: Record<string, unknown>
): Promise<boolean> {
  const before = await mcpColumns(bridge, documentId, tableId);
  if (countKeyValue(before, "id", columnId) > 0) return false;
  await callTool(bridge, "grist_add_structure", {
    action: "create_columns", documentId, tableId,
    columns: [{ id: columnId, fields }]
  });
  return true;
}

export async function ensurePage(
  bridge: string,
  documentId: string,
  tableId: string,
  name: string
): Promise<boolean> {
  const before = await mcpPages(bridge, documentId);
  if (containsValue(before, name)) return false;
  await callTool(bridge, "grist_add_ui", {
    action: "create_page", documentId, tableId, name
  });
  return true;
}
