# Privacy Policy — Gia by L’Œil du Maître

Effective date: 2026-09-30

Gia by L’Œil du Maître is an independent remote MCP plugin published by Emmanuel Blanchard. It is designed to let an authenticated user inspect and make bounded changes to documents on one configured self-hosted Grist Community deployment.

This plugin is independent and is not affiliated with, endorsed by, or sponsored by Grist Labs, DINUM, or OpenAI. Grist is a trademark of Grist Labs, Inc.

## Data processed

The plugin processes only data needed to perform the Grist operation requested by the user:

- OAuth/OIDC identity data needed to authenticate the user and derive the plugin's internal principal, including email information when provided by the authorization server;
- Grist workspace, document, table, column, page, widget, relationship and record identifiers or metadata needed for the requested operation;
- Grist record values explicitly requested for reading or mutation;
- bounded operational metadata used for security, troubleshooting and audit, such as timestamps, pseudonymous principal identifiers, document identifiers, request identifiers and outcome classes.

The bridge does not intentionally return or expose OAuth access, refresh or ID tokens, authorization codes, PKCE verifiers, Grist API keys, service-account credentials, principal-map contents or server secrets.

## Purposes

Data is processed only to:

- authenticate and authorize the current user;
- select the Grist authority assigned to that authenticated principal;
- perform the user's requested Grist read or bounded mutation;
- return the result to the requesting MCP client;
- maintain minimal security, abuse-prevention, troubleshooting and audit records.

Data is not sold, used for advertising, or used by the plugin publisher to build advertising profiles.

## Recipients and systems involved

Depending on the requested operation, data may be processed by:

- the user's ChatGPT or other MCP-capable client, which sends the request and receives the requested tool result;
- the configured OAuth/OIDC authorization service used to authenticate the user;
- the configured self-hosted Grist Community instance, which remains the authoritative data and permission system;
- the server infrastructure hosting this MCP bridge, solely to execute requests and retain the limited operational records described below.

Those external services are governed by their own privacy terms where applicable.

## Retention

The bridge does not create a separate durable database containing copies of Grist document contents.

For the public deployment:

- request and tool payload contents are not intentionally written to operational logs;
- low-cardinality operational events contain no user or document payloads;
- protected audit records may contain pseudonymous principal identifiers, authorized document identifiers and request identifiers;
- operational and audit logs are retained for no more than 30 days, unless a shorter period is required by the deployment operator for security or incident response;
- secrets and authentication credentials are not retained in model-visible logs or public evidence.

Data stored in Grist is retained according to the user's Grist deployment and is not deleted merely because the plugin is disconnected.

## User controls

Users can control plugin processing by:

- choosing which requests to make and which Grist resources to target;
- relying on native Grist permissions, which remain authoritative;
- disconnecting or revoking the plugin/OAuth authorization in the relevant client or identity-provider settings;
- asking the deployment operator to remove their principal-to-service-account mapping where applicable;
- deleting or changing their data directly in Grist when they have the required Grist permission;
- requesting deletion of retained plugin operational records through the support channel below, subject to security and legal requirements.

## Restricted data

The public plugin is not intended to collect, solicit or process:

- payment-card data subject to PCI DSS;
- protected health information (PHI);
- government identifiers such as national identity or social-security numbers;
- passwords, API keys, MFA/OTP codes or other authentication secrets.

Do not place such data in plugin prompts, tool arguments or Grist documents intended for processing through this public plugin. Other regulated sensitive or special-category personal data should not be processed through the public deployment unless there is a lawful and explicitly disclosed basis for doing so.

## Security

The plugin uses bounded semantic MCP operations, OAuth authentication, per-principal authority mapping, Grist-native permissions, rate limits and secret-minimized operational logging. The bridge is designed so that it may reduce upstream authority but does not elevate Grist permissions.

No online service can guarantee absolute security. Users should grant only the minimum Grist access necessary for their intended work.

## Changes

This policy may be updated when the public plugin, deployment or applicable requirements change. Material changes will be published in this repository with a new effective date.

## Contact and support

Support and privacy requests: https://github.com/djibian/grist-chatgpt/issues

Project source and public documentation: https://github.com/djibian/grist-chatgpt
