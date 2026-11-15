# Firm transfer authority draft

This extends the existing isolated firm-preview schema with relational authority,
recipient-specific rights reviews, expiring fence attestations and an append-only
receipt ledger. It is **not a production migration or an ownership-transfer API**.
No live module imports it; the Docker runtime does not copy it. No accounts,
legacy owners, provider rights, firm membership or infrastructure are changed.

## Implemented ports

`createFirmTransferAuthority({firmId})` returns `authorizeAndLock`,
`loadAndLockRights`, `findReceipt`, and `insertReceipt` for an application-owned
transaction client. It intentionally does not provide `loadAndLockSnapshot` or
`compareAndSwap`; passing these ports alone to the existing execution service
fails closed. No caller can convert a distribution-preview fingerprint into an
execution grant.

- Server-selected firm plus stored active supervisor/owner membership is required.
- Source must be departed; target active. Expiring reviewed fence attestations
  must confirm access/session/worker fencing and target verification. A ledger
  entry is not proof that Firebase or every old worker actually enforces a fence.
- Every selected record must match both the explicit firm's assignment and the
  legacy UID owner, with an allowed, unexpired exact-source/target rights review.
  Missing rights, matching email/domain, or UID-owned unassigned records never
  establish permission. Reviewers must still be active firm supervisors/owners.
- Serializable read/write transaction and row locks are required. Every port
  reacquires authority, including after savepoint rollback. A grant cannot be
  reused with a new transaction or another client.
- Versions include a random incarnation plus incrementing counter so a deleted
  and recreated rights/assignment row cannot reuse an old token.
- Receipts use a unique firm/actor/idempotency key, reject private extra payloads,
  and prohibit SQL update/delete/truncate. DBA/owner trigger bypass is outside
  this guarantee; a reviewed least-privilege DB role is still needed.

## Verification scope

Tests apply ordinary migrations, then both draft schemas, only in disposable
synthetic databases. PGlite verifies authorization, rights, savepoint safety,
version/receipt constraints, rollback atomicity and fail-closed configuration.
The optional `POSTGRES_TEST_URL` suite checks actual independent-connection lock
contention and subsequent revocation. It never reads `DATABASE_URL`.

## Remaining integration requirements

1. A trusted, reviewed provisioning process must establish firm ownership and
   memberships, provider-contract rights and fence evidence. This draft has no
   enrollment, backfill, guessed membership, grant API or automatic claim.
2. Verify the actor's current revoked-aware Firebase session upstream; bind its
   UID on the server. Do not accept actorUid from an HTTP body.
3. Build and lock a complete coherent manifest of every relevant legacy record,
   relationship, suppression, tombstone, job, provider right, sharing grant,
   privacy record, cost and history. These ports do not claim that completeness.
4. Integrate all writers with a durable fence and perform actual session/worker
   revocation outside the transfer transaction. Attestations must be renewed from
   verified evidence. Retain locks/timeout budget through the final audit.
5. Implement exact versioned CAS, preserved-manifest verification and a full
   atomic execution/replay/reconciliation rehearsal. Do not replay an uncertain
   commit with a new key. The existing orchestrator covers the transaction shape;
   this increment proves only its relational authority/audit ports.
6. Migration, privacy retention/deletion, DB grants, native load testing, backup
   restore and release/rollback reviews must pass before any production wiring.

Do not add this schema to `migrate.mjs` or populate it from production under this
PR. Its foreign-key/locking behavior and audit retention need separate review.
