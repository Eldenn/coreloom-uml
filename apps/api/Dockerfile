# syntax=docker/dockerfile:1
#
# Build context is the monorepo root: docker build -f apps/api/Dockerfile .
# (needed so pnpm can resolve `@coreloom-uml/*` workspace dependencies).
FROM node:26.3.0-alpine AS base
RUN npm install -g pnpm@11.5.2
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @coreloom-uml/api build
# `--config.confirm-modules-purge=false`: switching to a prod-only install makes
# pnpm purge node_modules, and it aborts on the confirmation prompt when there is
# no TTY (Docker/CI build). Answer it non-interactively.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --config.confirm-modules-purge=false
RUN rm -rf apps/web

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api/build
EXPOSE 3333
# `--import ./instrumentation.js` starts the OpenTelemetry SDK before any
# instrumented library loads. It self-disables unless OTEL_EXPORTER_OTLP_ENDPOINT
# is set (see instrumentation.ts).
CMD ["node", "--import", "./instrumentation.js", "bin/server.js"]
