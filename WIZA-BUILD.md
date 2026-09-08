# Wiza-style ProspectPilot — active build

Goal: create an application like Wiza, centered on professional contact search, list building, email and phone enrichment, verification and exports. The existing retirement Research Lab remains a separate workflow. This goal is not complete merely because local tests pass.

## Current implementation

- Authenticated `/prospect` workspace with professional contact search by name, title, company, location, industry, seniority, email status and contact availability.
- PostgreSQL storage for contacts, lists and membership, saved searches and import history; migration 008.
- CSV acquisition with deduplication, identity-conflict rejection, source labels, suppression preservation and no imported verification claims.
- List creation, add/remove members, saved filters, pagination and suppression-aware CSV export.
- Production root routes to the contact workspace; Research Lab remains at `/lab`.
- Loopback synthetic demonstration includes the new workspace, using the actual database and API code.
- Initial People Data Labs search/enrichment and Hunter email-verification adapters are implemented and contract-tested with mocked provider responses. They are wired to durable provider jobs; live provider calls remain untested. Official references: https://docs.peopledatalabs.com/docs/reference-person-search-api and https://hunter.io/api-documentation.

## Required work before completion

- Connect a real professional-contact search/enrichment provider, including phone enrichment, with server-side credentials and precise identity matching. Never imply the local directory is a proprietary global database.
- Implement email verification through a real provider, preserving catch-all/unknown/invalid states and freshness.
- Durable bulk jobs, idempotency, progress, conservative cost reservations and interruption handling are implemented and tested. Validate the deployed worker and real billing behavior before completion.
- Provider setup/readiness and enrichment actions are implemented. Supply licensed provider configuration in both the service and worker; see PROVIDER-SETUP.md.
- Validate the complete search → list → enrich → verify → export journey, including failures and access isolation.
- Review whether browser capture and CRM integration are required to satisfy the user's intended Wiza workflow; implement requested capabilities without extracting session cookies or private-profile data.
- Publish updated repository changes and verify production deployment when its environment is available. Do not treat the synthetic demonstration as deployment or real-data verification.

## External dependencies

Provider API access has been requested from the user (provider name only; secrets belong in configuration). There is no evidence yet of licensed contact-search or verification credentials in this workspace. Lack of credentials does not block building adapters, jobs, setup UX, and automated contract tests.

## Product reference

[Wiza Prospect overview](https://help.wiza.co/en/articles/8839911-wiza-prospect-overview): professional database search, targeted contact/company lists and bulk enrichment.
[Wiza lists workflow](https://help.wiza.co/en/articles/9211271-mastering-your-lists-page): CSV acquisition, list management and exports.

## Verified progress — 2026-09-08

- Migration 009, durable provider jobs, budget reservations, readiness UI and worker integration are implemented. Provider failures keep their reservation and are not blindly replayed.
- Lists can be renamed and deleted through the UI. Deleting a list preserves contacts and clears its scope from saved searches. Saved searches can be deleted from the sidebar.
- Older overlapping directory requests cannot overwrite newer filter results. Provider pagination preserves opaque tokens up to 5,000 characters instead of truncating at 250.
- Email checks expire after 30 days or on missing/mismatched/future evidence before status filtering and CSV export.
- `pnpm test`: 105 passing tests. `pnpm build` and `git diff --check` pass.
- Browser verified against a fresh synthetic demo on port 8089: list rename, queued verification, completed job, contact status update, and cost display. No real provider request or real spending occurred.
- Existing port 8088 demo was left running with its previous in-memory data. The updated demo serves port 8089; revalidate process status before using it in a later turn.
- Contact detail views show source, list membership, verification history and enrichment timestamps. Suppression can be set or removed in the UI; owner isolation and suppression-aware exports are tested. Browser verified the detail view and suppression toggle.
- Production deployment and live licensed provider verification are still outstanding. The overall goal remains active.

## Release readiness

- [Draft PR #4](https://github.com/dst-boop/prospectpilot.io/pull/4) contains the contact workspace. GitHub run 34191164569 passed all checks, including the production Docker image, for commit 5388ec2.
- Four additional transport tests cover contact pages/assets, signed-session ownership, cross-site write rejection, error redaction, CSV headers and version identity.
- `/version` now reports whether the contact workspace is registered. The release script requires that marker as well as the Research Lab version and exact release ID.
- Local preflight found no PDL/Hunter keys, Google application-default credentials, Google credential-path setting, or gcloud configuration. Live provider testing and deployment require an authenticated deployment environment and the configuration described in PROVIDER-SETUP.md. No secrets were read or printed.

## Source clarification

The user selected ZoomInfo with no API access. ZoomInfo CSV imports are now the primary acquisition workflow and do not depend on PDL/Hunter credentials. The import preset includes professional-field aliases and blank-placeholder handling, while preserving deduplication, suppression and unverified status for imported data. Optional API adapters remain available. Automated ZoomInfo sourcing is not implemented; validate the exact layout using a user-supplied export and measure manual/export costs separately. Cloud deployment still requires an authenticated environment.
