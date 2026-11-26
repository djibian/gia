import {
  assertThat,
  callTool,
  containsValue,
  countKeyValue,
  createTestApiKey,
  gristApi,
  gristStatus,
  recordsFrom,
  startBridge,
  stopBridge,
  waitForUrl
} from "./grist-harness.js";
import { readOwnerFormShareKey } from "../src/grist/formShareLookup.js";
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

// Reserved origins and inactive widgets qualify metadata only, not remote code.
const witnessWidgets = [
  {key: "structures-map", page: "Consultation structures", section: "carte",
    tableId: "Structures_de_stage", columnId: "Nom_usuel", direct: false},
  {key: "teacher-geocoder", page: "Liste des enseignants", section: "geocodeur",
    tableId: "Enseignants", columnId: "Adresse", direct: true},
  {key: "teacher-map", page: "Liste des enseignants", section: "carte",
    tableId: "Enseignants", columnId: "Identite", direct: false},
  {key: "structure-assistant", page: "Assistant structures", section: "assistant",
    tableId: "Structures_de_stage", columnId: "Nom_usuel", direct: true},
  {key: "assignment-assistant", page: "Affectation des stages", section: "assistant",
    tableId: "Classes", columnId: "Classe", direct: true}
] as const;
const widgetFixtureUrl = (key: string) => `https://${key}.invalid/v1.0.0/index.html`;
const widgetFixtureRegistry = JSON.stringify(witnessWidgets.map(spec => ({
  key: spec.key, name: spec.key, widgetId: `@test/${spec.key}`,
  revision: "v1.0.0", url: widgetFixtureUrl(spec.key),
  ...(spec.direct ? {directUrl: true} : {}),
  referenceOption: {key: "fixtureConfig", version: 1,
    tableSlots: ["source"], columnSlots: {display: "source"}}
})));

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
async function configureSyntheticStagePolicy(bridge: string, documentId: string): Promise<void> {
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
}

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

  await configureSyntheticStagePolicy(bridge, documentId);

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


/**
 * #295: native ordinary page topology from the witness, with synthetic schema
 * and rows. Five blank Custom sections receive native links from ordinary
 * selectors. Custom metadata uses inert fixtures; external code and the two
 * reciprocal custom-source links are absent.
 * The source document is not used at runtime.
 */
async function validateFromEmptyStageTopology(
  bridge: string, context: FixtureContext
): Promise<void> {
  const created = await callTool(bridge, "grist_add_structure", {
    action: "create_document", workspaceId: context.workspaceId,
    name: "From-empty synthetic stage topology"
  }) as {documentId?: string; bootstrap?: string};
  assertThat(typeof created.documentId === "string" && created.bootstrap === "empty",
    "stage_topology_not_empty");
  const documentId = created.documentId!;
  const tableIds = ["Classes", "Enseignants", "Structures_de_stage", "Stages",
    "Activites", "Verrou", "Periodes_de_stage", "Affectation", "Eleves"];
  // Stable column IDs and native types from the witness, never source rows,
  // URLs, identity values or secret-bearing formulas. Historical empty-formula
  // placeholders are explicit writable columns in this synthetic target.
  const writable: Record<string, Record<string, string>> = {
    Classes: {Classe: "Text", Niveau: "Text", Filiere: "Text"},
    Enseignants: {
      Nom: "Text", Prenom: "Text", Titre: "Text", Adresse: "Text",
      Acces_Stages_Actif: "Bool", Acces_Direction: "Bool", Envoyer_Lien_Stages: "Bool",
      Latitude: "Numeric", Longitude: "Numeric", Adresse_normalisee: "Text",
      Localisation_validee: "Bool", Sujet_Lien_Stages: "Text", Corps_Lien_Stages: "Text",
      Classes_PP: "RefList:Classes"
    },
    Structures_de_stage: {
      Nom_usuel: "Text", Numero_d_immatriculation: "Text", Courriel: "Text",
      Telephone: "Text", Latitude: "Numeric", Longitude: "Numeric", Adresse: "Text",
      Activites: "ChoiceList", Recommande: "Bool", Service: "Bool", Vente: "Bool",
      Raison_sociale: "Text", Site_web: "Text", Partenaire: "Bool"
    },
    Stages: {
      Date_de_debut_modifiee: "Date", Date_de_fin_modifiee: "Date", Commentaire: "Text",
      Type_de_contact: "Choice", Ponctualite: "Choice", Implication: "Choice",
      Assiduite: "Choice", Prise_d_initiative: "Choice", Autonomie: "Choice", Efficacite: "Choice"
    },
    Activites: {Nom: "Any", Nombre_d_eleves: "Numeric", Date: "Date"},
    Verrou: {A: "Any"},
    Periodes_de_stage: {Numero: "Text", Date_debut: "Date", Date_fin: "Date"},
    Affectation: {Stage_a_suivre: "Numeric"},
    Eleves: {Nom: "Text", Prenom: "Text", Date_de_naissance: "Date", Sexe: "Choice", email: "Any"}
  };
  const relations: Record<string, Record<string, string>> = {
    Classes: {Professeur_principal: "Enseignants"},
    Stages: {Suivi_par: "Enseignants", Structure_de_stage: "Structures_de_stage",
      Periode: "Periodes_de_stage", Eleve: "Eleves"},
    Activites: {Patrenaire: "Structures_de_stage", Enseignant: "Enseignants", Classe: "Classes"},
    Periodes_de_stage: {Classe: "Classes"},
    Affectation: {Classe: "Classes", Enseignant: "Enseignants", Periode: "Periodes_de_stage"},
    Eleves: {Classe: "Classes"}
  };
  type FormulaSeed = { id: string; fields: {type: string; isFormula: boolean; formula: string} };
  const formula = (id: string, type: string, expression: string, isFormula = true): FormulaSeed =>
    ({id, fields: {type, isFormula, formula: expression}});
  // Dependencies are constructed before each calculated batch. Ordinary business
  // formulas match the source schema; email/token/link delivery uses deliberately
  // inert synthetic values and is not qualified here.
  const computed: Array<[string, FormulaSeed[]]> = [
    ["Structures_de_stage", [formula("Statut", "Choice", '"à vérifier"', false)]],
    ["Enseignants", [
      formula("Identite", "Any",
        "f\"{$Titre} {$Nom} {$Prenom}\".strip()"),
      formula("Email", "Text",
        `${JSON.stringify(TEACHER_A_EMAIL)} if $Cle == "synthetique-Enseignants" else (${JSON.stringify(TEACHER_B_EMAIL)} if $Cle == "synthetique-enseignant-b" else "")`),
      formula("Token_Stages", "Text", '"synthetic-token"', false),
      formula("Lien_Stages", "Text", '"synthetic-link"'),
      formula("Expediteur_Lien_Stages", "Text", '"synthetic-sender"', false),
      formula("Id_Envoi_Stages", "Text", '"synthetic-message"', false),
      formula("Est_PP", "Bool", "bool($Classes_PP)")
    ]],
    ["Eleves", [formula("Identite", "Text",
        "f\"{$Prenom} {$Nom} - {$Classe.Classe}\"")]],
    ["Stages", [
      formula("Commune", "Text",
        "import re\n\nadresse = ($Structure_de_stage.Adresse or \"\").strip()\n\nm = re.search(r\"\\b\\d{5}\\s+([^,;]+)\", adresse)\n\nreturn m.group(1).strip().title() if m else \"\""),
      formula("Structure_de_stage_Statut", "Choice", "$Structure_de_stage.Statut"),
      formula("Classe", "Ref:Classes", "$Eleve.Classe"),
      formula("Enseignants_affectables", "RefList:Enseignants",
        "[\n    a.Enseignant\n    for a in Affectation.lookupRecords(\n        Classe=$Classe,\n        Periode=$Periode\n    )\n    if a.Enseignant and a.Stage_a_suivre > 0\n]")
    ]],
    ["Affectation", [
      formula("Stages_attribues", "Numeric",
        "sum(\n    1 for s in Stages.lookupRecords(\n        Suivi_par=$Enseignant,\n        Classe=$Classe,\n        Periode=$Periode\n    )\n    if s.Structure_de_stage\n)"),
      formula("Reste_a_attribuer", "Any", "$Stage_a_suivre - $Stages_attribues")
    ]],
    ["Periodes_de_stage", [
      formula("Periode", "Text",
        "if $Numero:\n    debut_str = f\"{$Date_debut.day:02d}/{$Date_debut.month:02d}/{$Date_debut.year}\" if $Date_debut else \"\"\n    fin_str = f\"{$Date_fin.day:02d}/{$Date_fin.month:002d}/{$Date_fin.year}\" if $Date_fin else \"\"\n\n    if debut_str and fin_str:\n        return f\"{$Numero} - {$Classe.Classe} - {debut_str} au {fin_str}\"\n    elif debut_str:\n        return f\"{$Numero} - {$Classe.Classe} - {debut_str}\"\n    elif fin_str:\n        return f\"{$Numero} - {$Classe.Classe} - {fin_str}\"\n\"\""),
      formula("Effectif", "Numeric", "len(Eleves.lookupRecords(Classe=$Classe))"),
      formula("Stages_declares", "Numeric",
        "stages = Stages.lookupRecords(Periode=$id)\n\nlen({\n    s.Eleve.id\n    for s in stages\n    if s.Eleve and s.Structure_de_stage\n})"),
      formula("Sans_stage", "Numeric",
        "max(0, $Effectif - $Stages_declares)"),
      formula("Stages_attribues", "Numeric",
        "sum(\n    1 for s in Stages.lookupRecords(Periode=$id)\n    if s.Structure_de_stage and s.Suivi_par\n)"),
      formula("Stages_sans_enseignants", "Numeric",
        "sum(\n    1 for s in Stages.lookupRecords(Periode=$id)\n    if s.Structure_de_stage and not s.Suivi_par\n)")
    ]],
    ["Classes", [
      formula("Nombre_de_periodes_de_stage", "Numeric", "len(Periodes_de_stage.lookupRecords(Classe=$id))")
    ]]
  ];
  const ensureSchema = async (replay = false) => {
    await callTool(bridge, "grist_add_structure", {
      action: "ensure_tables", documentId, tables: tableIds.map(id => ({
        id, columns: [{id: "Cle", fields: {type: "Text", isFormula: false}}]
      }))
    });
    for (const tableId of tableIds) {
      const columns = {...writable[tableId],
        ...Object.fromEntries(Object.entries(relations[tableId] ?? {}).map(([id, target]) => [id, "Ref:" + target]))};
      const result = await callTool(bridge, "grist_add_structure", {
        action: "ensure_columns", documentId, tableId,
        columns: Object.entries(columns).map(([id, type]) => ({
          id, fields: {type, isFormula: false}
        }))
      }) as {changed: boolean; persistedSchemaVerified: boolean};
      assertThat(result.persistedSchemaVerified && (!replay || !result.changed),
        "stage_topology_writable_schema_not_reconciled");
    }
    for (const [tableId, columns] of computed) {
      const result = await callTool(bridge, "grist_add_structure", {
        action: "ensure_columns", documentId, tableId, columns
      }) as {changed: boolean; persistedSchemaVerified: boolean};
      assertThat(result.persistedSchemaVerified && (!replay || !result.changed),
        "stage_topology_formula_schema_not_reconciled");
    }
  };
  const displayFields: Record<string, Record<string, string>> = {
    Classes: {Professeur_principal: "Identite"},
    Enseignants: {Classes_PP: "Classe"},
    Stages: {Eleve: "Identite", Structure_de_stage: "Nom_usuel", Periode: "Periode",
      Suivi_par: "Identite", Classe: "Classe"},
    Activites: {Patrenaire: "Nom_usuel", Enseignant: "Identite", Classe: "Classe"},
    Periodes_de_stage: {Classe: "Classe"},
    Affectation: {Classe: "Classe", Enseignant: "Identite", Periode: "Periode"},
    Eleves: {Classe: "Classe"}
  };
  const dropdowns = [
    {columnId: "Structure_de_stage",
      condition: {kind: "choice_field_equals_literal", choiceColumnId: "Statut", value: "validé"},
      text: 'choice.Statut == "validé"'},
    {columnId: "Periode",
      condition: {kind: "choice_field_equals_record_ref", choiceColumnId: "Classe", recordColumnId: "Classe"},
      text: "choice.Classe == $Classe"},
    {columnId: "Suivi_par",
      condition: {kind: "choice_id_in_record_reflist", recordColumnId: "Enseignants_affectables"},
      text: "choice.id in $Enseignants_affectables"}
  ];
  const configureSchema = async (replay = false) => {
    for (const update of [{locale: "fr-FR"}, {timezone: "Europe/Paris"}]) {
      await callTool(bridge, "grist_change_structure", {
        action: "update_document", documentId, update
      });
    }
    // Synthetic conditional presentation, not claimed to be the source palette.
    for (const rule of [
      {action: "append_row_style_rule", tableId: "Stages",
        conditionFormula: "not $Suivi_par", style: {fillColor: "#FFF3D4", fontBold: true}},
      {action: "append_style_rule", tableId: "Stages", columnId: "Structure_de_stage_Statut",
        conditionFormula: '$Structure_de_stage_Statut == "à vérifier"',
        style: {textColor: "#A00000", fontBold: true}}
    ]) {
      const result = await callTool(bridge, "grist_change_structure", {
        documentId, ...rule
      }) as {changed: boolean; persistedStyleVerified: boolean};
      assertThat(result.persistedStyleVerified && (!replay || !result.changed),
        "stage_topology_style_not_reconciled");
    }
    for (const [tableId, fields] of Object.entries(displayFields)) {
      const updated = await callTool(bridge, "grist_change_structure", {
        action: "update_columns", documentId, tableId,
        columns: Object.entries(fields).map(([id, visibleColumnId]) => ({
          id, fields: {visibleColumnId}
        }))
      }) as {updatedColumns: Array<{targetColumnId: string; columnId: string; visibleColumnId: string}>};
      assertThat(updated.updatedColumns.length === Object.keys(fields).length &&
        updated.updatedColumns.every(column => column.targetColumnId === column.columnId &&
          fields[column.columnId] === column.visibleColumnId),
        "stage_topology_display_column_not_verified");
    }
    // Witness choice presentation (labels and colors only, never source rows).
    const status = ["à vérifier", "refusé", "validé", "à compléter", "doublon"];
    const assessment = ["pas satisfaisant", "moyen", "satisfaisant"];
    const choices: Array<[string, string, string[]]> = [
      ["Structures_de_stage", "Statut", status],
      ["Stages", "Structure_de_stage_Statut", status],
      ["Stages", "Type_de_contact", ["Appel", "Visite"]],
      ...["Ponctualite","Implication","Assiduite","Prise_d_initiative","Autonomie","Efficacite"]
        .map((id): [string,string,string[]] => ["Stages",id,assessment]),
      ["Structures_de_stage","Activites",["fromagerie","ehpah","bâtiment","menuiserie"]],
      ["Eleves","Sexe",["F","M"]]
    ];
    for (const [tableId,columnId,values] of choices) {
      const result = await callTool(bridge,"grist_change_structure",{
        action:"append_choice_options",documentId,tableId,columnId,values
      }) as {changed:boolean;persistedOptionsVerified:boolean;choices:string[]};
      assertThat(result.persistedOptionsVerified && JSON.stringify(result.choices) === JSON.stringify(values)
        && (!replay || !result.changed), "stage_topology_choices_not_reconciled");
    }
    for (const [tableId,columnId] of [["Structures_de_stage","Statut"],["Stages","Structure_de_stage_Statut"]]) {
      for (const [label,colors] of Object.entries({
        "à vérifier":{textColor:"#E8D62F"},
        "refusé":{fillColor:"#FFFFFF",textColor:"#E00A17"},
        "validé":{textColor:"#2AE028"},
        "à compléter":{textColor:"#FD9D28"}
      })) {
        const result = await callTool(bridge,"grist_change_structure",{
          action:"set_choice_colors",documentId,tableId,columnId,label,colors
        }) as {changed:boolean;persistedOptionsVerified:boolean};
        assertThat(result.persistedOptionsVerified && (!replay || !result.changed),
          "stage_topology_choice_color_not_reconciled");
      }
    }
    for (const {columnId, condition} of dropdowns) {
      const updated = await callTool(bridge, "grist_change_structure", {
        action: "update_dropdown_condition", documentId, tableId: "Stages", columnId, condition
      }) as {changed: boolean; persistedOptionsVerified: boolean};
      assertThat(updated.persistedOptionsVerified && (!replay || !updated.changed),
        "stage_topology_dropdown_not_reconciled");
    }
  };
  await ensureSchema();
  await configureSchema();
  const ensureData = async () => {
    const ids = new Map<string, number>();
    // Dependency order: no source data, no native import, all writes via Gia.
    for (const tableId of ["Enseignants", "Structures_de_stage", "Verrou", "Classes",
      "Periodes_de_stage", "Eleves", "Affectation", "Stages", "Activites"]) {
      const examples: Record<string, Record<string, unknown>> = {
        Enseignants: {Nom: "Fictif", Prenom: "Prof", Acces_Stages_Actif: true},
        Structures_de_stage: {Nom_usuel: "Structure fictive", Adresse: "00000 commune fictive"},
        Classes: {Classe: "Classe A"},
        Periodes_de_stage: {Numero: "1"},
        Eleves: {Nom: "Fictif", Prenom: "Eleve"},
        Affectation: {Stage_a_suivre: 2}
      };
      const fields: Record<string, unknown> = {Cle: "synthetique-" + tableId, ...examples[tableId]};
      for (const [columnId, target] of Object.entries(relations[tableId] ?? {})) {
        const targetId = ids.get(target);
        assertThat(targetId !== undefined, "stage_topology_reference_order");
        fields[columnId] = targetId;
      }
      const result = await callTool(bridge, "grist_add_records", {
        action: "ensure_record", documentId, tableId, keyColumnId: "Cle", record: {fields}
      }) as {recordId: number; persistedRecordVerified: boolean};
      assertThat(result.recordId > 0 && result.persistedRecordVerified,
        "stage_topology_record_missing");
      ids.set(tableId, result.recordId);
    }
    return [...ids.entries()];
  };
  const records = await ensureData();
  type WidgetSpec = {
    key: string; tableId: string; type: "record" | "single" | "form" | "custom";
    source?: string; targetColumnId?: string; collapsed?: boolean; groupByColumnIds?: string[];
  };
  const grid = (key: string, tableId: string, extras: Partial<WidgetSpec> = {}): WidgetSpec =>
    ({key, tableId, type: "record", ...extras});
  const lock = (): WidgetSpec => grid("lock", "Verrou", {collapsed: true});
  const pages: Array<{name: string; widgets: WidgetSpec[]}> = [
    {name: "Consultation structures", widgets: [
      grid("structures", "Structures_de_stage"),
      {...grid("carte", "Structures_de_stage", {source: "structures"}), type: "custom"},
      {...grid("fiche", "Structures_de_stage", {source: "structures"}), type: "single"}]},
    {name: "Suivi des stages", widgets: [
      grid("stages", "Stages", {source: "enseignant", targetColumnId: "Suivi_par"}),
      {...grid("fiche", "Stages", {source: "stages"}), type: "single"},
      grid("enseignant", "Enseignants", {collapsed: true})]},
    {name: "Partenaires", widgets: [
      grid("structures", "Structures_de_stage"),
      grid("stages", "Stages", {source: "structures", targetColumnId: "Structure_de_stage"}),
      grid("activites", "Activites", {source: "structures", targetColumnId: "Patrenaire"})]},
    {name: "Ma classe", widgets: [
      grid("classes", "Classes", {source: "enseignants", targetColumnId: "Professeur_principal"}),
      grid("bilan", "Affectation", {source: "classes", targetColumnId: "Classe",
        groupByColumnIds: ["Classe", "Enseignant"]}),
      grid("periodes", "Periodes_de_stage", {source: "classes", targetColumnId: "Classe"}),
      grid("stages", "Stages", {source: "periodes", targetColumnId: "Periode"}),
      grid("affectations", "Affectation", {source: "periodes", targetColumnId: "Periode"}),
      grid("enseignants", "Enseignants", {collapsed: true})]},
    {name: "Formulaire structures", widgets: [
      grid("structures", "Structures_de_stage"), {...grid("form", "Structures_de_stage"), type: "form"}, lock()]},
    {name: "Formulaire stages", widgets: [
      grid("stages", "Stages", {source: "form"}),
      {...grid("form", "Stages", {source: "stages"}), type: "form"}, lock()]},
    {name: "Périodes de stage", widgets: [grid("periodes", "Periodes_de_stage"), lock()]},
    {name: "Liste des activités", widgets: [grid("activites", "Activites"), lock()]},
    {name: "Liste des affectations", widgets: [grid("affectations", "Affectation"), lock()]},
    {name: "Liste des enseignants", widgets: [grid("enseignants", "Enseignants"),
      {...grid("geocodeur", "Enseignants", {source: "enseignants"}), type: "custom"},
      {...grid("carte", "Enseignants", {source: "enseignants"}), type: "custom"}, lock()]},
    {name: "Liste des élèves", widgets: [grid("eleves", "Eleves"), lock()]},
    {name: "Liste des classes", widgets: [grid("classes", "Classes"),
      grid("periodes", "Periodes_de_stage", {source: "classes", targetColumnId: "Classe"}), lock()]},
    {name: "Liste des stages", widgets: [grid("stages", "Stages"), lock()]},
    {name: "Assistant structures", widgets: [grid("structures", "Structures_de_stage"),
      {...grid("assistant", "Structures_de_stage", {source: "structures"}), type: "custom"}, lock()]},
    {name: "Affectation des stages", widgets: [
      grid("affectations", "Affectation", {source: "classes", targetColumnId: "Classe"}),
      grid("stages", "Stages", {source: "classes", targetColumnId: "Classe"}),
      grid("classes", "Classes"), {...grid("assistant", "Classes", {source: "classes"}), type: "custom"}, lock()]}
  ];
  // Stable witness field bindings; instructional text and required-field
  // choices are synthetic acceptance values, not copied source Form options.
  type FormSpec = {columns: string[]; required: string[]; title: string};
  const formSpecs: Record<string, FormSpec> = {
    Structures_de_stage: {
      columns: ["Nom_usuel", "Numero_d_immatriculation", "Courriel", "Telephone",
        "Adresse", "Service", "Vente", "Site_web"],
      required: ["Nom_usuel"], title: "Proposer une structure de stage"
    },
    Stages: {
      columns: ["Eleve", "Structure_de_stage", "Periode"],
      required: ["Eleve", "Structure_de_stage", "Periode"], title: "Déclarer un stage"
    }
  };
  const formLayout = (spec: FormSpec) => ({
    children: [
      {type: "paragraph", text: spec.title},
      {type: "section", children: spec.columns.map(columnId => ({type: "field", columnId}))},
      {type: "submit"}
    ],
    submitText: "Envoyer", successText: "Réponse reçue"
  });
  const construct = async (replay: boolean) => {
    const results: Array<{pageId: number; widgetIds: number[]}> = [];
    for (const page of pages) {
      const p = await callTool(bridge, "grist_add_ui", {
        action: "ensure_page", documentId, tableId: page.widgets[0]!.tableId, name: page.name
      }) as {page: {id: number}; changed: boolean};
      if (replay) assertThat(!p.changed, "stage_topology_duplicate_page");
      const pageId = p.page.id;
      const ids = new Map<string, number>();
      const ordinary = page.widgets.filter(widget => widget.groupByColumnIds === undefined);
      const specs = ordinary.map(({tableId, type}) => ({tableId, type}));
      const batch = await callTool(bridge, "grist_add_ui", {
        action: "ensure_widgets", documentId, pageId, widgets: specs
      }) as {widgets: Array<{id: number}>; changed: boolean};
      if (replay) assertThat(!batch.changed, "stage_topology_duplicate_widgets");
      assertThat(batch.widgets.length === ordinary.length, "stage_topology_missing_widgets");
      ordinary.forEach((widget, index) => ids.set(widget.key, batch.widgets[index]!.id));
      for (const widget of page.widgets.filter(widget => widget.groupByColumnIds !== undefined)) {
        const summary = await callTool(bridge, "grist_add_ui", {
          action: "ensure_widget", documentId, pageId, tableId: widget.tableId, type: widget.type,
          groupByColumnIds: widget.groupByColumnIds
        }) as {widget: {id: number}; changed: boolean};
        if (replay) assertThat(!summary.changed, "stage_topology_duplicate_summary");
        ids.set(widget.key, summary.widget.id);
      }
      for (const widget of page.widgets) {
        const widgetId = ids.get(widget.key)!;
        if (widget.source) {
          await callTool(bridge, "grist_change_ui", {
            action: "update_widget", documentId, pageId, widgetId, update: {selectBy: {
              sourceWidgetId: ids.get(widget.source),
              ...(widget.targetColumnId ? {targetColumnId: widget.targetColumnId} : {})
            }}
          });
        }
        if (widget.type === "form") {
          const formSpec = formSpecs[widget.tableId]!;
          await callTool(bridge, "grist_change_ui", {
            action: "update_widget", documentId, pageId, widgetId,
            update: {visibleFields: formSpec.columns.map(columnId => ({columnId}))}
          });
          const configured = await callTool(bridge, "grist_change_ui", {
            action: "update_form_layout", documentId, pageId, widgetId,
            layout: formLayout(formSpec)
          }) as {changed: boolean; persistedLayoutVerified: boolean};
          assertThat(configured.persistedLayoutVerified && (!replay || !configured.changed),
            "stage_topology_form_layout_not_reconciled");
          for (const columnId of formSpec.required) {
            const options = await callTool(bridge, "grist_change_ui", {
              action: "update_form_field_options", documentId, pageId, widgetId, columnId,
              update: {required: true}
            }) as {changed: boolean; persistedOptionsVerified: boolean};
            assertThat(options.persistedOptionsVerified && (!replay || !options.changed),
              "stage_topology_form_field_options_not_reconciled");
          }
        }
      }
      await callTool(bridge, "grist_change_ui", {
        action: "update_layout", documentId, pageId, layout: {
          root: {kind: "group", children: page.widgets.filter(w => !w.collapsed).map(w => ({
            kind: "widget", widgetId: ids.get(w.key)
          }))},
          collapsedWidgetIds: page.widgets.filter(w => w.collapsed).map(w => ids.get(w.key))
        }
      });
      results.push({pageId, widgetIds: page.widgets.map(w => ids.get(w.key)!)});
    }
    return results;
  };
  const first = await construct(false);
  await ensureSchema(true);
  await configureSchema(true);
  assertThat(JSON.stringify(await ensureData()) === JSON.stringify(records),
    "stage_topology_duplicate_records");
  assertThat(JSON.stringify(await construct(true)) === JSON.stringify(first),
    "stage_topology_ids_changed_on_replay");
  const path = "/api/docs/" + encodeURIComponent(documentId);
  const metadata = async (table: string) => recordsFrom(await gristApi(context.baseUrl,
    context.ownerKey, path + "/tables/" + table + "/records?hidden=true"));
  const [sections, columns, views, navigation, tables] = await Promise.all([
    metadata("_grist_Views_section"), metadata("_grist_Tables_column"),
    metadata("_grist_Views"), mcpPages(bridge, documentId), metadata("_grist_Tables")
  ]);
  const docInfo = await metadata("_grist_DocInfo");
  assertThat(docInfo.length === 1 && docInfo[0]?.fields.timezone === "Europe/Paris" &&
    JSON.parse(String(docInfo[0]?.fields.documentSettings)).locale === "fr-FR",
    "stage_topology_document_settings_wrong");
  let witnessColumns = 0;
  for (const tableId of tableIds) {
    const table = tables.find(t => t.fields.tableId === tableId);
    assertThat(table !== undefined, "stage_topology_native_table_missing");
    const expected = [
      ...Object.entries(writable[tableId] ?? {}).map(([id, type]) => ({id, fields: {type, isFormula: false, formula: ""}})),
      ...Object.entries(relations[tableId] ?? {}).map(([id, target]) => ({id, fields: {type: "Ref:" + target, isFormula: false, formula: ""}})),
      ...(computed.find(([id]) => id === tableId)?.[1] ?? [])
    ];
    for (const spec of expected) {
      const matches = columns.filter(col => col.fields.parentId === table.id && col.fields.colId === spec.id);
      assertThat(matches.length === 1 && matches[0]?.fields.type === spec.fields.type &&
        matches[0]?.fields.isFormula === spec.fields.isFormula &&
        String(matches[0]?.fields.formula ?? "") === spec.fields.formula,
        "stage_topology_native_column_wrong:" + tableId + "." + spec.id);
      witnessColumns++;
    }
  }
  assertThat(witnessColumns === 89, "stage_topology_schema_count_wrong");
  const nativeColumn = (tableId: string, columnId: string) => {
    const table = tables.find(t => t.fields.tableId === tableId);
    const matches = columns.filter(col => col.fields.parentId === table?.id && col.fields.colId === columnId);
    assertThat(table !== undefined && matches.length === 1, "stage_topology_reference_column_missing");
    return matches[0]!;
  };
  let displayCount = 0;
  for (const [tableId, fields] of Object.entries(displayFields)) {
    for (const [columnId, visibleColumnId] of Object.entries(fields)) {
      const source = nativeColumn(tableId, columnId);
      const targetTable = String(source.fields.type).replace(/^Ref(?:List)?:/, "");
      const target = nativeColumn(targetTable, visibleColumnId);
      assertThat(source.fields.visibleCol === target.id, "stage_topology_native_display_column_wrong");
      displayCount++;
    }
  }
  assertThat(displayCount === 15, "stage_topology_display_count_wrong");
  for (const {columnId, text} of dropdowns) {
    const column = nativeColumn("Stages", columnId);
    const options = JSON.parse(String(column.fields.widgetOptions)) as {
      dropdownCondition?: {text: string; parsed: string}
    };
    assertThat(options.dropdownCondition?.text === text &&
      typeof options.dropdownCondition.parsed === "string" &&
      Array.isArray(JSON.parse(options.dropdownCondition.parsed)),
      "stage_topology_native_dropdown_wrong:" + columnId);
  }
  console.log("from-empty stage schema configuration: 15 display references, 3 typed native dropdown predicates, stable replay: PASS");
  const recordIds = new Map(records);
  const row = async (tableId: string) => {
    const rows = await metadata(tableId);
    assertThat(rows.length === 1 && rows[0]?.id === recordIds.get(tableId),
      "stage_topology_native_row_missing:" + tableId);
    return rows[0]!.fields;
  };
  const [stage, assignment, period, structure] = await Promise.all([
    row("Stages"), row("Affectation"), row("Periodes_de_stage"), row("Structures_de_stage")
  ]);
  assertThat(stage.Classe === recordIds.get("Classes") &&
    JSON.stringify(stage.Enseignants_affectables) === JSON.stringify(["L", recordIds.get("Enseignants")]) &&
    stage.Structure_de_stage_Statut === "à vérifier" && structure.Statut === "à vérifier" &&
    assignment.Stages_attribues === 1 && assignment.Reste_a_attribuer === 1 &&
    period.Effectif === 1 && period.Stages_declares === 1 && period.Sans_stage === 0 &&
    period.Stages_attribues === 1 && period.Stages_sans_enseignants === 0,
    "stage_topology_native_formula_results_wrong");
  assertThat(stage.Commune === "Commune Fictive",
    "stage_topology_native_commune_formula_wrong");
  // A zero allocation must exclude an otherwise matching teacher; a stage
  // without a structure must not count as declared or assigned.
  const changeWitness = (tableId: string, fields: Record<string, unknown>) =>
    callTool(bridge, "grist_change_records", {
      action: "update", documentId, tableId, records: [{id: recordIds.get(tableId), fields}]
    });
  await changeWitness("Affectation", {Stage_a_suivre: 0});
  const unallocated = (await row("Stages")).Enseignants_affectables;
  assertThat(unallocated == null || JSON.stringify(unallocated) === JSON.stringify(["L"]),
    "stage_topology_zero_allocation_teacher_included");
  await changeWitness("Affectation", {Stage_a_suivre: 2});
  await changeWitness("Stages", {Structure_de_stage: 0});
  const absentAssignment = await row("Affectation");
  const absentPeriod = await row("Periodes_de_stage");
  assertThat(absentAssignment.Stages_attribues === 0 && absentAssignment.Reste_a_attribuer === 2 &&
    absentPeriod.Stages_declares === 0 && absentPeriod.Sans_stage === 1 &&
    absentPeriod.Stages_attribues === 0 && absentPeriod.Stages_sans_enseignants === 0,
    "stage_topology_missing_structure_counted");
  await changeWitness("Stages", {Structure_de_stage: recordIds.get("Structures_de_stage")});
  assertThat(JSON.stringify((await row("Stages")).Enseignants_affectables) ===
    JSON.stringify(["L", recordIds.get("Enseignants")]) &&
    (await row("Affectation")).Stages_attribues === 1 &&
    (await row("Periodes_de_stage")).Stages_declares === 1,
    "stage_topology_formula_restore_wrong");
  console.log("from-empty stage schema: 89 ordinary witness columns, native business formulas, zero-allocation and missing-structure negatives, stable replay: PASS");
  const allIds = first.flatMap(page => page.widgetIds);
  assertThat(first.length === 15 && new Set(first.map(page => page.pageId)).size === 15 &&
    allIds.length === 46 && new Set(allIds).size === 46, "stage_topology_cardinality_wrong");
  let links = 0;
  let blankCustomSections = 0;
  for (let i = 0; i < pages.length; i++) {
    const spec = pages[i]!, actual = first[i]!;
    assertThat(countKeyValue(navigation, "name", spec.name) === 1, "stage_topology_page_name_duplicate");
    const pageSections = sections.filter(section => section.fields.parentId === actual.pageId);
    assertThat(pageSections.length === spec.widgets.length, "stage_topology_native_section_count_wrong");
    const nativeLayout = JSON.parse(String(views.find(view => view.id === actual.pageId)?.fields.layoutSpec)) as {
      children: Array<{leaf: number}>; collapsed?: Array<{leaf: number}>;
    };
    const expectedPlaced = spec.widgets.flatMap((widget, index) => widget.collapsed ? [] : [actual.widgetIds[index]]);
    const expectedCollapsed = spec.widgets.flatMap((widget, index) => widget.collapsed ? [actual.widgetIds[index]] : []);
    assertThat(JSON.stringify(nativeLayout.children.map(node => node.leaf)) === JSON.stringify(expectedPlaced) &&
      JSON.stringify((nativeLayout.collapsed ?? []).map(node => node.leaf)) === JSON.stringify(expectedCollapsed),
      "stage_topology_layout_wrong");
    for (let j = 0; j < spec.widgets.length; j++) {
      const widget = spec.widgets[j]!, section = pageSections.find(row => row.id === actual.widgetIds[j]);
      assertThat(section?.fields.parentKey === widget.type, "stage_topology_native_widget_type_wrong");
      if (widget.type === "custom") {
        blankCustomSections++;
        const custom = JSON.parse(String(section?.fields.options || "{}")).customView;
        assertThat(!custom || ((!custom.url && !custom.widgetId) &&
          (!custom.access || custom.access === "none")), "stage_topology_custom_section_not_blank");
      }
      if (widget.source) {
        links++;
        const sourceIndex = spec.widgets.findIndex(candidate => candidate.key === widget.source);
        assertThat(section?.fields.linkSrcSectionRef === actual.widgetIds[sourceIndex] &&
          section?.fields.linkSrcColRef === 0, "stage_topology_native_source_wrong");
        const target = columns.find(column => column.id === section?.fields.linkTargetColRef);
        assertThat(widget.targetColumnId ?
          target?.fields.colId === widget.targetColumnId && target?.fields.parentId === section?.fields.tableRef :
          section?.fields.linkTargetColRef === 0, "stage_topology_native_target_wrong");
      }
    }
  }
  assertThat(links === 20, "stage_topology_native_link_count_wrong");
  assertThat(blankCustomSections === 5, "stage_topology_custom_section_count_wrong");
  const installed = new Map<number, typeof witnessWidgets[number]>();
  for (const spec of witnessWidgets) {
    const pageIndex = pages.findIndex(page => page.name === spec.page);
    assertThat(pageIndex >= 0, "witness_widget_page_missing");
    const sectionIndex = pages[pageIndex]!.widgets.findIndex(widget => widget.key === spec.section);
    assertThat(sectionIndex >= 0 && pages[pageIndex]!.widgets[sectionIndex]?.type === "custom",
      "witness_widget_target_missing");
    const pageId = first[pageIndex]!.pageId, widgetId = first[pageIndex]!.widgetIds[sectionIndex]!;
    assertThat(!installed.has(widgetId), "witness_widget_duplicate_target");
    installed.set(widgetId, spec);
    const install = {action: "install_trusted_widget", documentId, pageId, widgetId,
      trustedKey: spec.key, confirmExternalWidget: true};
    const configure = {action: "configure_trusted_widget_references", documentId, pageId, widgetId,
      trustedKey: spec.key, confirmExternalWidget: true,
      tables: {source: spec.tableId}, columns: {display: spec.columnId}};
    const result = await callTool(bridge, "grist_change_ui", install) as {
      changed: boolean; persistedWidgetVerified: boolean; remoteCodeExecutionQualified: boolean
    };
    assertThat(result.changed && result.persistedWidgetVerified &&
      result.remoteCodeExecutionQualified === false, "witness_widget_install_unverified");
    const config = await callTool(bridge, "grist_change_ui", configure) as {
      changed: boolean; persistedOptionsVerified: boolean; remoteCodeExecutionQualified: boolean
    };
    assertThat(config.changed && config.persistedOptionsVerified &&
      config.remoteCodeExecutionQualified === false, "witness_widget_binding_unverified");
    const replay = await callTool(bridge, "grist_change_ui", install) as {changed: boolean};
    const configReplay = await callTool(bridge, "grist_change_ui", configure) as {changed: boolean};
    assertThat(!replay.changed && !configReplay.changed, "witness_widget_replay_changed_state");
  }
  const configuredSections = await metadata("_grist_Views_section");
  assertThat(installed.size === 5 && configuredSections.length === sections.length,
    "witness_widget_native_count_wrong");
  for (const before of sections) {
    const after = configuredSections.find(row => row.id === before.id);
    assertThat(after, "witness_widget_collateral_section_removed");
    const spec = installed.get(before.id);
    if (!spec) {
      assertThat(JSON.stringify(after) === JSON.stringify(before), "witness_widget_collateral_section_changed");
      continue;
    }
    const {options: beforeOptions, ...beforeFields} = before.fields;
    const {options: afterOptions, ...afterFields} = after!.fields;
    const {customView: _oldView, ...beforeOuter} = JSON.parse(String(beforeOptions || "{}"));
    const {customView, ...afterOuter} = JSON.parse(String(afterOptions || "{}"));
    assertThat(JSON.stringify(beforeFields) === JSON.stringify(afterFields) &&
      JSON.stringify(beforeOuter) === JSON.stringify(afterOuter), "witness_widget_collateral_options_changed");
    const view = JSON.parse(String(customView));
    assertThat(view.access === "none" && (spec.direct
      ? view.url === widgetFixtureUrl(spec.key) && view.widgetId == null && view.widgetDef == null
      : view.widgetId === `@test/${spec.key}` && view.widgetDef?.url === widgetFixtureUrl(spec.key) &&
        view.url == null), "witness_widget_native_identity_or_access_wrong");
    const tableRef = tables.find(table => table.fields.tableId === spec.tableId)?.id;
    const columnRef = columns.find(column => column.fields.parentId === tableRef &&
      column.fields.colId === spec.columnId)?.id;
    assertThat(tableRef && columnRef, "witness_widget_native_binding_missing");
    assertThat(JSON.stringify(view.widgetOptions?.fixtureConfig) === JSON.stringify({
      version: 1, tables: {source: tableRef}, bindings: {display: {tableRef, columnRef}}
    }), "witness_widget_native_binding_wrong");
  }
  console.log("from-empty stage topology: 9 base tables, 15 named pages, 46 sections (5 inert configured Custom), 20 native links, stable replay: PASS");
  // Publication is deliberately confined to this disposable native fixture.
  // No source share key or URL is used, and no public key enters a tool result.
  const formTarget = (tableId: string) => {
    const index = pages.findIndex(page => page.widgets.some(widget =>
      widget.type === "form" && widget.tableId === tableId));
    assertThat(index >= 0, "stage_topology_form_page_missing");
    const widgetIndex = pages[index]!.widgets.findIndex(widget =>
      widget.type === "form" && widget.tableId === tableId);
    return {pageId: first[index]!.pageId, widgetId: first[index]!.widgetIds[widgetIndex]!};
  };
  const structureForm = formTarget("Structures_de_stage");
  const stageForm = formTarget("Stages");
  for (const [target, spec] of [
    [structureForm, formSpecs.Structures_de_stage!], [stageForm, formSpecs.Stages!]
  ] as const) {
    const preview = await gristApi(context.baseUrl, context.ownerKey,
      path + "/forms/" + target.widgetId) as {
        formFieldsById: Record<string, {colId: string}>;
      };
    const actual = Object.values(preview.formFieldsById).map(field => field.colId);
    assertThat(actual.length === spec.columns.length &&
      spec.columns.every(column => actual.includes(column)),
      "stage_topology_native_form_bindings_wrong");
  }
  const publish = (target: {pageId: number; widgetId: number}) =>
    callTool(bridge, "grist_change_ui", {
      action: "publish_form", documentId, ...target, confirmPublic: true
    }) as Promise<{changed: boolean; persistedPublicationIntentVerified: boolean}>;
  const structurePublished = await publish(structureForm);
  assertThat(structurePublished.changed && structurePublished.persistedPublicationIntentVerified,
    "stage_topology_structure_publication_failed");
  const label = "Proposer une structure";
  const layout = formLayout(formSpecs.Stages!);
  const linkForms = () => callTool(bridge, "grist_change_ui", {
    action: "update_form_layout", documentId, ...stageForm,
    layout: {...layout, confirmPublicLink: true, children: [
      {type: "form_link", label, targetPageId: structureForm.pageId,
        targetWidgetId: structureForm.widgetId}, ...layout.children
    ]}
  }) as Promise<{changed: boolean; persistedLayoutVerified: boolean}>;
  const linked = await linkForms();
  const stagePublished = await publish(stageForm);
  const linkedReplay = await linkForms();
  assertThat(linked.changed && linked.persistedLayoutVerified &&
    stagePublished.changed && stagePublished.persistedPublicationIntentVerified &&
    !linkedReplay.changed && linkedReplay.persistedLayoutVerified &&
    !(await publish(structureForm)).changed && !(await publish(stageForm)).changed,
    "stage_topology_public_forms_not_reconciled");
  const publishedSections = await metadata("_grist_Views_section");
  const source = publishedSections.find(section => section.id === stageForm.widgetId);
  const nativeForm = JSON.parse(String(source?.fields.layoutSpec)) as {
    children: Array<{text?: string}>;
  };
  const link = /^\[Proposer une structure\]\(\/forms\/([a-zA-Z0-9_-]{1,100})\/([1-9]\d*)\)$/
    .exec(nativeForm.children[0]?.text ?? "");
  assertThat(link && Number(link[2]) === structureForm.widgetId,
    "stage_topology_public_form_link_wrong");
  assertThat(![linked, linkedReplay, structurePublished, stagePublished]
    .some(result => JSON.stringify(result).includes(link![1]!)),
    "stage_topology_public_form_key_exposed");
  const publicPath = "/api/s/" + link![1]!;
  const anonymous = (targetPath: string, body?: unknown) => fetch(
    new URL(targetPath, context.baseUrl), {
      credentials: "omit", redirect: "error", signal: AbortSignal.timeout(10000),
      ...(body === undefined ? {} : {method: "POST",
        headers: {"content-type": "application/json"}, body: JSON.stringify(body)})
    }).catch(() => {throw new Error("Synthetic anonymous Form request failed.");});
  const publicPreview = await anonymous(publicPath + "/forms/" + structureForm.widgetId);
  assertThat(publicPreview.ok, "stage_topology_structure_form_preview_denied");
  const fields = await publicPreview.json() as {
    formFieldsById: Record<string, {colId: string}>;
  };
  const actual = Object.values(fields.formFieldsById).map(field => field.colId);
  assertThat(actual.length === 8 && formSpecs.Structures_de_stage!.columns
    .every(column => actual.includes(column)), "stage_topology_public_form_bindings_wrong");
  const submitted = "Structure fictive soumise";
  const sent = await anonymous(publicPath + "/tables/Structures_de_stage/records",
    {records: [{fields: {Nom_usuel: submitted}}]});
  await sent.body?.cancel();
  assertThat(sent.ok, "stage_topology_structure_submission_failed");
  const saved = await metadata("Structures_de_stage");
  assertThat(saved.filter(row => row.fields.Nom_usuel === submitted &&
    row.fields.Statut === "à vérifier").length === 1,
    "stage_topology_structure_submission_missing_default");
  console.log("from-empty stage topology: 8/3 Form fields, native layout replay, linked public Forms and anonymous structure submission: PASS");
  // Obtain the second disposable native capability without returning it via MCP.
  const pageRows = await metadata("_grist_Pages");
  const shareRows = await metadata("_grist_Shares");
  const stagePages = pageRows.filter(page => page.fields.viewRef === stageForm.pageId);
  const share = shareRows.find(row => row.id === stagePages[0]?.fields.shareRef);
  assertThat(stagePages.length === 1 && typeof share?.fields.linkId === "string",
    "stage_topology_stage_share_missing");
  const doc = await gristApi(context.baseUrl, context.ownerKey, path) as Record<string, unknown>;
  const worker = await gristApi(context.baseUrl, context.ownerKey,
    "/api/worker/" + encodeURIComponent(documentId));
  const stageKey = await readOwnerFormShareKey(context.baseUrl, doc, worker,
    documentId, String(share?.fields.linkId), context.ownerKey);
  assertThat(stageKey !== link![1], "stage_topology_form_shares_not_distinct");
  const stagePublicPath = "/api/s/" + stageKey;
  const stagePreview = await anonymous(stagePublicPath + "/forms/" + stageForm.widgetId);
  assertThat(stagePreview.ok, "stage_topology_stage_form_preview_denied");
  const stageFields = await stagePreview.json() as {formFieldsById: Record<string, {colId: string}>};
  const stageBindings = Object.values(stageFields.formFieldsById).map(field => field.colId);
  assertThat(stageBindings.length === 3 && formSpecs.Stages!.columns.every(id => stageBindings.includes(id)),
    "stage_topology_stage_public_form_bindings_wrong");
  // Seed a second student through Gia and approve the existing synthetic structure.
  const secondStudent = await callTool(bridge, "grist_add_records", {
    action: "ensure_record", documentId, tableId: "Eleves", keyColumnId: "Cle",
    record: {fields: {Cle: "synthetique-form-eleve", Nom: "Test", Prenom: "Second",
      Classe: recordIds.get("Classes")}}
  }) as {recordId: number; persistedRecordVerified: boolean};
  assertThat(secondStudent.persistedRecordVerified, "stage_topology_second_student_missing");
  await callTool(bridge, "grist_change_records", {
    action: "update", documentId, tableId: "Structures_de_stage",
    records: [{id: recordIds.get("Structures_de_stage"), fields: {Statut: "validé"}}]
  });
  const stageFieldsToSubmit = {Eleve: secondStudent.recordId,
    Structure_de_stage: recordIds.get("Structures_de_stage"), Periode: recordIds.get("Periodes_de_stage")};
  const stageSent = await anonymous(stagePublicPath + "/tables/Stages/records",
    {records: [{fields: stageFieldsToSubmit}]});
  await stageSent.body?.cancel();
  assertThat(stageSent.ok, "stage_topology_stage_submission_failed");
  const stageRows = await metadata("Stages");
  const submittedStage = stageRows.filter(row => row.fields.Eleve === secondStudent.recordId);
  assertThat(stageRows.length === 2 && submittedStage.length === 1 &&
    submittedStage[0]?.fields.Structure_de_stage === stageFieldsToSubmit.Structure_de_stage &&
    submittedStage[0]?.fields.Periode === stageFieldsToSubmit.Periode &&
    submittedStage[0]?.fields.Classe === recordIds.get("Classes") &&
    submittedStage[0]?.fields.Structure_de_stage_Statut === "validé",
    "stage_topology_stage_submission_not_persisted");
  for (const [publicBase, tableId, foreignFormId] of [
    [publicPath, "Structures_de_stage", stageForm.widgetId],
    [stagePublicPath, "Stages", structureForm.widgetId]
  ] as const) {
    const response = await anonymous(publicBase + "/tables/" + tableId + "/records");
    if (response.ok) {
      assertThat(recordsFrom(await response.json()).length === 0,
        "stage_topology_public_rows_disclosed");
    } else {
      await response.body?.cancel();
      assertThat(response.status === 403 || response.status === 404,
        "stage_topology_public_row_privacy_unverified");
    }
    const foreign = await anonymous(publicBase + "/forms/" + foreignFormId);
    await foreign.body?.cancel();
    assertThat(foreign.status === 403 || foreign.status === 404,
      "stage_topology_cross_form_share_allowed");
  }
  console.log("from-empty stage topology: locale/timezone, conditional styles, both anonymous submissions and native public-row/cross-form denials: PASS");

  // Reuse the same bounded synthetic role policy on the actual full topology,
  // including its already-published Forms. No source identity or ACL is copied.
  const ensureWitnessRow = async (tableId: string, fields: Record<string, unknown>) => {
    const result = await callTool(bridge, "grist_add_records", {
      action: "ensure_record", documentId, tableId, keyColumnId: "Cle", record: {fields}
    }) as {recordId: number; persistedRecordVerified: boolean};
    assertThat(result.recordId > 0 && result.persistedRecordVerified, "full_witness_role_seed_failed");
    return result.recordId;
  };
  const updateWitnessRow = (tableId: string, id: number, fields: Record<string, unknown>) =>
    callTool(bridge, "grist_change_records", {
      action: "update", documentId, tableId, records: [{id, fields}]
    });
  const teacherA = recordIds.get("Enseignants")!;
  const teacherB = await ensureWitnessRow("Enseignants", {
    Cle: "synthetique-enseignant-b", Nom: "Test", Prenom: "Prof B", Acces_Stages_Actif: true
  });
  const classA = recordIds.get("Classes")!;
  const classB = await ensureWitnessRow("Classes", {
    Cle: "synthetique-classe-b", Classe: "Classe B", Professeur_principal: teacherA
  });
  const periodB = await ensureWitnessRow("Periodes_de_stage", {
    Cle: "synthetique-periode-b", Numero: "1", Classe: classB
  });
  const studentC = await ensureWitnessRow("Eleves", {
    Cle: "synthetique-eleve-c", Nom: "Test", Prenom: "Troisième", Classe: classB
  });
  const stageA = recordIds.get("Stages")!;
  const stageB = submittedStage[0]!.id;
  await updateWitnessRow("Stages", stageB, {Suivi_par: teacherB});
  await configureSyntheticStagePolicy(bridge, documentId);

  // Qualify the native Owner-only schema guard on this same application.
  // The raw native action is only an adversarial authenticated test probe,
  // never a new Gia action or a means of constructing witness schema.
  const schemaProbe = (columnId: string) => gristStatus(context.baseUrl,
    context.teacherAKey, path + "/apply", {
      method: "POST", body: JSON.stringify([
        ["AddColumn", "Verrou", columnId, {type: "Text"}]
      ])
    });
  const beforeProbe = "SchemaProbeBeforeGuard";
  const deniedProbe = "SchemaProbeDenied";
  const ownerProbe = "SchemaProbeOwner";
  const removeProbe = (columnId: string) => callTool(bridge, "grist_change_structure", {
    action: "delete_columns", documentId, tableId: "Verrou", columnIds: [columnId]
  });
  const probeColumns = async () => {
    const tables = await metadata("_grist_Tables");
    const lockTable = tables.find(row => row.fields.tableId === "Verrou");
    assertThat(lockTable, "full_witness_schema_probe_table_missing");
    return (await metadata("_grist_Tables_column"))
      .filter(row => row.fields.parentId === lockTable.id);
  };
  const beforeColumns = await probeColumns();
  assertThat(await schemaProbe(beforeProbe) === 200,
    "full_witness_schema_guard_editor_baseline_denied");
  assertThat((await probeColumns()).some(row => row.fields.colId === beforeProbe),
    "full_witness_schema_guard_editor_baseline_not_persisted");
  await removeProbe(beforeProbe);
  const beforeRules = await metadata("_grist_ACLRules");
  const guard = () => callTool(bridge, "grist_change_structure", {
    action: "ensure_owner_schema_guard", documentId, confirmSchemaRestriction: true
  }) as Promise<{changed: boolean; persistedDefinitionVerified: boolean;
    effectiveEnforcementVerified: boolean}>;
  let guarded: Awaited<ReturnType<typeof guard>>;
  try {
    guarded = await guard();
  } catch (error) {
    const after = await metadata("_grist_ACLRules");
    const resources = await metadata("_grist_ACLResources");
    const defaultIds = resources.filter(row => row.fields.tableId === "*" && row.fields.colIds === "*").map(row => row.id);
    const describe = (row: typeof after[number]) => ({
      id: row.id, resource: row.fields.resource, position: row.fields.rulePos,
      guard: row.fields.aclFormula === "user.Access != OWNER" && row.fields.permissionsText === "-S",
      changedFields: Object.keys(row.fields).filter(key =>
        JSON.stringify(row.fields[key]) !== JSON.stringify(beforeRules.find(previous => previous.id === row.id)?.fields[key]))
    });
    console.error("full_witness_schema_guard_native_diagnostic", JSON.stringify({
      defaultIds, before: beforeRules.map(describe), after: after.map(describe),
      guardParsed: after.filter(row => row.fields.aclFormula === "user.Access != OWNER" && row.fields.permissionsText === "-S")
        .map(row => row.fields.aclFormulaParsed)
    }));
    throw error;
  }
  const guardReplay = await guard();
  assertThat(guarded.changed && guarded.persistedDefinitionVerified &&
    !guarded.effectiveEnforcementVerified && !guardReplay.changed &&
    guardReplay.persistedDefinitionVerified, "full_witness_schema_guard_not_reconciled");
  const afterRules = await metadata("_grist_ACLRules");
  assertThat(afterRules.length === beforeRules.length + 1 &&
    afterRules.filter(row => row.fields.aclFormula === "user.Access != OWNER" &&
      row.fields.permissionsText === "-S").length === 1 &&
    beforeRules.every(original => afterRules.some(row =>
      row.id === original.id && JSON.stringify(row.fields) === JSON.stringify(original.fields))),
    "full_witness_schema_guard_changed_unrelated_policy");
  assertThat(await schemaProbe(deniedProbe) === 403,
    "full_witness_schema_guard_editor_not_denied");
  const ownerColumn = await callTool(bridge, "grist_add_structure", {
    action: "ensure_columns", documentId, tableId: "Verrou",
    columns: [{id: ownerProbe, fields: {type: "Text", isFormula: false}}]
  }) as {changed: boolean; persistedSchemaVerified: boolean};
  assertThat(ownerColumn.changed && ownerColumn.persistedSchemaVerified &&
    (await probeColumns()).some(row => row.fields.colId === ownerProbe),
    "full_witness_schema_guard_owner_write_denied");
  await removeProbe(ownerProbe);
  const afterColumns = await probeColumns();
  assertThat(afterColumns.length === beforeColumns.length &&
    beforeColumns.every(original => afterColumns.some(row =>
      row.id === original.id && JSON.stringify(row.fields) === JSON.stringify(original.fields))),
    "full_witness_schema_guard_probe_not_cleaned");
  console.log("from-empty full witness: Owner-only schema guard replay, editor schema denial, Owner schema write and preservation: PASS");

  // Submit via the same public capability AFTER the ACL installation. The
  // document remains disposable; the owner verifies persistence separately.
  const thirdSubmission = await anonymous(stagePublicPath + "/tables/Stages/records", {
    records: [{fields: {Eleve: studentC, Structure_de_stage: recordIds.get("Structures_de_stage"),
      Periode: periodB}}]
  });
  await thirdSubmission.body?.cancel();
  assertThat(thirdSubmission.ok, "full_witness_form_submission_after_acl_denied");
  const afterAcl = await metadata("Stages");
  const third = afterAcl.filter(row => row.fields.Eleve === studentC);
  assertThat(afterAcl.length === 3 && third.length === 1 &&
    third[0]?.fields.Classe === classB && third[0]?.fields.Periode === periodB,
    "full_witness_form_after_acl_not_persisted");
  const stageC = third[0]!.id;
  await updateWitnessRow("Stages", stageC, {Suivi_par: teacherA});

  const stagePath = path + "/tables/Stages/records";
  const rolePath = path + "/tables/Enseignants/records";
  const roleContext = {...context, stageDocId: documentId};
  const expectStageIds = async (key: string, expected: number[]) => {
    const status = await gristStatus(context.baseUrl, key, stagePath, {method: "GET"});
    if (expected.length === 0 && status === 403) return;
    assertThat(status === 200, "full_witness_role_read_status:" + status);
    const rows = recordsFrom(await gristApi(context.baseUrl, key, stagePath));
    const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);
    assertThat(JSON.stringify(sorted(rows.map(row => row.id))) === JSON.stringify(sorted(expected)),
      "full_witness_role_scope_wrong");
  };
  await expectStageIds(context.teacherAKey, [stageA, stageC]);
  await expectStageIds(context.teacherBKey, [stageB]);
  const ownEdit = await updateStage(roleContext, context.teacherAKey, stageA,
    {Commentaire: "Trace synthétique autorisée"});
  assertThat(ownEdit >= 200 && ownEdit < 300, "full_witness_own_stage_update_denied");
  assertThat(await updateStage(roleContext, context.teacherAKey, stageB,
    {Commentaire: "Écriture interdite"}) === 403, "full_witness_foreign_stage_update_allowed");
  assertThat(await updateStage(roleContext, context.teacherAKey, stageA,
    {Suivi_par: teacherB}) === 403, "full_witness_stage_reassignment_allowed");
  assertThat(await gristStatus(context.baseUrl, context.teacherBKey, rolePath, {
    method: "PATCH", body: JSON.stringify({records: [{id: teacherB, fields: {Acces_Direction: true}}]})
  }) === 403, "full_witness_self_promotion_allowed");
  await updateWitnessRow("Enseignants", teacherB, {Classes_PP: ["L", classA]});
  await expectStageIds(context.teacherBKey, [stageA, stageB]);
  assertThat(await updateStage(roleContext, context.teacherBKey, stageA,
    {Commentaire: "PP lecture seulement"}) === 403, "full_witness_pp_foreign_update_allowed");
  await updateWitnessRow("Enseignants", teacherB, {Acces_Direction: true});
  await expectStageIds(context.teacherBKey, [stageA, stageB, stageC]);
  await updateWitnessRow("Enseignants", teacherB, {Acces_Stages_Actif: false});
  await expectStageIds(context.teacherBKey, []);
  assertThat(await updateStage(roleContext, context.teacherBKey, stageB,
    {Commentaire: "Accès désactivé"}) === 403, "full_witness_inactive_update_allowed");
  await updateWitnessRow("Enseignants", teacherB, {Acces_Stages_Actif: true, Acces_Direction: false});
  await expectStageIds(context.teacherBKey, [stageA, stageB]);
  await expectStageIds(context.teacherAKey, [stageA, stageC]);
  // Recheck public-row confidentiality under the installed role policy.
  const afterPolicyPublic = await anonymous(stagePublicPath + "/tables/Stages/records");
  if (afterPolicyPublic.ok) {
    assertThat(recordsFrom(await afterPolicyPublic.json()).length === 0,
      "full_witness_public_rows_disclosed_after_acl");
  } else {
    await afterPolicyPublic.body?.cancel();
    assertThat(afterPolicyPublic.status === 403 || afterPolicyPublic.status === 404,
      "full_witness_public_row_privacy_unverified_after_acl");
  }
  console.log("from-empty full witness: native authenticated teacher, class PP, direction, disabled role and public Form coexistence: PASS");

  // The disposable home database supplies an existing org member with no
  // inherited document role. Only Gia changes this member's document access.
  // This identity has no Personnel row and must not bypass stage ACLs.
  const recipient = "test-witness-recipient@example.invalid";
  const recipientKey = await createTestApiKey(context.baseUrl, recipient, "Witness recipient");
  const nativeDoc = await gristApi(context.baseUrl, context.ownerKey, path) as {
    workspace?: {org?: {id?: number}}
  };
  const orgId = nativeDoc.workspace?.org?.id;
  assertThat(Number.isSafeInteger(orgId) && (orgId ?? 0) > 0,
    "full_witness_share_org_missing");
  await gristApi(context.baseUrl, context.ownerKey, "/api/orgs/" + orgId + "/access", {
    method: "PATCH", body: JSON.stringify({delta: {users: {[recipient]: "members"}}})
  });
  type AccessSnapshot = {
    users: Array<{email?: string; id?: number; access?: string | null;
      parentAccess?: string | null; isMember?: boolean}>;
    maxInheritedRole?: string | null
  };
  const access = () => gristApi(context.baseUrl, context.ownerKey, path + "/access") as Promise<AccessSnapshot>;
  const initialAccess = await access();
  const originalRecipient = initialAccess.users.find(user => user.email === recipient);
  assertThat(originalRecipient?.isMember === true && originalRecipient.access === null &&
    originalRecipient.parentAccess == null && Number.isSafeInteger(originalRecipient.id) &&
    (originalRecipient.id ?? 0) > 0, "full_witness_share_recipient_not_eligible");
  const unrelated = (snapshot: AccessSnapshot) => JSON.stringify(snapshot.users
    .filter(user => user.email !== recipient).sort((a, b) => (a.id ?? 0) - (b.id ?? 0)));
  const assertAccess = async (role: "viewers" | "editors" | null) => {
    const snapshot = await access();
    const target = snapshot.users.find(user => user.email === recipient);
    assertThat(role === null && !target || target?.id === originalRecipient.id &&
      target?.access === role && target?.parentAccess == null, "full_witness_share_target_wrong");
    assertThat(snapshot.maxInheritedRole === initialAccess.maxInheritedRole &&
      unrelated(snapshot) === unrelated(initialAccess), "full_witness_share_unrelated_changed");
  };
  const grant = () => callTool(bridge, "grist_change_structure", {
    action: "grant_document_user", documentId, email: recipient, role: "viewers"
  }) as Promise<{changed: boolean; persistedGrantVerified: boolean}>;
  const changeRole = (expectedRole: "viewers" | "editors", role: "viewers" | "editors") =>
    callTool(bridge, "grist_change_structure", {
      action: "change_document_user_role", documentId, email: recipient, expectedRole, role,
      confirmRoleChange: true
    }) as Promise<{changed: boolean; persistedRoleVerified: boolean}>;
  const revoke = () => callTool(bridge, "grist_change_structure", {
    action: "revoke_document_user", documentId, email: recipient, expectedRole: "viewers",
    confirmRevocation: true
  }) as Promise<{changed: boolean; persistedRevocationVerified: boolean}>;
  const structurePath = path + "/tables/Structures_de_stage/records";
  const structureId = recordIds.get("Structures_de_stage")!;
  const writeStructure = (label: string) => gristStatus(context.baseUrl, recipientKey, structurePath, {
    method: "PATCH", body: JSON.stringify({records: [{id: structureId, fields: {Adresse: label}}]})
  });
  const assertNoDocumentRead = async () => {
    const status = await gristStatus(context.baseUrl, recipientKey, structurePath, {method: "GET"});
    assertThat(status === 403 || status === 404, "full_witness_share_ungranted_read_allowed");
  };
  await assertNoDocumentRead();
  const granted = await grant();
  assertThat(granted.changed && granted.persistedGrantVerified && !(await grant()).changed,
    "full_witness_share_grant_not_reconciled");
  await assertAccess("viewers");
  // A fresh direct role may be visible to the home database before a doc
  // worker forgets its earlier negative authorization. Probe only reads;
  // never retry the grant. The disposable fixture's 10 s polling budget
  // is an experimental limit, not a production enforcement guarantee.
  const started = Date.now();
  let workerRead = await gristStatus(context.baseUrl, recipientKey, structurePath, {method: "GET"});
  while (workerRead === 403 && Date.now() - started < 10_000) {
    await new Promise(resolve => setTimeout(resolve, 250));
    workerRead = await gristStatus(context.baseUrl, recipientKey, structurePath, {method: "GET"});
  }
  const homeRead = await gristStatus(context.baseUrl, recipientKey, path, {method: "GET"});
  console.log("full_witness_share_grant_propagation:" + homeRead + ":" + workerRead + ":" +
    (Date.now() - started));
  assertThat(homeRead === 200 && workerRead === 200,
    "full_witness_share_viewer_effect_not_verified");
  const visibleStructures = recordsFrom(await gristApi(context.baseUrl, recipientKey, structurePath));
  assertThat(visibleStructures.some(row => row.id === structureId),
    "full_witness_share_viewer_read_denied");
  await expectStageIds(recipientKey, []);
  assertThat(await writeStructure("Interdit lecteur") === 403, "full_witness_share_viewer_write_allowed");

  const promoted = await changeRole("viewers", "editors");
  assertThat(promoted.changed && promoted.persistedRoleVerified &&
    !(await changeRole("viewers", "editors")).changed, "full_witness_share_role_not_reconciled");
  await assertAccess("editors");
  const editorLabel = "Adresse synthétique modifiée";
  const promotionStarted = Date.now();
  let editorWrite = await writeStructure(editorLabel);
  // The fixture retries only a definitive authorization refusal, never an
  // uncertain write. Stop on the first successful or unexpected response.
  while (editorWrite === 403 && Date.now() - promotionStarted < 10_000) {
    await new Promise(resolve => setTimeout(resolve, 250));
    editorWrite = await writeStructure(editorLabel);
  }
  console.log("full_witness_share_promotion_propagation:" + editorWrite + ":" +
    (Date.now() - promotionStarted));
  assertThat(editorWrite >= 200 && editorWrite < 300, "full_witness_share_editor_write_denied");
  await expectStageIds(recipientKey, []);
  assertThat(await updateStage(roleContext, recipientKey, stageA,
    {Commentaire: "Interdit sans attribut"}) === 403, "full_witness_share_editor_bypassed_acl");
  const restored = await changeRole("editors", "viewers");
  assertThat(restored.changed && restored.persistedRoleVerified &&
    !(await changeRole("editors", "viewers")).changed, "full_witness_share_downgrade_not_reconciled");
  await assertAccess("viewers");
  // Grist 1.7.19 caches effective authorization for a nominal 5000 ms
  // (HomeDBManager.getDocAuthCached), independently of persisted shares.
  // The owner explicitly selected delayed native enforcement qualification.
  // Preserve the immediate probe as evidence, not an instant-revocation PASS.
  // The fixed 6 s interval is fixture-only, not a Gia runtime delay or SLA.
  const staleMarker = "Modification synthétique pendant propagation";
  const downgradeStarted = Date.now();
  const downgradeStatus = await writeStructure(staleMarker);
  const staleWriteAccepted = downgradeStatus >= 200 && downgradeStatus < 300;
  console.log("full_witness_share_immediate_downgrade_status:" + downgradeStatus +
    ":" + (Date.now() - downgradeStarted));
  assertThat(staleWriteAccepted || downgradeStatus === 403,
    "full_witness_share_unexpected_downgrade_status");
  const readAddress = async () => (await metadata("Structures_de_stage"))
    .find(row => row.id === structureId)?.fields.Adresse;
  assertThat(await readAddress() === (staleWriteAccepted ? staleMarker : editorLabel),
    "full_witness_share_immediate_write_effect_wrong");
  await new Promise(resolve => setTimeout(resolve, 6_000));
  const settledDowngrade = await writeStructure("Interdit après propagation");
  console.log("full_witness_share_settled_downgrade_status:" + settledDowngrade +
    ":" + (Date.now() - downgradeStarted));
  assertThat(settledDowngrade === 403, "full_witness_share_downgrade_not_enforced_after_propagation");
  assertThat(await readAddress() === (staleWriteAccepted ? staleMarker : editorLabel),
    "full_witness_share_denied_write_changed_state");
  if (staleWriteAccepted) {
    await updateWitnessRow("Structures_de_stage", structureId, {Adresse: editorLabel});
  }
  // Prove the downgraded identity still has viewer access (and no protected
  // stage access); this also warms the native authorization cache for revoke.
  const downgradedRows = recordsFrom(await gristApi(context.baseUrl, recipientKey, structurePath));
  assertThat(downgradedRows.some(row => row.id === structureId),
    "full_witness_share_downgraded_viewer_read_denied");
  await expectStageIds(recipientKey, []);

  const revoked = await revoke();
  assertThat(revoked.changed && revoked.persistedRevocationVerified,
    "full_witness_share_revocation_not_verified");
  await assertAccess(null);
  const revocationStarted = Date.now();
  const immediateRevocation = await gristStatus(context.baseUrl, recipientKey, structurePath, {method: "GET"});
  console.log("full_witness_share_immediate_revocation_status:" + immediateRevocation +
    ":" + (Date.now() - revocationStarted));
  assertThat([200, 403, 404].includes(immediateRevocation),
    "full_witness_share_unexpected_revocation_status");
  await new Promise(resolve => setTimeout(resolve, 6_000));
  const settledRevocation = await gristStatus(context.baseUrl, recipientKey, structurePath, {method: "GET"});
  console.log("full_witness_share_settled_revocation_status:" + settledRevocation +
    ":" + (Date.now() - revocationStarted));
  assertThat(settledRevocation === 403 || settledRevocation === 404,
    "full_witness_share_revocation_not_enforced_after_propagation");
  assertThat(await writeStructure("Interdit après révocation") === 403,
    "full_witness_share_revoked_write_allowed");
  await assertAccess(null);
  const persistedStructures = await metadata("Structures_de_stage");
  assertThat(persistedStructures.find(row => row.id === structureId)?.fields.Adresse === editorLabel,
    "full_witness_share_denied_write_changed_state");
  await expectStageIds(context.teacherAKey, [stageA, stageC]);
  await expectStageIds(context.teacherBKey, [stageA, stageB]);
  console.log("from-empty full witness: persisted direct sharing, authenticated access/ACL isolation and delayed native restrictions: PASS; immediate enforcement NOT QUALIFIED");

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
    workspaceIds: [context.workspaceId],
    trustedWidgetsJson: widgetFixtureRegistry
  });

  try {
    await validateExistingGeneric(bridge.baseUrl, context);
    await validateStageTracking(bridge.baseUrl, context);
    await validateCcf(bridge.baseUrl, context);
    await validateFromEmptyStageSkeleton(bridge.baseUrl, context);
    await validateFromEmptyStageTopology(bridge.baseUrl, context);
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
