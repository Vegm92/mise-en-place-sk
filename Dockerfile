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
RUN pnpm build
RUN pnpm prune --prod

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 3000
# Default: web server. The worker service overrides this with
# `node build/worker.js` (see docker-compose.yml).
CMD ["node", "build"]
