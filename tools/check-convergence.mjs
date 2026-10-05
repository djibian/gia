import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const documents = new Set([
  "AGENTS.md", "README.md", "PRIVACY.md", "TERMS.md", "SUPPORT.md",
  "docs/PRODUCT_VISION.md", "docs/ARCHITECTURE.md", "docs/MCP-CONTRACT.md",
  "docs/SECURITY.md", "docs/OPERATIONS.md", "docs/DEVELOPMENT.md", "docs/ROADMAP.md",
  ".github/pull_request_template.md"
]);
const forbiddenPath = /(?:^|\/)(?:[JRMP]\d+(?=[._/-]|$)|poc|archive[s]?|history|reports?|evidence|milestones?|expert)(?:\/|[._-]|$)/i;
const historicalText = /\b(?:[JRMP]\d+(?:\.\d+)*|DONE|RETIRED)\b|\[[xX]\]|\bMCP\s+v1\b|\bgrist-chatgpt\b/i;

/** The integrated tree is a current specification, never an evidence archive. */
export function convergenceErrors(files) {
  const errors = [];
  for (const path of documents) {
    if (!files.has(path)) errors.push(`Missing current document: ${path}`);
  }
  for (const [path, content] of files) {
    if (forbiddenPath.test(path)) errors.push(`Historical artifact path: ${path}`);
    if ((path.startsWith("docs/") || /\.md$/i.test(path)) && !documents.has(path)) {
      errors.push(`Outside current document inventory: ${path}`);
    }
    if (!documents.has(path)) continue;
    if (historicalText.test(content)) errors.push(`Historical status/contract in current document: ${path}`);
    for (const match of content.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1].replace(/^<|>$/g, "").split("#", 1)[0];
      if (!target || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
      const local = posix.normalize(posix.join(posix.dirname(path), target));
      if (!files.has(local)) errors.push(`Broken local link: ${path} -> ${target}`);
    }
  }
  return errors;
}

export function checkRepository(root) {
  const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const files = new Map();
  for (const path of new Set(paths)) {
    const absolute = resolve(root, path);
    if (existsSync(absolute)) files.set(path, readFileSync(absolute, "utf8"));
  }
  return convergenceErrors(files);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(dirname(process.argv[1]), "..");
  const errors = checkRepository(root);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Repository convergence: PASS");
  }
}
