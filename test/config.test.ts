import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/config.js";

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void
): void {
  const original = { ...process.env };
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fn();
  } finally {
    process.env = original;
  }
}

const BASE_ENV = {
  GRIST_BASE_URL: "https://grist.example.org",
  GRIST_CREDENTIAL_MODE: undefined,
  GRIST_API_KEY: "test-key",
  GRIST_PRINCIPAL_CREDENTIALS_FILE: undefined,
  GRIST_ALLOWED_DOCUMENT_IDS: "doc-1",
  GRIST_ALLOWED_WORKSPACE_IDS: undefined,
  GRIST_MAX_READ_RECORDS: undefined,
  GRIST_MAX_WRITE_RECORDS: undefined,
  MCP_AUTH_MODE: undefined,
  MCP_BEARER_TOKEN: "0123456789abcdef0123456789abcdef",
  OAUTH_ISSUER: undefined,
  OAUTH_JWKS_URI: undefined,
  MCP_RESOURCE_URI: undefined,
  MCP_PRINCIPAL_RATE_LIMIT_PER_MINUTE: undefined,
  HOST: "127.0.0.1",
  PORT: "3000"
};

test("OAuth URL validation rejects even empty fragments without changing exact valid URLs", () => {
  const oauth = { ...BASE_ENV, MCP_AUTH_MODE: "oauth", MCP_BEARER_TOKEN: undefined,
    OAUTH_ISSUER: "https://auth.example.org/oidc", OAUTH_JWKS_URI: "https://auth.example.org/jwks?key=1", MCP_RESOURCE_URI: "https://bridge.example.org/mcp" };
  for (const key of ["OAUTH_ISSUER", "OAUTH_JWKS_URI", "MCP_RESOURCE_URI"] as const) {
    withEnv({ ...oauth, [key]: oauth[key] + "#" }, () => assert.throws(() => loadConfig(), /without embedded credentials or a fragment/));
  }
  withEnv(oauth, () => assert.deepEqual(loadConfig().mcpAuth, {
    mode: "oauth", issuer: oauth.OAUTH_ISSUER, jwksUri: oauth.OAUTH_JWKS_URI, resourceUri: oauth.MCP_RESOURCE_URI
  }));
});

test("Grist base URL preserves valid path prefixes and rejects unusable or secret-bearing URLs", () => {
  for (const [input, expected] of [
    ["https://grist.example.org/base/", "https://grist.example.org/base"],
    ["http://localhost:8484/", "http://localhost:8484"],
    ["http://127.0.0.1:8484/base", "http://127.0.0.1:8484/base"]
  ]) {
    withEnv({ ...BASE_ENV, GRIST_BASE_URL: input }, () => {
      assert.equal(loadConfig().gristBaseUrl, expected);
    });
  }
  for (const input of [
    "ftp://localhost", "ws://localhost", "file://127.0.0.1/a",
    "http://grist.example.org", "https://grist.example.org/base?x=1",
    "https://grist.example.org/base#fragment", "https://user:secret-sentinel@grist.example.org",
    "https://grist.example.org/base?", "https://grist.example.org/base#", "https://grist.example.org/base?#",
    "invalid-secret-sentinel"
  ]) {
    withEnv({ ...BASE_ENV, GRIST_BASE_URL: input }, () => {
      assert.throws(() => loadConfig(), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /GRIST_BASE_URL/);
        assert.doesNotMatch(error.message, /secret-sentinel/);
        return true;
      });
    });
  }
});

test("defaults Grist credentials to controlled static mode", () => {
  withEnv(BASE_ENV, () => {
    const config = loadConfig();
    assert.deepEqual(config.gristCredentials, {
      mode: "static",
      apiKey: "test-key"
    });
  });
});

test("loads principal-map Grist credentials without a shared fallback key", () => {
  withEnv(
    {
      ...BASE_ENV,
      GRIST_CREDENTIAL_MODE: "principal-map",
      GRIST_API_KEY: undefined,
      GRIST_PRINCIPAL_CREDENTIALS_FILE: "/run/secrets/grist-principals.json"
    },
    () => {
      const config = loadConfig();
      assert.deepEqual(config.gristCredentials, {
        mode: "principal-map",
        mappingFile: "/run/secrets/grist-principals.json"
      });
    }
  );
});

test("principal-map mode rejects a shared Grist API key and requires an absolute mapping path", () => {
  withEnv(
    {
      ...BASE_ENV,
      GRIST_CREDENTIAL_MODE: "principal-map",
      GRIST_PRINCIPAL_CREDENTIALS_FILE: "/run/secrets/grist-principals.json"
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /GRIST_API_KEY must not be configured/
      );
    }
  );

  withEnv(
    {
      ...BASE_ENV,
      GRIST_CREDENTIAL_MODE: "principal-map",
      GRIST_API_KEY: undefined,
      GRIST_PRINCIPAL_CREDENTIALS_FILE: "relative/mapping.json"
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /GRIST_PRINCIPAL_CREDENTIALS_FILE must be an absolute path/
      );
    }
  );
});

test("static Grist credential mode rejects a principal mapping file", () => {
  withEnv(
    {
      ...BASE_ENV,
      GRIST_PRINCIPAL_CREDENTIALS_FILE: "/run/secrets/grist-principals.json"
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /GRIST_PRINCIPAL_CREDENTIALS_FILE must not be configured/
      );
    }
  );
});

test("rejects unsupported Grist credential modes", () => {
  withEnv(
    {
      ...BASE_ENV,
      GRIST_CREDENTIAL_MODE: "automatic"
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /GRIST_CREDENTIAL_MODE must be either "static" or "principal-map"/
      );
    }
  );
});

test("defaults MCP authentication to static bearer mode", () => {
  withEnv(BASE_ENV, () => {
    const config = loadConfig();
    assert.deepEqual(config.mcpAuth, {
      mode: "static",
      bearerToken: BASE_ENV.MCP_BEARER_TOKEN
    });
  });
});

test("loads provider-neutral OAuth MCP configuration", () => {
  withEnv(
    {
      ...BASE_ENV,
      MCP_AUTH_MODE: "oauth",
      MCP_BEARER_TOKEN: undefined,
      OAUTH_ISSUER: "https://auth.example.test/oidc",
      OAUTH_JWKS_URI: "https://auth.example.test/oidc/jwks",
      MCP_RESOURCE_URI: "https://mcp.example.test/mcp"
    },
    () => {
      const config = loadConfig();
      assert.deepEqual(config.mcpAuth, {
        mode: "oauth",
        issuer: "https://auth.example.test/oidc",
        jwksUri: "https://auth.example.test/oidc/jwks",
        resourceUri: "https://mcp.example.test/mcp"
      });
    }
  );
});

test("OAuth MCP mode rejects any configured static MCP bearer", () => {
  withEnv(
    {
      ...BASE_ENV,
      MCP_AUTH_MODE: "oauth",
      OAUTH_ISSUER: "https://auth.example.test/oidc",
      OAUTH_JWKS_URI: "https://auth.example.test/oidc/jwks",
      MCP_RESOURCE_URI: "https://mcp.example.test/mcp"
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /MCP_BEARER_TOKEN must not be configured when MCP_AUTH_MODE=oauth/
      );
    }
  );
});

test("OAuth MCP mode requires HTTPS issuer, JWKS and resource URLs", () => {
  withEnv(
    {
      ...BASE_ENV,
      MCP_AUTH_MODE: "oauth",
      MCP_BEARER_TOKEN: undefined,
      OAUTH_ISSUER: "http://auth.example.test/oidc",
      OAUTH_JWKS_URI: "https://auth.example.test/oidc/jwks",
      MCP_RESOURCE_URI: "https://mcp.example.test/mcp"
    },
    () => {
      assert.throws(() => loadConfig(), /OAUTH_ISSUER must use HTTPS/);
    }
  );

  withEnv(
    {
      ...BASE_ENV,
      MCP_AUTH_MODE: "oauth",
      MCP_BEARER_TOKEN: undefined,
      OAUTH_ISSUER: "https://auth.example.test/oidc",
      OAUTH_JWKS_URI: undefined,
      MCP_RESOURCE_URI: "https://mcp.example.test/mcp"
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /Missing required environment variable: OAUTH_JWKS_URI/
      );
    }
  );
});

test("rejects unsupported MCP authentication modes", () => {
  withEnv(
    {
      ...BASE_ENV,
      MCP_AUTH_MODE: "automatic"
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /MCP_AUTH_MODE must be either "static" or "oauth"/
      );
    }
  );
});

test("adds configured public MCP hosts while preserving localhost", () => {
  withEnv(
    {
      ...BASE_ENV,
      MCP_ALLOWED_HOSTS: "grist-chatgpt.loeildumaitre.fr,mcp.example.org"
    },
    () => {
      const config = loadConfig();
      assert.deepEqual(config.mcpAllowedHosts, [
        "127.0.0.1",
        "localhost",
        "[::1]",
        "grist-chatgpt.loeildumaitre.fr",
        "mcp.example.org"
      ]);
    }
  );
});

test("rejects URLs in MCP_ALLOWED_HOSTS", () => {
  withEnv(
    {
      ...BASE_ENV,
      MCP_ALLOWED_HOSTS: "https://grist-chatgpt.loeildumaitre.fr"
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /MCP_ALLOWED_HOSTS must contain hostnames only/
      );
    }
  );
});

test("accepts document and/or workspace access scopes", () => {
  withEnv(
    {
      ...BASE_ENV,
      GRIST_ALLOWED_DOCUMENT_IDS: undefined,
      GRIST_ALLOWED_WORKSPACE_IDS: "42, 77"
    },
    () => {
      const config = loadConfig();
      assert.deepEqual(config.allowedDocumentIds, []);
      assert.deepEqual(config.allowedWorkspaceIds, ["42", "77"]);
    }
  );

  withEnv(
    {
      ...BASE_ENV,
      GRIST_ALLOWED_DOCUMENT_IDS: undefined,
      GRIST_ALLOWED_WORKSPACE_IDS: undefined
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /Configure at least one GRIST_ALLOWED_DOCUMENT_IDS or GRIST_ALLOWED_WORKSPACE_IDS/
      );
    }
  );
});

test("loads configurable record guardrails and supports zero as unlimited", () => {
  withEnv(
    {
      ...BASE_ENV,
      GRIST_MAX_READ_RECORDS: "12000",
      GRIST_MAX_WRITE_RECORDS: "0"
    },
    () => {
      const config = loadConfig();
      assert.equal(config.maxReadRecords, 12000);
      assert.equal(config.maxWriteRecords, 0);
    }
  );
});

test("defaults and validates the per-principal MCP request ceiling", () => {
  withEnv(BASE_ENV, () => {
    assert.equal(loadConfig().mcpPrincipalRateLimitPerMinute, 120);
  });

  withEnv(
    {
      ...BASE_ENV,
      MCP_PRINCIPAL_RATE_LIMIT_PER_MINUTE: "240"
    },
    () => {
      assert.equal(loadConfig().mcpPrincipalRateLimitPerMinute, 240);
    }
  );

  withEnv(
    {
      ...BASE_ENV,
      MCP_PRINCIPAL_RATE_LIMIT_PER_MINUTE: "0"
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /MCP_PRINCIPAL_RATE_LIMIT_PER_MINUTE must be a positive integer/
      );
    }
  );
});
