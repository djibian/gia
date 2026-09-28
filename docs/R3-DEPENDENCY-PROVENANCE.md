# R3 — Dependency, license and provenance audit

Date: 2026-09-27  
Baseline: `151dfc5068db14dab115eadc1b8b779fb73cde6f`

## Scope

This is the bounded R3 pass required before freezing the generic candidate. It records the direct package inventory, repository license, dependency vulnerability gate and external-project provenance decisions that shaped R1/R2.

It does **not** certify every transitive dependency independently of the npm lockfile and CI. The authoritative install set is `package-lock.json`; CI installs it with `npm ci` and rejects high-or-higher production dependency advisories with `npm audit --omit=dev --audit-level=high`.

## Repository license

`grist-chatgpt` contains a root `LICENSE` with the Apache License 2.0 text. No license change is made in R3.

## Direct dependency inventory

Exact versions below are the versions locked in `package-lock.json` at the baseline SHA, not merely the semver ranges declared in `package.json`.

| Dependency | Role | Locked version | Lockfile license |
| --- | --- | ---: | --- |
| `@modelcontextprotocol/express` | MCP HTTP/Express integration | 2.0.0 | MIT |
| `@modelcontextprotocol/node` | Node MCP transport/handler integration | 2.0.0 | MIT |
| `@modelcontextprotocol/server` | MCP server/tool registration | 2.0.0 | MIT |
| `express` | HTTP application/router | 5.2.1 | MIT |
| `zod` | bounded input/output schemas | 4.6.5 | MIT |

Direct development dependencies are build/test tooling only:

| Development dependency | Locked version | Lockfile license |
| --- | ---: | --- |
| `@types/express` | 5.0.6 | MIT |
| `@types/node` | 22.20.2 | MIT |
| `tsx` | 4.23.13 | MIT |
| `typescript` | 7.0.2 | Apache-2.0 |

No new dependency is introduced by R3.

## Dependency/security gate already enforced

`.github/workflows/ci.yml` performs, in order:

1. `npm ci` from the committed lockfile;
2. `npm audit --omit=dev --audit-level=high`;
3. type/build checks;
4. tests;
5. production build.

R3 therefore keeps the dependency set lockfile-reproducible and keeps the existing high-severity production advisory gate. Expanding into a second dependency scanner, SBOM pipeline or supply-chain subsystem is not justified for the construction candidate; production/distribution hardening remains R5 work if evidence later requires it.

## External-project provenance

R1/R2 deliberately used external projects as reference/oracle material rather than as a source-code merge strategy.

### Official Grist / `grist-core`

Used as the primary semantic oracle for Grist-native behavior: API/user-action meaning, pages/widgets, identifiers, permission behavior and relevant UI safety boundaries. `grist-chatgpt` reimplements the small semantic bridge needed by its own architecture; this audit does not identify copied Grist source incorporated into the candidate.

### Official Model Context Protocol packages

Used through the npm dependencies listed above. The bridge builds its public MCP contract on the official server/Node/Express package interfaces rather than maintaining a custom transport protocol.

### `gwhthompson/grist-mcp-server`

R1-B used its documented compact manager-style tool pattern as design evidence. No source code was copied: at the observed revision, the README advertised Apache-2.0 but the repository review did not find a root `LICENSE`, so the project was treated as pattern/reference material only.

### `nic01asFr/GristCoder`

Used as product/design evidence for semantic application context and Grist-aware editing loops. R1-B recorded the observed root MIT license but did not copy its wizard/session/sub-agent/generated-artifact implementation. R1-C reimplemented only the relevant compact-context idea within the existing `grist-chatgpt` service path.

## Candidate conclusion

For R3 purposes:

- the direct dependency set is small and justified by the active MCP/HTTP/schema implementation;
- versions are lockfile-pinned at install time;
- direct dependency license metadata is compatible with the repository's Apache-2.0 distribution posture;
- production dependencies remain subject to the existing high-severity npm advisory gate;
- no externally copied code requiring a new attribution/license obligation was identified by the R1/R2 provenance record;
- no additional dependency/provenance subsystem is warranted before R4 validation.

If R5 introduces a production identity provider, packaging/distribution change or new external code reuse, this audit must be revisited for the changed dependency/provenance set rather than treated as a permanent certification.
