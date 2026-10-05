import assert from "node:assert/strict";
import test from "node:test";
import { convergenceErrors } from "../tools/check-convergence.mjs";

function currentTree() {
  return new Map([
    "AGENTS.md", "README.md", "PRIVACY.md", "TERMS.md", "SUPPORT.md",
    "docs/PRODUCT_VISION.md", "docs/ARCHITECTURE.md", "docs/MCP-CONTRACT.md",
    "docs/SECURITY.md", "docs/OPERATIONS.md", "docs/DEVELOPMENT.md", "docs/ROADMAP.md",
    ".github/pull_request_template.md"
  ].map(path => [path, "Current product."]));
}

test("current docs, open work, compatibility numbers and legal dates remain valid", () => {
  const files = currentTree();
  files.set("docs/ROADMAP.md", "- [ ] A bounded authorized repair.");
  files.set("docs/MCP-CONTRACT.md", "MCP v2; Grist 1.7.20; maximum 200 fields.");
  files.set("PRIVACY.md", "Effective date: 2026-09-30");
  files.set("README.md", "[Current contract](docs/MCP-CONTRACT.md#safety-invariants)");
  assert.deepEqual(convergenceErrors(files), []);
});

test("new reports cannot bypass the inventory by changing their names or format", () => {
  for (const path of ["docs/CURRENT-NOTES.md", "docs/notes.json", "reports/check.json",
    "infra/poc/compose.yml", "tools/r4-proof.ts", "archive/result.txt"]) {
    const files = currentTree();
    files.set(path, "temporary evidence");
    assert.ok(convergenceErrors(files).length > 0, path);
  }
});

test("completed slices and old contracts are rejected even in an allowed document", () => {
  for (const text of ["R6 is DONE", "J0 proof", "M3 results", "- [x] integrated", "MCP v1", "grist-chatgpt", "contractVersion: 1", "GPT Actions"]) {
    const files = currentTree();
    files.set("docs/ROADMAP.md", text);
    assert.ok(convergenceErrors(files).length > 0, text);
  }
});

test("dormant schemas and provider POCs cannot return as a parallel product contract", () => {
  for (const [path, content] of [
    ["src/mcp/outputSchemas.ts", ""],
    ["src/operations/progressiveHelp.ts", ""],
    ["src/compat/provider.ts", ""],
    ["prompts/developer.txt", ""],
    ["src/mcp/other.ts", "export function structuredResult() {}"]
  ]) {
    const files = currentTree();
    files.set(path, content);
    assert.ok(convergenceErrors(files).length > 0, path);
  }
});

test("removing a normative document or leaving a deleted link refuses convergence", () => {
  const files = currentTree();
  files.delete("docs/SECURITY.md");
  files.set("README.md", "[Policy](docs/removed.md)");
  assert.ok(convergenceErrors(files).some(error => error.includes("Missing current document")));
  assert.ok(convergenceErrors(files).some(error => error.includes("Broken local link")));
});
