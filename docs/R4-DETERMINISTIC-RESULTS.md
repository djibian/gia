# R4 deterministic validation results

This record supplements `docs/R4-VALIDATION-CAMPAIGN.md` with current results for validation classes that are more reliably proved by deterministic fault/security tests than by destructive live experimentation.

## Candidate exercised

- exact integrated candidate: `ab22a1620e127db5e49c1b9c90d8aaaaa3adc62e`;
- GitHub Actions CI run: 603;
- result: PASS;
- test kind: deterministic unit/contract fault and security validation against the active candidate path.

The CI run executes the repository's current `npm test` suite after check/audit steps and before build. These are not historical evidence-only files: the tests below are part of the active suite on the exact R4 candidate.

---

## R4-6 — Partial / ambiguous failure

**Result: PASS**

### Boundary validated

A mutating Grist request whose effect cannot be known must not be reported as a definite failure and must not invite blind whole-operation replay. Confirmed effects from earlier batches must survive later ambiguous or definite failures.

### Active evidence

`test/j0-uncertain-writes.test.ts` exercises the current `GristClient`, `GristService` and public MCP error projection:

- transport loss during a mutation produces an uncertain effect state;
- mutating HTTP 5xx is conservatively uncertain;
- mutating HTTP 4xx also remains uncertain unless endpoint semantics prove no effect;
- read-side transport failure remains non-mutating / not-applied;
- a confirmed earlier batch is retained when a later batch becomes uncertain;
- a confirmed earlier batch is retained when a later batch fails definitely;
- public error results expose confirmed effects/counts needed for recovery;
- `retryWholeOperation` is false for uncertain and partial writes.

### Why no live forced fault is required for PASS

A live network interruption cannot make the semantic invariant more precise: it would only exercise one timing point while risking an uncontrolled mutation of a real fixture. The deterministic tests inject the exact ambiguous boundaries in the active transport/service/result path and are rerun on the candidate by CI.

R4 therefore does not create a bespoke chaos transport or deliberately corrupt a real Grist document merely to repeat this proof. A future real incident may still add evidence, but it is not a prerequisite for this class.

### Unsupported / excluded

This result does **not** claim transactional atomicity across Grist batches. The supported behavior is explicit non-atomic/uncertain reporting plus no blind replay.

---

## R4-7 — Authorization / isolation

**Result: PASS for the candidate's declared bridge security boundary**

### Boundary validated

The bridge may reduce authority but must not broaden it. Principal-bound credentials, discovery state and caches must remain isolated. Credentials/tokens and internal metadata must not become model-visible outputs.

### Active evidence

`test/access-policy.test.ts` verifies the deployment resource ceiling and rejects a document outside the configured document/workspace scope.

`test/authorization-service.test.ts` verifies intersection of deployment scope with principal resource grants and capabilities:

- a document granted only `doc:read` is rejected for `doc:write`;
- a principal lacking `doc.schema:write` is rejected for schema mutation;
- internal secret-bearing discovery fields are removed from returned resource metadata.

`test/grist-context-factory.test.ts` creates two different principals whose credential provider returns two different Grist API keys, then proves:

- a separate principal-bound client/context is created for each principal;
- each context discovers only the document returned under its own credential;
- each context keeps its own discovery cache;
- repeated cached discovery for principal A cannot return principal B's document, and vice versa.

`test/grist-credentials.test.ts` verifies that the current principal is passed to the credential provider and that an empty credential is rejected.

`test/oauth-request-context.test.ts` verifies that the raw OAuth bearer is delivered only to the verifier, is absent from the derived principal, and that failed token verification prevents Grist-context construction.

`test/oauth-tool-security.test.ts` derives MCP OAuth scopes from the normative operation registry so read/data-write/schema-write capabilities do not drift into independent ad-hoc tool annotations.

`test/public-metadata.test.ts` verifies that private numeric engine references and unrelated internal Grist metadata are not projected into public table/column metadata, with unexpected upstream shapes failing closed.

All of these tests passed in CI run 603 on the exact candidate SHA above.

### Upstream-authority statement

Grist remains authoritative. The bridge has no generic HTTP forwarding, raw SQL model surface or arbitrary `/apply` / UserAction escape hatch that could be used to bypass the configured Grist credential. Its own resource/capability policy can only narrow the operations reachable through that credential.

The deterministic isolation test additionally demonstrates that the credential-provider seam is capable of principal-specific credentials without sharing clients/discovery caches when such a provider is used.

### Explicit supported / unsupported boundary

The current default controlled deployment uses static MCP bearer authentication plus one server-side Grist API key. Optional OAuth distinguishes MCP principals, but the current production candidate may still use a shared configured server-side Grist API key unless a principal-specific credential provider is supplied.

Therefore this PASS means:

- bridge resource/capability authorization: supported and validated;
- principal-derived context/client/cache separation: supported and validated;
- secret/token minimization at the bridge boundary: supported and validated;
- per-user upstream Grist credential custody/onboarding in the production deployment: **not claimed by R4 and deferred to R5**.

R4 does not relabel a shared upstream credential as per-user Grist isolation.

---

## Remaining campaign classes after this record

Classes 1–5 still require the integrated MCP v2 candidate to operate against the prepared real Grist fixtures; class 8 remains conditional on those runs revealing a browser-only postcondition; class 9 still requires an evidence-backed Grist Community support-version statement and execution against the declared version boundary/boundaries.

The currently connected Grist tool surface is the older granular connector, not the integrated ten-tool MCP v2 candidate. It may prepare/observe fixtures but cannot be used as counterfeit end-to-end evidence for classes 1–5 or 9.
