# Multi-stage build for both processes of the app:
#   web    → node build            (SvelteKit adapter-node server)
#   worker → node build/worker.js  (pg-boss extraction worker)
# The same image serves both; pick the process via the container command.

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Vite inlines VITE_* at build time, so these must exist in the build stage or
# the shipped client bundle ships an empty Sentry DSN and reports nothing.
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_RELEASE
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE
RUN pnpm build
RUN pnpm prune --prod

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
# drizzle-kit (pre-deploy migration step) needs its config + migration files at runtime
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/drizzle ./drizzle

# adapter-node caps request bodies at 512K unless told otherwise, which is far
# below the 20 MB-per-file upload the product advertises: a single phone photo
# blows past it and the body stream is killed with a 413 before the form action
# ever runs. Keep this above MAX_UPLOAD_TOTAL_BYTES in src/lib/upload-formats.ts
# (tests/upload-body-size-limit.test.ts holds the two in sync).
ENV BODY_SIZE_LIMIT=64M

# Mount point for the shared uploads volume (issue #285). Creating it here with
# `node` ownership means Docker gives the named volume the same ownership when
# it first materialises, so both containers can write to it unprivileged.
ENV UPLOADS_DIR=/app/uploads
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node

EXPOSE 3000
# Default: web server. The worker service overrides this with
# `node build/worker.js` (see docker-compose.yml).
CMD ["node", "build"]
