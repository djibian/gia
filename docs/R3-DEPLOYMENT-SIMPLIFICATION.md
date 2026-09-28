# R3 deployment simplification

## Decision

The R3 product candidate is **MCP-only at runtime**.

The historical GPT Actions/OpenAPI compatibility layer is retired instead of being kept as a second model-facing product surface.

## Why

Before this slice, every bridge start required a second `GPT_ACTION_TOKEN`, created a second static principal/context, registered `/api/v1` and `/openapi.json`, and carried separate OpenAPI schemas/tests in addition to the already-frozen MCP v2 contract.

That work did not add a generic Grist capability to the candidate. It duplicated transport/schema concerns and directly contradicted the R3 goal of a minimum coherent MCP deployment.

## Removed from the candidate

- `src/actions/*` GPT Actions/OpenAPI adapters;
- `src/openaiAppsChallenge.ts` distribution challenge route;
- GPT Actions configuration fields/tokens/capability lists;
- `/api/v1` and `/openapi.json` runtime routes;
- OpenAI challenge registration;
- tests whose only purpose was the retired HTTP/OpenAPI surface;
- OpenAPI-only assertions from otherwise useful semantic safety tests.

The underlying semantic Grist services, MCP v2 tools and bounded UI/data/schema safety tests are retained.

## Minimum controlled deployment

The default candidate needs only:

- `GRIST_BASE_URL`;
- server-side `GRIST_API_KEY`;
- at least one allowed document/workspace ID;
- `MCP_BEARER_TOKEN` (static mode, minimum 32 characters).

Limits, capability restriction, allowed public hosts and port remain optional configuration.

Provider-neutral OAuth/JWKS authentication remains available because it is already integrated into the MCP path and does not impose configuration on the default static deployment. It is not represented as production multi-user credential isolation: all contexts still use the configured server-side Grist API key.

## Deferred compatibility

Historical GPT Actions/OpenAI submission documents and the submission JSON remain repository history/evidence. They are not active requirements and do not justify retaining a duplicate runtime adapter.

If post-R4 distribution work demonstrates a current need for a non-MCP surface, R5 must reassess it against then-current platform requirements rather than silently reviving the old adapter.

## Safety effect

This is an authority-neutral reduction:

- no MCP tool or Grist semantic operation is added;
- no capability or resource ceiling is broadened;
- credentials remain server-side;
- partial/ambiguous-write behavior is unchanged;
- the active public surface becomes smaller.
