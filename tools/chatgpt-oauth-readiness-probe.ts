import { isDeepStrictEqual } from "node:util";
import { LEAN_TOOL_REGISTRY } from "../src/mcp/leanRegistry.js";
import { oauthSecuritySchemesForTool } from "../src/mcp/oauthToolSecurity.js";

const PROTOCOL_VERSION = "2026-07-28";
const REQUIRED_SCOPES = ["doc:read", "doc:write", "doc.schema:write"] as const;
const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";
const CHATGPT_STABLE_CIMD_URL = "https://chatgpt.com/oauth/client.json";

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

function requestMeta(): JsonObject {
  return {
    "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
    "io.modelcontextprotocol/clientInfo": {
      name: "gia-oauth-v2-readiness-probe",
      version: "2.0.0"
    },
    "io.modelcontextprotocol/clientCapabilities": {}
  };
}

async function postMcp(options: {
  resourceUri: string;
  bearer?: string;
  method: string;
  params?: JsonObject;
}): Promise<{ status: number; wwwAuthenticate: string; body: unknown }> {
  const headers: Record<string, string> = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "MCP-Protocol-Version": PROTOCOL_VERSION,
    "Mcp-Method": options.method
  };
  if (options.bearer) headers.authorization = `Bearer ${options.bearer}`;

  let response: Response;
  try {
    response = await fetch(options.resourceUri, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: options.method,
        params: {
          ...(options.params ?? {}),
          _meta: requestMeta()
        }
      }),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    throw new Error("mcp_request_failed");
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  return {
    status: response.status,
    wwwAuthenticate: response.headers.get("www-authenticate") ?? "",
    body
  };
}

function inspectToolSecurity(body: unknown): {
  toolsListAccepted: boolean;
  exactLeanToolSet: boolean;
  rootSecuritySchemesMatch: boolean;
  compatibilityMirrorMatches: boolean;
} {
  if (!isObject(body) || !isObject(body.result)) {
    return {
      toolsListAccepted: false,
      exactLeanToolSet: false,
      rootSecuritySchemesMatch: false,
      compatibilityMirrorMatches: false
    };
  }

  const tools = body.result.tools;
  if (!Array.isArray(tools)) {
    return {
      toolsListAccepted: false,
      exactLeanToolSet: false,
      rootSecuritySchemesMatch: false,
      compatibilityMirrorMatches: false
    };
  }

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
  }

  return {
    toolsListAccepted: true,
    exactLeanToolSet,
    rootSecuritySchemesMatch,
    compatibilityMirrorMatches
  };
}

async function run(): Promise<boolean> {
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

  if (!authorizationServerPresent) return false;
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

  let authenticatedChecks = true;
  if (accessToken) {
    const toolList = await postMcp({
      resourceUri,
      bearer: accessToken,
      method: "tools/list"
    });
    const toolSecurity = inspectToolSecurity(toolList.body);
    const authenticated = toolList.status === 200 && toolSecurity.toolsListAccepted;

    printPass("Authenticated tools/list succeeds", authenticated);
    printPass("Live tools/list is exactly the ten-tool MCP v2 contract", toolSecurity.exactLeanToolSet);
    printPass("Root OAuth securitySchemes match lean tool capabilities", toolSecurity.rootSecuritySchemesMatch);
    printPass("Compatibility _meta securitySchemes mirror matches", toolSecurity.compatibilityMirrorMatches);

    authenticatedChecks =
      authenticated &&
      toolSecurity.exactLeanToolSet &&
      toolSecurity.rootSecuritySchemesMatch &&
      toolSecurity.compatibilityMirrorMatches;
  } else {
    console.log("Authenticated tools/list probe: SKIPPED (no OAUTH_ACCESS_TOKEN)");
  }

  return (
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
    challengeOk &&
    authenticatedChecks
  );
}

try {
  const ok = await run();
  console.log(`ChatGPT OAuth readiness: ${ok ? "PASS" : "FAIL"}`);
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  const code = error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
    ? error.message
    : "unexpected_probe_failure";
  console.log("ChatGPT OAuth readiness: FAIL");
  console.log(`Failure stage: ${code}`);
  process.exitCode = 1;
}
