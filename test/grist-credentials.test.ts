import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createPrincipal } from "../src/auth/principal.js";
import {
  FilePrincipalApiKeyCredentialProvider,
  GristClientFactory,
  PrincipalCredentialMappingError,
  StaticApiKeyCredentialProvider,
  type GristCredentialContext,
  type GristCredentialProvider
} from "../src/grist/credentials.js";

const principal = createPrincipal({
  id: "test-principal",
  transport: "mcp",
  documentIds: ["doc-1"],
  workspaceIds: [],
  capabilities: ["doc:read"]
});

const oauthPrincipalA = createPrincipal({
  id: "oauth:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  transport: "mcp",
  documentIds: ["doc-1"],
  workspaceIds: [],
  capabilities: ["doc:read"]
});

const oauthPrincipalB = createPrincipal({
  id: "oauth:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  transport: "mcp",
  documentIds: ["doc-2"],
  workspaceIds: [],
  capabilities: ["doc:read"]
});

async function withMappingFile(
  mapping: unknown,
  fn: (path: string) => Promise<void>
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "grist-credentials-"));
  const path = join(directory, "mapping.json");
  try {
    await writeFile(path, JSON.stringify(mapping), { mode: 0o400 });
    await fn(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("StaticApiKeyCredentialProvider preserves the configured key through GristClientFactory", async () => {
  const originalFetch = globalThis.fetch;
  let observedAuthorization: string | null = null;

  globalThis.fetch = async (_input, init) => {
    observedAuthorization = new Headers(init?.headers).get("Authorization");
    return new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const factory = new GristClientFactory(
      "https://grist.example.org",
      new StaticApiKeyCredentialProvider("static-test-key")
    );
    const client = await factory.createClient({ principal });

    await client.listOrgs();

    assert.equal(observedAuthorization, "Bearer static-test-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GristClientFactory forwards the current principal to the credential provider", async () => {
  let observedPrincipalId: string | undefined;
  const provider: GristCredentialProvider = {
    async getApiKey(context: GristCredentialContext) {
      observedPrincipalId = context.principal.id;
      return "principal-specific-test-key";
    }
  };
  const factory = new GristClientFactory("https://grist.example.org", provider);

  await factory.createClient({ principal });

  assert.equal(observedPrincipalId, "test-principal");
});

test("credential providers cannot produce an empty API key", async () => {
  assert.throws(
    () => new StaticApiKeyCredentialProvider("   "),
    /must not be empty/
  );

  const provider: GristCredentialProvider = {
    async getApiKey() {
      return "";
    }
  };
  const factory = new GristClientFactory("https://grist.example.org", provider);

  await assert.rejects(
    factory.createClient({ principal }),
    /returned an empty API key/
  );
});

test("file principal mapping resolves distinct service-account keys without cross-principal reuse", async () => {
  await withMappingFile(
    {
      version: 1,
      principals: {
        [oauthPrincipalA.id]: "service-account-key-a",
        [oauthPrincipalB.id]: "service-account-key-b"
      }
    },
    async (path) => {
      const provider = await FilePrincipalApiKeyCredentialProvider.fromFile(path);
      assert.equal(
        await provider.getApiKey({ principal: oauthPrincipalA }),
        "service-account-key-a"
      );
      assert.equal(
        await provider.getApiKey({ principal: oauthPrincipalB }),
        "service-account-key-b"
      );
    }
  );
});

test("file principal mapping fails closed when a principal is not mapped", async () => {
  await withMappingFile(
    {
      version: 1,
      principals: {
        [oauthPrincipalA.id]: "service-account-key-a"
      }
    },
    async (path) => {
      const provider = await FilePrincipalApiKeyCredentialProvider.fromFile(path);
      await assert.rejects(
        provider.getApiKey({ principal: oauthPrincipalB }),
        (error: unknown) =>
          error instanceof PrincipalCredentialMappingError &&
          error.code === "missing_principal" &&
          !error.message.includes(oauthPrincipalB.id)
      );
    }
  );
});

test("file principal mapping rejects malformed or raw-principal entries without leaking values", async () => {
  const secretSentinel = "secret-service-account-sentinel";
  await withMappingFile(
    {
      version: 1,
      principals: {
        "raw-provider-subject": secretSentinel
      }
    },
    async (path) => {
      await assert.rejects(
        FilePrincipalApiKeyCredentialProvider.fromFile(path),
        (error: unknown) =>
          error instanceof PrincipalCredentialMappingError &&
          error.code === "invalid_mapping" &&
          !error.message.includes(secretSentinel) &&
          !error.message.includes("raw-provider-subject")
      );
    }
  );
});

test("file principal mapping is an immutable startup snapshot until controlled restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "grist-credentials-"));
  const path = join(directory, "mapping.json");
  try {
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        principals: { [oauthPrincipalA.id]: "service-account-key-a" }
      })
    );
    const provider = await FilePrincipalApiKeyCredentialProvider.fromFile(path);

    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        principals: { [oauthPrincipalA.id]: "rotated-service-account-key" }
      })
    );

    assert.equal(
      await provider.getApiKey({ principal: oauthPrincipalA }),
      "service-account-key-a"
    );
    const reloaded = await FilePrincipalApiKeyCredentialProvider.fromFile(path);
    assert.equal(
      await reloaded.getApiKey({ principal: oauthPrincipalA }),
      "rotated-service-account-key"
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
