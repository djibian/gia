import assert from "node:assert/strict";
import test from "node:test";
import { linkKeyVisibilityStatus } from "../tools/grist-linkkey-web-acceptance.js";

test("missing or wrong LinkKey requires confirmed visibility of neither restricted row", () => {
  assert.equal(linkKeyVisibilityStatus("none"), "UNKNOWN");
  assert.equal(linkKeyVisibilityStatus("none", "none"), "PASS");
  assert.equal(linkKeyVisibilityStatus("none", "alpha"), "FAIL");
  assert.equal(linkKeyVisibilityStatus("none", "both"), "FAIL");
});

test("each matching LinkKey requires exactly its own visible restricted row", () => {
  assert.equal(linkKeyVisibilityStatus("alpha", "alpha"), "PASS");
  assert.equal(linkKeyVisibilityStatus("beta", "beta"), "PASS");
  assert.equal(linkKeyVisibilityStatus("alpha", "none"), "FAIL");
  assert.equal(linkKeyVisibilityStatus("beta", "alpha"), "FAIL");
  assert.equal(linkKeyVisibilityStatus("beta", "both"), "FAIL");
});
