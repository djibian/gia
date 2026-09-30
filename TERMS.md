# Terms of Use — Gia by L’Œil du Maître

Effective date: 2026-09-30

These terms govern use of the public Gia by L’Œil du Maître plugin and its hosted remote MCP endpoint.

Gia by L’Œil du Maître is an independent project published by Emmanuel Blanchard. It is not affiliated with, endorsed by, sponsored by, or an official product of Grist Labs, DINUM, or OpenAI. Grist is a trademark of Grist Labs, Inc. References to Grist Community describe compatibility with that software and do not imply endorsement.

## 1. Purpose

The plugin provides bounded semantic operations for inspecting, querying and modifying data, schema, pages and widgets on one configured self-hosted Grist Community deployment through an MCP-capable client.

The plugin does not provide generic HTTP forwarding, raw SQL access, arbitrary Grist actions, account creation, organization administration or Grist ACL administration.

## 2. Authorized use

You may use the plugin only for Grist resources and data that you are authorized to access or modify. Native Grist permissions remain authoritative.

You are responsible for reviewing the intended operation, especially before approving a write or destructive action, and for maintaining appropriate backups and access-control practices for important Grist data.

You must not use the plugin to bypass Grist permissions, security controls, access restrictions or applicable law.

## 3. Restricted data

Do not use the public plugin to collect, solicit or process:

- payment-card data subject to PCI DSS;
- protected health information (PHI);
- government identifiers such as national identity or social-security numbers;
- passwords, API keys, MFA/OTP codes or other authentication secrets.

Do not paste credentials or secrets into prompts or tool arguments. Other regulated sensitive or special-category personal data should not be processed through the public deployment unless its processing is lawful, necessary for the stated function and explicitly disclosed where required.

## 4. Authentication and third-party services

Use of the plugin may require authentication through an OAuth/OIDC identity provider and access to a configured Grist Community instance. Those services are separate from this plugin and may have their own terms and privacy policies.

Disconnecting the plugin does not delete data stored in Grist.

## 5. Open-source code and hosted service

The source code in this repository is licensed under the repository's Apache License 2.0. That software license governs copying, modification and distribution of the source code.

These Terms govern use of the publisher-operated public plugin endpoint and directory listing. They do not replace the open-source license.

## 6. Availability and changes

The public endpoint is provided on a best-effort basis. Availability, latency and compatibility are not guaranteed. The publisher may modify, suspend or discontinue the public endpoint, or revoke access when necessary for security, abuse prevention, maintenance or compliance.

Published tool names and schemas are intended to remain stable where practical, but compatible changes may be introduced as the underlying software or platform requirements evolve.

## 7. No warranty

To the extent permitted by applicable law, the public plugin is provided "as is" and "as available" without warranties of uninterrupted operation, fitness for a particular purpose, or error-free results.

Users remain responsible for verifying important data changes and for the consequences of instructions they authorize the plugin to perform.

## 8. Limitation of responsibility

To the extent permitted by applicable law, the publisher is not responsible for indirect or consequential loss arising from unavailable third-party services, user instructions, insufficient backups, unauthorized use of an account, or changes performed within the authority the user has granted.

Nothing in these Terms excludes rights or liabilities that cannot lawfully be excluded.

## 9. Privacy

Use of the plugin is also governed by the public Privacy Policy:

https://github.com/djibian/gia/blob/main/PRIVACY.md

## 10. Changes to these Terms

These Terms may be updated when the service, deployment or applicable platform requirements change. The current version and effective date will remain published in this repository.

## 11. Support

Support requests: https://github.com/djibian/gia/issues

Project source and documentation: https://github.com/djibian/gia
