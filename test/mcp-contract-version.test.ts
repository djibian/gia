import assert from "node:assert/strict";
import test from "node:test";

import {
  LEAN_TOOL_REGISTRY,
  MCP_CONTRACT_VERSION,
  leanToolHelp
} from "../src/mcp/leanRegistry.js";

test("MCP v2 contract version and exact public tool set are explicit", () => {
  assert.equal(MCP_CONTRACT_VERSION, "2");
  assert.deepEqual(leanToolHelp().contractVersion, "2");
  assert.deepEqual(
    LEAN_TOOL_REGISTRY.map((tool) => tool.name),
    [
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
    ]
  );
});
