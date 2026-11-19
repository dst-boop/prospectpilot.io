# Synthetic actual-server bootstrap rehearsal

This follow-up extends green draft135 without authorizing deployment or floor registration. It runs the built rollback image's actual `rollback-server.mjs` entrypoint, not only a handler callback.

The test creates its own randomly named schema and temporary login role in the explicitly allowlisted disposable loopback PostgreSQL database. That role's search path selects only its fixture schema, avoiding the production guard's prohibited PGOPTIONS override. All role credentials and key material are synthetic and ephemeral. No production role, permissions, data or settings are changed.

The child receives a minimal environment with no user/provider/Firebase credentials. A preload guard denies external network connections and provider fetches. Requests are limited to health/version and unauthenticated pages/API calls; there are no cookies or ID tokens and no authentication requests. The application is initialized with a synthetic project identifier. This is not real Firebase/session validation.

The rehearsal verifies startup only after the exact034 schema guard succeeds, unauthenticated denial, retained fixture rows, and the held guard's exclusion of a cooperating migration lock. It then terminates only the verified guard backend owned by its unique synthetic role and verifies the real server exits and stops serving. Cleanup is bounded and scoped to the child, role and schema created by this run. It does not execute the normal research worker or replay queues.

## Remaining gates

Even a green result does not prove real Firebase credentials/session checks, a different successor image's rollback, registry provenance, production backup/restore, writer quiescence or a safe initial production migration. Network instrumentation is a synthetic test control, not a production network-security policy. All existing DNC, ownership, historical review, key-version and legacy mutation safeguards remain unchanged. No merge or deployment is authorized.
