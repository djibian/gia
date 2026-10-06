# Gia

Gia **0.8.0** is a compact open-source MCP adaptation layer for Grist Community.
It provides exactly ten bounded semantic tools under **MCP contract major 2**.
The client reasons and orchestrates; Gia normalizes and executes; Grist remains
authoritative for application state and permissions.

This is an independent project, without official affiliation with Grist Labs,
DINUM / La Suite numérique or OpenAI.

## Start

Requirements: Node.js 22+ and a Grist Community deployment.

```sh
cp .env.example .env
npm ci
npm run dev
```

For controlled single-principal use, configure `GRIST_BASE_URL`, server-side
`GRIST_API_KEY`, `MCP_BEARER_TOKEN` (at least 32 random characters), and at least
one explicit `GRIST_ALLOWED_DOCUMENT_IDS` or `GRIST_ALLOWED_WORKSPACE_IDS` ceiling.
For production multi-principal use, configure OAuth and a protected read-only
principal-to-service-account mapping. See [Operations](docs/OPERATIONS.md).

The process binds to localhost. Remote access uses an HTTPS reverse proxy and
`MCP_ALLOWED_HOSTS`. `/mcp` serves authenticated MCP; `/healthz` reports health.

## Tools

| Tool | Purpose |
| --- | --- |
| `grist_discover` | allowed workspaces, documents, tables and columns |
| `grist_inspect` | compact document/page/widget/access-rule structure |
| `grist_query` | bounded records |
| `grist_add_records` | bounded record creation |
| `grist_change_records` | explicit record updates/deletion |
| `grist_add_structure` | empty document/template bootstrap and table/column creation |
| `grist_change_structure` | bounded document metadata/schema changes and application-rule groups |
| `grist_add_ui` | native pages/widgets, including summaries |
| `grist_change_ui` | bounded page/widget/calendar configuration, layout and order |
| `grist_help` | progressive current-contract disclosure |

Credentials stay server-side. Effective authority intersects native Grist rights,
deployment ceiling, principal grants and required capability. Partial/uncertain
writes preserve known effects and forbid blind replay. Inspection/mutation use
stable identifiers and refuse unsafe incomplete metadata.
Persisted ACL verification does not prove confidentiality; hidden fields/filters
are presentation state. A native template copy retains substantial metadata and
is not a privacy scrub.

## Documentation and contributing

- [Product Vision](docs/PRODUCT_VISION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [MCP Contract](docs/MCP-CONTRACT.md)
- [Security](docs/SECURITY.md)
- [Operations](docs/OPERATIONS.md)
- [Development and verification](docs/DEVELOPMENT.md)
- [Current unfinished work](docs/ROADMAP.md)
- [Development contract](AGENTS.md)
- [Privacy](PRIVACY.md), [Terms](TERMS.md), [Support](SUPPORT.md)

`main` describes the current product. Git/GitHub preserves history.
An evolution is complete only after temporary artifacts have been absorbed or removed.
