import type { McpHttpHandler } from "@modelcontextprotocol/server";

import { getLeanTool } from "./leanRegistry.js";

export interface OAuth2ToolSecurityScheme {
  type: "oauth2";
  scopes: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function oauthSecuritySchemesForTool(
  name: string
): OAuth2ToolSecurityScheme[] | undefined {
  let tool;
  try {
    tool = getLeanTool(name);
  } catch {
    return undefined;
  }

  return [
    {
      type: "oauth2",
      scopes: tool.capability ? [tool.capability] : []
    }
  ];
}

export function actionScopeRequirementsForTool(
  name: string
): Record<string, string[]> | undefined {
  if (name !== "grist_add_structure") return undefined;
  return {
    copy_document_as_template: ["doc.schema:write", "doc:read"]
  };
}

export function addRootOAuthSecuritySchemesToToolList(
  value: unknown
): { value: unknown; changed: boolean } {
  if (!isRecord(value) || !isRecord(value.result) || !Array.isArray(value.result.tools)) {
    return { value, changed: false };
  }

  let changed = false;
  const tools = value.result.tools.map((tool) => {
    if (!isRecord(tool) || typeof tool.name !== "string") return tool;

    const securitySchemes = oauthSecuritySchemesForTool(tool.name);
    if (!securitySchemes) return tool;

    changed = true;
    const meta = isRecord(tool._meta) ? tool._meta : {};
    const actionScopeRequirements = actionScopeRequirementsForTool(tool.name);
    return {
      ...tool,
      securitySchemes,
      _meta: {
        ...meta,
        securitySchemes,
        ...(actionScopeRequirements
          ? { "gia/actionScopeRequirements": actionScopeRequirements }
          : {})
      }
    };
  });

  if (!changed) return { value, changed: false };

  return {
    changed: true,
    value: {
      ...value,
      result: {
        ...value.result,
        tools
      }
    }
  };
}

export function installOAuthToolSecuritySchemes(
  handler: McpHttpHandler
): McpHttpHandler {
  const originalFetch = handler.fetch;

  handler.fetch = async (request, options) => {
    const response = await originalFetch(request, options);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) return response;

    let body: unknown;
    try {
      body = await response.clone().json();
    } catch {
      return response;
    }

    const transformed = addRootOAuthSecuritySchemesToToolList(body);
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
