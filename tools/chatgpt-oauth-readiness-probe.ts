import { isDeepStrictEqual } from "node:util";
import { LEAN_TOOL_REGISTRY, leanToolHelp } from "../src/mcp/leanRegistry.js";
import type { LeanToolLimits } from "../src/mcp/leanTools.js";
import { actionScopeRequirementsForTool, oauthSecuritySchemesForTool } from "../src/mcp/oauthToolSecurity.js";
import { VERSION } from "../src/version.js";
import { jsonObject, makeReadinessRequest, qualifyReadinessSchemas, READINESS_PROTOCOL_VERSION } from "./mcp-readiness-schema.js";

const REQUIRED_SCOPES = ["doc:read", "doc:write", "doc.schema:write"] as const;
const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";
const CHATGPT_STABLE_CIMD_URL = "https://chatgpt.com/oauth/client.json";
const PREVIOUS_PROTOCOLS = ["2025-03-26", "2025-06-18", "2025-11-25"];
const SELECTED_GUIDES = ["grist_inspect", "grist_change_structure"];

type JsonObject = Record<string, unknown>;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function printPass(label: string, value: boolean): void {
  console.log(`${label}: ${value ? "PASS" : "FAIL"}`);
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && !url.href.includes("#");
  } catch {
    return false;
  }
}

async function fetchJson(url: string, failureCode: string): Promise<JsonObject> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error(failureCode);
  }
  if (!response.ok) throw new Error(failureCode);
  try {
    const body: unknown = await response.json();
    if (!isObject(body)) throw new Error(failureCode);
    return body;
  } catch {
    throw new Error(failureCode);
  }
}

function discoveryCandidates(issuer: string): string[] {
  const base = issuer.endsWith("/") ? issuer : `${issuer}/`;
  return [
    new URL(".well-known/openid-configuration", base).toString(),
    new URL(".well-known/oauth-authorization-server", base).toString()
  ];
}

async function fetchAuthorizationMetadata(issuer: string): Promise<JsonObject> {
  for (const candidate of discoveryCandidates(issuer)) {
    try {
      const body = await fetchJson(candidate, "authorization_metadata_fetch_failed");
      if (body.issuer === issuer) return body;
    } catch {}
  }
  throw new Error("authorization_metadata_fetch_failed");
}

async function postMcp(options: Parameters<typeof makeReadinessRequest>[0]) {
  let response: Response;
  try {
    response = await fetch(makeReadinessRequest(options));
  } catch {
    throw new Error("mcp_request_failed");
  }

  const contentType = response.headers.get("content-type") ?? "";
  let body: unknown;
  try {
    if (contentType.toLowerCase().includes("application/json")) body = await response.json();
  } catch {
    body = undefined;
  }

  return {
    status: response.status,
    wwwAuthenticate: response.headers.get("www-authenticate") ?? "",
    envelope: jsonObject(body)
  };
}

function inspectToolSecurity(tools: unknown[]) {
  const byName = new Map<string, JsonObject>();
  for (const tool of tools) {
    if (isObject(tool) && typeof tool.name === "string") byName.set(tool.name, tool);
  }

  const expectedNames = LEAN_TOOL_REGISTRY.map((tool) => tool.name).sort();
  const actualNames = [...byName.keys()].sort();
  const exactLeanToolSet = tools.length === expectedNames.length &&
    byName.size === tools.length && isDeepStrictEqual(actualNames, expectedNames);
  let rootSecuritySchemesMatch = exactLeanToolSet;
  let compatibilityMirrorMatches = exactLeanToolSet;
  let actionScopeRequirementsMatch = exactLeanToolSet;

  for (const definition of LEAN_TOOL_REGISTRY) {
    const tool = byName.get(definition.name);
    const expected = oauthSecuritySchemesForTool(definition.name);
    if (!tool || !expected || !isDeepStrictEqual(tool.securitySchemes, expected)) {
      rootSecuritySchemesMatch = false;
    }

    const meta = tool && isObject(tool._meta) ? tool._meta : undefined;
    if (!meta || !expected || !isDeepStrictEqual(meta.securitySchemes, expected)) {
      compatibilityMirrorMatches = false;
    }
    if (!isDeepStrictEqual(meta?.["gia/actionScopeRequirements"], actionScopeRequirementsForTool(definition.name))) {
      actionScopeRequirementsMatch = false;
    }
  }

  return {
    exactLeanToolSet,
    rootSecuritySchemesMatch,
    compatibilityMirrorMatches,
    actionScopeRequirementsMatch
  };
}

function rpcResult(response: Awaited<ReturnType<typeof postMcp>>): JsonObject | undefined {
  const envelope = response.envelope;
  return response.status === 200 && envelope?.jsonrpc === "2.0" && envelope.id === 1 &&
    envelope.error === undefined ? jsonObject(envelope.result) : undefined;
}

function rpcError(response: Awaited<ReturnType<typeof postMcp>>): JsonObject | undefined {
  const envelope = response.envelope;
  return envelope?.jsonrpc === "2.0" && envelope.id === 1 && envelope.result === undefined
    ? jsonObject(envelope.error) : undefined;
}

function selectedHelpIsCurrent(result: JsonObject | undefined, limits: LeanToolLimits): boolean {
  if (result?.isError === true || !Array.isArray(result?.content) || result.content.length !== 1) return false;
  const content = jsonObject(result.content[0]);
  if (content?.type !== "text" || typeof content.text !== "string") return false;
  try {
    return isDeepStrictEqual(JSON.parse(content.text), leanToolHelp(SELECTED_GUIDES, limits));
  } catch {
    return false;
  }
}

async function qualifyAuthenticated(resourceUri: string, bearer: string): Promise<boolean> {
  const endpoint = { resourceUri, bearer };
  const discover = rpcResult(await postMcp({ ...endpoint, method: "server/discover" }));
  const supportsCurrent = isDeepStrictEqual(discover?.supportedVersions, [READINESS_PROTOCOL_VERSION]);
  const server = jsonObject(jsonObject(discover?._meta)?.["io.modelcontextprotocol/serverInfo"]);
  const serverIdentity = server?.name === "gia" && server.version === VERSION;
  const unsupported: boolean[] = [];
  for (const protocol of PREVIOUS_PROTOCOLS) {
    const response = await postMcp({ ...endpoint, method: "server/discover", protocol });
    const error = rpcError(response);
    const data = jsonObject(error?.data);
    unsupported.push(response.status === 400 && error?.code === -32022 && data?.requested === protocol &&
      isDeepStrictEqual(data.supported, [READINESS_PROTOCOL_VERSION]));
  }
  const legacy = await postMcp({ ...endpoint, method: "initialize" });
  const transportOk = supportsCurrent && unsupported.every(Boolean) &&
    legacy.status === 404 && rpcError(legacy)?.code === -32601;
  printPass("MCP transport supports 2026-07-28 and refuses tested legacy variants", transportOk);
  printPass("Gia server name and release version match this checkout", serverIdentity);

  const result = rpcResult(await postMcp({ ...endpoint, method: "tools/list" }));
  const tools = Array.isArray(result?.tools) ? result.tools : [];
  const security = inspectToolSecurity(tools);
  const limits = security.exactLeanToolSet ? await qualifyReadinessSchemas(tools) : undefined;
  const help = limits !== undefined && selectedHelpIsCurrent(rpcResult(await postMcp({
    ...endpoint, method: "tools/call", toolName: "grist_help",
    params: { name: "grist_help", arguments: { tools: SELECTED_GUIDES } }
  })), limits);
  printPass("Authenticated tools/list succeeds", Array.isArray(result?.tools));
  printPass("Live tools/list is exactly the ten-tool MCP v2 contract", security.exactLeanToolSet);
  printPass("Root OAuth securitySchemes match lean tool capabilities", security.rootSecuritySchemesMatch);
  printPass("Compatibility _meta securitySchemes mirror matches", security.compatibilityMirrorMatches);
  printPass("Template action declares additional source read scope", security.actionScopeRequirementsMatch);
  printPass("Live input schemas match current Gia wire shapes and configured limits", limits !== undefined);
  printPass("Selected help exposes the current MCP contract and guides", help);
  const qualified = help && security.rootSecuritySchemesMatch &&
    security.compatibilityMirrorMatches && security.actionScopeRequirementsMatch;
  printPass("Authenticated schema qualification", qualified);
  return transportOk && serverIdentity && qualified;
}

async function run(): Promise<"PASS" | "FAIL" | "NOT QUALIFIED"> {
  const resourceUri = required("MCP_RESOURCE_URI");
  const accessToken = optional("OAUTH_ACCESS_TOKEN");
  const resourceUrl = new URL(resourceUri);
  if (resourceUrl.protocol !== "https:") throw new Error("resource_uri_not_https");
  if (!isHttpsUrl(resourceUri) || resourceUrl.pathname !== "/mcp" || resourceUrl.href.includes("?")) throw new Error("resource_uri_not_canonical");

  const metadataUrl = new URL(PROTECTED_RESOURCE_PATH, resourceUrl.origin).toString();
  const metadata = await fetchJson(metadataUrl, "protected_resource_metadata_fetch_failed");
  const authorizationServers = stringArray(metadata.authorization_servers) ?? [];
  const scopesSupported = stringArray(metadata.scopes_supported) ?? [];

  const resourceMatches = metadata.resource === resourceUri;
  const authorizationServerPresent = authorizationServers.length === 1 && isHttpsUrl(authorizationServers[0]);
  const scopesMatch =
    scopesSupported.length === REQUIRED_SCOPES.length &&
    REQUIRED_SCOPES.every((scope) => scopesSupported.includes(scope)) &&
    scopesSupported.every((scope) => REQUIRED_SCOPES.includes(scope as typeof REQUIRED_SCOPES[number]));

  printPass("Protected-resource metadata reachable", true);
  printPass("Protected-resource resource matches canonical MCP URI", resourceMatches);
  printPass("Authorization server advertised", authorizationServerPresent);
  printPass("Protected-resource metadata exposes exactly the fixed bridge scopes", scopesMatch);

  if (!authorizationServerPresent) {
    printPass("Public OAuth metadata and challenge", false);
    return "FAIL";
  }
  const issuer = authorizationServers[0]!;
  const authorizationMetadata = await fetchAuthorizationMetadata(issuer);
  const tokenAuthMethods = stringArray(
    authorizationMetadata.token_endpoint_auth_methods_supported
  ) ?? [];
  const pkceMethods = stringArray(authorizationMetadata.code_challenge_methods_supported) ?? [];
  const grantTypes = stringArray(authorizationMetadata.grant_types_supported) ?? [];

  const cimdAdvertised = authorizationMetadata.client_id_metadata_document_supported === true;
  const pkceS256 = pkceMethods.includes("S256");
  const authCode = grantTypes.includes("authorization_code");
  const refresh = grantTypes.includes("refresh_token");
  const issuerIdentification =
    authorizationMetadata.authorization_response_iss_parameter_supported === true;

  printPass("Authorization metadata issuer matches protected-resource issuer", authorizationMetadata.issuer === issuer);
  printPass("CIMD/dynamic-client support advertised", cimdAdvertised);
  printPass("PKCE S256 advertised", pkceS256);
  printPass("Authorization Code grant advertised", authCode);
  printPass("Refresh-token grant advertised", refresh);
  printPass("RFC 9207 issuer identification enables stable ChatGPT CIMD", issuerIdentification);

  let chatGptCimdChecks = false;
  if (issuerIdentification) {
    const chatGptCimd = await fetchJson(CHATGPT_STABLE_CIMD_URL, "chatgpt_cimd_fetch_failed");
    const clientIdMatches = chatGptCimd.client_id === CHATGPT_STABLE_CIMD_URL;
    const legacyPreferredMethod =
      typeof chatGptCimd.token_endpoint_auth_method === "string"
        ? chatGptCimd.token_endpoint_auth_method
        : undefined;
    const declaredClientMethods =
      stringArray(chatGptCimd.token_endpoint_auth_methods_supported) ?? [];
    const legacyPreferenceDeclared =
      legacyPreferredMethod === undefined || declaredClientMethods.includes(legacyPreferredMethod);
    const compatibleTokenAuthMethods = declaredClientMethods.filter((method) =>
      tokenAuthMethods.includes(method)
    );
    const tokenAuthCompatible = compatibleTokenAuthMethods.length > 0;
    const redirectUris = stringArray(chatGptCimd.redirect_uris) ?? [];
    const redirectsUsable = redirectUris.length > 0 && redirectUris.every(isHttpsUrl);
    const privateKeyJwtJwksUsable =
      !compatibleTokenAuthMethods.includes("private_key_jwt") || isHttpsUrl(chatGptCimd.jwks_uri);

    printPass("Stable ChatGPT CIMD reachable", true);
    printPass("Stable ChatGPT CIMD client_id matches document URL", clientIdMatches);
    printPass("ChatGPT legacy token-auth preference is declared by its supported-method array", legacyPreferenceDeclared);
    printPass("Authorization server supports at least one ChatGPT CIMD token authentication method", tokenAuthCompatible);
    printPass("ChatGPT CIMD redirect URIs are HTTPS", redirectsUsable);
    printPass("ChatGPT private_key_jwt JWKS metadata is usable when applicable", privateKeyJwtJwksUsable);

    chatGptCimdChecks =
      clientIdMatches &&
      legacyPreferenceDeclared &&
      tokenAuthCompatible &&
      redirectsUsable &&
      privateKeyJwtJwksUsable;
  } else {
    console.log("Stable ChatGPT CIMD probe: SKIPPED (RFC 9207 issuer identification unavailable)");
  }

  const unauthenticated = await postMcp({
    resourceUri,
    method: "server/discover"
  });
  const challengeOk =
    unauthenticated.status === 401 &&
    unauthenticated.wwwAuthenticate.includes(`resource_metadata="${metadataUrl}"`);
  printPass("Unauthenticated /mcp challenge advertises resource metadata", challengeOk);

  const publicChecks = (
    resourceMatches &&
    authorizationServerPresent &&
    scopesMatch &&
    authorizationMetadata.issuer === issuer &&
    cimdAdvertised &&
    pkceS256 &&
    authCode &&
    refresh &&
    issuerIdentification &&
    chatGptCimdChecks &&
    challengeOk
  );
  printPass("Public OAuth metadata and challenge", publicChecks);
  if (!accessToken) {
    console.log("MCP transport compatibility: SKIPPED (no OAUTH_ACCESS_TOKEN)");
    console.log("Authenticated schema qualification: SKIPPED (no OAUTH_ACCESS_TOKEN)");
    return publicChecks ? "NOT QUALIFIED" : "FAIL";
  }
  return await qualifyAuthenticated(resourceUri, accessToken) && publicChecks ? "PASS" : "FAIL";
}

console.log("Running build revision: NOT QUALIFIED (requires trusted deployment evidence)");
console.log("Principal isolation and client catalog refresh: NOT QUALIFIED (outside this probe)");
try {
  const result = await run();
  console.log(`ChatGPT OAuth readiness: ${result}`);
  process.exitCode = result === "FAIL" ? 1 : 0;
} catch (error) {
  const code = error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
    ? error.message
    : "unexpected_probe_failure";
  console.log("ChatGPT OAuth readiness: FAIL");
  console.log(`Failure stage: ${code}`);
  process.exitCode = 1;
}
