import {
  assertThat,
  callTool,
  containsValue,
  countKeyValue,
  gristApi,
  gristStatus,
  recordsFrom,
  startBridge,
  stopBridge,
  waitForUrl
} from "./r4-harness.js";
import {
  type FixtureContext,
  ensureColumn,
  ensurePage,
  mcpColumns,
  mcpPages,
  mcpQuery,
  setupFixtures
} from "./r4-application-fixtures.js";

async function validateExistingGeneric(bridge: string, context: FixtureContext): Promise<void> {
  await ensurePage(bridge, context.genericDocId, "Inventory", "Human Dashboard");

  const evolve = async () => {
    await ensureColumn(bridge, context.genericDocId, "Inventory", "Status", { type: "Text" });
    const current = await mcpQuery(bridge, context.genericDocId, "Inventory");
    if (!containsValue(current, "Reorder")) {
      await callTool(bridge, "grist_change_records", {
        action: "update",
        documentId: context.genericDocId,
        tableId: "Inventory",
        records: [{ id: 1, fields: { Qty: 4, Status: "Reorder" } }]
      });
    }
    await ensurePage(bridge, context.genericDocId, "Inventory", "Reorder");
  };

  await evolve();
  await evolve();

  const columns = await mcpColumns(bridge, context.genericDocId, "Inventory");
  assertThat(countKeyValue(columns, "id", "Status") === 1, "generic_status_not_idempotent");
  const pages = await mcpPages(bridge, context.genericDocId);
  assertThat(containsValue(pages, "Human Dashboard"), "generic_human_page_lost");
  assertThat(countKeyValue(pages, "name", "Reorder") === 1, "generic_reorder_page_not_idempotent");

  const inventory = recordsFrom(await gristApi(
    context.baseUrl,
    context.ownerKey,
    `/api/docs/${encodeURIComponent(context.genericDocId)}/tables/Inventory/records`
  ));
  const adapter = inventory.find((record) => record.id === 2);
  assertThat(adapter?.fields.HumanNote === "leave-me", "generic_unrelated_human_data_changed");
  const cable = inventory.find((record) => record.id === 1);
  assertThat(cable?.fields.Qty === 4 && cable.fields.Status === "Reorder", "generic_target_postcondition_missing");

  const settings = recordsFrom(await gristApi(
    context.baseUrl,
    context.ownerKey,
    `/api/docs/${encodeURIComponent(context.genericDocId)}/tables/HumanSettings/records`
  ));
  assertThat(settings[0]?.fields.Value === "human-config-v1", "generic_unrelated_configuration_changed");
  console.log("R4-2 existing generic application: PASS");
}

async function assertStageVisibility(
  context: FixtureContext,
  apiKey: string,
  allowedStudent: string,
  deniedStudent: string
): Promise<void> {
  const body = await gristApi(
    context.baseUrl,
    apiKey,
    `/api/docs/${encodeURIComponent(context.stageDocId)}/tables/Stages/records`
  );
  const text = JSON.stringify(body);
  assertThat(text.includes(allowedStudent), `stage_allowed_row_missing:${allowedStudent}`);
  assertThat(!text.includes(deniedStudent), `stage_denied_row_visible:${deniedStudent}`);
}

async function updateStage(
  context: FixtureContext,
  apiKey: string,
  id: number,
  fields: Record<string, unknown>
): Promise<number> {
  return gristStatus(
    context.baseUrl,
    apiKey,
    `/api/docs/${encodeURIComponent(context.stageDocId)}/tables/Stages/records`,
    { method: "PATCH", body: JSON.stringify({ records: [{ id, fields }] }) }
  );
}

async function validateStageTracking(bridge: string, context: FixtureContext): Promise<void> {
  await assertStageVisibility(
    context, context.teacherAKey,
    "Eleve Alpha (synthetique)", "Eleve Beta (synthetique)"
  );
  await assertStageVisibility(
    context, context.teacherBKey,
    "Eleve Beta (synthetique)", "Eleve Alpha (synthetique)"
  );

  const humanEdit = await updateStage(context, context.teacherAKey, 1, {
    Commentaire: "Modification enseignant A a preserver"
  });
  assertThat(humanEdit >= 200 && humanEdit < 300, `stage_authorized_write_failed:${humanEdit}`);
  const forbiddenBefore = await updateStage(context, context.teacherAKey, 2, {
    Commentaire: "forbidden"
  });
  assertThat(forbiddenBefore >= 400, "stage_cross_teacher_write_allowed_before");

  const evolve = async () => {
    await ensureColumn(bridge, context.stageDocId, "Stages", "Date_du_contact", { type: "Date" });
    const current = await mcpQuery(bridge, context.stageDocId, "Stages");
    if (!containsValue(current, 1790553600)) {
      await callTool(bridge, "grist_change_records", {
        action: "update",
        documentId: context.stageDocId,
        tableId: "Stages",
        records: [{ id: 1, fields: { Date_du_contact: 1790553600, Type_contact: "Appel" } }]
      });
    }
    await ensurePage(bridge, context.stageDocId, "Stages", "Suivi enseignant");
  };

  await evolve();
  await evolve();

  const columns = await mcpColumns(bridge, context.stageDocId, "Stages");
  assertThat(countKeyValue(columns, "id", "Date_du_contact") === 1, "stage_contact_date_not_idempotent");
  const pages = await mcpPages(bridge, context.stageDocId);
  assertThat(countKeyValue(pages, "name", "Suivi enseignant") === 1, "stage_page_not_idempotent");

  const ownerRows = recordsFrom(await gristApi(
    context.baseUrl,
    context.ownerKey,
    `/api/docs/${encodeURIComponent(context.stageDocId)}/tables/Stages/records`
  ));
  const alpha = ownerRows.find((record) => record.id === 1);
  const beta = ownerRows.find((record) => record.id === 2);
  assertThat(alpha?.fields.Suivi_par === 1, "stage_assignment_changed");
  assertThat(alpha?.fields.Commentaire === "Modification enseignant A a preserver", "stage_human_trace_changed");
  assertThat(beta?.fields.Suivi_par === 2, "stage_unrelated_assignment_changed");
  assertThat(beta?.fields.Commentaire === "", "stage_unrelated_trace_changed");

  await assertStageVisibility(
    context, context.teacherAKey,
    "Eleve Alpha (synthetique)", "Eleve Beta (synthetique)"
  );
  await assertStageVisibility(
    context, context.teacherBKey,
    "Eleve Beta (synthetique)", "Eleve Alpha (synthetique)"
  );

  const authorizedAfter = await updateStage(context, context.teacherAKey, 1, {
    Commentaire: "Correction enseignant A apres evolution"
  });
  assertThat(authorizedAfter >= 200 && authorizedAfter < 300, `stage_authorized_write_after_failed:${authorizedAfter}`);
  const forbiddenAfter = await updateStage(context, context.teacherAKey, 2, {
    Commentaire: "still-forbidden"
  });
  assertThat(forbiddenAfter >= 400, "stage_cross_teacher_write_allowed_after");
  console.log("R4-3 synthetic stage-tracking application: PASS");
}

async function validateCcf(bridge: string, context: FixtureContext): Promise<void> {
  await ensurePage(bridge, context.ccfDocId, "Informations", "Mission");
  const evolve = async () => {
    await ensureColumn(bridge, context.ccfDocId, "Reponses", "Statut", { type: "Text" });
    await ensurePage(bridge, context.ccfDocId, "Reponses", "Restitution");
  };
  await evolve();
  await evolve();

  const columns = await mcpColumns(bridge, context.ccfDocId, "Reponses");
  assertThat(countKeyValue(columns, "id", "Statut") === 1, "ccf_status_not_idempotent");
  const pages = await mcpPages(bridge, context.ccfDocId);
  assertThat(containsValue(pages, "Mission"), "ccf_mission_page_lost");
  assertThat(countKeyValue(pages, "name", "Restitution") === 1, "ccf_restitution_not_idempotent");

  const responses = recordsFrom(await gristApi(
    context.baseUrl,
    context.ownerKey,
    `/api/docs/${encodeURIComponent(context.ccfDocId)}/tables/Reponses/records`
  ));
  assertThat(responses.length === 4, "ccf_response_row_count_changed");
  const cadrage = responses.find((record) => record.fields.Rubrique === "Cadrage");
  assertThat(cadrage?.fields.Reponse === "Saisie humaine a preserver", "ccf_human_response_changed");

  const info = recordsFrom(await gristApi(
    context.baseUrl,
    context.ownerKey,
    `/api/docs/${encodeURIComponent(context.ccfDocId)}/tables/Informations/records`
  ));
  assertThat(info[0]?.fields.Contenu === "Donnees pedagogiques synthetiques", "ccf_mission_content_changed");
  console.log("R4-4 materially different CCF/pedagogy application: PASS");
}

async function run(): Promise<void> {
  const baseUrl = process.env.GRIST_R4_BASE_URL?.trim().replace(/\/$/, "");
  const version = process.env.GRIST_R4_VERSION?.trim();
  assertThat(baseUrl, "missing_grist_r4_base_url");
  assertThat(version, "missing_grist_r4_version");
  await waitForUrl(`${baseUrl}/api/orgs`);
  const context = await setupFixtures(baseUrl);
  const bridge = await startBridge({
    baseUrl,
    apiKey: context.ownerKey,
    documentIds: [context.genericDocId, context.stageDocId, context.ccfDocId]
  });

  try {
    await validateExistingGeneric(bridge.baseUrl, context);
    await validateStageTracking(bridge.baseUrl, context);
    await validateCcf(bridge.baseUrl, context);
    console.log("R4-5 semantic rerun/idempotence: PASS");
    console.log("R4-8 browser escalation: NOT TRIGGERED; material UI and access postconditions were observable through MCP/API semantics");
    console.log(`R4 application validation on Grist Community ${version}: PASS`);
  } finally {
    await stopBridge(bridge.child);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
