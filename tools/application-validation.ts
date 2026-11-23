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
} from "./grist-harness.js";
import {
  type FixtureContext,
  ensureColumn,
  ensurePage,
  mcpColumns,
  mcpPages,
  mcpQuery,
  setupFixtures
} from "./application-fixtures.js";

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
  console.log("existing generic application: PASS");
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
  console.log("synthetic stage-tracking application: PASS");
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
  console.log("materially different CCF/pedagogy application: PASS");
}


/**
 * #295: construct a representative stage-tracking slice using only Gia writes.
 * The native Grist instance supplies a disposable empty workspace; neither
 * the source .grist document nor private native actions seed this application.
 */
async function validateFromEmptyStageSkeleton(
  bridge: string, context: FixtureContext
): Promise<void> {
  const created = await callTool(bridge, "grist_add_structure", {
    action: "create_document", workspaceId: context.workspaceId,
    name: "From-empty synthetic stage acceptance"
  }) as { documentId?: string; bootstrap?: string };
  assertThat(typeof created.documentId === "string" && created.bootstrap === "empty",
    "from_empty_document_bootstrap_failed");
  const documentId = created.documentId!;

  const tables = [
    { id: "Classes", columns: [{ id: "Code", fields: { type: "Text" } }] },
    { id: "Enseignants", columns: [{ id: "Cle", fields: { type: "Text" } }] },
    { id: "Stages", columns: [{ id: "Code_Stage", fields: { type: "Text" } }] }
  ];
  const ensureTables = () => callTool(bridge, "grist_add_structure", {
    action: "ensure_tables", documentId, tables
  });
  await ensureTables();
  await ensureTables();

  const ensureColumns = (tableId: string,
    columns: { id: string; fields: { type: string; isFormula: false } }[]) =>
    callTool(bridge, "grist_add_structure", {
      action: "ensure_columns", documentId, tableId, columns
    }) as Promise<{ changed: boolean; persistedSchemaVerified: boolean }>;
  const writable = (columns: { id: string; fields: { type: string } }[]) =>
    columns.map(column => ({
      id: column.id, fields: { type: column.fields.type, isFormula: false as const }
    }));
  const stageColumns = [
    { id: "Classe", fields: { type: "Ref:Classes" } },
    { id: "Suivi_par", fields: { type: "Ref:Enseignants" } },
    { id: "Commentaire", fields: { type: "Text" } }
  ];
  const classColumns = writable([{ id: "Libelle", fields: { type: "Text" } }]);
  const teacherColumns = writable([{ id: "Email", fields: { type: "Text" } }]);
  const allStageColumns = writable([...stageColumns,
    { id: "Statut", fields: { type: "Choice" } }]);
  for (const [tableId, columns] of [
    ["Classes", classColumns],
    ["Enseignants", teacherColumns],
    ["Stages", allStageColumns]
  ] as const) {
    const first = await ensureColumns(tableId, columns);
    const replay = await ensureColumns(tableId, columns);
    assertThat(first.changed && first.persistedSchemaVerified &&
      !replay.changed && replay.persistedSchemaVerified,
      "from_empty_writable_schema_not_idempotent");
  }

  await callTool(bridge, "grist_change_structure", {
    action: "append_choice_options", documentId, tableId: "Stages",
    columnId: "Statut", values: ["À suivre", "En cours"]
  });

  const ensureRows = async (tableId: string, keyColumnId: string,
    fields: Record<string, unknown>[]) =>
    await callTool(bridge, "grist_add_records", {
      action: "ensure_records", documentId, tableId, keyColumnId,
      records: fields.map(item => ({ fields: item }))
    }) as { recordIds: number[]; changed: boolean };
  const classes = [
    { Code: "A", Libelle: "Classe A synthétique" },
    { Code: "B", Libelle: "Classe B synthétique" }
  ];
  const teachers = [
    { Cle: "T-A", Email: "prof-a@example.invalid" },
    { Cle: "T-B", Email: "prof-b@example.invalid" }
  ];
  const classesFirst = await ensureRows("Classes", "Code", classes);
  const teachersFirst = await ensureRows("Enseignants", "Cle", teachers);
  assertThat(classesFirst.recordIds.length === 2 && teachersFirst.recordIds.length === 2,
    "from_empty_reference_ids_missing");
  const stageRows = [
    { Code_Stage: "S-A", Classe: classesFirst.recordIds[0],
      Suivi_par: teachersFirst.recordIds[0], Statut: "À suivre", Commentaire: "Test A" },
    { Code_Stage: "S-B", Classe: classesFirst.recordIds[1],
      Suivi_par: teachersFirst.recordIds[1], Statut: "En cours", Commentaire: "Test B" }
  ];
  const stagesFirst = await ensureRows("Stages", "Code_Stage", stageRows);

  // Qualify creation/restart of a real Grist Python formula on synthetic rows.
  // This is an incremental schema operation, not a private native UserAction.
  const computedSpec = [{
    id: "Stage_Libelle",
    fields: { type: "Text", isFormula: true,
      formula: '$Code_Stage + " | " + $Statut' }
  }];
  const ensureComputed = () => callTool(bridge, "grist_add_structure", {
    action: "ensure_columns", documentId, tableId: "Stages",
    columns: computedSpec
  }) as Promise<{ changed: boolean; persistedSchemaVerified: boolean }>;
  const firstComputed = await ensureComputed();
  const replayComputed = await ensureComputed();
  assertThat(firstComputed.changed && firstComputed.persistedSchemaVerified &&
    !replayComputed.changed && replayComputed.persistedSchemaVerified,
    "from_empty_formula_schema_not_idempotent");


  const ensurePage = () => callTool(bridge, "grist_add_ui", {
    action: "ensure_page", documentId, tableId: "Stages", name: "Suivi synthétique"
  }) as Promise<{ page: { id: number }; changed: boolean }>;
  const firstPage = await ensurePage();
  assertThat(Number.isInteger(firstPage.page?.id) && firstPage.page.id > 0,
    "from_empty_page_id_missing");
  const pageId = firstPage.page.id;
  const ensureWidget = (type: "record" | "form") =>
    callTool(bridge, "grist_add_ui", {
      action: "ensure_widget", documentId, pageId, tableId: "Stages", type
    }) as Promise<{ widget: { id: number }; changed: boolean }>;
  const grid = await ensureWidget("record");
  const form = await ensureWidget("form");
  assertThat(grid.widget.id > 0 && form.widget.id > 0 && grid.widget.id !== form.widget.id,
    "from_empty_widget_id_missing");

  await callTool(bridge, "grist_change_ui", {
    action: "update_widget", documentId, pageId, widgetId: form.widget.id,
    update: { visibleFields: [{ columnId: "Code_Stage" },
      { columnId: "Commentaire" }] }
  });
  const layout = {
    children: [
      { type: "section", children: [
        { type: "field", columnId: "Code_Stage" },
        { type: "field", columnId: "Commentaire" }
      ] },
      { type: "submit" }
    ],
    submitText: "Envoyer", successText: "Réponse reçue"
  };
  await callTool(bridge, "grist_change_ui", {
    action: "update_form_layout", documentId, pageId,
    widgetId: form.widget.id, layout
  });
  await callTool(bridge, "grist_change_structure", {
    action: "update_form_column_options", documentId,
    tableId: "Stages", columnId: "Code_Stage",
    update: { required: true, question: "Référence du stage" }
  });

  const repeatClasses = await ensureRows("Classes", "Code", classes);
  const repeatTeachers = await ensureRows("Enseignants", "Cle", teachers);
  const repeatStages = await ensureRows("Stages", "Code_Stage", stageRows);
  assertThat(!repeatClasses.changed && !repeatTeachers.changed && !repeatStages.changed,
    "from_empty_record_replay_created_duplicates");
  assertThat(JSON.stringify(repeatClasses.recordIds) === JSON.stringify(classesFirst.recordIds) &&
    JSON.stringify(repeatTeachers.recordIds) === JSON.stringify(teachersFirst.recordIds) &&
    JSON.stringify(repeatStages.recordIds) === JSON.stringify(stagesFirst.recordIds),
    "from_empty_replay_lost_stable_record_ids");

  const replayPage = await ensurePage();
  const replayGrid = await ensureWidget("record");
  const replayForm = await ensureWidget("form");
  assertThat(!replayPage.changed && !replayGrid.changed && !replayForm.changed &&
    replayPage.page.id === pageId && replayGrid.widget.id === grid.widget.id &&
    replayForm.widget.id === form.widget.id,
    "from_empty_replay_created_duplicate_ui");
  await callTool(bridge, "grist_change_ui", {
    action: "update_form_layout", documentId, pageId,
    widgetId: form.widget.id, layout
  });

  const stages = recordsFrom(await gristApi(context.baseUrl, context.ownerKey,
    "/api/docs/" + encodeURIComponent(documentId) + "/tables/Stages/records"));
  assertThat(stages.length === 2 &&
    stages.some(row => row.fields.Code_Stage === "S-A") &&
    stages.some(row => row.fields.Code_Stage === "S-B"),
    "from_empty_native_stage_data_incomplete");

  const labels = new Map(stages.map(row =>
    [row.fields.Code_Stage, row.fields.Stage_Libelle]));
  assertThat(labels.get("S-A") === "S-A | À suivre" &&
    labels.get("S-B") === "S-B | En cours",
    "from_empty_native_formula_values_incomplete");
  const pageState = await mcpPages(bridge, documentId);
  assertThat(countKeyValue(pageState, "name", "Suivi synthétique") === 1,
    "from_empty_native_page_not_unique");
  console.log("from-empty synthetic stage schema, references, records and Form layout: PASS");
}

async function run(): Promise<void> {
  const baseUrl = process.env.GRIST_TEST_BASE_URL?.trim().replace(/\/$/, "");
  const version = process.env.GRIST_TEST_VERSION?.trim();
  assertThat(baseUrl, "missing_grist_test_base_url");
  assertThat(version, "missing_grist_test_version");
  await waitForUrl(`${baseUrl}/api/orgs`);
  const context = await setupFixtures(baseUrl);
  const bridge = await startBridge({
    baseUrl,
    apiKey: context.ownerKey,
    documentIds: [context.genericDocId, context.stageDocId, context.ccfDocId],
    workspaceIds: [context.workspaceId]
  });

  try {
    await validateExistingGeneric(bridge.baseUrl, context);
    await validateStageTracking(bridge.baseUrl, context);
    await validateCcf(bridge.baseUrl, context);
    await validateFromEmptyStageSkeleton(bridge.baseUrl, context);
    console.log("semantic rerun/idempotence: PASS");
    console.log("browser escalation: NOT TRIGGERED; material UI and access postconditions were observable through MCP/API semantics");
    console.log(`application validation on Grist Community ${version}: PASS`);
  } finally {
    await stopBridge(bridge.child);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
