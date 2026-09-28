# R5-A — Current production and distribution gap audit

**Audit date:** 2026-09-28  
**Candidate baseline:** `a2b5f4b478df1950e2e160988bef1763224c25a7`  
**Scope:** production identity, upstream Grist credentials, operational hardening, reviewer readiness and public OpenAI plugin distribution for the frozen MCP v2 candidate.

This audit is a decision document. It does not resume the old C4/C5/C6/S0/S1/C7/C8 architecture mechanically and it does not perform any production publication or institutional commitment.

## Executive decision

R4 proved the product. R5 should now productionize the **same compact MCP v2 bridge**, not revive the retired v1/GPT-Actions or Builder architecture.

The smallest coherent path is:

1. keep the existing provider-neutral OAuth resource-server seam and revalidate the current Logto/ProConnect deployment against the current OpenAI MCP OAuth contract;
2. **reject the historical plan to collect and persist each user's personal Grist API key**;
3. use Grist Community's native **service accounts** as the upstream per-principal credential boundary, with keys provisioned by the Grist/operator side and injected into the bridge only as server-side secrets;
4. add only the production controls that are still missing: principal credential selection, per-principal rate limiting, operational evidence/alert inputs and controlled rotation/recovery;
5. rebuild the OpenAI submission package from the current ten-tool MCP v2 contract instead of carrying forward the stale 23-tool artifact;
6. leave publisher verification, production secrets/identity ownership, public-domain proof, rights/branding basis and actual OpenAI submission/publishing as explicit external actions.

Public directory approval is **not** assumed. The current OpenAI plugin guidelines say an unofficial connector whose primary function is connecting to a third-party service cannot be approved. The bounded semantic/safety product is materially more than a transparent relay, but only the actual review can decide that classification.

## Current external facts

### OpenAI / ChatGPT plugin distribution

Official OpenAI plugin documentation rechecked on 2026-09-28:

- `https://developers.openai.com/plugins/deploy/submission`
- `https://developers.openai.com/plugins/deploy/app-review`
- `https://developers.openai.com/plugins/app-guidelines`
- `https://developers.openai.com/plugins/build/auth`
- `https://developers.openai.com/plugins/guides/security-privacy`

Current implications for this product:

- a public remote-MCP-only plugin is a supported submission shape; custom UI and skills are optional;
- the MCP server must be a stable public HTTPS endpoint and the publisher must prove control of its domain;
- submission requires verified individual/business identity and Apps Management write permission;
- the current review package requires accurate tool metadata/annotations, starter prompts, exactly five positive and three negative cases, release notes, availability, public website/support/privacy/terms URLs and a demo recording;
- authenticated reviewer credentials must work without inaccessible MFA, SMS/email confirmation, private networking or extra setup;
- projects using EU data residency currently cannot submit an MCP plugin for public review; the submission project must use global data residency;
- user-specific/private data and write actions should use MCP OAuth 2.1 with protected-resource metadata, authorization-server discovery, PKCE `S256`, resource binding and CIMD/DCR/predefined-client support as appropriate;
- per-tool `securitySchemes` and runtime OAuth challenges are part of the current ChatGPT contract;
- access credentials/authentication secrets must not be solicited as plugin/user data;
- third-party integrations require authorized access and compliance with the third party's terms; plugins primarily functioning as unofficial connectors/pass-through layers are not approvable.

The candidate already has the important OAuth server-side pieces: RFC 9728 protected-resource metadata/challenges, JWT/JWKS validation, resource/audience checks, fixed scopes, per-tool `securitySchemes`, dynamic principals and principal-bound contexts. The current ten-tool registry also carries `readOnlyHint`, `destructiveHint` and `openWorldHint` annotations.

### Grist Community

Grist upstream was rechecked on 2026-09-28 against current `gristlabs/grist-core`/Help Center material, including revision `34542eab62f0decb309a7e0476c3009fc6567f29` where inspected through GitHub.

Relevant current facts:

- `grist-core` / Community is Apache-2.0 and its documented REST API remains available for external integrations;
- the current Grist documentation explicitly acknowledges community MCP servers using the REST API when the Full-edition built-in MCP is not available;
- Community provides `GRIST_ENABLE_SERVICE_ACCOUNTS`; service accounts are intended for fine-grained API access by third-party automations;
- one regular account may own multiple service accounts; each service account is a dedicated Grist user with its own API key, optional expiration and independently grantable resource permissions;
- `/api/service-accounts` can create/delete service accounts, rotate/delete their API keys and report validity; creation returns the service account's API key;
- the feature is currently API-oriented and disabled unless `GRIST_ENABLE_SERVICE_ACCOUNTS` is enabled;
- Grist OAuth Apps / Connected Apps and the built-in Grist MCP are Full-edition features for self-hosted deployments, not Community capabilities that this product can assume.

This changes the C5 design materially: Community now supplies the correct upstream *identity and least-privilege primitive*. `grist-chatgpt` does not need to invent a user-key lifecycle or an ACL shadow system.

### Logto / ProConnect

Current Logto documentation still supports the properties used by the successful C4-P0:

- audience/resource-bound API resources;
- OAuth authorization code + PKCE;
- refresh tokens;
- dynamic applications using CIMD;
- third-party consent/grant revocation;
- MCP resource-server patterns with JWT/JWKS validation.

Therefore the provider-neutral C4 implementation is not obsolete. The exact production Logto configuration and ProConnect institutional registration still need current live revalidation; they are not silently promoted from a 2026-09 POC to production evidence.

## Historical-component classification

| Historical component | R5-A classification | Decision |
| --- | --- | --- |
| C4 provider-neutral OAuth resource server | **KEEP** | RFC 9728 metadata/challenge, JWT/JWKS validation, resource/audience/scope checks, dynamic principal and per-tool security schemes match the current MCP direction. |
| Logto OSS as MCP authorization server | **REVALIDATE** | Current Logto still supports MCP/resource/CIMD patterns. Re-run exact current ChatGPT conformance and production operations; do not redesign auth first. |
| ProConnect federation | **REVALIDATE + EXTERNAL ACTION** | Keep as intended institutional user identity if current integration remains valid. Production registration/authorization belongs to the institution/operator. It is not suitable as the only OpenAI reviewer login path. |
| C5 "store each user's personal Grist API key" | **REJECT** | It is unnecessarily broad now that Community service accounts exist, and a public plugin must not solicit authentication secrets through its model/plugin data path. |
| Grist Community service accounts | **ADAPT** | Use one service account credential per bridge principal (or equally narrow operational identity), with Grist-native resource grants and rotation/revocation. Never expose service-account administration to the model. |
| Existing `StaticApiKeyCredentialProvider` | **KEEP for single-principal/dev only** | Retain the simple controlled mode; it must not be described as multi-user upstream isolation. |
| C6 deployment/preflight/smoke material | **KEEP / SIMPLIFY** | Existing secret-safe preflight, health checks and rollback discipline are useful. Update stale assumptions about one `GRIST_API_KEY`; add only missing production controls. |
| C6 per-principal rate limiting / alert inputs | **REDO SMALL** | Implement the minimum identity-aware limiter and secret-safe operational counters/events. Alert routing/storage can remain deployment infrastructure. |
| GPT Actions/OpenAPI compatibility path | **REJECT** | MCP v2 is the product contract and current public plugin submission accepts remote MCP directly. Do not rebuild a duplicate Actions surface. |
| S0 public eligibility analysis | **REVALIDATE / EXTERNAL REVIEW** | The current unofficial-connector rule remains. Factual authorization/terms/branding basis must be documented, but only OpenAI review decides approval. |
| S1 `chatgpt-app-submission.json` / 23-tool package | **REDO** | It describes the retired v1 surface and is not a submission artifact for the ten-tool v2 candidate. Rebuild from the lean registry and current portal requirements. |
| Existing 5-positive / 3-negative scenario ideas | **REVALIDATE** | Preserve useful generic scenarios, but rewrite them against MCP v2 names/semantics and the final reviewer fixture. |
| Historical domain challenge implementation | **REDO SMALL if public submission proceeds** | R3 removed it from the candidate runtime. Current portal still requires a well-known domain-verification token on the final host. Re-add only the exact bounded route when needed. |
| C7 reviewer environment | **REDO SMALL** | One synthetic Grist fixture, one isolated reviewer identity with no MFA/email/SMS dependency, and one reviewer service-account credential are sufficient. |
| C8 public submission/publish | **EXTERNAL ACTION** | Publisher verification, global-residency OpenAI project, domain token, final Tool Scan, reviewer credentials, rights/branding basis, submit/review/publish decisions cannot be manufactured by repository code. |

## New credential boundary

The production Community path should be:

```text
ChatGPT / Codex
      |
 MCP OAuth 2.1
      v
Logto (federated to ProConnect for normal users)
      |
 validated principal
      v
grist-chatgpt
      |
 principal -> operator-provisioned secret lookup
      v
Grist service-account API key
      |
 native Grist grants of that service account
      v
Grist Community
```

Properties:

- the user never enters a Grist API key into an MCP tool, prompt or ChatGPT field;
- the bridge never receives or stores the user's personal Grist API key;
- the bridge does not create service accounts through model-facing operations;
- service-account creation, resource grants and key rotation are operator-side administration;
- the bridge only consumes a principal-to-service-secret mapping from protected deployment state;
- Grist remains authoritative: a service account can access only resources that Grist itself grants to it;
- removing/expiring the service account or deleting its key removes upstream authority independently of bridge OAuth;
- missing principal mapping fails closed.

For the first production implementation, a **read-only operator-mounted secret mapping file** is sufficient and preferable to a new database/encryption subsystem. The bridge does not write this file. Operators may source/mount it from systemd credentials, Docker secrets or another secret manager without changing product semantics. Rotation may initially require an atomic file replacement plus controlled service restart; hot-reload is not a product prerequisite.

## Public distribution boundary

There are two distinct readiness targets:

### Production/private or controlled deployment

This is technically achievable without public-directory approval once R5-B through R5-D below pass. It can serve authorized principals against the configured Community instance.

### OpenAI public plugin directory

This additionally depends on external review and publisher facts. In particular:

- the product integrates with a third-party service, so its factual authorization/terms basis must be documented;
- Grist Community's Apache-2.0 code, documented REST API and explicit acknowledgement of community MCP servers are relevant evidence, but they do **not** by themselves decide OpenAI's "unofficial connector" primary-function test or trademark/branding questions;
- the listing must remain explicit that the project is independent/non-official unless a durable authorization says otherwise;
- actual OpenAI review is the authoritative eligibility decision.

Public-directory uncertainty must not force extra runtime architecture into the core.

## Finite R5 implementation set

R5-A commits the following finite sequence and nothing beyond it.

### R5-B — production OAuth revalidation

Revalidate the existing provider-neutral OAuth path against the current ten-tool MCP v2 candidate and current OpenAI contract.

Required result:

- current ChatGPT/Codex OAuth connection using protected-resource metadata, PKCE `S256`, resource binding and CIMD (preferred) or an explicitly justified current alternative;
- exact per-tool OAuth `securitySchemes` for the ten lean tools;
- issuer/audience/expiry/scope failures remain fail-closed;
- current Logto configuration/probes and deployment docs updated without provider-specific logic entering bridge core;
- one reviewer-capable Logto identity path can authenticate without inaccessible MFA/SMS/email steps;
- no new public scope unless a separately reviewed need is demonstrated.

Production ProConnect registration/secrets remain an external action; R5-B can validate the generic path without inventing those values.

### R5-C — Community service-account credentials

Replace the shared upstream credential only for multi-principal production mode.

Required result:

- add a principal-aware `GristCredentialProvider` implementation that reads a protected operator-mounted mapping and returns the mapped Grist service-account API key;
- keep `StaticApiKeyCredentialProvider` for controlled single-principal/dev deployments;
- no MCP/API/tool accepts a Grist credential or service-account key;
- missing/invalid principal mappings fail closed and never fall back to a shared master key;
- document operator provisioning/permission/expiration/rotation/revocation using Grist's native service-account API;
- integration evidence with at least two service accounts proves distinct Grist resource authority and no cross-principal credential/context reuse;
- do not add a generic service-account/ACL administration surface.

### R5-D — minimal operational hardening

Add only controls justified by a real public/controlled server:

- per-principal request/rate bounds appropriate to the ten-tool surface;
- secret-safe operational counters/events sufficient for external alerting;
- production dependency/security check and controlled release/rollback smoke;
- exercise OAuth issuer/JWKS outage/recovery and service-account credential rotation/revocation;
- ensure logging/retention guidance remains compatible with current OpenAI privacy/data-minimization expectations;
- keep alert transport, log backend and secret manager outside core unless a concrete deployment need proves otherwise.

### R5-E — reviewer and current plugin package

Rebuild submission/reviewer material from the frozen v2 contract only after R5-B/C/D are green.

Required repository result:

- remove or replace stale v1/23-tool submission artifacts and tests;
- current ten-tool metadata, annotations and OAuth schemes match the live MCP endpoint;
- exactly five positive and three negative cases target the final generic reviewer fixture;
- one synthetic reviewer document/account/service-account path is documented and exercised;
- listing/starter-prompt/release-note/privacy-data inventory material reflects actual v2 behavior;
- bounded domain-verification route is available for a portal-issued token when public submission is actually attempted;
- final endpoint can pass Tool Scan and the reviewer scenarios before submission.

Actions that require real OpenAI/Grist/institutional credentials or publishing authority remain external and are never replaced by invented values.

## External actions / human gates after the finite code path

The following are explicitly **not autonomous repository actions**:

1. select/own the production hostname and supply deployment secrets;
2. enable/service-account administration on the target Grist Community instance and provision final principals/resources;
3. complete any required institutional ProConnect registration/authorization;
4. choose and verify the public publisher identity and ensure the OpenAI submission project uses global rather than EU data residency while that restriction exists;
5. hold Apps Management write permission in the publishing organization;
6. publish website/support/privacy/terms pages and provide the demo recording URL;
7. establish and record the factual third-party API/instance/branding authorization basis without implying an official Grist Labs/DINUM/OpenAI affiliation;
8. configure the portal-issued domain-verification token, run final Tool Scan and provide reviewer credentials;
9. submit for review, respond to review findings and make the explicit publish decision after approval.

The current OpenAI unofficial-connector rule means step 9 may still reject the public listing even if the technical product is sound. Such a review outcome must be treated as evidence, not worked around by misleading naming or architecture.

## R5-A conclusion

**R5-A is complete as an audit candidate.**

The old largest technical blocker — a bespoke encrypted store of every user's personal Grist API key — is no longer part of the target architecture. Grist Community service accounts provide the upstream least-privilege identity primitive; the bridge only needs a small principal-to-operator-secret selector plus current production OAuth and operations hardening.

The next committed work, after independent review of this roadmap-changing audit, is R5-B followed by R5-C, R5-D and R5-E. Public submission itself remains an explicit external gate.