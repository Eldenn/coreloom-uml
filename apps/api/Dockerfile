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
# Claude subscriptions run the official, unmodified Claude Code binary (`claude`), pinned. Each
# account gets its own config folder under CLAUDE_CODE_HOME (a volume in the Compose stacks).
RUN npm install -g @anthropic-ai/claude-code@2.1.322
COPY --from=build /app /app
WORKDIR /app/apps/api/build
EXPOSE 3333
# `--import ./instrumentation.js` starts the OpenTelemetry SDK before any
# instrumented library loads. It self-disables unless OTEL_EXPORTER_OTLP_ENDPOINT
# is set (see instrumentation.ts).
CMD ["node", "--import", "./instrumentation.js", "bin/server.js"]

# The skill scanner worker (`queue:work --queues=skill-scans`, the `skill-scanner` service): the
# API's runtime plus NVIDIA's SkillSpector, which `ScanSkillVersionJob` runs on each copy of a
# skill. SkillSpector is not on PyPI: its source is taken at one commit, its dependencies from
# `infra/skill-scanner/requirements.lock` (pinned with their hashes). Python 3.12 comes from uv,
# since YARA has no prebuilt wheel for Alpine's own Python. See infra/skill-scanner/README.md.
FROM runtime AS skill-scanner
COPY --from=ghcr.io/astral-sh/uv:0.11.20@sha256:eaa5f1a3305307aaf9e67fe2bbba1d85ebbb2d8a63bce23af21797bfafbe0f8b /uv /usr/local/bin/uv
ADD --keep-git-dir=false https://github.com/NVIDIA/SkillSpector.git#c323ad4c43e3c8f2de051572cc25b2711d11e648 /opt/skillspector-src
COPY infra/skill-scanner/requirements.lock /opt/skillspector-src/requirements.lock
ENV UV_PYTHON_INSTALL_DIR=/opt/python UV_NO_CACHE=1
RUN uv python install 3.12.13 \
  && uv venv --python 3.12.13 /opt/skillspector \
  && uv pip install --python /opt/skillspector/bin/python --require-hashes \
    -r /opt/skillspector-src/requirements.lock \
  && uv pip install --python /opt/skillspector/bin/python --no-deps --no-build-isolation \
    /opt/skillspector-src \
  && rm -rf /opt/skillspector-src /usr/local/bin/uv \
  && ln -s /opt/skillspector/bin/skillspector /usr/local/bin/skillspector \
  && skillspector --version
# It reads third-party files: not as root (it writes only under the system's temporary folder).
USER node
CMD ["node", "--import", "./instrumentation.js", "bin/console.js", "queue:work", "--queues=skill-scans"]

# The skill tagger worker (`queue:work --queues=skill-topics`, the `skill-tagger` service): the
# API on Debian rather than Alpine, since onnxruntime's prebuilt binary, which reads the skills
# with the embedding model (`SkillEmbedder`), needs glibc. No Claude Code binary: it never calls a
# model of an account. The model is downloaded on first use into /models (a volume). See
# infra/skill-tagger/README.md.
FROM node:26.3.0-slim AS skill-tagger
ENV NODE_ENV=production SKILL_TAGGER_CACHE=/models
COPY --from=build /app /app
RUN mkdir -p /models && chown node:node /models
WORKDIR /app/apps/api/build
USER node
CMD ["node", "--import", "./instrumentation.js", "bin/console.js", "queue:work", "--queues=skill-topics"]

# The default target stays the API's image.
FROM runtime
