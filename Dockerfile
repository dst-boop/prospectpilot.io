FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
# Tests gate the image; development dependencies stay out of the final stage.
RUN node build.mjs && node --test test/*.test.mjs
RUN pnpm prune --prod

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080
# Standard-library Python is used only by the separate public-plan ingestion job.
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY contact-benchmark.mjs ./
COPY --from=build /app/generated ./generated
COPY scripts ./scripts
COPY lab.html lab.css lab-client.js lead-quality.mjs source-catalog.mjs plan-catalog.mjs lab-sources.mjs robots-policy.mjs research-lab.mjs ./
COPY prospect.html prospect.css prospect-client.js prospect-workspace.mjs prospect-providers.mjs prospect-data-quality.mjs prospect-domain-check.mjs ./
COPY prospect-jobs.mjs prospect-jobs-client.js ./
COPY migrations ./migrations
COPY server.mjs http-server.mjs handler.mjs database.mjs migrate.mjs login.html research-jobs.mjs research-worker.mjs warn.mjs warn.html warn-client.js native-research.mjs linkedin.mjs linkedin.html linkedin-client.js ./
USER node
CMD ["node","server.mjs"]
