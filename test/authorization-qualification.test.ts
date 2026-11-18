import assert from "node:assert/strict";
import test from "node:test";
import {
  disposableGristFromInspection,
  mutationObservation,
  openDisposableGrist,
  qualificationStatus
} from "../tools/authorization-qualification.js";

const validContainer = [
  '"gristlabs/grist-oss:1.7.20"', "true", "true", "test-login", "[]", "default",
  '[{"HostIp":"127.0.0.1","HostPort":"8484"}]'
];

test("native qualification requires labeled, running, unmounted local Grist with test login", async () => {
  const read = (contents: string[], version = "1.7.20") =>
    disposableGristFromInspection(contents.join("\n"), version);
  assert.deepEqual(read(validContainer), { baseUrl: "http://127.0.0.1:8484", version: "1.7.20" });
  const invalid = new Map<number, string>([
    [0, '"gristlabs/grist-oss:latest"'], [1, "false"], [2, "false"],
    [3, "disabled"], [4, '[{"Type":"bind"}]'], [5, "host"],
    [6, '[{"HostIp":"0.0.0.0","HostPort":"8484"}]']
  ]);
  for (const [index, value] of invalid) {
    const fields = [...validContainer];
    fields[index] = value;
    assert.throws(() => read(fields), /disposable_grist/);
  }
  assert.throws(() => read(validContainer, "1.7.21"), /disposable_grist/);
  await assert.rejects(() => openDisposableGrist("https://grist.example.invalid", "1.7.20"), /disposable_grist/);
});

test("only operation-specific native ACL denial with unchanged state qualifies as deny", () => {
  assert.equal(qualificationStatus("deny",
    mutationObservation("update", 403, "Blocked by row update access rules", false, true)), "PASS");
  assert.equal(qualificationStatus("deny",
    mutationObservation("delete", 403, "Blocked by row update access rules", false, true)), "UNKNOWN");
  assert.equal(qualificationStatus("deny",
    mutationObservation("update", 403, "Document access denied", false, true)), "UNKNOWN");
  assert.equal(qualificationStatus("deny", mutationObservation("update", 500, "error", false, true)), "UNKNOWN");
  assert.equal(qualificationStatus("deny", mutationObservation("create", 201, undefined, true, false)), "FAIL");
  assert.equal(qualificationStatus("deny",
    mutationObservation("delete", 403, "Blocked by row delete access rules", false, false)), "FAIL");
  assert.equal(qualificationStatus("allow", mutationObservation("create", 201, undefined, false, true)), "FAIL");
  assert.equal(qualificationStatus("allow", mutationObservation("delete", 200, undefined, true, false)), "PASS");
});
