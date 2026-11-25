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
  TEACHER_A_EMAIL,
  TEACHER_B_EMAIL,
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
    { id: "Structures_de_stage", columns: [
      { id: "Nom", fields: { type: "Text", isFormula: false } }
    ] },
    { id: "Stages", columns: [
      { id: "Code_Stage", fields: { type: "Text" } },
      { id: "Contact_Le", fields: { type: "DateTime:Europe/Paris", isFormula: false } }
    ] }
  ];
  const ensureTables = () => callTool(bridge, "grist_add_structure", {
    action: "ensure_tables", documentId, tables
  });
  await ensureTables();
  await ensureTables();

  const structureStatusSeed = () => callTool(bridge, "grist_add_structure", {
    action: "ensure_columns", documentId, tableId: "Structures_de_stage",
    columns: [{ id: "Statut", fields: { type: "Choice", isFormula: false, formula: "'en attente'" } }]
  }) as Promise<{ changed: boolean; persistedSchemaVerified: boolean }>;
  const initialStatus = await structureStatusSeed();
  const repeatedStatus = await structureStatusSeed();
  assertThat(initialStatus.changed && initialStatus.persistedSchemaVerified &&
    !repeatedStatus.changed && repeatedStatus.persistedSchemaVerified, "from_empty_structure_default_not_reconciled");

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
    { id: "Structure", fields: { type: "Ref:Structures_de_stage" } },
    { id: "Commentaire", fields: { type: "Text" } },
    { id: "Justificatifs", fields: { type: "Attachments" } }
  ];
  const classColumns = writable([{ id: "Libelle", fields: { type: "Text" } }]);
  const teacherColumns = writable([
    { id: "Email", fields: { type: "Text" } },
    { id: "Acces_Stages_Actif", fields: { type: "Bool" } },
    { id: "Est_PP", fields: { type: "Bool" } },
    { id: "Acces_Direction", fields: { type: "Bool" } },
    { id: "Classes_PP", fields: { type: "RefList:Classes" } }
  ]);
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
  await callTool(bridge, "grist_change_structure", {
    action: "append_choice_options", documentId, tableId: "Structures_de_stage",
    columnId: "Statut", values: ["validé", "en attente"]
  });
  const setStructureCondition = () => callTool(bridge, "grist_change_structure", {
    action: "update_dropdown_condition", documentId, tableId: "Stages", columnId: "Structure",
    condition: { kind: "choice_field_equals_literal", choiceColumnId: "Statut", value: "validé" }
  }) as Promise<{ changed: boolean; persistedOptionsVerified: boolean }>;
  const condition = await setStructureCondition();
  const conditionReplay = await setStructureCondition();
  assertThat(condition.changed && condition.persistedOptionsVerified &&
    !conditionReplay.changed && conditionReplay.persistedOptionsVerified,
    "from_empty_structure_dropdown_not_reconciled");
  const setStageStyle = () => callTool(bridge, "grist_change_structure", {
    action: "append_row_style_rule", documentId, tableId: "Stages",
    conditionFormula: '$Statut == "À suivre"', style: { fillColor: "#FFF3D4" }
  }) as Promise<{ changed: boolean; persistedStyleVerified: boolean }>;
  const style = await setStageStyle();
  const styleReplay = await setStageStyle();
  assertThat(style.changed && style.persistedStyleVerified &&
    !styleReplay.changed && styleReplay.persistedStyleVerified, "from_empty_stage_style_not_reconciled");

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
    { Cle: "T-A", Email: TEACHER_A_EMAIL, Acces_Stages_Actif: true, Est_PP: false, Acces_Direction: false },
    { Cle: "T-B", Email: TEACHER_B_EMAIL, Acces_Stages_Actif: true, Est_PP: false, Acces_Direction: false }
  ];
  const classesFirst = await ensureRows("Classes", "Code", classes);
  const teachersFirst = await ensureRows("Enseignants", "Cle", teachers);
  const structures = await ensureRows("Structures_de_stage", "Nom", [
    { Nom: "Structure fictive A", Statut: "validé" },
    { Nom: "Structure fictive B", Statut: "en attente" }
  ]);
  assertThat(classesFirst.recordIds.length === 2 && teachersFirst.recordIds.length === 2,
    "from_empty_reference_ids_missing");
  const stageRows = [
    { Code_Stage: "S-A", Classe: classesFirst.recordIds[0],
      Suivi_par: teachersFirst.recordIds[0], Structure: structures.recordIds[0],
      Statut: "À suivre", Commentaire: "Test A" },
    { Code_Stage: "S-B", Classe: classesFirst.recordIds[1],
      Suivi_par: teachersFirst.recordIds[1], Statut: "En cours", Commentaire: "Test B" },
    { Code_Stage: "S-C", Classe: classesFirst.recordIds[1],
      Suivi_par: teachersFirst.recordIds[0], Statut: "En cours", Commentaire: "Test C" }
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
  const widgetBatch = [
    { tableId: "Stages", type: "record" as const },
    { tableId: "Stages", type: "form" as const }
  ];
  const ensureWidgets = (widgets: Array<{tableId: string;type: "record"|"form"|"chart"}>) =>
    callTool(bridge, "grist_add_ui", {
      action: "ensure_widgets", documentId, pageId, widgets
    }) as Promise<{ widgets: Array<{id:number;created:boolean}>; changed:boolean;
      persistedWidgetsVerified:boolean }>;
  const initialWidgets = await ensureWidgets(widgetBatch);
  assertThat(initialWidgets.changed && initialWidgets.persistedWidgetsVerified &&
    initialWidgets.widgets.length === 2 &&
    initialWidgets.widgets.every(widget => widget.created && widget.id > 0),
    "from_empty_widget_batch_creation_failed");
  const batchReplay = await ensureWidgets(widgetBatch);
  assertThat(!batchReplay.changed && batchReplay.persistedWidgetsVerified &&
    batchReplay.widgets.every(widget => !widget.created) &&
    JSON.stringify(initialWidgets.widgets.map(widget => widget.id)) ===
      JSON.stringify(batchReplay.widgets.map(widget => widget.id)),
    "from_empty_widget_batch_replay_duplicated_sections");
  const grid = await ensureWidget("record");
  const form = await ensureWidget("form");
  assertThat(!grid.changed && !form.changed &&
    grid.widget.id === initialWidgets.widgets[0]?.id &&
    form.widget.id === initialWidgets.widgets[1]?.id &&
    grid.widget.id !== form.widget.id,
    "from_empty_widget_id_missing");

  await callTool(bridge, "grist_change_ui", {
    action: "update_widget", documentId, pageId, widgetId: form.widget.id,
    update: { visibleFields: [{ columnId: "Code_Stage" },
      { columnId: "Structure" }, { columnId: "Commentaire" }] }
  });
  const layout = {
    children: [
      { type: "paragraph", text: "Suivi du stage : informations synthétiques" },
      { type: "section", children: [
        { type: "field", columnId: "Code_Stage" },
        { type: "field", columnId: "Structure" },
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

  const extra = await ensureWidgets([
    ...widgetBatch, { tableId: "Stages", type: "chart" }
  ]);
  assertThat(extra.changed && extra.persistedWidgetsVerified &&
    extra.widgets[0]?.id === grid.widget.id && !extra.widgets[0].created &&
    extra.widgets[1]?.id === form.widget.id && !extra.widgets[1].created &&
    extra.widgets[2]?.created && extra.widgets[2].id > 0,
    "from_empty_widget_partial_batch_not_reconciled");

  const selector = await callTool(bridge, "grist_add_ui", {
    action: "ensure_widget", documentId, pageId, tableId: "Classes", type: "record"
  }) as { widget: { id: number } };
  const selectBy = { sourceWidgetId: selector.widget.id, targetColumnId: "Classe" };
  await callTool(bridge, "grist_change_ui", {
    action: "update_widget", documentId, pageId, widgetId: grid.widget.id, update: { selectBy }
  });
  const pageWidgets = await callTool(bridge, "grist_inspect", { action: "page_widgets", documentId, pageId }) as {
    widgets: Array<{ id: number; selectByNormalized?: typeof selectBy }>;
  };
  const linked = pageWidgets.widgets.find(widget => widget.id === grid.widget.id)?.selectByNormalized;
  assertThat(linked?.sourceWidgetId === selectBy.sourceWidgetId && linked.targetColumnId === "Classe",
    "from_empty_class_stage_link_not_persisted");

  const structurePage = await callTool(bridge, "grist_add_ui", {
    action: "ensure_page", documentId, tableId: "Structures_de_stage", name: "Formulaire structures"
  }) as { page: { id: number } };
  const structureForm = await callTool(bridge, "grist_add_ui", {
    action: "ensure_widget", documentId, pageId: structurePage.page.id,
    tableId: "Structures_de_stage", type: "form"
  }) as { widget: { id: number } };
  await callTool(bridge, "grist_change_ui", {
    action: "update_widget", documentId, pageId: structurePage.page.id, widgetId: structureForm.widget.id,
    update: { visibleFields: [{ columnId: "Nom" }] }
  });
  const setStructureFormLayout = () => callTool(bridge, "grist_change_ui", {
    action: "update_form_layout", documentId, pageId: structurePage.page.id, widgetId: structureForm.widget.id,
    layout: { children: [{ type: "paragraph", text: "Structure de stage" },
      { type: "section", children: [{ type: "field", columnId: "Nom" }] }, { type: "submit" }] }
  }) as Promise<{ changed: boolean; persistedLayoutVerified: boolean }>;
  const structuresLayout = await setStructureFormLayout();
  const structuresLayoutReplay = await setStructureFormLayout();
  assertThat(structuresLayout.changed && structuresLayout.persistedLayoutVerified &&
    !structuresLayoutReplay.changed && structuresLayoutReplay.persistedLayoutVerified,
    "from_empty_structure_form_not_reconciled");
  for (const [formId, expectedColumns] of [
    [form.widget.id, ["Code_Stage", "Structure", "Commentaire"]], [structureForm.widget.id, ["Nom"]]
  ] as const) {
    const preview = await gristApi(context.baseUrl, context.ownerKey,
      `/api/docs/${encodeURIComponent(documentId)}/forms/${formId}`) as {
        formFieldsById: Record<string, { colId: string }>;
      };
    const actualColumns = Object.values(preview.formFieldsById).map(field => field.colId);
    assertThat(actualColumns.length === expectedColumns.length &&
      expectedColumns.every(column => actualColumns.includes(column)), "from_empty_native_form_bindings_wrong");
  }

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
  assertThat(stages.length === 3 &&
    ["S-A", "S-B", "S-C"].every(code => stages.some(row => row.fields.Code_Stage === code)),
    "from_empty_native_stage_data_incomplete");

  const labels = new Map(stages.map(row =>
    [row.fields.Code_Stage, row.fields.Stage_Libelle]));
  assertThat(labels.get("S-A") === "S-A | À suivre" &&
    labels.get("S-B") === "S-B | En cours",
    "from_empty_native_formula_values_incomplete");
  // Changing an existing computed field is separate from creating it.
  const replaceFormula = () => callTool(bridge, "grist_change_structure", {
    action: "replace_column_formula", documentId, tableId: "Stages",
    columnId: "Stage_Libelle", formula: '$Statut + " / " + $Code_Stage'
  }) as Promise<{ changed: boolean; persistedFormulaVerified: boolean }>;
  const changedFormula = await replaceFormula();
  const replayFormula = await replaceFormula();
  assertThat(changedFormula.changed && changedFormula.persistedFormulaVerified &&
    !replayFormula.changed && replayFormula.persistedFormulaVerified,
    "from_empty_formula_replacement_not_idempotent");
  const recalculated = recordsFrom(await gristApi(context.baseUrl, context.ownerKey,
    "/api/docs/" + encodeURIComponent(documentId) + "/tables/Stages/records"));
  const updatedLabels = new Map(recalculated.map(row =>
    [row.fields.Code_Stage, row.fields.Stage_Libelle]));
  assertThat(updatedLabels.get("S-A") === "À suivre / S-A" &&
    updatedLabels.get("S-B") === "En cours / S-B",
    "from_empty_formula_replacement_not_calculated");
  const pageState = await mcpPages(bridge, documentId);
  assertThat(countKeyValue(pageState, "name", "Suivi synthétique") === 1,
    "from_empty_native_page_not_unique");
  console.log("from-empty stage and structure forms, dropdown, row style and linked selector: PASS");

  // Synthetic role policy, not a copy of the production application's ACL.
  const flag = (attributeColumnId: string) => ({
    kind: "user_attribute_flag", attributeName: "Personnel", attributeColumnId
  });
  const policies = [
    {
      target: { userAttributeName: "Personnel" },
      definition: { tableId: "Enseignants", lookupColId: "Email",
        source: { kind: "user_property", property: "Email" } }
    },
    {
      target: { tableId: "Stages" },
      rules: [
        { condition: { kind: "user_access", operator: "equals", role: "owner" },
          permissions: { read: "allow", update: "allow" } },
        { condition: { kind: "not", condition: flag("Acces_Stages_Actif") },
          permissions: { read: "deny", update: "deny" } },
        { condition: flag("Acces_Direction"),
          permissions: { read: "allow", update: "unspecified" } },
        { condition: { kind: "all", conditions: [
          flag("Est_PP"),
          { kind: "record_in_user_attribute_ref_list", operator: "in", columnId: "Classe",
            attributeName: "Personnel", attributeColumnId: "Classes_PP" }
        ] }, permissions: { read: "allow", update: "unspecified" } },
        { condition: { kind: "match_user_attribute", operator: "equals", columnId: "Suivi_par",
          attributeName: "Personnel", attributeColumnId: "id" },
          permissions: { read: "allow", update: "allow" } },
        { condition: { kind: "everyone" }, permissions: { read: "deny", update: "deny" } }
      ]
    },
    {
      target: { tableId: "Enseignants" },
      rules: [{ condition: { kind: "user_access", operator: "not_equals", role: "owner" },
        permissions: { read: "unspecified", create: "deny", update: "deny", delete: "deny" } }]
    },
    {
      target: { tableId: "Stages", columnIds: ["Suivi_par"] },
      rules: [{ condition: { kind: "user_access", operator: "not_equals", role: "owner" },
        permissions: { read: "unspecified", update: "deny" } }]
    }
  ];
  const ensurePolicy = (policy: Record<string, unknown>) =>
    callTool(bridge, "grist_change_structure", {
      action: "access_rule_group", documentId, mode: "ensure", ...policy
    }) as Promise<{ changed: boolean; persistedDefinitionVerified: boolean }>;
  for (const policy of policies) {
    const first = await ensurePolicy(policy);
    const repeat = await ensurePolicy(policy);
    assertThat(first.changed && first.persistedDefinitionVerified &&
      !repeat.changed && repeat.persistedDefinitionVerified, "from_empty_acl_not_reconciled");
  }

  const newStageContext = { ...context, stageDocId: documentId };
  await assertStageVisibility(newStageContext, context.teacherAKey, "S-A", "S-B");
  await assertStageVisibility(newStageContext, context.teacherBKey, "S-B", "S-A");
  const ownStageId = stagesFirst.recordIds[0]!;
  const otherStageId = stagesFirst.recordIds[1]!;
  const ownEdit = await updateStage(newStageContext, context.teacherAKey, ownStageId, {
    Commentaire: "Trace synthétique autorisée"
  });
  const otherEdit = await updateStage(newStageContext, context.teacherAKey, otherStageId, {
    Commentaire: "Écriture interdite"
  });
  const reassignment = await updateStage(newStageContext, context.teacherAKey, ownStageId, {
    Suivi_par: teachersFirst.recordIds[1]
  });
  assertThat(ownEdit >= 200 && ownEdit < 300 && otherEdit === 403 && reassignment === 403,
    `from_empty_native_acl_effect_wrong:${ownEdit}:${otherEdit}:${reassignment}`);
  console.log("from-empty synthetic stage schema, Form layout and authenticated ACL enforcement: PASS");

  const stagePath = "/api/docs/" + encodeURIComponent(documentId) + "/tables/Stages/records";
  const rolePath = "/api/docs/" + encodeURIComponent(documentId) + "/tables/Enseignants/records";
  const teacherBId = teachersFirst.recordIds[1]!;
  const roleCodes = async (apiKey: string, expected: string[]) => {
    const status = await gristStatus(context.baseUrl, apiKey, stagePath, { method: "GET" });
    if (expected.length === 0 && status === 403) return;
    assertThat(status === 200, "from_empty_role_read_status:" + status);
    const rows = recordsFrom(await gristApi(context.baseUrl, apiKey, stagePath));
    const actual = rows.map(row => row.fields.Code_Stage).sort();
    assertThat(JSON.stringify(actual) === JSON.stringify([...expected].sort()),
      "from_empty_role_row_scope_wrong");
  };
  const setRoles = (fields: Record<string, unknown>) =>
    callTool(bridge, "grist_change_records", {
      action: "update", documentId, tableId: "Enseignants",
      records: [{ id: teacherBId, fields }]
    });
  await roleCodes(context.teacherAKey, ["S-A", "S-C"]);
  await roleCodes(context.teacherBKey, ["S-B"]);
  // A real editor must not be able to grant themselves management privileges.
  const selfPromotion = await gristStatus(context.baseUrl, context.teacherBKey, rolePath, {
    method: "PATCH", body: JSON.stringify({
      records: [{ id: teacherBId, fields: { Acces_Direction: true } }]
    })
  });
  assertThat(selfPromotion === 403, "from_empty_role_self_promotion_allowed");
  await setRoles({ Est_PP: true, Classes_PP: ["L", classesFirst.recordIds[0]] });
  await roleCodes(context.teacherBKey, ["S-A", "S-B"]);
  const ppForeignEdit = await updateStage(newStageContext, context.teacherBKey, ownStageId, {
    Commentaire: "PP lecture seulement"
  });
  assertThat(ppForeignEdit === 403, "from_empty_role_pp_foreign_update_allowed");
  await setRoles({ Acces_Direction: true });
  await roleCodes(context.teacherBKey, ["S-A", "S-B", "S-C"]);
  await setRoles({ Acces_Stages_Actif: false });
  await roleCodes(context.teacherBKey, []);
  const inactiveEdit = await updateStage(newStageContext, context.teacherBKey, otherStageId, {
    Commentaire: "Accès désactivé"
  });
  assertThat(inactiveEdit === 403, "from_empty_role_inactive_update_allowed");
  await setRoles({ Acces_Stages_Actif: true, Acces_Direction: false });
  await roleCodes(context.teacherBKey, ["S-A", "S-B"]);
  await roleCodes(context.teacherAKey, ["S-A", "S-C"]);
  console.log("from-empty authenticated teacher, class PP, direction and disabled role boundaries: PASS");

  const publishForm = (targetPageId: number, widgetId: number) =>
    callTool(bridge, "grist_change_ui", {
      action: "publish_form", documentId, pageId: targetPageId, widgetId, confirmPublic: true
    }) as Promise<{ changed: boolean; persistedPublicationIntentVerified: boolean }>;
  const structurePageId = structurePage.page.id;
  const structureFormId = structureForm.widget.id;
  const publishedStructure = await publishForm(structurePageId, structureFormId);
  assertThat(publishedStructure.changed && publishedStructure.persistedPublicationIntentVerified,
    "from_empty_structure_form_not_published");
  const linkLabel = "Proposer une structure";
  const connectForms = () => callTool(bridge, "grist_change_ui", {
    action: "update_form_layout", documentId, pageId, widgetId: form.widget.id,
    layout: { ...layout, confirmPublicLink: true, children: [
      { type: "form_link", label: linkLabel, targetPageId: structurePageId, targetWidgetId: structureFormId },
      ...layout.children
    ] }
  }) as Promise<{ changed: boolean; persistedLayoutVerified: boolean }>;
  const linkedForms = await connectForms();
  const publishedStage = await publishForm(pageId, form.widget.id);
  const replayedForms = await connectForms();
  assertThat(linkedForms.changed && linkedForms.persistedLayoutVerified &&
    !replayedForms.changed && replayedForms.persistedLayoutVerified &&
    publishedStage.changed && publishedStage.persistedPublicationIntentVerified &&
    !(await publishForm(structurePageId, structureFormId)).changed &&
    !(await publishForm(pageId, form.widget.id)).changed, "from_empty_public_forms_not_reconciled");

  const nativeDocPath = "/api/docs/" + encodeURIComponent(documentId);
  const nativeSections = recordsFrom(await gristApi(context.baseUrl, context.ownerKey,
    nativeDocPath + "/tables/_grist_Views_section/records?hidden=true"));
  const sourceSection = nativeSections.find(row => row.id === form.widget.id);
  const nativeLayout = JSON.parse(String(sourceSection?.fields.layoutSpec)) as { children: Array<{ text?: string }> };
  const link = /^\[Proposer une structure\]\(\/forms\/([a-zA-Z0-9_-]{1,100})\/([1-9]\d*)\)$/
    .exec(nativeLayout.children[0]?.text ?? "");
  assertThat(link && Number(link[2]) === structureFormId, "from_empty_public_form_link_wrong_target");
  assertThat(![linkedForms, replayedForms, publishedStructure, publishedStage]
    .some(result => JSON.stringify(result).includes(link![1]!)), "from_empty_public_form_link_secret_exposed");
  const publicApi = "/api/s/" + link![1]!;
  const anon = (path: string, body?: unknown) => fetch(new URL(path, context.baseUrl), {
    credentials: "omit", redirect: "error", signal: AbortSignal.timeout(10_000),
    ...(body === undefined ? {} : {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    })
  }).catch(() => { throw new Error("Synthetic anonymous Form request failed."); });
  const preview = await anon(publicApi + "/forms/" + structureFormId);
  assertThat(preview.ok, "from_empty_public_structure_form_not_accessible");
  const publicFields = await preview.json() as { formFieldsById: Record<string, { colId: string }> };
  assertThat(Object.values(publicFields.formFieldsById).some(field => field.colId === "Nom"),
    "from_empty_public_structure_form_wrong_fields");
  const submission = "Structure fictive publiée";
  const structureRecords = "/tables/Structures_de_stage/records";
  const sent = await anon(publicApi + structureRecords, { records: [{ fields: { Nom: submission } }] });
  await sent.body?.cancel();
  assertThat(sent.ok, "from_empty_public_structure_submission_failed");
  const saved = recordsFrom(await gristApi(context.baseUrl, context.ownerKey, nativeDocPath + structureRecords));
  assertThat(saved.some(row => row.fields.Nom === submission && row.fields.Statut === "en attente"),
    "from_empty_public_structure_submission_missing_default");
  const publicRows = await anon(publicApi + structureRecords);
  if (publicRows.ok) {
    assertThat(recordsFrom(await publicRows.json()).length === 0, "from_empty_public_structure_rows_disclosed");
  } else {
    await publicRows.body?.cancel();
    assertThat(publicRows.status === 403 || publicRows.status === 404,
      "from_empty_public_structure_row_privacy_unverified");
  }
  const wrongForm = await anon(publicApi + "/forms/" + form.widget.id);
  await wrongForm.body?.cancel();
  assertThat(wrongForm.status === 403 || wrongForm.status === 404, "from_empty_public_stage_wrong_share");
  console.log("from-empty public Form link, anonymous submission and native default: PASS");
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
