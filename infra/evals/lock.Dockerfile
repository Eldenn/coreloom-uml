# syntax=docker/dockerfile:1.29.0@sha256:572cebbc2b15e6f84c077742952674889cb63cd5e9b80abdffcbe587b6f19183
#
# Writes requirements.lock (Harbor and its dependencies, with their hashes) for the evals image,
# without Python or uv on the host:
#   docker build -f infra/evals/lock.Dockerfile --output type=local,dest=infra/evals infra/evals
# EXCLUDE_NEWER is the date the lock was resolved at: the same inputs give the same lock. Raise it
# when raising Harbor (see README.md).
FROM --platform=linux/amd64 node:26.3.0-slim@sha256:95a34da32a840bd9b3b09a5b773591c16923e350174b1c50e1200c75bf15eaa9 AS compile
ARG EXCLUDE_NEWER=2026-11-27T01:00:00Z
COPY --from=ghcr.io/astral-sh/uv:0.11.20@sha256:eaa5f1a3305307aaf9e67fe2bbba1d85ebbb2d8a63bce23af21797bfafbe0f8b /uv /usr/local/bin/uv
WORKDIR /w
COPY requirements.in .
RUN uv pip compile requirements.in --python-version 3.12 --python-platform x86_64-unknown-linux-gnu \
  --exclude-newer "${EXCLUDE_NEWER}" --generate-hashes --no-header -o requirements.lock

FROM scratch
COPY --from=compile /w/requirements.lock /
