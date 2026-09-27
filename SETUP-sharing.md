# List sharing (phase E)

Ported from Lead Qualifier's `SETUP-team.md` and sharing cases in
`tests/team-test.py`. No leaderboard, contest, domain-team, or firm-wide pool
behavior is added.

Run the normal migration job before deploying this version. Migration 020 adds
`prospect_list_shares`; the existing list owner remains `prospect_lists.user_id`.
There is no ownership transfer. Shares cascade on list deletion.

In Contacts, **Manage list** lets the owner share by email as editor or viewer,
update an existing recipient's role, inspect recipients, revoke, rename, or
delete. Recipients see "shared by" and their role in the list selector. They can
leave from Manage list. Email lookup requires an existing verified, enabled
Firebase account. Authorization uses its UID, never email/domain matching; a
new account obtaining the same email does not inherit an old UID's shares.
No invitation or notification is sent.

| Operation | Owner | Editor | Viewer |
|---|---|---|---|
| Read list contacts and export unsuppressed rows | Yes | Yes | Yes |
| Import CSV, correct fields, suppress, prepare contact | Yes | Yes | No |
| Remove contact membership | Yes | Yes | No |
| Inspect recipients, share, change role, revoke | Yes | No | No |
| Rename or delete list | Yes | No | No |
| Leave shared access | No | Yes | Yes |
| Permanently delete a person across the account | Yes | No | No |
| Run paid provider jobs / copy to advisor worklist | Own account | Own account only | Own account only |

## API

- `GET /api/prospect/lists` returns owned and explicitly shared lists, with
  `role` and `shared_by`. It returns no unshared list metadata.
- `GET|POST /api/prospect/lists/:id/shares`: owner-only inspection or
  `{email, role: "editor" | "viewer"}` upsert.
- `DELETE /api/prospect/lists/:id/shares/:recipient_uid`: owner revocation.
- `DELETE /api/prospect/lists/:id/shares/me`: recipient leaves.
- Existing `PATCH|DELETE /api/prospect/lists/:id`: owner only.
- `GET /api/prospect/lists/:id/contacts` and `GET|PATCH .../contacts/:contactId`:
  list-scoped directory and detail/corrections/suppression.
- `POST .../contacts/:contactId/prepare`, `POST .../import`,
  `POST .../import/preview`, `POST .../export`, `POST|DELETE .../members`:
  checked against the list role and current membership.
- Existing `GET /api/prospect/contacts?list_id=:id` and CSV import endpoints
  with `list_id` also accept authorized shared lists.

List IDs stay opaque UUIDs. No email addresses are placed in URLs. Unshared
and missing lists both return 404. A known recipient attempting a forbidden
operation receives 403. Authentication and same-origin enforcement stay in
`handler.mjs`; caller-supplied owner/role fields never grant access.

## Isolation and lifecycle

A shared adapter allowlists routes, checks the role, and pins access with a
parent-list row lock for the entire transaction. Mutations take `FOR UPDATE`;
reads take `FOR SHARE`. Share changes, leaving, deletion, membership writes,
and imports use the same parent lock before contact advisory locks. The
transaction-scoped workspace cannot route jobs or inspect the owner's private
imports, saved searches, data-quality reports, or other list memberships.
Revocation waits for earlier authorized operations and blocks later ones.

Contacts remain owner-owned. Editing a shared contact is visible wherever the
owner uses that same contact, but other list names/memberships are not exposed.
Editors add new contacts via CSV; they cannot attach guessed private contact
IDs. A CSV matching a private owner record is refused with a generic message,
without exposing or merging its values and without creating a duplicate that
could discard suppression. Owner import fingerprints are unchanged; shared
imports have a separate actor-scoped replay key. Shared corrections and CSV
provenance record the acting UID. Verification expiry remains server-maintained
and shared reads only refresh contacts in that list.

Leaving/revoking deletes that recipient's saved searches for the list. Deleting
a list deletes recipient searches rather than silently widening their scope;
the owner's existing search cleanup behavior is preserved. Contacts remain in
the owner's directory. Permanent person deletion still cascades memberships;
this table stores advisor access identities, not prospect data, so it does not
add prospect PII requiring an additional `forgetPerson` deletion path.

## Validation

`test/list-sharing.test.mjs` uses PGlite with authenticated HTTP requests and
synthetic fixtures: role matrix, mixed/private ID denial, account isolation,
UID/email separation, import preview/replay, suppression, field correction,
preparation, membership removal, role downgrade, revocation, leaving, cascade,
saved-search cleanup, role validation, session rejection, and CSRF.
Run `node build.mjs` and `pnpm test` before pushing. PGlite verifies PostgreSQL
queries and transactions; it does not simulate multiple independent database
sessions or production Firebase/IAM. The deployment must run migration 020 and
retain Firebase Admin user-lookup permission for sharing by email.
