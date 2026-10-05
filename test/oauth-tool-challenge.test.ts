import assert from "node:assert/strict";
import test from "node:test";

import type { McpHttpHandler } from "@modelcontextprotocol/server";

import { createPrincipal } from "../src/auth/principal.js";
import { installOAuthToolAuthChallenges } from "../src/mcp/oauthToolChallenge.js";

const METADATA_URL =
  "https://grist-chatgpt.loeildumaitre.fr/.well-known/oauth-protected-resource";

function fakeHandler(body: unknown): McpHttpHandler {
  return {
    fetch: async () =>
      Response.json(body, {
        status: 200,
        headers: { "content-length": "999", "x-preserved": "yes" }
      }),
    close: async () => {},
    notify: {} as McpHttpHandler["notify"],
    bus: {} as McpHttpHandler["bus"]
  };
}

function toolCall(name: string, args?: Record<string, unknown>) {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name,
      arguments: args ?? {
        documentId: "doc-1",
        tableId: "Table1",
        records: []
      }
    }
  };
}

test("adds mcp/www_authenticate when the OAuth principal lacks the lean tool capability", async () => {
  const principal = createPrincipal({
    id: "oauth:test",
    transport: "mcp",
    documentIds: ["doc-1"],
    workspaceIds: [],
    capabilities: ["doc:read"]
  });
  const handler = installOAuthToolAuthChallenges(
    fakeHandler({
      jsonrpc: "2.0",
      id: 1,
      result: {
        isError: true,
        content: [{ type: "text", text: "write denied" }],
        _meta: { existing: "keep-me" }
      }
    }),
    { principal, resourceMetadataUrl: METADATA_URL }
  );

  const response = await handler.fetch(new Request("https://example.test/mcp"), {
    parsedBody: toolCall("grist_add_records")
  });
  const body = (await response.json()) as {
    result: { _meta: Record<string, unknown> };
  };

  assert.equal(response.headers.get("content-length"), null);
  assert.equal(response.headers.get("x-preserved"), "yes");
  assert.equal(body.result._meta.existing, "keep-me");
  assert.deepEqual(body.result._meta["mcp/www_authenticate"], [
    `Bearer resource_metadata="${METADATA_URL}", error="insufficient_scope", error_description="Additional authorization is required for scope doc:write.", scope="doc:write"`
  ]);
});

test("adds schema-write step-up for destructive lean UI tools", async () => {
  const principal = createPrincipal({
    id: "oauth:test",
    transport: "mcp",
    documentIds: ["doc-1"],
    workspaceIds: [],
    capabilities: ["doc:read", "doc:write"]
  });
  const handler = installOAuthToolAuthChallenges(
    fakeHandler({
      jsonrpc: "2.0",
      id: 1,
      result: {
        isError: true,
        content: [{ type: "text", text: "schema denied" }]
      }
    }),
    { principal, resourceMetadataUrl: METADATA_URL }
  );

  const response = await handler.fetch(new Request("https://example.test/mcp"), {
    parsedBody: toolCall("grist_change_ui")
  });
  const body = (await response.json()) as {
    result: { _meta: Record<string, unknown> };
  };

  assert.deepEqual(body.result._meta["mcp/www_authenticate"], [
    `Bearer resource_metadata="${METADATA_URL}", error="insufficient_scope", error_description="Additional authorization is required for scope doc.schema:write.", scope="doc.schema:write"`
  ]);
});


test("adds doc:read step-up only for template copy when schema scope is already present", async () => {
  const principal = createPrincipal({
    id: "oauth:schema-only",
    transport: "mcp",
    documentIds: ["source-doc"],
    workspaceIds: ["7"],
    capabilities: ["doc.schema:write"]
  });
  const handler = installOAuthToolAuthChallenges(
    fakeHandler({
      jsonrpc: "2.0",
      id: 1,
      result: {
        isError: true,
        content: [{ type: "text", text: "source read denied" }]
      }
    }),
    { principal, resourceMetadataUrl: METADATA_URL }
  );

  const copyResponse = await handler.fetch(new Request("https://example.test/mcp"), {
    parsedBody: toolCall("grist_add_structure", {
      action: "copy_document_as_template",
      sourceDocumentId: "source-doc",
      workspaceId: 7,
      name: "Copy"
    })
  });
  const copyBody = (await copyResponse.json()) as {
    result: { _meta: Record<string, unknown> };
  };
  assert.deepEqual(copyBody.result._meta["mcp/www_authenticate"], [
    `Bearer resource_metadata="${METADATA_URL}", error="insufficient_scope", error_description="Additional authorization is required for scope doc:read.", scope="doc:read"`
  ]);

  const createResponse = await handler.fetch(new Request("https://example.test/mcp"), {
    parsedBody: toolCall("grist_add_structure", {
      action: "create_document",
      workspaceId: 7,
      name: "Empty"
    })
  });
  const createBody = (await createResponse.json()) as {
    result: { _meta?: Record<string, unknown> };
  };
  assert.equal(createBody.result._meta?.["mcp/www_authenticate"], undefined);
});

test("does not turn a source resource denial into a scope challenge when doc:read exists", async () => {
  const principal = createPrincipal({
    id: "oauth:both-scopes",
    transport: "mcp",
    documentIds: ["other-doc"],
    workspaceIds: ["7"],
    capabilities: ["doc:read", "doc.schema:write"]
  });
  const originalBody = {
    jsonrpc: "2.0",
    id: 1,
    result: {
      isError: true,
      content: [{ type: "text", text: "source resource denied" }]
    }
  };
  const handler = installOAuthToolAuthChallenges(fakeHandler(originalBody), {
    principal,
    resourceMetadataUrl: METADATA_URL
  });
  const response = await handler.fetch(new Request("https://example.test/mcp"), {
    parsedBody: toolCall("grist_add_structure", {
      action: "copy_document_as_template",
      sourceDocumentId: "source-doc",
      workspaceId: 7,
      name: "Copy"
    })
  });
  assert.deepEqual(await response.json(), originalBody);
});


test("adds an action-specific doc:read challenge for template copy without changing empty creation", async () => {
  const principal = createPrincipal({
    id: "oauth:test",
    transport: "mcp",
    documentIds: ["source-doc"],
    workspaceIds: [7],
    capabilities: ["doc.schema:write"]
  });
  const errorBody = {
    jsonrpc: "2.0",
    id: 1,
    result: {
      isError: true,
      content: [{ type: "text", text: "copy denied" }]
    }
  };

  const copyHandler = installOAuthToolAuthChallenges(fakeHandler(errorBody), {
    principal,
    resourceMetadataUrl: METADATA_URL
  });
  const copyResponse = await copyHandler.fetch(new Request("https://example.test/mcp"), {
    parsedBody: toolCall("grist_add_structure", {
      action: "copy_document_as_template",
      sourceDocumentId: "source-doc",
      workspaceId: 7,
      name: "Copy"
    })
  });
  const copyBody = (await copyResponse.json()) as {
    result: { _meta: Record<string, unknown> };
  };
  assert.deepEqual(copyBody.result._meta["mcp/www_authenticate"], [
    `Bearer resource_metadata="${METADATA_URL}", error="insufficient_scope", error_description="Additional authorization is required for scope doc:read.", scope="doc:read"`
  ]);

  const createHandler = installOAuthToolAuthChallenges(fakeHandler(errorBody), {
    principal,
    resourceMetadataUrl: METADATA_URL
  });
  const createResponse = await createHandler.fetch(new Request("https://example.test/mcp"), {
    parsedBody: toolCall("grist_add_structure", {
      action: "create_document",
      workspaceId: 7,
      name: "Empty"
    })
  });
  assert.deepEqual(await createResponse.json(), errorBody);
});

test("does not request OAuth step-up when the principal already has the capability", async () => {
  const principal = createPrincipal({
    id: "oauth:test",
    transport: "mcp",
    documentIds: ["doc-1"],
    workspaceIds: [],
    capabilities: ["doc:read", "doc:write"]
  });
  const originalBody = {
    jsonrpc: "2.0",
    id: 1,
    result: {
      isError: true,
      content: [{ type: "text", text: "document denied" }]
    }
  };
  const handler = installOAuthToolAuthChallenges(fakeHandler(originalBody), {
    principal,
    resourceMetadataUrl: METADATA_URL
  });

  const response = await handler.fetch(new Request("https://example.test/mcp"), {
    parsedBody: toolCall("grist_add_records")
  });
  assert.deepEqual(await response.json(), originalBody);
});

test("does not attach a challenge to a successful response even if a capability is absent", async () => {
  const principal = createPrincipal({
    id: "oauth:test",
    transport: "mcp",
    documentIds: ["doc-1"],
    workspaceIds: [],
    capabilities: ["doc:read"]
  });
  const originalBody = {
    jsonrpc: "2.0",
    id: 1,
    result: {
      content: [{ type: "text", text: "success" }]
    }
  };
  const handler = installOAuthToolAuthChallenges(fakeHandler(originalBody), {
    principal,
    resourceMetadataUrl: METADATA_URL
  });

  const response = await handler.fetch(new Request("https://example.test/mcp"), {
    parsedBody: toolCall("grist_add_records")
  });
  assert.deepEqual(await response.json(), originalBody);
});
