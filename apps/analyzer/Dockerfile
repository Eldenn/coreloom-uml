# syntax=docker/dockerfile:1
#
# The code map analyzer: clones a public GitHub repository and maps its code with graphify
# (tree-sitter only, no model). Holds no secret; only the API's queue worker calls it.
# Build context is the monorepo root: docker build -f apps/analyzer/Dockerfile .
FROM python:3.12.15-slim-bookworm

# git clones the repositories; nothing else is installed. graphify's version is the one
# `@coreloom-uml/codemap` reads (GRAPHIFY_TESTED_VERSION): bump both together.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/* \
  && pip install --no-cache-dir graphifyy==0.9.108 \
  && useradd --create-home --uid 10001 analyzer

COPY apps/analyzer/analyzer.py /app/analyzer.py

USER analyzer
WORKDIR /home/analyzer
ENV PYTHONUNBUFFERED=1 TMPDIR=/tmp
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=4)"
CMD ["python", "/app/analyzer.py"]
