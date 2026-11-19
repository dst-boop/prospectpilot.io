# Historical identity review (schema 034 draft)

## Behavior
A committed import/correction retains minimal owner-scoped strong-identifier tokens
in a separate evidence relation. Deleting the associated record retires those
identifiers into historical review markers. Incoming individual email, LinkedIn
profile or provider contact-ID matches are held for owner review, not automatically
attributed to the deleted person. Names/company alone and shared inboxes are not
historical identity proof. Current deletion tombstones remain authoritative.

A verified admin deleting another owner's lead receives historical review coverage
only for the exact evidence of that deleted lead. Tokens retain their original
owner namespace; the marker records that specific authorized deletion grant.
Lookup derives tokens only for namespaces explicitly granted to the current user,
never arbitrary owners. Authorized explicit merges retain the original token namespace while moving only that record’s evidence to the destination owner. No deleted payload, namespace identifier or evidence
snapshot is exposed in the review API. The admin cannot read or decide the other
owner's private review queue. Lookup supports at most 1,000 granted namespaces and 50,000 namespace/arrival combinations per batch; oversized
checks fail closed rather than silently omit coverage.

CSV, networking, provider search, Research Lab ingestion, provider enrichment and
manual contact corrections check these markers. Enrichment/correction holds leave
the existing record unchanged. The owner reviews only the current incoming data,
confirms a different person and supplies a reason, or discards the arrival.
Approvals recheck current tombstones, ownership, live identifier collisions and
original revision for updates. An approval covers a specific still-live identity,
not an identifier globally; deletion/correction invalidates that coverage. Retry
and concurrent decisions cannot create a second copy. Queued networking notes
remain private and become a capture only after successful resolution.

Pending candidates are user data, not anonymized. Resolution clears candidate/input
copies; associated deletion clears matching open/resolved review details and source
report references. Stored evidence/markers contain no raw identifiers. The UI never
shows deleted-person snapshots or another owner's details. Shared-list editors
receive the same generic unavailable result as private matches and cannot access
or decide the owner's historical reviews.

## Legacy scope and key management
No guess is made for already discarded associations. Exact pre-correction email or
LinkedIn evidence still retained in trusted manual-correction history can be used
for review, but absent historical evidence cannot be reconstructed. This is not a
complete-erasure or universal reimport-prevention guarantee.

`FORGET_TOMBSTONE_KEY` enables HMAC tokens. Without it, the existing deployment's
per-owner salted SHA fallback remains supported, and is dictionary-testable if the
DB is compromised. Do not describe fallback hashes as anonymous or secret. With a
key configured, newly persisted holds store only keyed tokens, never an unkeyed
fallback. Holds also retain references to the exact pre-existing markers that matched, including legacy markers when applicable, so later deletion can clear a hold across key rotations without recreating unkeyed tokens. Legacy hashes may still be read for backward compatibility.

Historical evidence records its key version. Changing/removing a key without
coverage fails closed before saving arrivals or approving holds. For deliberate
rotation, supply `FORGET_TOMBSTONE_PREVIOUS_KEYS` as a JSON array of up to five
previous secrets in managed secret configuration; do not put secrets in source,
logs or this document. Prior keys are also consulted for current tombstones.
Retain them until a separately verified migration covers all keyed evidence.
Malformed key configuration fails closed. No secrets were configured or changed by
this draft; all tests use synthetic keys.

## Release and rollback gate
Migration 034 is additive, but **old application code is semantically unsafe**: it
ignores historical markers and can recreate old identities after correction/deletion.
A schema-033 guard must continue to refuse 034 until a compatible floor explicitly
backports these checks, review handling and key-version rules and passes tests.
Do not weaken the pinned 029→033→PR100 rehearsal or relabel it 034-compatible.

The dedicated `historical identity safety` workflow runs native application and
browser regressions independently of that known release gate. Passing feature CI
is not rollback approval. This draft must not merge or deploy until the compatible
floor and migration034 activation/recovery are separately reviewed and verified.

No production data, paid providers or live permissions were used in development.

## Legacy writes intentionally paused (no full replacement parity)
The shared runtime guard is applied after authentication in the web handler and
before every queued legacy research-worker delegation. Blocked requests return 409
with current-workspace guidance before the generated worker, DB or provider work.

Blocked non-GET/HEAD/OPTIONS routes:
- `/api/v3/discovery/*`: campaign create/update/run, lead edit/delete/bulk
  assignment/reclaim/share and CSV/LinkedIn imports. Read-only POST source discovery,
  Salesforce/ZoomInfo exports and campaign company export remain available.
- `/api/enrichment/*`: preview and commit, including future mutating endpoints;
  the existing file-export POST remains available.
- `/api/research/*`: enqueue, automatic/preview research and saving results. Queued
  legacy research jobs also hit the guard and cannot write through the back door.
- `/api/wealthfeed/*`: submit/check/import; credential connect/disconnect remain.
- `/api/beta/calls`: the legacy saver rewrites full lead payloads without modern
  locks. Legacy preferences and read-only week views remain available.

Current `/prospect` imports, edits and enrichment plus `/lab` lead work, activity
and historical review are supported and covered by regressions. This is NOT full
legacy parity: legacy campaign discovery, bulk owner transfer/reclaim/share,
provider-specific file exchange/WealthFeed and legacy research processing remain
paused until historical-provenance-safe adapters are separately implemented and
reviewed. Existing legacy read-only pages remain visible. Old application revisions
or old worker images must be quiesced during any eventual migration034 rollout;
the guard cannot protect an older executable still running against the database.
