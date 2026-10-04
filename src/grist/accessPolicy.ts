import {
  type GristClient,
  type GristDocumentSummary,
  type GristOrgSummary,
  type GristWorkspaceSummary
} from "./client.js";

export interface AllowedWorkspace {
  org: GristOrgSummary;
  workspace: GristWorkspaceSummary;
}

export interface AllowedDocument extends AllowedWorkspace {
  document: GristDocumentSummary;
}

export interface DeploymentResourcePolicyOptions {
  allowedDocumentIds: readonly string[];
  allowedWorkspaceIds: readonly string[];
}

export interface ResourceDiscoveryOptions {
  cacheTtlMs?: number;
}

export interface AccessPolicyOptions extends DeploymentResourcePolicyOptions {
  cacheTtlMs?: number;
}

function documentCandidates(document: GristDocumentSummary): string[] {
  const values = [String(document.id)];
  if (document.urlId) values.push(document.urlId);
  return values;
}

/**
 * Static deployment ceiling. It contains no Grist client, credential-derived
 * state or discovery cache and is therefore safe to share between principals.
 */
export class DeploymentResourcePolicy {
  private readonly allowedDocumentIds: ReadonlySet<string>;
  private readonly allowedWorkspaceIds: ReadonlySet<string>;

  constructor(options: DeploymentResourcePolicyOptions) {
    this.allowedDocumentIds = new Set(options.allowedDocumentIds.map(String));
    this.allowedWorkspaceIds = new Set(options.allowedWorkspaceIds.map(String));

    if (this.allowedDocumentIds.size === 0 && this.allowedWorkspaceIds.size === 0) {
      throw new Error("At least one document or workspace must be allowed.");
    }
  }

  allowsDocumentId(documentId: string): boolean {
    return this.allowedDocumentIds.has(String(documentId));
  }

  allowsWorkspaceId(workspaceId: string | number): boolean {
    return this.allowedWorkspaceIds.has(String(workspaceId));
  }

  allowsDiscoveredDocument(
    workspace: GristWorkspaceSummary,
    document: GristDocumentSummary
  ): boolean {
    if (this.allowsWorkspaceId(workspace.id)) return true;
    return documentCandidates(document).some((id) => this.allowedDocumentIds.has(id));
  }
}

/**
 * Credential-derived Grist discovery state. Instances must belong to exactly
 * one principal/client context; they are never shared across principals.
 */
export class GristResourceDiscovery {
  private readonly cacheTtlMs: number;
  private cachedWorkspaces: AllowedWorkspace[] | null = null;
  private cacheExpiresAt = 0;

  constructor(
    private readonly client: GristClient,
    options: ResourceDiscoveryOptions = {}
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? 60_000;
  }

  async listWorkspaces(): Promise<AllowedWorkspace[]> {
    const now = Date.now();
    if (this.cachedWorkspaces && now < this.cacheExpiresAt) {
      return this.cachedWorkspaces;
    }

    const orgs = await this.client.listOrgs();
    const discovered: AllowedWorkspace[] = [];
    for (const org of orgs) {
      const workspaces = await this.client.listWorkspaces(org.id);
      for (const workspace of workspaces) {
        discovered.push({ org, workspace });
      }
    }

    this.cachedWorkspaces = discovered;
    this.cacheExpiresAt = now + this.cacheTtlMs;
    return discovered;
  }

  async listDocuments(): Promise<AllowedDocument[]> {
    const workspaces = await this.listWorkspaces();
    const discovered: AllowedDocument[] = [];
    for (const { org, workspace } of workspaces) {
      for (const document of workspace.docs ?? []) {
        discovered.push({ org, workspace, document });
      }
    }
    return discovered;
  }

  invalidate(): void {
    this.cachedWorkspaces = null;
    this.cacheExpiresAt = 0;
  }
}

export class AccessPolicy {
  private readonly deploymentPolicy: DeploymentResourcePolicy;
  private readonly discovery: GristResourceDiscovery;

  constructor(client: GristClient, options: AccessPolicyOptions);
  constructor(
    client: GristClient,
    deploymentPolicy: DeploymentResourcePolicy,
    discovery?: GristResourceDiscovery
  );
  constructor(
    private readonly client: GristClient,
    optionsOrPolicy: AccessPolicyOptions | DeploymentResourcePolicy,
    discovery?: GristResourceDiscovery
  ) {
    if (optionsOrPolicy instanceof DeploymentResourcePolicy) {
      this.deploymentPolicy = optionsOrPolicy;
      this.discovery = discovery ?? new GristResourceDiscovery(client);
      return;
    }

    this.deploymentPolicy = new DeploymentResourcePolicy(optionsOrPolicy);
    this.discovery =
      discovery ??
      new GristResourceDiscovery(client, {
        ...(optionsOrPolicy.cacheTtlMs !== undefined
          ? { cacheTtlMs: optionsOrPolicy.cacheTtlMs }
          : {})
      });
  }

  async listAllowedWorkspaces(): Promise<AllowedWorkspace[]> {
    const all = await this.discovery.listWorkspaces();
    return all.filter(({ workspace }) =>
      this.deploymentPolicy.allowsWorkspaceId(workspace.id)
    );
  }

  async assertWorkspaceAllowed(
    workspaceId: string | number
  ): Promise<AllowedWorkspace> {
    const normalized = String(workspaceId);
    if (!this.deploymentPolicy.allowsWorkspaceId(normalized)) {
      throw new Error(
        `Grist workspace "${normalized}" is not allowed by this bridge.`
      );
    }

    const allowed = await this.listAllowedWorkspaces();
    const match = allowed.find(
      ({ workspace }) => String(workspace.id) === normalized
    );
    if (!match) {
      throw new Error(
        `Grist workspace "${normalized}" is not available to the selected upstream credential.`
      );
    }
    return match;
  }

  async listAllowedDocuments(): Promise<AllowedDocument[]> {
    const all = await this.discovery.listDocuments();
    return all.filter(({ workspace, document }) =>
      this.deploymentPolicy.allowsDiscoveredDocument(workspace, document)
    );
  }

  async assertDocumentAllowed(documentIdOrUrl: string): Promise<string> {
    const documentId = this.client.normalizeDocumentId(documentIdOrUrl);
    if (this.deploymentPolicy.allowsDocumentId(documentId)) return documentId;

    const allowed = await this.listAllowedDocuments();
    const match = allowed.some(({ document }) =>
      documentCandidates(document).includes(documentId)
    );

    if (!match) {
      throw new Error(
        `Grist document "${documentId}" is not allowed by this bridge.`
      );
    }
    return documentId;
  }

  invalidate(): void {
    this.discovery.invalidate();
  }
}
