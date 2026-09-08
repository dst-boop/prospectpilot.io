# ProspectPilot engineering review — 2026-09-05

The refactor is prepared locally and has not been deployed. Complete runnable source and generated application code accompany this report.

## Findings and implemented changes

| Finding | Change | Validation |
|---|---|---|
| Category lookup rebuilt and normalized more than 400 aliases on every call. | Compile a bounded catalog once, look up normalized phrases, and weakly cache optional catalogs. | All aliases and mixed-category cases pass. A 2,000-call local microbenchmark decreased from 2,336 ms to 16 ms. This is not an end-to-end latency measurement. |
| HTTP output was copied into a full ArrayBuffer and then a Buffer. | Stream responses with backpressure and cancel output on client disconnect. | A response's first chunk arrives before its producer finishes; disconnect and HEAD tests pass. |
| Request handlers could accumulate without an application limit, and shutdown could wait indefinitely. | 5 MB body limit, admission cap, explicit header/body receive timeouts, and an 8.5-second shutdown deadline. | Oversized Content-Length and chunked uploads, saturation, exception recovery, and forced shutdown tests pass. |
| PostgreSQL rollback failures replaced the original error and returned damaged clients to the pool. | Preserve the original failure and evict clients when rollback fails. Cache up to 256 translated SQL templates. | Fault-injection tests and actual PostgreSQL-engine transaction tests pass. |
| The SQL translator did not distinguish comments, identifiers, or dollar-quoted strings. | Lexical handling for quoted sections and comments. Values remain separate query parameters. | Quote/comment cases and a malicious bound value test pass. The translator remains a compatibility layer for the app's authored SQL, not a general SQL parser. |
| Weekly calls loaded and qualified every team lead before filtering ownership. | Filter by team plus owner ID or case-insensitive owner email in PostgreSQL first. Preserve the original visibility and eligibility checks. | Team-member exclusion and legacy owner-email matching pass. |
| Team-wide job sorting and ordered weekly call history were not fully covered by existing indexes. | Add three indexes for owner-email filtering, team/job ordering, and user/week/call ordering. | Migration repeatability and query-plan checks against PGlite pass. |
| Runtime did not handle idle pool errors and could silently round BIGINT identifiers. | Handle idle connection errors, bound statements/lock waits, and preserve unsafe large integers as strings. | Module checks and existing integration suite pass; production pool sizing requires Cloud SQL measurements. |
| Deployment image had no test gate. | Multi-stage Docker build runs tests before pruning dev dependencies. Final image excludes the test runner's dev dependencies and globally installed pnpm. Routine releases reuse resources and migrate before updating the app image. | All 24 local tests pass; shell syntax checked. Docker/Cloud Run validation occurs during release because Docker is unavailable locally. |

## Deployment

Upload update-runtime-review.sh to Cloud Shell's home folder and run:

```bash
bash ~/update-runtime-review.sh
```

It updates the existing ~/prospectpilot source, preserves custom category additions, builds a test-gated image, applies additive migrations through the existing prospectpilot-migrate job, and deploys the service image. It prints the previous image for rollback. It does not modify IAM, login rules, secrets, or stored lead payloads. The local update script includes the category expansion and 25-mile default.

## Operational limits and remaining work

- No live Cloud SQL load test or Cloud Run memory benchmark was available. Do not treat the local matcher result as a whole-app speed claim.
- The current index migration uses ordinary CREATE INDEX inside a transaction: a 5-second lock-wait limit and 120-second statement limit bound it, but index building can temporarily block writes. For a large or busy database, schedule this migration in a quiet window or convert it to an independently monitored concurrent-index migration before rollout.
- General discovery listing and import deduplication still read team lead payloads. Further high-volume work requires server pagination, relational identity keys, and API changes. A JSONB/GIN index would not accelerate the current unfiltered payload reads.
- Request bodies remain bounded but buffered for compatibility with the worker. Responses stream. A client disconnect cancels response transport; existing crawler subrequests retain their individual timeouts and are not all cooperatively cancelled.
- PGPOOL_MAX defaults to 5 per container; MAX_INFLIGHT defaults to 40. Size the total connection budget across maximum instances and overlapping revisions against the actual Cloud SQL limit before raising concurrency.
- Firebase revocation checks still run for authenticated requests. No authentication cache or permission weakening was introduced.
- The generated worker is included, so the Docker release is standalone. Rebuilding HTML/runtime sources with build.mjs uses the existing sibling ../app workspace.

## Primary references

- Node.js HTTP server lifecycle: https://nodejs.org/docs/latest-v24.x/api/http.html
- node-postgres pool handling: https://node-postgres.com/features/pooling
- Cloud Run container shutdown contract: https://cloud.google.com/run/docs/container-contract
