import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

import { AuditLogger } from "./audit/auditLogger.js";
import { OAuthAccessTokenError } from "./auth/oauthAccessToken.js";
import {
  JwksAccessTokenVerifierError,
  JwksOAuthAccessTokenVerifier
} from "./auth/jwksAccessTokenVerifier.js";
import {
  buildBearerChallenge,
  buildOAuthProtectedResourceMetadata,
  buildOAuthProtectedResourceMetadataUrl,
  OAUTH_PROTECTED_RESOURCE_METADATA_PATH
} from "./auth/oauthProtectedResource.js";
import { OAuthPrincipalError } from "./auth/oauthPrincipal.js";
import {
  createOAuthMcpRequestContext,
  OAuthRequestAuthenticationError
} from "./auth/oauthRequestContext.js";
import {
  createPrincipal,
  GRIST_CAPABILITIES,
  type Principal
} from "./auth/principal.js";
import { isAuthorizedBearerHeader } from "./auth/staticBearer.js";
import { loadConfig } from "./config.js";
import { DeploymentResourcePolicy } from "./grist/accessPolicy.js";
import type { AuthorizedGristService } from "./grist/authorizedService.js";
import { GristContextFactory } from "./grist/contextFactory.js";
import {
  FilePrincipalApiKeyCredentialProvider,
  GristClientFactory,
  StaticApiKeyCredentialProvider
} from "./grist/credentials.js";
import { registerLeanTools } from "./mcp/leanTools.js";
import { installOAuthToolAuthChallenges } from "./mcp/oauthToolChallenge.js";
import { installOAuthToolSecuritySchemes } from "./mcp/oauthToolSecurity.js";
import { VERSION } from "./version.js";

const config = loadConfig();
const credentialProvider =
  config.gristCredentials.mode === "static"
    ? new StaticApiKeyCredentialProvider(config.gristCredentials.apiKey)
    : await FilePrincipalApiKeyCredentialProvider.fromFile(
        config.gristCredentials.mappingFile
      );
const clientFactory = new GristClientFactory(
  config.gristBaseUrl,
  credentialProvider
);
const deploymentPolicy = new DeploymentResourcePolicy({
  allowedDocumentIds: config.allowedDocumentIds,
  allowedWorkspaceIds: config.allowedWorkspaceIds
});
const audit = new AuditLogger();
const contextFactory = new GristContextFactory(
  clientFactory,
  deploymentPolicy,
  audit,
  {
    maxReadRecords: config.maxReadRecords,
    maxWriteRecords: config.maxWriteRecords,
    writeBatchRecords: config.writeBatchRecords,
    maxSchemaItems: config.maxSchemaItems
  }
);

const staticMcpPrincipal =
  config.mcpAuth.mode === "static"
    ? createPrincipal({
        id: "mcp-client",
        transport: "mcp",
        documentIds: config.allowedDocumentIds,
        workspaceIds: config.allowedWorkspaceIds,
        capabilities: config.mcpCapabilities
      })
    : undefined;

// Static mode creates one controlled deployment principal. OAuth mode creates
// a fresh Principal-bound Grist context for every authenticated request.
const staticMcpGrist = staticMcpPrincipal
  ? await contextFactory.create(staticMcpPrincipal)
  : undefined;

const oauthMcpVerifier =
  config.mcpAuth.mode === "oauth"
    ? new JwksOAuthAccessTokenVerifier({ jwksUri: config.mcpAuth.jwksUri })
    : undefined;

function buildServer(grist: AuthorizedGristService): McpServer {
  const server = new McpServer({
    name: "grist-chatgpt",
    version: VERSION
  });

  registerLeanTools(server, grist, {
    maxReadRecords: config.maxReadRecords,
    maxWriteRecords: config.maxWriteRecords,
    maxSchemaItems: config.maxSchemaItems
  });
  return server;
}

function buildNodeMcpHandler(
  grist: AuthorizedGristService,
  oauth?: { principal: Principal; resourceMetadataUrl: string }
) {
  const handler = createMcpHandler(() => buildServer(grist));
  if (config.mcpAuth.mode === "oauth") {
    installOAuthToolSecuritySchemes(handler);
    if (oauth) installOAuthToolAuthChallenges(handler, oauth);
  }
  return toNodeHandler(handler);
}

const staticMcpNodeHandler = staticMcpGrist
  ? buildNodeMcpHandler(staticMcpGrist)
  : undefined;

function isOAuthAuthenticationFailure(error: unknown): boolean {
  return (
    error instanceof OAuthRequestAuthenticationError ||
    error instanceof JwksAccessTokenVerifierError ||
    error instanceof OAuthAccessTokenError ||
    error instanceof OAuthPrincipalError
  );
}

function isOAuthVerifierAvailabilityFailure(error: unknown): boolean {
  return (
    error instanceof JwksAccessTokenVerifierError &&
    (error.code === "jwks_fetch_failed" || error.code === "invalid_jwks")
  );
}

function publicBaseUrl(req: { get(name: string): string | undefined; protocol: string }): string {
  const forwarded = req.get("X-Forwarded-Proto")?.split(",")[0]?.trim();
  const protocol = forwarded === "https" || forwarded === "http" ? forwarded : req.protocol;
  return `${protocol}://${req.get("host")}`;
}

function oauthProtectedResourceMetadataUrl(req: {
  get(name: string): string | undefined;
  protocol: string;
}): string {
  return buildOAuthProtectedResourceMetadataUrl(publicBaseUrl(req));
}

const app = createMcpExpressApp({
  host: config.host,
  allowedHosts: [...config.mcpAllowedHosts]
});

app.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    service: "grist-chatgpt",
    version: VERSION
  });
});

if (config.mcpAuth.mode === "oauth") {
  const oauthAuth = config.mcpAuth;
  app.get(OAUTH_PROTECTED_RESOURCE_METADATA_PATH, (_req, res) => {
    res.json(
      buildOAuthProtectedResourceMetadata({
        resource: oauthAuth.resourceUri,
        authorizationServer: oauthAuth.issuer,
        scopes: GRIST_CAPABILITIES
      })
    );
  });
}

app.all("/mcp", async (req, res) => {
  if (config.mcpAuth.mode === "static") {
    if (
      !isAuthorizedBearerHeader(
        req.get("Authorization"),
        config.mcpAuth.bearerToken
      )
    ) {
      res.setHeader("WWW-Authenticate", "Bearer");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!staticMcpNodeHandler) {
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    void staticMcpNodeHandler(req, res, req.body);
    return;
  }

  try {
    if (!oauthMcpVerifier) {
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    const { context, principal } = await createOAuthMcpRequestContext({
      authorizationHeader: req.get("Authorization"),
      verifier: oauthMcpVerifier,
      policy: {
        issuer: config.mcpAuth.issuer,
        audience: config.mcpAuth.resourceUri
      },
      grant: {
        documentIds: config.allowedDocumentIds,
        workspaceIds: config.allowedWorkspaceIds
      },
      contextFactory
    });

    const oauthNodeHandler = buildNodeMcpHandler(context, {
      principal,
      resourceMetadataUrl: oauthProtectedResourceMetadataUrl(req)
    });
    void oauthNodeHandler(req, res, req.body);
  } catch (error) {
    if (isOAuthVerifierAvailabilityFailure(error)) {
      res.status(503).json({ error: "Authorization service unavailable" });
      return;
    }

    if (isOAuthAuthenticationFailure(error)) {
      const missingBearer =
        error instanceof OAuthRequestAuthenticationError &&
        error.code === "missing_bearer";
      const resourceMetadataUrl = oauthProtectedResourceMetadataUrl(req);
      res.setHeader(
        "WWW-Authenticate",
        missingBearer
          ? buildBearerChallenge(resourceMetadataUrl)
          : buildBearerChallenge(resourceMetadataUrl, "invalid_token")
      );
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  }
});

const httpServer = app.listen(config.port, config.host, () => {
  console.log(
    `grist-chatgpt listening on http://${config.host}:${config.port} (MCP /mcp; auth ${config.mcpAuth.mode})`
  );
});

// Bound only the time allowed to receive inbound HTTP request data. These
// parser-level limits do not cap the duration of an MCP streaming response.
httpServer.requestTimeout = 120_000;
httpServer.headersTimeout = 60_000;
