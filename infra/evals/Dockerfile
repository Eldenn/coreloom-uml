# syntax=docker/dockerfile:1
#
# The agent convention evals (packages/catalog/evals/, decision record there). Build context is
# the monorepo root: docker build -f infra/evals/Dockerfile --target runner .
# The `evals` service of infra/docker-compose.yml builds `runner`. Nothing here is installed on
# the host. Every version is exact, every download checked: the base image by tag and digest,
# Python packages by hash (requirements.lock), the Docker binaries by SHA-256. x86_64 only (the
# lock and the binaries are for that platform). Raising a version: see infra/evals/README.md.

# What a trial's agent runs on: the agents' CLIs and git. The runner below is built on it, so
# both stay in step, and a trial's image is built FROM this stage (ticket 4).
FROM node:26.3.0-slim@sha256:95a34da32a840bd9b3b09a5b773591c16923e350174b1c50e1200c75bf15eaa9 AS agent
# Equal to packages/catalog/evals/src/versions.ts and to ci.yml (a test checks both).
ARG CLAUDE_CODE_VERSION=2.1.322
ARG CODEX_VERSION=0.167.2
RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    git=1:2.47.3-0+deb13u1 \
    ca-certificates=20250419+deb13u1 \
  && rm -rf /var/lib/apt/lists/*
RUN npm install --global \
    @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} \
    @openai/codex@${CODEX_VERSION} \
  && npm cache clean --force

# Harbor (Python 3.12, from requirements.lock with hashes), the Docker CLI and its Compose plugin
# Harbor drives a trial's container with, and the catalog with the tasks and graders. No Docker
# daemon and no socket: how the runner reaches one is the owner's decision (decision record, §4).
FROM agent AS runner
ARG HARBOR_VERSION=0.27.0
ARG DOCKER_VERSION=29.6.1
ARG COMPOSE_VERSION=5.3.0
ARG PNPM_VERSION=11.5.2
COPY --from=ghcr.io/astral-sh/uv:0.11.20@sha256:eaa5f1a3305307aaf9e67fe2bbba1d85ebbb2d8a63bce23af21797bfafbe0f8b /uv /usr/local/bin/uv
COPY infra/evals/requirements.lock /opt/harbor-requirements.lock
ENV UV_PYTHON_INSTALL_DIR=/opt/python UV_NO_CACHE=1
RUN uv python install 3.12.13 \
  && uv venv --python 3.12.13 /opt/harbor \
  && uv pip install --python /opt/harbor/bin/python --require-hashes \
    -r /opt/harbor-requirements.lock \
  && rm -f /usr/local/bin/uv /opt/harbor-requirements.lock \
  && ln -s /opt/harbor/bin/harbor /usr/local/bin/harbor \
  && /opt/harbor/bin/python -c "import importlib.metadata as m; assert m.version('harbor') == '${HARBOR_VERSION}'"
# Docker publishes no checksum for its static archives: this one was computed on download and is
# checked on every build. Only the client is kept.
ADD --checksum=sha256:b0df4a43a98d7ecb708acbdb5a34a3416e13b6e39bcbbdf296f51f0f3442b29f \
  https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz /tmp/docker.tgz
RUN tar -xzf /tmp/docker.tgz -C /usr/local/bin --strip-components=1 docker/docker \
  && rm /tmp/docker.tgz
# The checksum Docker publishes beside the release (docker-compose-linux-x86_64.sha256).
ADD --checksum=sha256:fffb010206c952ee5e45d0cd05dc88d3ca063c4634d40eaad6b72677c4c7bbf0 --chmod=755 \
  https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-x86_64 \
  /usr/local/lib/docker/cli-plugins/docker-compose
RUN npm install --global pnpm@${PNPM_VERSION} && npm cache clean --force

# The catalog and what its tests read, nothing else of the repository (no app, no `.env`).
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node packages/config packages/config
COPY --chown=node:node packages/catalog packages/catalog
COPY --chown=node:node .github/workflows/ci.yml .github/workflows/ci.yml
COPY --chown=node:node infra/evals infra/evals
RUN pnpm install --frozen-lockfile --filter @coreloom-uml/catalog...
# The tests check this image's tools against the pinned versions when it is set.
ENV EVALS_IMAGE=1
CMD ["pnpm", "--filter", "@coreloom-uml/catalog", "test:evals"]
