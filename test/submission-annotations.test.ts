import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { LEAN_TOOL_REGISTRY } from "../src/mcp/leanRegistry.js";
import {
  buildSubmissionArtifactTools,
  buildSubmissionToolAnnotations
} from "../src/operations/submissionAnnotations.js";

const expectedTools = [
  "grist_discover",
  "grist_inspect",
  "grist_query",
  "grist_add_records",
  "grist_change_records",
  "grist_add_structure",
  "grist_change_structure",
  "grist_add_ui",
  "grist_change_ui",
  "grist_help"
];

const destructiveWrites = [
  "grist_change_records",
  "grist_change_structure",
  "grist_change_ui"
].sort();

const additiveWrites = [
  "grist_add_records",
  "grist_add_structure",
  "grist_add_ui"
].sort();

const readOnlyTools = [
  "grist_discover",
  "grist_help",
  "grist_inspect",
  "grist_query"
].sort();

test("submission metadata is derived from exactly the frozen MCP v2 tool set", () => {
  assert.deepEqual(
    LEAN_TOOL_REGISTRY.map((tool) => tool.name),
    expectedTools
  );
  assert.equal(buildSubmissionToolAnnotations().length, 10);
});

test("MCP v2 submission annotations preserve the lean registry risk classes", () => {
  assert.deepEqual(
    LEAN_TOOL_REGISTRY.filter((tool) => !tool.readOnly && tool.destructive)
      .map((tool) => tool.name)
      .sort(),
    destructiveWrites
  );
  assert.deepEqual(
    LEAN_TOOL_REGISTRY.filter((tool) => !tool.readOnly && !tool.destructive)
      .map((tool) => tool.name)
      .sort(),
    additiveWrites
  );
  assert.deepEqual(
    LEAN_TOOL_REGISTRY.filter((tool) => tool.readOnly)
      .map((tool) => tool.name)
      .sort(),
    readOnlyTools
  );
});

test("every v2 tool has non-empty submission justifications for all annotations", () => {
  const submission = buildSubmissionToolAnnotations();

  for (const entry of submission) {
    const registry = LEAN_TOOL_REGISTRY.find((tool) => tool.name === entry.name);
    assert.ok(registry, entry.name);
    assert.deepEqual(entry.annotations, {
      readOnlyHint: registry.readOnly,
      destructiveHint: registry.destructive,
      openWorldHint: false
    });
    assert.ok(entry.justifications.readOnlyHint.trim().length > 0, entry.name);
    assert.ok(entry.justifications.destructiveHint.trim().length > 0, entry.name);
    assert.ok(entry.justifications.openWorldHint.trim().length > 0, entry.name);
  }
});

test("tracked ChatGPT submission tool metadata cannot drift from the lean registry", async () => {
  const raw = await readFile(new URL("../chatgpt-app-submission.json", import.meta.url), "utf8");
  const artifact = JSON.parse(raw) as { tools?: unknown };

  assert.deepEqual(artifact.tools, buildSubmissionArtifactTools());
});
