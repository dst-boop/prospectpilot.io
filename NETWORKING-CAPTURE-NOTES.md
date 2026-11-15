# Private networking capture

`/networking` adds quick, owner-only capture for an in-person conversation, a warm introduction, a referral, or a manual entry. The Contacts navigation links to it, and sign-in returns to the capture page.

## Data and access

- A first name, last name, source/meeting context, and a company, individual work email, or LinkedIn profile are required. Existing conservative contact identity rules still apply. Ambiguous or conflicting identities save no capture.
- A new person creates an unverified contact and a private capture in one transaction. A matching contact is left entirely unchanged, including its verification, suppression, contact fields, and source history. Supplied details remain visible only in the owner's private capture.
- Referrer context and introduction permission are explicit observations. They do not verify a relationship, authorize outreach, clear restrictions, qualify assets, create a worklist item, or change a shared list.
- Each capture keeps its own submitted details, source context, note, optional interaction date, and permission evidence. Later entries preserve earlier observations. The recent-capture view shows the latest 20 records and says when older records remain saved.
- The authenticated API is `/api/prospect/networking` (GET/POST). Writes require the exact same Origin. Shared-list routes cannot read or write this ledger. The page has a restrictive CSP, no-referrer policy, and private/no-store responses. Notes render as text and are not stored in browser storage.
- A stable request key makes retries idempotent. Reusing a successfully saved key with different details returns 409. If a contact and its capture were deleted, retrying their old request returns 409 rather than reporting a nonexistent saved capture.
- Deleting a contact first derives normalized directory and Research Lab identity keys from only its owner-matching captures' person fields. Only hashes survive for that owner, so captured-only identities cannot silently return; private aliases never affect another owner. Deletion then cascades its private captures. Networking import caches retain no names or contact diagnostics, including for matched contacts whose source history is intentionally unchanged.

## Interaction behavior

- Clear form opens an inline, labeled confirmation when unsaved edits exist. Focus starts on Keep editing. Keep editing or Escape dismisses it and restores focus to Clear form; confirming clears only the form and focuses First name. A clear confirmation never sends an API write.
- Editing clears old result messages. Pending saves disable the fieldset and block repeated save/clear actions. A failed save retains the same request key for a safe retry.
- A restored page refreshes recent history, and stale history responses cannot overwrite newer ones. Unsaved page navigation uses the browser's normal leave-page warning.

## Migration and rollback

Migration 032 creates `prospect_networking_captures` and its owner/history index. It uses the existing PostgreSQL database and migration runner. Runtime assets are included in the Docker image.

Do not roll back to arbitrary older application code. Even with this table retained, old contact deletion can cascade away captured aliases without tombstones, allowing later reimport. A compatible immutable rollback floor must already be verified and serving before networking writes are enabled. Keep schema 032, captures and tombstones; see [the networking release gate](NETWORKING-RELEASE-GATE.md). Its checked-in floor policy is empty, so routine release is blocked before any build or migration. No production migration, data access or deployment is part of this change.

## Verification scope

Focused coverage is in `test/networking-capture.test.mjs` and `test/networking-client.test.mjs`. It includes validation, owner isolation, shared-contact privacy, exact-origin protection, transaction rollback, replay/deletion behavior, private-data cleanup, inline clear/cancel/Escape, repeated submit, retry, text-only rendering, and simulated restored-page history.

Original feature-branch validation on 2026-11-15: focused tests 13/13 passed; the complete `test/*.test.mjs` suite passed 624 with 1 skipped and no failures (115.9 seconds, bounded to four minutes). The skipped existing PostgreSQL concurrency test requires `POSTGRES_TEST_URL`. `node build.mjs`, JavaScript syntax checking, and `git diff --check` passed. Independent code/security review found no remaining actionable findings after the replay, shared-contact, and deletion-cache fixes.

The automated client tests use a simulated DOM. Subsequent integration verification used a fresh Chrome tab and an in-memory synthetic demo on loopback port 8113: inline Clear/Keep editing/Escape, confirmed Clear, new capture, matching referral, literal-text notes, Contacts and Back/Forward recovery, and Cancel with an empty form all passed. Recent history retained two captures while the directory held one matching contact. No warning/error console entries were observed. The native unsaved-navigation warning and real Firebase/staging login were not exercised; no claim is made for them. A viewport screenshot is saved locally at `.tmp/integration-networking-desktop.png`.


## Firm-scoped snapshot boundary

The isolated firm snapshot rejects a source-assigned contact with linked networking captures via an existence-only query, because the private ledger has no approved firm-transfer assignment. It never reads private notes or person payloads. Unrelated captures and target contacts used only as collision candidates do not change the source inventory or disclose private content. The snapshot remains incomplete and cannot authorize transfer.
