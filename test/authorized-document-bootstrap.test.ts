import assert from "node:assert/strict";
import test from "node:test";

import type { AuditLogger } from "../src/audit/auditLogger.js";
import { AuthorizationService } from "../src/auth/authorizationService.js";
import type { Principal } from "../src/auth/principal.js";
import { AccessPolicy } from "../src/grist/accessPolicy.js";
import {
  AuthorizedGristService,
  DocumentBootstrapVerificationError
} from "../src/grist/authorizedService.js";
import type {
  GristClient,
  GristOrgSummary,
  GristWorkspaceSummary
} from "../src/grist/client.js";
import type { GristService } from "../src/grist/service.js";
import type { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";

function audit(): AuditLogger {
  return {
    nextRequestId: () => "request-bootstrap",
    record: () => {}
  } as unknown as AuditLogger;
}

function discoveryClient(
  workspaces: GristWorkspaceSummary[]
): GristClient {
  const orgs: GristOrgSummary[] = [{ id: 1, name: "Org" }];
  return {
    listOrgs: async () => orgs,
    listWorkspaces: async () => workspaces,
    normalizeDocumentId: (value: string) => value
  } as unknown as GristClient;
}

function principal(): Principal {
  return {
    id: "bootstrap-agent",
    transport: "mcp",
    grants: [
      {
        documentIds: ["source-doc"],
        workspaceIds: [],
        capabilities: ["doc:read"]
      },
      {
        documentIds: [],
        workspaceIds: ["10"],
        capabilities: ["doc:read", "doc.schema:write"]
      }
    ]
  };
}

function service(
  inner: GristService,
  authorization: AuthorizationService
): AuthorizedGristService {
  return new AuthorizedGristService(
    inner,
    authorization,
    audit(),
    principal(),
    {} as GristUiActionsAdapter
  );
}

test("creates an empty document only in an explicitly authorized destination and verifies membership", async () => {
  const workspaces: GristWorkspaceSummary[] = [
    { id: 10, name: "Destination", access: "editors", docs: [] },
    {
      id: 20,
      name: "Source",
      access: "viewers",
      docs: [{ id: "source-doc", urlId: "source-doc", name: "Source" }]
    }
  ];
  const policy = new AccessPolicy(discoveryClient(workspaces), {
    allowedDocumentIds: ["source-doc"],
    allowedWorkspaceIds: ["10"],
    cacheTtlMs: 0
  });
  const authorization = new AuthorizationService(policy);
  const inner = {
    createDocument: async (workspaceId: number, name: string) => {
      assert.equal(workspaceId, 10);
      assert.equal(name, "Fresh app");
      workspaces[0]!.docs = [
        { id: "created-doc", urlId: "created-doc", name, access: "owners" }
      ];
      return "created-doc";
    }
  } as unknown as GristService;

  const result = await service(inner, authorization).createDocument(10, "Fresh app");
  assert.deepEqual(result, {
    documentId: "created-doc",
    workspaceId: 10,
    created: true,
    bootstrap: "empty",
    destinationMembershipVerified: true,
    creatorOwnershipIsNativeGristBehavior: true
  });
});

test("template copy requires separate source read authority and destination schema authority", async () => {
  const workspaces: GristWorkspaceSummary[] = [
    { id: 10, name: "Destination", access: "editors", docs: [] },
    {
      id: 20,
      name: "Source",
      access: "viewers",
      docs: [{ id: "source-doc", urlId: "source-doc", name: "Source" }]
    }
  ];
  const policy = new AccessPolicy(discoveryClient(workspaces), {
    allowedDocumentIds: ["source-doc"],
    allowedWorkspaceIds: ["10"],
    cacheTtlMs: 0
  });
  const authorization = new AuthorizationService(policy);
  let copyCalls = 0;
  const inner = {
    copyDocumentAsTemplate: async (
      sourceDocumentId: string,
      workspaceId: number,
      name: string
    ) => {
      copyCalls += 1;
      assert.equal(sourceDocumentId, "source-doc");
      assert.equal(workspaceId, 10);
      assert.equal(name, "Template app");
      workspaces[0]!.docs = [
        { id: "template-doc", urlId: "template-doc", name, access: "owners" }
      ];
      return "template-doc";
    }
  } as unknown as GristService;

  const result = await service(inner, authorization).copyDocumentAsTemplate(
    "source-doc",
    10,
    "Template app"
  );
  assert.deepEqual(result, {
    documentId: "template-doc",
    sourceDocumentId: "source-doc",
    workspaceId: 10,
    created: true,
    bootstrap: "template_copy",
    asTemplate: true,
    destinationMembershipVerified: true,
    creatorOwnershipIsNativeGristBehavior: true,
    nativeCopyAuthorizationVerifiedByGrist: true
  });
  assert.equal(copyCalls, 1);

  const noSourceRead: Principal = {
    id: "no-source-read",
    transport: "mcp",
    grants: [
      {
        documentIds: [],
        workspaceIds: ["10"],
        capabilities: ["doc:read", "doc.schema:write"]
      }
    ]
  };
  const denied = new AuthorizedGristService(
    inner,
    authorization,
    audit(),
    noSourceRead,
    {} as GristUiActionsAdapter
  );
  await assert.rejects(
    () => denied.copyDocumentAsTemplate("source-doc", 10, "Denied copy"),
    /document "source-doc" is not allowed by this bridge/
  );
  assert.equal(copyCalls, 1);
});

test("retains a known created ID when destination membership cannot be verified", async () => {
  const workspaces: GristWorkspaceSummary[] = [
    { id: 10, name: "Destination", access: "editors", docs: [] }
  ];
  const policy = new AccessPolicy(discoveryClient(workspaces), {
    allowedDocumentIds: [],
    allowedWorkspaceIds: ["10"],
    cacheTtlMs: 0
  });
  const authorization = new AuthorizationService(policy);
  const inner = {
    createDocument: async () => "created-but-not-discovered"
  } as unknown as GristService;

  await assert.rejects(
    () => service(inner, authorization).createDocument(10, "Fresh app"),
    (error: unknown) => {
      assert.ok(error instanceof DocumentBootstrapVerificationError);
      assert.equal(error.createdDocumentId, "created-but-not-discovered");
      assert.match(error.message, /Do not retry the creation by name/);
      return true;
    }
  );
});
