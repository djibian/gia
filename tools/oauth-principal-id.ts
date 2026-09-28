import { pathToFileURL } from "node:url";

import { oauthPrincipalId } from "../src/auth/oauthPrincipal.js";

/**
 * Operator-only helper for deriving the opaque bridge principal mapping key.
 * Raw issuer/subject values are accepted only through protected environment
 * state and are never printed.
 */
export function runPrincipalIdTool(env: NodeJS.ProcessEnv = process.env): number {
  const issuer = env.OAUTH_ISSUER?.trim();
  const subject = env.OAUTH_SUBJECT?.trim();
  if (!issuer || !subject) {
    console.error("principal_id: FAIL");
    return 1;
  }

  try {
    console.log(`principal_id: ${oauthPrincipalId(issuer, subject)}`);
    return 0;
  } catch {
    console.error("principal_id: FAIL");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runPrincipalIdTool();
}
