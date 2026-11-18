import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SHA = /^[a-f0-9]{40}$/i;
const mandatoryReview = path =>
  path === "AGENTS.md" || path === "docs/ROADMAP.md" ||
  path === "docs/DEVELOPMENT.md" || path === ".github/pull_request_template.md" ||
  path === "test/pr-integration-gate.test.mjs" ||
  path === "docs/PRODUCT_VISION.md" || path === "docs/MCP-CONTRACT.md" ||
  path === "docs/SECURITY.md" || path.startsWith("src/") ||
  path.startsWith("tools/") || path.startsWith(".github/workflows/") ||
  (path.startsWith("test/") && /(?:acl|access|oauth|auth|security|linkkey|compatibility|preservation|policy)/i.test(path));

const nativeCompatibility = path => path.startsWith("src/") ||
  path.startsWith("test/") || path === "docs/MCP-CONTRACT.md" ||
  path === "docs/SECURITY.md" || path.startsWith("package") ||
  path.startsWith("tsconfig") ||
  ["tools/grist-compatibility.ts", "tools/grist-linkkey-web-acceptance.ts",
    "tools/authorization-qualification.ts", "tools/authorization-lock-qualification.ts",
    "tools/grist-harness.ts", "tools/application-fixtures.ts",
    ".github/workflows/grist-compatibility.yml"].includes(path);

const nativeApplications = path => path.startsWith("src/") ||
  path.startsWith("test/") || path === "docs/SECURITY.md" ||
  path === "docs/MCP-CONTRACT.md" || path.startsWith("package") ||
  path.startsWith("tsconfig") ||
  ["tools/grist-harness.ts", "tools/application-fixtures.ts",
    "tools/application-validation.ts", ".github/workflows/application-preservation.yml"].includes(path);

function reviewDeclaration(body) {
  const match = body.match(/^\s*(?:\*\*)?Review gate:\s*(REQUIRED|NOT REQUIRED)(?:\*\*)?\s*[:—–-]?\s*(.*)$/im);
  if (!match) return null;
  const reason = match[2].trim().replace(/^[\s(*]+|[\s)*]+$/g, "");
  // Unfilled template placeholders are not a substantive review justification.
  return { gate: match[1], reason: /<[^<>]+>/.test(reason) ? "" : reason };
}

function verdicts(comments, sha) {
  return comments.filter(comment => {
    const body = comment.body ?? "";
    return new RegExp("^Head:\\s*" + sha + "\\s*$", "im").test(body) &&
      /^Result:\s*(PASS|CHANGES REQUIRED)\s*$/im.test(body);
  }).map(comment => ({
    body: comment.body,
    stamp: Date.parse(comment.updated_at ?? comment.created_at ?? "") || 0,
    id: comment.id ?? 0
  })).sort((a, b) => a.stamp - b.stamp || a.id - b.id);
}

/** Read-only pre-merge evidence gate. Independence and semantic review remain Controller decisions. */
export function integrationGateErrors({ pr, comments, files, runs, baseSha, eventHeadSha }) {
  const errors = [];
  const headSha = pr?.head?.sha;
  if (!SHA.test(headSha ?? "")) return ["Missing valid PR head SHA"];
  if (pr.state !== "open" || pr.draft) errors.push("PR must be open and ready for review");
  if (headSha !== eventHeadSha) errors.push("PR head moved since this workflow started");
  if (!SHA.test(baseSha ?? "") || pr.base?.sha !== baseSha) {
    errors.push("Target branch moved or cannot be verified: rerun exact-head checks");
  }
  const body = pr.body ?? "";
  const declaration = reviewDeclaration(body);
  if (!declaration || declaration.reason.length < 5) {
    errors.push("Missing Review gate: REQUIRED/NOT REQUIRED with a substantive reason");
  }
  if (!/\bDependencies\s*:/i.test(body) || !/\b(?:net )?complexity\b/i.test(body) ||
      !/\bValidation\b/i.test(body)) {
    errors.push("PR must document dependencies, complexity and validation");
  }
  const paths = files.map(file => file.filename);
  if (declaration?.gate === "NOT REQUIRED" && paths.some(mandatoryReview)) {
    errors.push("Risk-sensitive files require independent exact-head review");
  }
  if (declaration?.gate === "REQUIRED") {
    const matching = verdicts(comments, headSha);
    const latest = matching.at(-1);
    if (!latest || !/^Result:\s*PASS\s*$/im.test(latest.body)) {
      errors.push("No current exact-head independent PASS (or later CHANGES REQUIRED overrides PASS)");
    }
  }
  for (const [needed, workflowName] of [
    [paths.some(nativeCompatibility), "Grist compatibility"],
    [paths.some(nativeApplications), "Application preservation"]
  ]) {
    if (!needed) continue;
    const candidates = runs.filter(run => run.name === workflowName && run.head_sha === headSha)
      .sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0));
    if (candidates.length === 0 || candidates[0].status !== "completed" ||
        candidates[0].conclusion !== "success") {
      errors.push(workflowName + ": latest exact-head native workflow run is not green");
    }
  }
  return errors;
}

async function githubJson(path, token) {
  const response = await fetch("https://api.github.com" + path, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: "Bearer " + token,
      "x-github-api-version": "2022-11-28"
    }, signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("GitHub API read failed: HTTP " + response.status);
  return response.json();
}

async function paged(path, token, maxPages = 10) {
  const result = [];
  for (let page = 1; page <= maxPages; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const batch = await githubJson(path + separator + "per_page=100&page=" + page, token);
    if (!Array.isArray(batch)) throw new Error("Unexpected GitHub collection format");
    result.push(...batch);
    if (batch.length < 100) return result;
  }
  throw new Error("Review evidence exceeds bounded GitHub pagination");
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") || !eventPath) {
    throw new Error("Expected GitHub pull_request workflow context and read-only GITHUB_TOKEN");
  }
  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const number = event.pull_request?.number;
  const eventHeadSha = event.pull_request?.head?.sha;
  if (!Number.isInteger(number) || !SHA.test(eventHeadSha ?? "")) {
    throw new Error("Expected pull_request event with immutable exact head");
  }
  const root = "/repos/" + repository;
  const [pr, comments, files, branch, runs] = await Promise.all([
    githubJson(root + "/pulls/" + number, token),
    paged(root + "/issues/" + number + "/comments", token),
    paged(root + "/pulls/" + number + "/files", token),
    githubJson(root + "/branches/" + encodeURIComponent(event.pull_request.base.ref), token),
    githubJson(root + "/actions/runs?head_sha=" + encodeURIComponent(eventHeadSha) + "&per_page=100", token)
  ]);
  const errors = integrationGateErrors({
    pr, comments, files, runs: runs.workflow_runs ?? [],
    baseSha: branch.commit.sha, eventHeadSha
  });
  if (errors.length) {
    for (const error of errors) console.error("Integration evidence: " + error);
    process.exitCode = 1;
  } else {
    console.log("Integration evidence: PASS for head " + eventHeadSha);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error("Integration evidence: " + error.message);
    process.exitCode = 1;
  });
}
