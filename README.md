# grist-chatgpt

`grist-chatgpt` is a compact open-source **MCP adaptation layer for Grist Community**. It gives an MCP-capable agent stable semantic tools to discover, inspect and modify Grist applications while keeping credentials, low-level Grist references and safety policy server-side.

> [!IMPORTANT]
> This repository is an independent prototype. It is not an official Grist Labs, DINUM / La Suite numérique, or OpenAI integration.

## Product boundary

```text
User
  |
  v
MCP-capable LLM client
  reason / plan / orchestrate
  |
  v
grist-chatgpt
  compact MCP v2 contract
  bounded semantic Grist operations
  authorization + stable-ID normalization
  partial/ambiguous-write safety
  |
  v
Grist Community
```

The bridge is deliberately **not** an internal planner, business workflow engine, generic Grist proxy, ACL/service-account administration layer, raw SQL surface, arbitrary `/apply` endpoint or browser automation framework.

Business applications such as stage tracking or pedagogy are validation cases, not architecture dependencies.

See [Product vision](docs/PRODUCT_VISION.md), [Authoritative roadmap](docs/ROADMAP.md), [MCP v2 contract](docs/MCP-CONTRACT.md), [Architecture](docs/ARCHITECTURE.md), [Security model](docs/SECURITY.md) and [Grist credential boundary](docs/CREDENTIALS.md).

## Current candidate

The product exposes exactly ten model-facing MCP v2 tools:

| Tool | Purpose |
| --- | --- |
| `grist_discover` | discover allowed documents, tables or columns |
| `grist_inspect` | inspect semantic document/page/widget context |
| `grist_query` | read bounded records |
| `grist_add_records` | create a bounded record batch |
| `grist_change_records` | update or delete explicit records |
| `grist_add_structure` | create tables or columns |
| `grist_change_structure` | update, rename or delete targeted structure |
| `grist_add_ui` | create a page or add a supported widget |
| `grist_change_ui` | change or delete supported page/widget state |
| `grist_help` | progressively disclose the contract |

`grist_help` reports MCP contract version `2`. The historical 23-tool v1 and GPT Actions/OpenAPI compatibility surfaces are retired from the active product.

## Security boundary

Grist remains authoritative for upstream authority. The bridge can only restrict it through:

```text
selected upstream Grist service-account permissions
∩ deployment document/workspace ceiling
∩ principal resource grant
∩ required capability
```

The capability vocabulary remains `doc:read`, `doc:write`, `doc.schema:write`.

Credentials, bearer/OAuth tokens, Grist API keys and principal credential mappings are never tool inputs or model-visible outputs.

Two upstream credential modes exist:

- `static` — one server-side `GRIST_API_KEY`, only for controlled single-principal/development use;
- `principal-map` — production multi-principal mode, selecting one operator-provisioned Grist Community service-account key per opaque OAuth principal from a protected read-only file.

`principal-map` mode forbids a shared `GRIST_API_KEY` fallback. Missing principals fail closed. The mapping is loaded once at startup and never written by the bridge.

## Installation

Requirements: **Node.js 22+**.

```bash
cp .env.example .env
npm ci
npm run dev
```

For the smallest controlled single-principal deployment:

```dotenv
GRIST_BASE_URL=https://grist.example.org
GRIST_CREDENTIAL_MODE=static
GRIST_API_KEY=<server-side Grist API key>
GRIST_ALLOWED_DOCUMENT_IDS=<one-or-more-document-ids>
MCP_AUTH_MODE=static
MCP_BEARER_TOKEN=<random-value-at-least-32-characters>
```

For production multi-principal OAuth, mount the operator-managed service-account mapping read-only:

```dotenv
GRIST_BASE_URL=https://grist.example.org
GRIST_CREDENTIAL_MODE=principal-map
GRIST_PRINCIPAL_CREDENTIALS_FILE=/run/secrets/grist-principals.json
GRIST_ALLOWED_DOCUMENT_IDS=<deployment-ceiling>
MCP_AUTH_MODE=oauth
OAUTH_ISSUER=https://auth.example.org/oidc
OAUTH_JWKS_URI=https://auth.example.org/oidc/jwks
MCP_RESOURCE_URI=https://mcp.example.org/mcp
```

`GRIST_API_KEY` and `MCP_BEARER_TOKEN` must be absent from that production OAuth configuration. See [docs/CREDENTIALS.md](docs/CREDENTIALS.md) for service-account provisioning, mapping, rotation and revocation.

`GRIST_ALLOWED_WORKSPACE_IDS` may be used instead of or alongside document IDs. The process refuses to start unless at least one deployment resource boundary is configured.

Optional guardrails include `MCP_CAPABILITIES`, `GRIST_MAX_READ_RECORDS`, `GRIST_MAX_WRITE_RECORDS`, `GRIST_WRITE_BATCH_RECORDS`, `GRIST_MAX_SCHEMA_ITEMS`, `MCP_ALLOWED_HOSTS`, `PORT` and `HOST`.

Production OAuth preflight additionally requires `GRIST_CREDENTIAL_MODE=principal-map`; this prevents a shared upstream key from being represented as multi-principal Grist isolation.

## Endpoints

```text
/mcp                                      MCP v2
/healthz                                  health check
/.well-known/oauth-protected-resource     OAuth mode only
```

The Node process binds only to localhost. Use a reverse proxy for remote HTTPS exposure and list the public hostname in `MCP_ALLOWED_HOSTS`.

## Development checks

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm run check
npm test
npm run build
```

R4 completed broad product validation. R5 adds focused production OAuth, credential, operational and reviewer/distribution evidence rather than changing the compact MCP contract.

## Repository history

Historical P0-P4, C4-C8, J0-J2 and distribution documents remain evidence/component-bank material. `docs/ROADMAP.md`, `docs/PRODUCT_VISION.md` and the current runtime define active project state.
