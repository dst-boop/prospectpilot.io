# Historical rollback negative control

`forget-b543fa4.mjs` is `forget.mjs` from repository commit
`b543fa4e52ee40f2e78a793733b9fbc3f6d29d50`. Only the relative import was
adjusted to resolve from this fixture directory. The test verifies the original
file SHA-256: `dc0dc256782ad0d08be68f218732b758fadc92b7b10bb4db3877b09949abd290`.

This is an explicitly unsafe historical comparison, **not** a supported rollback
target and **not** evidence that this commit or its image is live. Its imports
resolve to current identity helpers, so the negative control isolates deletion
logic rather than representing a complete historical runtime.

Synthetic fixtures only. No user data, credentials, external providers, or
production database connections are used.
