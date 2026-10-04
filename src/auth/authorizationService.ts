import {
  AccessPolicy,
  type AllowedDocument,
  type AllowedWorkspace
} from "../grist/accessPolicy.js";
import type {
  GristCapability,
  Principal,
  ResourceGrant
} from "./principal.js";

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

function documentCandidates(document: AllowedDocument["document"]): string[] {
  const values = [String(document.id)];
  if (document.urlId) values.push(document.urlId);
  return values;
}

function grantMatchesDocument(
  grant: ResourceGrant,
  allowed: AllowedDocument,
  capability: GristCapability
): boolean {
  if (!grant.capabilities.includes(capability)) return false;
  if (grant.workspaceIds.map(String).includes(String(allowed.workspace.id))) return true;
  const candidates = documentCandidates(allowed.document);
  return grant.documentIds.some((id) => candidates.includes(String(id)));
}

function grantMatchesWorkspace(
  grant: ResourceGrant,
  workspaceId: string | number,
  capability: GristCapability
): boolean {
  return (
    grant.capabilities.includes(capability) &&
    grant.workspaceIds.map(String).includes(String(workspaceId))
  );
}

function minimizeAllowedWorkspace({
  org,
  workspace
}: AllowedWorkspace): AllowedWorkspace {
  return {
    org: {
      id: org.id,
      ...(org.name !== undefined ? { name: org.name } : {}),
      ...(org.domain !== undefined ? { domain: org.domain } : {})
    },
    workspace: {
      id: workspace.id,
      ...(workspace.name !== undefined ? { name: workspace.name } : {}),
      ...(workspace.access !== undefined ? { access: workspace.access } : {})
    }
  };
}

function minimizeAllowedDocument({
  org,
  workspace,
  document
}: AllowedDocument): AllowedDocument {
  return {
    ...minimizeAllowedWorkspace({ org, workspace }),
    document: {
      id: document.id,
      ...(document.name !== undefined ? { name: document.name } : {}),
      ...(document.urlId !== undefined ? { urlId: document.urlId } : {}),
      ...(document.access !== undefined ? { access: document.access } : {})
    }
  };
}

export class AuthorizationService {
  constructor(private readonly deploymentPolicy: AccessPolicy) {}

  async listWorkspaces(
    principal: Principal,
    capability: GristCapability = "doc:read"
  ): Promise<AllowedWorkspace[]> {
    const allowed = await this.deploymentPolicy.listAllowedWorkspaces();
    return allowed
      .filter(({ workspace }) =>
        principal.grants.some((grant) =>
          grantMatchesWorkspace(grant, workspace.id, capability)
        )
      )
      .map(minimizeAllowedWorkspace);
  }

  async assertWorkspaceAllowed(
    principal: Principal,
    workspaceId: string | number,
    capability: GristCapability
  ): Promise<AllowedWorkspace> {
    const allowed = await this.deploymentPolicy.assertWorkspaceAllowed(workspaceId);
    if (
      !principal.grants.some((grant) =>
        grantMatchesWorkspace(grant, allowed.workspace.id, capability)
      )
    ) {
      throw new AuthorizationError(
        `Grist workspace "${String(workspaceId)}" is not allowed by this bridge for principal "${principal.id}" with capability ${capability}.`
      );
    }
    return minimizeAllowedWorkspace(allowed);
  }

  async listDocuments(
    principal: Principal,
    capability: GristCapability = "doc:read"
  ): Promise<AllowedDocument[]> {
    const allowed = await this.deploymentPolicy.listAllowedDocuments();
    return allowed
      .filter((document) =>
        principal.grants.some((grant) =>
          grantMatchesDocument(grant, document, capability)
        )
      )
      .map(minimizeAllowedDocument);
  }

  async assertDocumentAllowed(
    principal: Principal,
    documentIdOrUrl: string,
    capability: GristCapability
  ): Promise<string> {
    const documentId = await this.deploymentPolicy.assertDocumentAllowed(documentIdOrUrl);
    const allowed = await this.listDocuments(principal, capability);
    const match = allowed.some(({ document }) =>
      documentCandidates(document).includes(documentId)
    );

    if (!match) {
      throw new AuthorizationError(
        `Grist document "${documentId}" is not allowed by this bridge for principal "${principal.id}" with capability ${capability}.`
      );
    }
    return documentId;
  }
}
