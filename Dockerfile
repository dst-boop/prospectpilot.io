FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
# Tests gate the image; development dependencies stay out of the final stage.
# Pinned-history rehearsal runs on the full-checkout CI runner, not this history-free context.
RUN node build.mjs && ROLLBACK_HISTORY_FREE_IMAGE_BUILD=1 node --test test/*.test.mjs
RUN pnpm prune --prod

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080
# Standard-library Python is used only by the separate public-plan ingestion job.
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY contact-benchmark.mjs ./
COPY historical-identities.mjs identity-keyring.mjs legacy-identity-guard.mjs ./
COPY advisor-pipeline.mjs advisor-conversation-guidance.mjs ./
COPY opportunity-policy.mjs ./
COPY --from=build /app/generated ./generated
COPY scripts ./scripts
COPY prospect-brief.mjs prospect-brief-evidence.mjs advisor-workflow.mjs outreach-cadence.mjs forget.mjs lead-costs.mjs web-research.mjs lab.html lab.css lab-client.js lead-quality.mjs age-band.mjs source-catalog.mjs plan-catalog.mjs rollover-playbooks.mjs lab-sources.mjs robots-policy.mjs research-lab.mjs ./
COPY prospect.html prospect.css prospect-client.js prospect-workspace.mjs prospect-providers.mjs prospect-data-quality.mjs prospect-domain-check.mjs ./
COPY prospect-jobs.mjs prospect-autopilot.mjs prospect-jobs-client.js billing.mjs ./
COPY prospect-preparation.mjs ./
COPY audience.html audience.css audience-client.js audience-catalog.mjs ./
COPY team-lead-hub.mjs advisor-reassignment-preview.mjs team-hub.html team-hub-client.js team-hub.css ./
COPY networking-capture.mjs networking.html networking-client.js networking.css ./
COPY migrations ./migrations
COPY readonly-fallback.mjs release-readiness.mjs server.mjs http-server.mjs handler.mjs login-destination.mjs database.mjs migrate.mjs home.html site.css brand.svg login.html research-jobs.mjs research-worker.mjs warn.mjs warn.html warn-client.js native-research.mjs linkedin.mjs linkedin.html linkedin-client.js ./
USER node
CMD ["node","server.mjs"]

# Explicit opt-in frozen rollback artifact. Default build below remains normal.
FROM runtime AS rollback-runtime
COPY rollback-bootstrap.mjs rollback-schema.mjs rollback-server.mjs rollback-worker.mjs ./
CMD ["node","rollback-server.mjs"]

FROM runtime AS production
