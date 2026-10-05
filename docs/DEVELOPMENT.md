# Development

Read [AGENTS.md](../AGENTS.md) before selecting or integrating work.
Node.js 22+ is required. Install from the committed lockfile.

```sh
npm ci
npm run check:convergence
npm audit --omit=dev --audit-level=high
npm run check
npm test
npm run build
```

The required `verify` CI job runs these checks. No new production dependency is
needed for convergence enforcement. Unit/contract tests protect current behavior;
remove a test only when its subject is removed and no current invariant is lost.

## Current documentation

Each fact has one normative home; link to it instead of duplicating it.

| Document | Owns |
| --- | --- |
| [Product Vision](PRODUCT_VISION.md) | purpose, exclusions and evolution policy |
| [Architecture](ARCHITECTURE.md) | runtime responsibilities and dependencies |
| [MCP Contract](MCP-CONTRACT.md) | current tool/action semantics, compatibility and versioning |
| [Security](SECURITY.md) | trust, authorization, secrets, preservation and effect invariants |
| [Operations](OPERATIONS.md) | configuration, credentials, deployment, rollback and monitoring |
| [Development](DEVELOPMENT.md) | contributor workflow, checks, native tests and convergence enforcement |
| [Roadmap](ROADMAP.md) | finite authorized unfinished work only |

README is the entry point; AGENTS is the development contract; LICENSE, Privacy,
Terms and Support retain their current legal/user-facing purpose. PR descriptions
are the home for analysis, provenance, decisions, review and validation evidence.
Release notes belong to GitHub releases. Git retains removed files and earlier decisions.
Do not add report/evidence/POC archives, dated snapshots, completed tasks, milestone
labels or alternative contracts to the integrated tree.

`tools/check-convergence.mjs` checks the explicit document inventory, forbidden
artifact categories, current-only documentation, unfinished-only Roadmap and local
Markdown links. It also sees unignored new files during local development.
The PR template makes absorption/deletion and net complexity reduction part of
completion. Changes to the inventory/policy require a justified independent review.
The guard is deliberately small; semantic consistency still requires review and tests.

## Native Grist regressions

The retained native probes create synthetic documents/users only in disposable
Grist instances with test login enabled. Never enable test login in production
or run these mutating probes against a real user deployment.

| Workflow / tool | Current purpose |
| --- | --- |
| Grist compatibility / `tools/grist-compatibility.ts` | MCP transport and native schema/UI/ACL/template boundaries across Grist Community 1.7.16–1.7.20 |
| Application preservation / `tools/application-validation.ts` | existing human configuration/data, differing native grants, a second application shape and repeat execution on Grist Community 1.7.19 |

Workflows run for relevant runtime/test/tool/dependency/workflow changes and can
also be dispatched for release verification. Results belong to their exact CI
head; passing a listed version is not a blanket guarantee for every Grist behavior
or an untested server version. Compatibility follows the executable probes.
The domain-shaped fixtures are test consumers, never product requirements.

To run against a disposable local Grist with test login enabled:

```sh
GRIST_COMPAT_BASE_URL=http://127.0.0.1:8484 GRIST_COMPAT_VERSION=1.7.20 \
  node --import tsx tools/grist-compatibility.ts
GRIST_TEST_BASE_URL=http://127.0.0.1:8484 GRIST_TEST_VERSION=1.7.19 \
  node --import tsx tools/application-validation.ts
```

The probes start a local Gia process, provision synthetic native state, perform
bounded tools and independently inspect native postconditions. The application
probe uses `application-fixtures.ts` and `grist-harness.ts`. No browser/planner,
generic model-facing command or committed proof platform is added.

## Licensing

The repository is Apache-2.0. Dependencies retain their own license metadata in
the lockfile. Official Grist behavior/documentation is the primary oracle:
[API](https://support.getgrist.com/api/),
[access rules](https://support.getgrist.com/access-rules/),
[upstream source](https://github.com/gristlabs/grist-core).
Community references supplied manager-tool and semantic-context ideas, not copied
source. Check the relevant license before any reuse and keep required attribution
with incorporated code; document the concrete decision in the PR.
