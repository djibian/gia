import { readFile } from "node:fs/promises";

import type { Principal } from "../auth/principal.js";
import { GristClient } from "./client.js";

export interface GristCredentialContext {
  principal: Principal;
}

/**
 * Server-side credential boundary for upstream Grist access.
 *
 * Implementations may resolve credentials dynamically, but must never expose
 * them through model-visible tool inputs/outputs, logs or audit payloads.
 */
export interface GristCredentialProvider {
  getApiKey(context: GristCredentialContext): Promise<string>;
}

/**
 * Development/backward-compatible provider preserving the controlled
 * single-key deployment while the rest of the runtime depends only on the
 * provider seam.
 */
export class StaticApiKeyCredentialProvider implements GristCredentialProvider {
  constructor(private readonly apiKey: string) {
    if (!apiKey.trim()) {
      throw new Error("Static Grist API key must not be empty.");
    }
  }

  async getApiKey(_context: GristCredentialContext): Promise<string> {
    return this.apiKey;
  }
}

export type PrincipalCredentialMappingErrorCode =
  | "mapping_unavailable"
  | "invalid_mapping"
  | "missing_principal";

export class PrincipalCredentialMappingError extends Error {
  constructor(readonly code: PrincipalCredentialMappingErrorCode) {
    super(`Grist principal credential mapping error: ${code}.`);
    this.name = "PrincipalCredentialMappingError";
  }
}

interface PrincipalCredentialMappingDocument {
  version: 1;
  principals: Record<string, string>;
}

const OAUTH_PRINCIPAL_ID = /^oauth:[A-Za-z0-9_-]{43}$/;
const MAX_MAPPING_BYTES = 1024 * 1024;
const MAX_API_KEY_LENGTH = 4096;

function parsePrincipalCredentialMapping(
  text: string
): PrincipalCredentialMappingDocument {
  if (Buffer.byteLength(text, "utf8") > MAX_MAPPING_BYTES) {
    throw new PrincipalCredentialMappingError("invalid_mapping");
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new PrincipalCredentialMappingError("invalid_mapping");
  }

  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("version" in value) ||
    value.version !== 1 ||
    !("principals" in value) ||
    value.principals === null ||
    typeof value.principals !== "object" ||
    Array.isArray(value.principals)
  ) {
    throw new PrincipalCredentialMappingError("invalid_mapping");
  }

  const principals = value.principals as Record<string, unknown>;
  const entries = Object.entries(principals);
  if (entries.length === 0) {
    throw new PrincipalCredentialMappingError("invalid_mapping");
  }

  const normalized: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (const [principalId, apiKey] of entries) {
    if (
      !OAUTH_PRINCIPAL_ID.test(principalId) ||
      typeof apiKey !== "string" ||
      apiKey.length === 0 ||
      apiKey.length > MAX_API_KEY_LENGTH ||
      apiKey.trim() !== apiKey
    ) {
      throw new PrincipalCredentialMappingError("invalid_mapping");
    }
    normalized[principalId] = apiKey;
  }

  return { version: 1, principals: normalized };
}

/**
 * Production multi-principal provider.
 *
 * The mapping is read exactly once at startup from operator-mounted deployment
 * state. The bridge never writes or hot-reloads it; rotation is an operator
 * action followed by a controlled restart.
 */
export class FilePrincipalApiKeyCredentialProvider
  implements GristCredentialProvider
{
  private constructor(
    private readonly apiKeysByPrincipal: ReadonlyMap<string, string>
  ) {}

  static async fromFile(
    mappingFile: string
  ): Promise<FilePrincipalApiKeyCredentialProvider> {
    let text: string;
    try {
      text = await readFile(mappingFile, "utf8");
    } catch {
      throw new PrincipalCredentialMappingError("mapping_unavailable");
    }

    const mapping = parsePrincipalCredentialMapping(text);
    return new FilePrincipalApiKeyCredentialProvider(
      new Map(Object.entries(mapping.principals))
    );
  }

  async getApiKey(context: GristCredentialContext): Promise<string> {
    const apiKey = this.apiKeysByPrincipal.get(context.principal.id);
    if (!apiKey) {
      throw new PrincipalCredentialMappingError("missing_principal");
    }
    return apiKey;
  }
}

/**
 * Credential-aware client construction seam. Principal-aware providers can
 * resolve a different credential per principal without changing GristClient or
 * the business services that consume it.
 */
export class GristClientFactory {
  constructor(
    private readonly baseUrl: string,
    private readonly credentialProvider: GristCredentialProvider
  ) {}

  async createClient(context: GristCredentialContext): Promise<GristClient> {
    const apiKey = await this.credentialProvider.getApiKey(context);
    if (!apiKey.trim()) {
      throw new Error("Grist credential provider returned an empty API key.");
    }

    return new GristClient({
      baseUrl: this.baseUrl,
      apiKey
    });
  }
}
