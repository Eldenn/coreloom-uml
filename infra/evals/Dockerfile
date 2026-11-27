# syntax=docker/dockerfile:1.29.0@sha256:572cebbc2b15e6f84c077742952674889cb63cd5e9b80abdffcbe587b6f19183
#
# The agent convention evals (packages/catalog/evals/, decision record there). Build context is
# the monorepo root: docker build -f infra/evals/Dockerfile --target runner .
# The `evals` service of infra/docker-compose.yml builds `runner`. Nothing here is installed on
# the host. Every version is exact. What is verified, and how:
#   - the BuildKit frontend and every image (base, uv, Docker CLI, Compose) by their digest;
#   - the agents' CLIs and pnpm by the sha512 integrity of agents/package-lock.json (npm ci);
#   - Harbor and its Python dependencies by the SHA-256 of requirements.lock, wheels only;
#   - Python itself by the SHA-256 uv ships for each of its Python builds;
#   - git and ca-certificates by exact Debian version only: apt checks them against the signed
#     Release file of the base image's Debian, not against a hash of ours.
# x86_64 only (the locks and the binaries are for that platform), hence --platform on every
# FROM. Raising a version: see infra/evals/README.md.

# The official images the Docker client and its Compose plugin are copied from.
FROM --platform=linux/amd64 docker:29.6.1-cli@sha256:862099ada15c669000bef53aa4cb9d821262829f45b0dda2159ccb276443043b AS docker-cli
FROM --platform=linux/amd64 docker/compose-bin:v5.3.0@sha256:edc9fe3a46ccba8e9aabd276199731661a6b97de45ec4759852c4a6b04f3d583 AS compose-bin

# The agents' CLIs and pnpm, from agents/package-lock.json, installed as `node` so that their
# install scripts (Claude Code's postinstall copies its platform binary) never run as root.
FROM --platform=linux/amd64 node:26.3.0-slim@sha256:95a34da32a840bd9b3b09a5b773591c16923e350174b1c50e1200c75bf15eaa9 AS agents-install
RUN mkdir /opt/agents && chown node:node /opt/agents
USER node
WORKDIR /opt/agents
COPY --chown=node:node infra/evals/agents/package.json infra/evals/agents/package-lock.json ./
RUN npm ci --no-audit --no-fund && npm cache clean --force

# What a trial's agent runs on: the agents' CLIs, pnpm and git. The runner below is built on it,
# so both stay in step, and a trial's image is built FROM this stage (ticket 4).
FROM --platform=linux/amd64 node:26.3.0-slim@sha256:95a34da32a840bd9b3b09a5b773591c16923e350174b1c50e1200c75bf15eaa9 AS agent
RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    git=1:2.47.3-0+deb13u1 \
    ca-certificates=20250419+deb13u1 \
  && rm -rf /var/lib/apt/lists/*
# Copied as root: an agent running as `node` cannot change its own CLI.
COPY --from=agents-install --chown=root:root /opt/agents /opt/agents
RUN ln -s /opt/agents/node_modules/.bin/claude /usr/local/bin/claude \
  && ln -s /opt/agents/node_modules/.bin/codex /usr/local/bin/codex \
  && ln -s /opt/agents/node_modules/.bin/pnpm /usr/local/bin/pnpm \
  && ln -s /opt/agents/node_modules/.bin/pnpx /usr/local/bin/pnpx

# Harbor (Python 3.12, from requirements.lock with hashes), the Docker CLI and its Compose plugin
# Harbor drives a trial's container with, and the catalog with the tasks and graders. No Docker
# daemon and no socket: how the runner reaches one is the owner's decision (decision record, §4).
FROM agent AS runner
ARG HARBOR_VERSION=0.27.0
COPY --from=ghcr.io/astral-sh/uv:0.11.20@sha256:eaa5f1a3305307aaf9e67fe2bbba1d85ebbb2d8a63bce23af21797bfafbe0f8b /uv /usr/local/bin/uv
COPY infra/evals/requirements.lock /opt/harbor-requirements.lock
ENV UV_PYTHON_INSTALL_DIR=/opt/python UV_NO_CACHE=1
RUN uv python install 3.12.13 \
  && uv venv --python 3.12.13 /opt/harbor \
  && uv pip install --python /opt/harbor/bin/python --require-hashes --no-build \
    -r /opt/harbor-requirements.lock \
  && rm -f /usr/local/bin/uv /opt/harbor-requirements.lock \
  && ln -s /opt/harbor/bin/harbor /usr/local/bin/harbor \
  && /opt/harbor/bin/python -c "import importlib.metadata as m; assert m.version('harbor') == '${HARBOR_VERSION}'"
# Only the client and the Compose plugin; buildx and the daemon are left out.
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=compose-bin /docker-compose /usr/local/lib/docker/cli-plugins/docker-compose
# Harbor sends no usage event to PostHog (harbor/telemetry.py reads HARBOR_TELEMETRY), and LiteLLM
# reads the model cost map it ships instead of fetching it from GitHub when it is imported.
ENV HARBOR_TELEMETRY=off LITELLM_LOCAL_MODEL_COST_MAP=True

# The catalog and what its tests read, nothing else of the repository (no app, no `.env`; the
# API's Dockerfile only for the Claude Code version it pins).
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node packages/config packages/config
COPY --chown=node:node packages/catalog packages/catalog
COPY --chown=node:node .github/workflows/ci.yml .github/workflows/ci.yml
COPY --chown=node:node apps/api/Dockerfile apps/api/Dockerfile
COPY --chown=node:node infra/evals infra/evals
RUN pnpm install --frozen-lockfile --filter @coreloom-uml/catalog...
# The tests check this image's tools against the pinned versions when it is set.
ENV EVALS_IMAGE=1
CMD ["pnpm", "--filter", "@coreloom-uml/catalog", "test:evals"]
