import type { McpHandlerRequestOptions, McpHttpHandler } from "@modelcontextprotocol/server";

import { buildInsufficientScopeToolChallenge } from "../auth/oauthProtectedResource.js";
import type { GristCapability, Principal } from "../auth/principal.js";
import { getLeanTool } from "./leanRegistry.js";
import { actionScopeRequirementsForTool } from "./oauthToolSecurity.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requestedToolName(options: McpHandlerRequestOptions | undefined): string | undefined {
  const body = options?.parsedBody;
  if (!isRecord(body) || body.method !== "tools/call" || !isRecord(body.params)) {
    return undefined;
  }
  return typeof body.params.name === "string" ? body.params.name : undefined;
}

function requestedToolArguments(
  options: McpHandlerRequestOptions | undefined
): Record<string, unknown> | undefined {
  const body = options?.parsedBody;
  if (!isRecord(body) || body.method !== "tools/call" || !isRecord(body.params)) {
    return undefined;
  }
  return isRecord(body.params.arguments) ? body.params.arguments : undefined;
}

function requiredCapabilities(
  toolName: string,
  options: McpHandlerRequestOptions | undefined,
  documentDownloadEnabled: boolean
): GristCapability[] {
  let baseline: GristCapability | null;
  try {
    baseline = getLeanTool(toolName).capability;
  } catch {
    return [];
  }

  const action = requestedToolArguments(options)?.action;
  const actionScopes = actionScopeRequirementsForTool(toolName, documentDownloadEnabled);
  if (typeof action === "string" && actionScopes && Object.hasOwn(actionScopes, action)) {
    return actionScopes[action]!;
  }
  return baseline ? [baseline] : [];
}

function principalHasCapability(
  principal: Principal,
  capability: GristCapability
): boolean {
  return principal.grants.some((grant) => grant.capabilities.includes(capability));
}

function addChallengeToErrorResult(
  value: unknown,
  challenge: string
): { value: unknown; changed: boolean } {
  if (!isRecord(value) || !isRecord(value.result) || value.result.isError !== true) {
    return { value, changed: false };
  }

  const meta = isRecord(value.result._meta) ? value.result._meta : {};
  return {
    changed: true,
    value: {
      ...value,
      result: {
        ...value.result,
        _meta: {
          ...meta,
          "mcp/www_authenticate": [
            ...(Array.isArray(meta["mcp/www_authenticate"])
              ? meta["mcp/www_authenticate"].filter(
                  (value): value is string => typeof value === "string"
                )
              : []),
            challenge
          ]
        }
      }
    }
  };
}

export function installOAuthToolAuthChallenges(
  handler: McpHttpHandler,
  options: {
    principal: Principal;
    resourceMetadataUrl: string;
    documentDownloadEnabled?: boolean;
  }
): McpHttpHandler {
  const originalFetch = handler.fetch;

  handler.fetch = async (request, requestOptions) => {
    const toolName = requestedToolName(requestOptions);
    const required = toolName
      ? requiredCapabilities(toolName, requestOptions, options.documentDownloadEnabled === true)
      : [];
    const missingCapability = required.find(
      (capability) => !principalHasCapability(options.principal, capability)
    );

    const response = await originalFetch(request, requestOptions);
    if (!missingCapability) return response;

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) return response;

    let body: unknown;
    try {
      body = await response.clone().json();
    } catch {
      return response;
    }

    const challenge = buildInsufficientScopeToolChallenge(
      options.resourceMetadataUrl,
      missingCapability
    );
    const transformed = addChallengeToErrorResult(body, challenge);
    if (!transformed.changed) return response;

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(JSON.stringify(transformed.value), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  };

  return handler;
}
