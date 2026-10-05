# Security

Grist remains authoritative for the selected upstream credential's permissions.
Gia can reduce that authority through the intersection of deployment resource
ceiling, principal grants and required capability; it cannot elevate it.
The capability vocabulary is exactly `doc:read`, `doc:write`, `doc.schema:write`.

## Authentication and credentials

Static bearer authentication is a controlled single-principal mode. OAuth mode
verifies JWT signatures using configured HTTPS JWKS, issuer, resource audience,
expiry and optional `nbf`; rejects unsupported critical JOSE extensions; enforces
algorithm/key-family/curve compatibility and at least 2048-bit RSA keys.
Unknown or unavailable verification state fails closed. Invalid authentication
returns a sanitized challenge; JWKS availability failure returns HTTP 503.

The exact validated OAuth issuer/subject produce an opaque non-reversible principal ID;
identity strings are not trimmed or canonicalized; malformed Unicode is rejected
before UTF-8 hashing. OAuth scopes
restrict capabilities; they neither grant Grist access nor create resource authority.
Each OAuth request gets a fresh principal-bound Grist client/context/cache.
The transport access token is used only for verification and is never forwarded
to Grist; upstream credentials come exclusively from the server-side provider.

`principal-map` credentials are loaded once from a protected operator-mounted
read-only file. Missing/invalid mapping or an unmapped principal fails closed.
`GRIST_API_KEY` is forbidden in this mode. Static upstream credentials are for
controlled single-principal use, not production multi-principal isolation.
Service-account provisioning, grants, expiry, rotation and revocation remain
operator-side Grist administration. See [Operations](OPERATIONS.md).

## Enforced invariants

1. **Secret exclusion.** API keys, bearer/OAuth/refresh tokens, authorization codes,
   PKCE verifiers, cookies, encryption/session secrets, LinkKeys, credential-map
   contents and raw provider subjects never become model outputs or committed
   artifacts. Do not log payloads, arbitrary upstream bodies or secret-bearing URLs.
2. **Principal isolation.** Credentials, clients, contexts, discovery and caches
   never cross principal boundaries. Static mode has one explicitly controlled principal.
3. **Native authority.** Local capabilities are additional restrictions. A denial
   never causes credential substitution, role/grant changes or bypass of Grist enforcement.
4. **Closed surface.** No generic HTTP/SQL, arbitrary `/apply`/UserAction, browser,
   file/system command or heterogeneous action-list input. Private native actions
   use fixed validated translations for supported semantic operations only.
5. **Explicit bounds and targets.** Closed schemas validate counts, stable current
   identifiers and supported fields. Destructive actions require exact explicit targets.
6. **State preservation.** Read-modify-write operations preserve unrelated human
   configuration. Incomplete, censored, malformed, ambiguous or unsupported metadata
   refuses unsafe writes; native references are resolved server-side rather than guessed.
7. **Effect knowledge.** Confirmed partial writes retain completed targets/counts.
   Response loss and unverified post-state are not proven no-effect. Results forbid
   blind whole-operation replay; known created IDs are retained. No guessed cleanup.
8. **Minimized output.** Inspection favors structure; rows are queried explicitly.
   Formula, cell, comment and external content are untrusted data and cannot alter
   authorization or tool policy. Numeric compatibility output is limited to the
   supported safe shape and is distinct from stable mutation inputs.
9. **Operational isolation.** Rate limits are per authenticated principal; general
   operational events contain no principal/document identifiers. Protected audit
   identifiers never become general metric labels or a model retrieval surface.

## Application access rules

Both ACL inspection and mutation require fresh native document metadata proving
`access === "owners"` before ACL metadata is read. Editing additionally requires
local `doc.schema:write`; native Grist Owner enforcement remains mandatory.

Only ordinary stable table/column groups and the contract's typed secret-safe
conditions/permission subset are writable. Opaque formulas, memos, user attributes,
legacy/special/default/schema-edit policy and virtual overlays are not converted
into editable model content. Incomplete/censored/truncated metadata, overlapping
targets or lossy normalization refuses mutation. Untargeted persisted policy is
fingerprinted internally and verified unchanged after the write.

Persisted rule verification is **not** proof of effective enforcement or
confidentiality. Native defaults, structure/schema-edit permissions and formulas
remain decisive. Hidden fields and saved filters are presentation state.
A generated summary table has its own native policy; source ACL inheritance is
not asserted. Gia does not evaluate permissions or administer identities/shares.

## Document bootstrap

Creation/copy requires both the explicit deployment workspace ceiling and one
same-principal grant naming that workspace with `doc.schema:write`.
A document-only grant or capabilities from unrelated grants cannot manufacture
destination authority. Template copy separately requires source `doc:read`;
Grist's native copy/download and destination `ADD` authorization remain decisive.

Creator ownership and destination inheritance are native effects. A new document
ID never widens the bridge allowlist. Discovery is invalidated on every creation
attempt. Known created IDs survive failed membership verification; ambiguous
creation is not replayed by name or automatically deleted.

A native template is a bootstrap primitive, not a privacy scrub: it removes
user-table data, attachments/history according to Grist behavior while retaining
substantial metadata, formulas, comments/configuration and policy. Effective copied
policy is not guaranteed after referenced data is removed.

## Deployment and reporting

The process binds only to localhost behind an HTTPS reverse proxy with an explicit
host allowlist. Keep production operation limits finite, protect secret files and
audit sinks, and test native account rotation/revocation without logging keys.
No log backend, alert transport or secret database is embedded in the product.
Applicable hosted-service obligations remain in [Privacy](../PRIVACY.md),
[Terms](../TERMS.md) and [Support](../SUPPORT.md).
