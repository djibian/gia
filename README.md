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

The bridge is deliberately **not** an internal planner, business workflow engine, generic Grist proxy, ACL administration layer, raw SQL surface, arbitrary `/apply` endpoint or browser automation framework.

Business applications such as stage tracking or pedagogy are validation cases, not architecture dependencies.

See:

- [Product vision](docs/PRODUCT_VISION.md)
- [Authoritative roadmap](docs/ROADMAP.md)
- [MCP v2 contract](docs/MCP-CONTRACT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY.md)
- [Grist credential boundary](docs/CREDENTIALS.md)
- [Generic usage flow](docs/R3-GENERIC-USAGE-FLOW.md)
- [Dependency/provenance audit](docs/R3-DEPENDENCY-PROVENANCE.md)

## Current candidate

The R3 candidate is MCP-first and exposes exactly ten model-facing tools:

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

`grist_help` reports MCP contract version `2`.

The historical 23-tool MCP v1 surface is retired. The historical GPT Actions/OpenAPI compatibility surface is also retired from the candidate rather than maintained as a second public product. Historical design and submission artefacts remain in the repository as history and possible R5 evidence; they do not control the current runtime.

## What the agent can do

### Discover and inspect

The agent can discover resources allowed by deployment policy and inspect compact application structure without indiscriminately loading business rows. Inspection includes supported table/column metadata, formulas and relationships plus normalized page/widget information where Grist state can be resolved exactly.

Unresolvable or unsupported private metadata is reported as incomplete rather than guessed.

### Query and change data

Reads are bounded by explicit query limits. Record creation, update and deletion target one table and a bounded set of records.

Large record mutations may be sent to Grist in sequential internal batches. Those batches are not atomic as a group. Confirmed partial results are preserved and an ambiguous upstream write is never treated as a proven no-effect suitable for blind replay.

### Change structure

The bridge supports bounded table/column creation and targeted structural changes through stable semantic inputs. Arbitrary Grist UserActions and `/apply` payloads are not public inputs.

### Change UI

Supported UI operations cover bounded creation/modification/deletion of native pages and widgets. Private metadata references are resolved server-side. Read-modify-write operations preserve unrelated configuration and re-read material postconditions where practical.

## Security boundary

Grist remains authoritative for the authority of the selected upstream credential. The bridge can restrict that authority through:

```text
upstream Grist permissions
∩ deployment document/workspace ceiling
∩ principal resource grant
∩ required capability
```

The compact capability vocabulary is:

- `doc:read`
- `doc:write`
- `doc.schema:write`

Credentials, bearer/OAuth tokens, API keys and principal credential mappings are never tool inputs or model-visible outputs.

Upstream Grist credentials have two explicit modes. `static` preserves one server-side `GRIST_API_KEY` for controlled single-principal/development use. `principal-map` is the R5-C multi-principal production path: it loads an operator-mounted read-only mapping from opaque OAuth principal IDs to Grist Community service-account keys. Principal-map mode forbids `GRIST_API_KEY`, so an unmapped principal fails closed rather than falling back to shared authority. See [docs/CREDENTIALS.md](docs/CREDENTIALS.md).

## Installation

Requirements: **Node.js 22+**.

```bash
cp .env.example .env
npm ci
npm run dev
```

For the smallest controlled deployment, configure:

```dotenv
GRIST_BASE_URL=https://grist.example.org
GRIST_CREDENTIAL_MODE=static
GRIST_API_KEY=<server-side Grist API key>
GRIST_ALLOWED_DOCUMENT_IDS=<one-or-more-document-ids>
MCP_BEARER_TOKEN=<random-value-at-least-32-characters>
```

`GRIST_ALLOWED_WORKSPACE_IDS` may be used instead of or alongside document IDs. The process refuses to start unless at least one deployment resource boundary is configured.

Optional guardrails:

- `MCP_CAPABILITIES` — defaults to all three capability classes;
- `GRIST_MAX_READ_RECORDS` — default `5000`;
- `GRIST_MAX_WRITE_RECORDS` — default `500`;
- `GRIST_WRITE_BATCH_RECORDS` — default `200`;
- `GRIST_MAX_SCHEMA_ITEMS` — default `100`;
- `MCP_ALLOWED_HOSTS` — additional public hostnames accepted by the MCP HTTP application;
- `PORT` — default `3000`;
- `HOST` — intentionally restricted to localhost.

The default authentication mode is static bearer:

```dotenv
MCP_AUTH_MODE=static
MCP_BEARER_TOKEN=<random-value-at-least-32-characters>
```

A provider-neutral JWT/JWKS OAuth mode also exists:

```dotenv
MCP_AUTH_MODE=oauth
OAUTH_ISSUER=https://auth.example.org/oidc
OAUTH_JWKS_URI=https://auth.example.org/oidc/jwks
MCP_RESOURCE_URI=https://mcp.example.org/mcp
```

When OAuth mode is selected, `MCP_BEARER_TOKEN` must be absent. For production multi-principal OAuth, also configure:

```dotenv
GRIST_CREDENTIAL_MODE=principal-map
GRIST_PRINCIPAL_CREDENTIALS_FILE=/run/secrets/grist-principals.json
```

and omit `GRIST_API_KEY`. Production OAuth preflight rejects a static upstream Grist credential as insufficient multi-principal isolation.

## Endpoints

```text
/mcp                                      MCP v2
/healthz                                  health check
/.well-known/oauth-protected-resource     OAuth mode only
```

The Node process binds only to localhost. Use a reverse proxy for remote HTTPS exposure and list the public hostname in `MCP_ALLOWED_HOSTS`.

## Development checks

The construction baseline is intentionally small:

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm run check
npm test
npm run build
```

R0-R3 use these checks as engineering feedback, not as comprehensive product proof. Domain scenarios, real-document campaigns, rerun/failure characterization and broader compatibility testing belong to R4.

## Repository history

The repository contains substantial historical P0-P4, C4-C8, J0-J2 and public-distribution design/evidence documents. They remain useful evidence or component-bank material, but `docs/ROADMAP.md`, `docs/PRODUCT_VISION.md` and the current runtime define the active project.

Do not infer current requirements from a historical milestone merely because its files remain present.
