# Production Deployment Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Coreloom UML a real production deployment path on Coolify — a second, independent stack next to staging, pulling prebuilt GHCR images instead of building on the host, with Postgres as a Coolify-native Database resource (for native scheduled backups), real SMTP/object-storage providers, and a manual approval gate on release.

**Architecture:** A new `infra/docker-compose.production.yml` (no `postgres:`/`mailpit:`/`minio*` services — those become an external Coolify Database resource, Resend, and Cloudflare R2 respectively), a dedicated SigNoz block copied from staging, a new `docker` job in `release.yml` that builds and pushes `apps/api`/`apps/web` images to `ghcr.io`, one new CI validation step, and README/CLAUDE.md updates removing the now-closed "no production path" gap.

**Tech Stack:** Docker Compose, GitHub Actions, GHCR, Coolify (Docker Compose + Database resources), Resend (SMTP), Cloudflare R2 (S3-compatible).

**Spec:** `docs/superpowers/specs/2026-09-12-production-deployment-path-design.md`

## Global Constraints

- Pin exact versions everywhere (image tags, action versions) — no `latest`, no floating ranges. (CLAUDE.md)
- All committed text (YAML, comments, docs) is English-only. (CLAUDE.md)
- `infra/signoz/*` and its image pins are a vendored copy from SigNoz `deploy/` tag `v0.128.0` — the production SigNoz block must use the exact same four image pins as staging's, copied verbatim, not re-derived. (CLAUDE.md, spec)
- No app code changes in this plan — infra, CI, and docs only. (spec "Out of scope")
- Every PR needs a changeset (`require-changeset.yml`); this change has no user-facing package effect, so it's an **empty** changeset. (`.changeset/README.md`)

---

## Task 1: Production Docker Compose stack

**Files:**
- Create: `infra/docker-compose.production.yml`

**Interfaces:**
- Consumes: `apps/api/Dockerfile`, `apps/web/Dockerfile` build outputs — but by *reference* only (`image: ghcr.io/...`), not `build:` — the images themselves are produced by Task 4's CI job, not by this file.
- Produces: the `IMAGE_OWNER`, `IMAGE_TAG`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`, `DB_SSL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM_ADDRESS`, `DRIVE_DISK`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`, `BULLBOARD_USER`, `BULLBOARD_PASSWORD`, `SERVICE_FQDN_BULLBOARD_3000`, `SERVICE_FQDN_SIGNOZ_8080` variable names Task 2's `.env.production.example` must document.

- [ ] **Step 1: Write `infra/docker-compose.production.yml`**

```yaml
services:
  # ---------------------------------------------------------------------------
  # Postgres is NOT a service in this stack. It is a dedicated Coolify
  # "Database" (PostgreSQL) resource, created separately in the same Coolify
  # project as this compose resource (so they share a private network) —
  # that resource type is the only place Coolify exposes native scheduled
  # backups to an S3 target. Create it first, configure its Backups tab
  # (schedule + a bucket separate from the object-storage bucket below), then
  # copy its connection details into DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/
  # DB_DATABASE below. See README.md "Production on Coolify".
  # ---------------------------------------------------------------------------

  migrate:
    image: 'ghcr.io/${IMAGE_OWNER}/coreloom-uml-api:${IMAGE_TAG:-production-latest}'
    command:
      - node
      - ace
      - 'migration:run'
      - '--force'
    restart: 'no'
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: '3333'
      APP_KEY: '${SERVICE_PASSWORD_64_APPKEY}'
      FRONTEND_URL: '${SERVICE_URL_WEB}'
      DB_HOST: '${DB_HOST}'
      DB_PORT: '${DB_PORT:-5432}'
      DB_USER: '${DB_USER}'
      DB_PASSWORD: '${DB_PASSWORD}'
      DB_DATABASE: '${DB_DATABASE}'
      # true if the Database resource is NOT on this compose resource's
      # private network (e.g. reached over a public endpoint); false if it is.
      DB_SSL: '${DB_SSL:-false}'
      SMTP_HOST: '${SMTP_HOST}'
      SMTP_PORT: '${SMTP_PORT:-587}'
      MAIL_FROM_ADDRESS: '${MAIL_FROM_ADDRESS}'

  api:
    image: 'ghcr.io/${IMAGE_OWNER}/coreloom-uml-api:${IMAGE_TAG:-production-latest}'
    restart: unless-stopped
    # Sans `expose`, Coolify ne detecte aucun port et retombe sur 3000.
    expose:
      - '3333'
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: '3333'
      APP_NAME: coreloom-uml-api-production
      LOG_LEVEL: info
      APP_KEY: '${SERVICE_PASSWORD_64_APPKEY}'
      FRONTEND_URL: '${SERVICE_URL_WEB}'
      DB_HOST: '${DB_HOST}'
      DB_PORT: '${DB_PORT:-5432}'
      DB_USER: '${DB_USER}'
      DB_PASSWORD: '${DB_PASSWORD}'
      DB_DATABASE: '${DB_DATABASE}'
      DB_SSL: '${DB_SSL:-false}'
      REDIS_HOST: redis
      REDIS_PORT: '6379'
      SESSION_DRIVER: cookie
      SESSION_COOKIE_SAME_SITE: none
      SESSION_COOKIE_SECURE: 'true'
      LIMITER_STORE: memory
      SMTP_HOST: '${SMTP_HOST}'
      SMTP_PORT: '${SMTP_PORT:-587}'
      SMTP_USERNAME: '${SMTP_USERNAME}'
      SMTP_PASSWORD: '${SMTP_PASSWORD}'
      MAIL_FROM_ADDRESS: '${MAIL_FROM_ADDRESS}'
      MAIL_FROM_NAME: Coreloom UML
      # Object storage (@adonisjs/drive). No MinIO in this stack — point at a
      # real S3 / R2 / Spaces bucket. See infra/.env.production.example.
      DRIVE_DISK: '${DRIVE_DISK:-s3}'
      S3_ENDPOINT: '${S3_ENDPOINT}'
      S3_REGION: '${S3_REGION:-auto}'
      S3_BUCKET: '${S3_BUCKET}'
      S3_ACCESS_KEY_ID: '${S3_ACCESS_KEY_ID}'
      S3_SECRET_ACCESS_KEY: '${S3_SECRET_ACCESS_KEY}'
      S3_PUBLIC_URL: '${S3_PUBLIC_URL:-}'
      # Observability — a SigNoz instance dedicated to production (below), not
      # shared with staging: an incident on one never blinds the other.
      OTEL_SERVICE_NAME: coreloom-uml-api-production
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://signoz-otel-collector:4318'
    depends_on:
      redis:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    healthcheck:
      test:
        - CMD-SHELL
        - 'wget -q --spider http://127.0.0.1:3333/health || exit 1'
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

  # BullMQ job worker — same image as `api`, run as an extra process (like
  # `migrate`). Processes jobs dispatched onto the queue.
  queue-worker:
    image: 'ghcr.io/${IMAGE_OWNER}/coreloom-uml-api:${IMAGE_TAG:-production-latest}'
    restart: unless-stopped
    command:
      - node
      - '--import'
      - './instrumentation.js'
      - 'bin/console.js'
      - 'queue:work'
    environment:
      NODE_ENV: production
      APP_NAME: coreloom-uml-worker-production
      LOG_LEVEL: info
      APP_KEY: '${SERVICE_PASSWORD_64_APPKEY}'
      FRONTEND_URL: '${SERVICE_URL_WEB}'
      DB_HOST: '${DB_HOST}'
      DB_PORT: '${DB_PORT:-5432}'
      DB_USER: '${DB_USER}'
      DB_PASSWORD: '${DB_PASSWORD}'
      DB_DATABASE: '${DB_DATABASE}'
      DB_SSL: '${DB_SSL:-false}'
      REDIS_HOST: redis
      REDIS_PORT: '6379'
      SMTP_HOST: '${SMTP_HOST}'
      SMTP_PORT: '${SMTP_PORT:-587}'
      SMTP_USERNAME: '${SMTP_USERNAME}'
      SMTP_PASSWORD: '${SMTP_PASSWORD}'
      MAIL_FROM_ADDRESS: '${MAIL_FROM_ADDRESS}'
      MAIL_FROM_NAME: Coreloom UML
      DRIVE_DISK: '${DRIVE_DISK:-s3}'
      S3_ENDPOINT: '${S3_ENDPOINT}'
      S3_REGION: '${S3_REGION:-auto}'
      S3_BUCKET: '${S3_BUCKET}'
      S3_ACCESS_KEY_ID: '${S3_ACCESS_KEY_ID}'
      S3_SECRET_ACCESS_KEY: '${S3_SECRET_ACCESS_KEY}'
      S3_PUBLIC_URL: '${S3_PUBLIC_URL:-}'
      OTEL_SERVICE_NAME: coreloom-uml-worker-production
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://signoz-otel-collector:4318'
    depends_on:
      redis:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully

  redis:
    image: 'redis:7.4.11-alpine'
    restart: unless-stopped
    volumes:
      - 'redis-data:/data'
    healthcheck:
      test:
        - CMD
        - redis-cli
        - ping
      interval: 5s
      timeout: 5s
      retries: 10

  # bull-board — queue dashboard (inspect / retry / remove jobs). Published on
  # its own subdomain by Coolify; drop this service if tunnel-only access is
  # preferred. Basic auth is mandatory — set BULLBOARD_USER / BULLBOARD_PASSWORD.
  bull-board:
    image: 'venatum/bull-board:3.4.11'
    restart: unless-stopped
    expose:
      - '3000'
    environment:
      SERVICE_FQDN_BULLBOARD_3000: '${SERVICE_FQDN_BULLBOARD_3000:-}'
      REDIS_HOST: redis
      REDIS_PORT: '6379'
      BULL_PREFIX: bull
      BULL_VERSION: BULLMQ
      USER_LOGIN: '${BULLBOARD_USER}'
      USER_PASSWORD: '${BULLBOARD_PASSWORD}'
    depends_on:
      redis:
        condition: service_healthy

  web:
    image: 'ghcr.io/${IMAGE_OWNER}/coreloom-uml-web:${IMAGE_TAG:-production-latest}'
    restart: unless-stopped
    expose:
      - '80'
    environment:
      # Injected into the SPA at container start (docker/30-render-env-js.sh) —
      # a domain change no longer needs an image rebuild, only a restart.
      API_URL: '${SERVICE_URL_API}'
    depends_on:
      - api
    healthcheck:
      test:
        - CMD-SHELL
        - 'wget -q --spider http://127.0.0.1:80/ || exit 1'
      interval: 10s
      timeout: 5s
      retries: 5

  # ---------------------------------------------------------------------------
  # SigNoz — dedicated to production, NOT shared with staging (see the design
  # spec). Identical to the block in infra/docker-compose.staging.yml — on any
  # upstream re-copy of infra/signoz/*, copy this block from staging's file
  # too, per CLAUDE.md's vendoring note. Same topology: ClickHouse + ZooKeeper
  # + a one-shot init + a schema migrator + the SigNoz app (UI/API on 8080) +
  # the SigNoz OTel collector (OTLP on 4317/4318 — what `api`/`queue-worker`
  # export to). Only `signoz` gets a domain.
  # ---------------------------------------------------------------------------
  signoz-init-clickhouse:
    image: 'clickhouse/clickhouse-server:25.5.6'
    restart: on-failure
    command:
      - bash
      - -c
      - |
        version="v0.0.1"
        node_os=$$(uname -s | tr '[:upper:]' '[:lower:]')
        node_arch=$$(uname -m | sed s/aarch64/arm64/ | sed s/x86_64/amd64/)
        echo "Fetching histogram-binary for $${node_os}/$${node_arch}"
        cd /tmp
        wget -O histogram-quantile.tar.gz "https://github.com/SigNoz/signoz/releases/download/histogram-quantile%2F$${version}/histogram-quantile_$${node_os}_$${node_arch}.tar.gz"
        tar -xvzf histogram-quantile.tar.gz
        mv histogram-quantile /var/lib/clickhouse/user_scripts/histogramQuantile
    volumes:
      - 'signoz-clickhouse-user-scripts:/var/lib/clickhouse/user_scripts'

  signoz-zookeeper:
    image: 'signoz/zookeeper:3.7.1'
    restart: unless-stopped
    user: root
    environment:
      ZOO_SERVER_ID: '1'
      ALLOW_ANONYMOUS_LOGIN: 'yes'
      ZOO_AUTOPURGE_INTERVAL: '1'
      ZOO_ENABLE_PROMETHEUS_METRICS: 'yes'
      ZOO_PROMETHEUS_METRICS_PORT_NUMBER: '9141'
    volumes:
      - 'signoz-zookeeper:/bitnami/zookeeper'
    healthcheck:
      test:
        - CMD-SHELL
        - 'curl -s -m 2 http://localhost:8080/commands/ruok | grep error | grep null'
      interval: 30s
      timeout: 5s
      retries: 3

  signoz-clickhouse:
    build:
      # The vendored SigNoz config is baked into the image rather than
      # bind-mounted: Coolify's Compose runner does not resolve relative host
      # bind-mount paths reliably. Context is the repo root — Coolify runs
      # `docker compose` with `--project-directory` set there regardless of
      # where this file lives; for a manual build pass `--project-directory ..`.
      context: .
      dockerfile: infra/signoz/clickhouse/Dockerfile
    restart: unless-stopped
    tty: true
    environment:
      CLICKHOUSE_SKIP_USER_SETUP: '1'
    ulimits:
      nproc: 65535
      nofile:
        soft: 262144
        hard: 262144
    volumes:
      - 'signoz-clickhouse-user-scripts:/var/lib/clickhouse/user_scripts'
      - 'signoz-clickhouse:/var/lib/clickhouse'
    healthcheck:
      test:
        - CMD
        - wget
        - --spider
        - -q
        - '0.0.0.0:8123/ping'
      interval: 30s
      timeout: 5s
      retries: 3
    depends_on:
      signoz-init-clickhouse:
        condition: service_completed_successfully
      signoz-zookeeper:
        condition: service_healthy

  signoz-schema-migrator:
    image: 'signoz/signoz-otel-collector:v0.144.5'
    restart: on-failure
    environment:
      SIGNOZ_OTEL_COLLECTOR_CLICKHOUSE_DSN: 'tcp://signoz-clickhouse:9000'
      SIGNOZ_OTEL_COLLECTOR_CLICKHOUSE_CLUSTER: cluster
      SIGNOZ_OTEL_COLLECTOR_CLICKHOUSE_REPLICATION: 'true'
      SIGNOZ_OTEL_COLLECTOR_TIMEOUT: 10m
    entrypoint:
      - /bin/sh
    command:
      - -c
      - |
        /signoz-otel-collector migrate bootstrap &&
        /signoz-otel-collector migrate sync up &&
        /signoz-otel-collector migrate async up
    depends_on:
      signoz-clickhouse:
        condition: service_healthy

  signoz:
    image: 'signoz/signoz:v0.128.0'
    restart: unless-stopped
    expose:
      - '8080'
    environment:
      # Coolify: attach a domain to this service, routed to container port
      # 8080. `expose` alone is not enough — this SERVICE_FQDN_<svc>_<port>
      # marker tells Coolify which port to proxy. Set it in the resource's
      # Environment Variables editor to e.g.
      #   SERVICE_FQDN_SIGNOZ_8080=https://signoz.example.com
      SERVICE_FQDN_SIGNOZ_8080: '${SERVICE_FQDN_SIGNOZ_8080:-}'
      SIGNOZ_ALERTMANAGER_PROVIDER: signoz
      SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_DSN: 'tcp://signoz-clickhouse:9000'
      SIGNOZ_SQLSTORE_SQLITE_PATH: /var/lib/signoz/signoz.db
      SIGNOZ_TOKENIZER_JWT_SECRET: '${SERVICE_PASSWORD_64_SIGNOZJWT}'
    volumes:
      - 'signoz-sqlite:/var/lib/signoz'
    healthcheck:
      test:
        - CMD
        - wget
        - --spider
        - -q
        - 'localhost:8080/api/v1/health'
      interval: 30s
      timeout: 5s
      retries: 3
    depends_on:
      signoz-clickhouse:
        condition: service_healthy

  signoz-otel-collector:
    build:
      # Config baked into the image, not bind-mounted — see the note on the
      # signoz-clickhouse service. Context is the repo root.
      context: .
      dockerfile: infra/signoz/otel-collector/Dockerfile
    restart: unless-stopped
    # OTLP receivers — `api`/`queue-worker` export to signoz-otel-collector:4318.
    expose:
      - '4317'
      - '4318'
    entrypoint:
      - /bin/sh
    command:
      - -c
      - |
        /signoz-otel-collector migrate sync check &&
        /signoz-otel-collector --config=/etc/otel-collector-config.yaml --manager-config=/etc/manager-config.yaml --copy-path=/var/tmp/collector-config.yaml
    environment:
      OTEL_RESOURCE_ATTRIBUTES: host.name=signoz-host,os.type=linux
      LOW_CARDINAL_EXCEPTION_GROUPING: 'false'
      SIGNOZ_OTEL_COLLECTOR_CLICKHOUSE_DSN: 'tcp://signoz-clickhouse:9000'
      SIGNOZ_OTEL_COLLECTOR_CLICKHOUSE_CLUSTER: cluster
      SIGNOZ_OTEL_COLLECTOR_CLICKHOUSE_REPLICATION: 'true'
      SIGNOZ_OTEL_COLLECTOR_TIMEOUT: 10m
    depends_on:
      signoz-clickhouse:
        condition: service_healthy
      signoz-schema-migrator:
        condition: service_completed_successfully

volumes:
  redis-data:
  signoz-clickhouse:
  signoz-clickhouse-user-scripts:
  signoz-zookeeper:
  signoz-sqlite:
```

- [ ] **Step 2: Validate the compose file parses and resolves correctly**

Run: `docker compose -f infra/docker-compose.production.yml config --quiet`
Expected: exit code `0`, no output other than possible "variable is not set" warnings on stderr (real values only exist in Coolify's env editor, not locally — that's expected and fine for a syntax/structure check).

- [ ] **Step 3: Commit**

```bash
git add infra/docker-compose.production.yml
git commit -m "$(cat <<'EOF'
feat: add production Docker Compose stack for Coolify

Second, independent Coolify stack next to staging. Postgres is
deliberately not a service here — it's a dedicated Coolify Database
resource so native scheduled S3 backups are available. Images are
pulled prebuilt from GHCR (see the release.yml docker job) instead of
built on the host. SigNoz is a full dedicated instance, not shared
with staging.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6crsGSv2JgtmuiWaMmHqy
EOF
)"
```

---

## Task 2: Production environment variables reference

**Files:**
- Create: `infra/.env.production.example`

**Interfaces:**
- Consumes: every `${VAR}` reference introduced in Task 1's `infra/docker-compose.production.yml`.
- Produces: nothing consumed by later tasks — this is documentation for whoever configures the Coolify resource by hand.

- [ ] **Step 1: Write `infra/.env.production.example`**

```bash
# -----------------------------------------------------------------------------
# Production variables for the Coolify "Docker Compose" resource.
# Paste these into the resource's Environment Variables editor (not committed).
# `docker-compose.production.yml` reads them; anything with a default is
# optional. See README.md "Production on Coolify" for the full setup order.
# -----------------------------------------------------------------------------

# --- Images (GHCR) -----------------------------------------------------------
# Lowercase GitHub org/user that owns the ghcr.io/<owner>/coreloom-uml-{api,web}
# packages built and pushed by .github/workflows/release.yml. Must be
# lowercase — Docker registry paths reject uppercase.
IMAGE_OWNER=your-github-org
# Pin a specific release to roll back, e.g. v0.3.1. Defaults to the moving
# tag CI overwrites on every successful release.
# IMAGE_TAG=production-latest

# --- Domains -----------------------------------------------------------------
# Subdomains under a wildcard you already point at the Coolify server.
# Coolify provisions them and issues Let's Encrypt certs automatically.
API_FQDN=api.example.com
WEB_FQDN=example.com
# SigNoz dashboard — dedicated production instance, separate from staging's.
# This IS read (by Coolify) — it publishes the `signoz` service on container
# port 8080. Full https:// URL, not a bare host.
SERVICE_FQDN_SIGNOZ_8080=https://signoz.example.com
# bull-board (queue dashboard). Same deal — publishes `bull-board` on
# container port 3000. Leave unset to let Coolify generate a domain, or drop
# the `bull-board` service entirely for tunnel-only access.
SERVICE_FQDN_BULLBOARD_3000=https://bull-board.example.com

# --- App -------------------------------------------------------------------
# Generate once: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
APP_KEY=

# --- Database ----------------------------------------------------------------
# Postgres is NOT a service in this stack — create it first as its own
# Coolify "Database" (PostgreSQL) resource in the same project (so it shares
# a private network with this compose resource), configure its Backups tab
# (schedule + a dedicated S3 bucket), then copy its connection details here.
DB_HOST=
DB_PORT=5432
DB_USER=
DB_PASSWORD=
DB_DATABASE=
# false if the Database resource is on this compose resource's private
# network (the default Coolify setup); true if it's reached over a public
# endpoint instead.
DB_SSL=false

# --- Redis / job queue (container-local, private network) -------------------
# The compose file hard-codes REDIS_HOST/REDIS_PORT to the `redis` service.
# Used only for the BullMQ queue — sessions are cookie-based, not Redis.
# bull-board basic auth — required, the dashboard has no other gate.
BULLBOARD_USER=admin
BULLBOARD_PASSWORD=change-me-strong

# --- Mail (Resend) -----------------------------------------------------------
# https://resend.com/docs/send-with-smtp
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USERNAME=resend
SMTP_PASSWORD=
MAIL_FROM_ADDRESS=no-reply@example.com

# --- Object storage (@adonisjs/drive) — Cloudflare R2 -----------------------
# There is no MinIO in this stack — a real bucket is required.
DRIVE_DISK=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=coreloom-uml-production
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
# Optional CDN / public base URL for building public object URLs.
# S3_PUBLIC_URL=

# --- Observability (SigNoz) ----------------------------------------------
# A dedicated SigNoz instance runs inside this Compose stack (clickhouse /
# zookeeper / signoz / signoz-otel-collector + migrators) — NOT shared with
# staging's. `api`/`queue-worker` already export to
# http://signoz-otel-collector:4318 over the Compose network, so there is
# nothing to set here to turn tracing on.
#
# SIGNOZ_TOKENIZER_JWT_SECRET signs the SigNoz dashboard's own login tokens.
# The compose file reads it from ${SERVICE_PASSWORD_64_SIGNOZJWT}, which
# Coolify auto-generates and persists like SERVICE_PASSWORD_64_APPKEY — no
# manual entry needed. Set it explicitly only to pin a known value:
# SERVICE_PASSWORD_64_SIGNOZJWT=
```

- [ ] **Step 2: Cross-check every variable against the compose file**

Run: `grep -oE '\$\{[A-Z0-9_]+(:-[^}]*)?\}' infra/docker-compose.production.yml | sed -E 's/\$\{([A-Z0-9_]+).*/\1/' | sort -u`
Expected: every name in the output is documented in `infra/.env.production.example` (either as a settable var, or explicitly noted as a Coolify-managed magic var like `SERVICE_PASSWORD_64_APPKEY` / `SERVICE_URL_WEB` / `SERVICE_URL_API`, which need no entry — they're Coolify-native, not something a user sets by hand).

- [ ] **Step 3: Commit**

```bash
git add infra/.env.production.example
git commit -m "$(cat <<'EOF'
docs: add production environment variables reference

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6crsGSv2JgtmuiWaMmHqy
EOF
)"
```

---

## Task 3: CI validation for the production compose file

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `infra/docker-compose.production.yml` from Task 1 (must exist for this step to run).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add a validation step at the end of the `ci` job**

In `.github/workflows/ci.yml`, the job currently ends with:

```yaml
      - run: pnpm test

      - run: pnpm build
```

Change it to:

```yaml
      - run: pnpm test

      - run: pnpm build

      - name: Validate production compose file
        run: docker compose -f infra/docker-compose.production.yml config --quiet
```

- [ ] **Step 2: Verify the workflow YAML is still valid**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`
Expected: no output, exit code `0`.

- [ ] **Step 3: Verify the new step actually catches a broken compose file**

Run: `docker compose -f infra/docker-compose.production.yml config --quiet` (same command, run directly)
Expected: exit code `0` — confirms the step you just added would pass in CI too, against the real file from Task 1.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: validate the production compose file syntax

The only meaningful "test" available for infra YAML — catches a
broken interpolation or structure before it reaches a real deploy.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6crsGSv2JgtmuiWaMmHqy
EOF
)"
```

---

## Task 4: Build and push production images to GHCR

**Files:**
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `apps/api/Dockerfile`, `apps/web/Dockerfile` (existing, unmodified).
- Produces: `ghcr.io/<owner>/coreloom-uml-api:{vX.Y.Z,production-latest}` and `ghcr.io/<owner>/coreloom-uml-web:{vX.Y.Z,production-latest}` — the exact image references Task 1's compose file already expects via `IMAGE_OWNER`/`IMAGE_TAG`.

- [ ] **Step 1: Add a `docker` job to `.github/workflows/release.yml`**

The current file has two jobs, `ci` and `publish` (both `needs: ci` for `publish`). Add a third job, `docker`, also gated on `ci`, and update the top-of-file comment to mention it. Full new file:

```yaml
name: Release

# Fires only on a pushed version tag (vX.Y.Z) — never on a plain push to
# `main`. The tag itself is pushed by changesets.yml's `publish` step
# (scripts/tag-release.mjs), automatically, the moment the auto-generated
# "Version Packages" PR is merged — see .changeset/README.md for the full
# chain. Re-runs the full CI suite against the tagged commit (`ci.yml` as a
# reusable workflow), publishes a GitHub Release whose notes are the
# matching apps/api/CHANGELOG.md + apps/web/CHANGELOG.md sections, and
# builds + pushes the apps/api and apps/web images to GHCR — the images
# infra/docker-compose.production.yml pulls (never built on the Coolify
# host). deploy-production.yml then fires once this whole workflow succeeds.
#
# This is the boundary between "shipped to staging" and "released": staging
# redeploys continuously off `main` (deploy-staging.yml) regardless of tags,
# and is not itself a release. Production redeploys once this workflow
# succeeds (deploy-production.yml).

on:
  push:
    tags: ['v*.*.*']

permissions:
  contents: write

jobs:
  ci:
    uses: ./.github/workflows/ci.yml

  publish:
    needs: ci
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Extract changelog sections for this version
        id: changelog
        env:
          VERSION: ${{ github.ref_name }}
        run: |
          set -euo pipefail
          node scripts/changelog-release-notes.mjs "${VERSION#v}" >> "$GITHUB_OUTPUT"

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          name: ${{ github.ref_name }}
          body: ${{ steps.changelog.outputs.notes }}

  docker:
    needs: ci
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Compute lowercase image owner
        id: owner
        run: echo "value=$(echo '${{ github.repository_owner }}' | tr '[:upper:]' '[:lower:]')" >> "$GITHUB_OUTPUT"

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push API image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/api/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ steps.owner.outputs.value }}/coreloom-uml-api:${{ github.ref_name }}
            ghcr.io/${{ steps.owner.outputs.value }}/coreloom-uml-api:production-latest

      - name: Build and push web image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/web/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ steps.owner.outputs.value }}/coreloom-uml-web:${{ github.ref_name }}
            ghcr.io/${{ steps.owner.outputs.value }}/coreloom-uml-web:production-latest
```

- [ ] **Step 2: Verify the workflow YAML is valid**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"`
Expected: no output, exit code `0`.

- [ ] **Step 3: Verify the image tags match what Task 1's compose file expects**

Run: `grep -n 'ghcr.io/\${IMAGE_OWNER}/coreloom-uml-' infra/docker-compose.production.yml`
Expected: two matches (`coreloom-uml-api`, `coreloom-uml-web`), both using `${IMAGE_TAG:-production-latest}` — confirms the `production-latest` tag pushed by this job is the one the compose file pulls by default, and that a manual `IMAGE_TAG=vX.Y.Z` override in Coolify would also resolve to a tag this job actually pushes.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "$(cat <<'EOF'
ci: build and push production images to GHCR on release

Replaces "Coolify builds on the host" with prebuilt, immutable,
auditable images. Each release publishes both an immutable vX.Y.Z tag
and a moving production-latest tag; infra/docker-compose.production.yml
defaults to the latter and can be pinned to the former for a rollback.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6crsGSv2JgtmuiWaMmHqy
EOF
)"
```

---

## Task 5: README — close the production gap, document the setup

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing from earlier tasks besides their existence (this task links to files created there).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Remove the production bullet from "Not yet included"**

Find this bullet under `## Not yet included` and delete it entirely (the `apps/web` component tests bullet directly above it stays untouched):

```markdown
- **A production deployment path.** What's here is local dev
  (`infra/docker-compose.yml`) and a click-through **staging** stack on Coolify
  (`infra/docker-compose.staging.yml`) — explicitly *not* production: single
  instance, in-memory rate limiter, containerised Postgres, Mailpit instead of a
  real SMTP provider, cross-site session cookies. Before going to production you
  still need: an `infra/docker-compose.production.yml` and matching Coolify
  resource, a managed Postgres with backups, a real SMTP provider, a session
  store decision for multi-replica (`cookie` or Redis), first-class secret
  management, error alerting on top of the traces, and image build + push in CI
  rather than letting Coolify build on the host. The release/deploy **wiring**
  for when that stack exists is already here — see
  [Releases and production](#releases-and-production).
```

- [ ] **Step 2: Insert a new "Production on Coolify" section**

Insert it immediately after the existing `### Staging on Coolify` section (right before `## Differences from coreloom`):

```markdown
### Production on Coolify

`infra/docker-compose.production.yml` deploys the app stack (Redis, one-shot
migrations, API, the `queue:work` worker, web, `bull-board`, and a dedicated
SigNoz — ClickHouse, ZooKeeper, the SigNoz app and its OTel collector) as a
second, independent Coolify **Docker Compose** resource on the same host as
staging. Two things differ from staging: Postgres is **not** a service in
this file — it's provisioned as its own Coolify **Database** (PostgreSQL)
resource, the only way to get Coolify's native scheduled backups to an S3
target — and the API/web images are pulled prebuilt from GHCR rather than
built on the host (see [Releases and production](#releases-and-production)).

1. **Create the Postgres resource first**: in Coolify, **New Resource →
   Database → PostgreSQL**, in the same project as the compose resource below
   so they share a private network. Open its **Backups** tab, point it at a
   dedicated S3-compatible bucket (kept separate from the object-storage
   bucket below) and set a schedule. Copy its host/port/user/password/
   database into the compose resource's environment variables (`DB_HOST`,
   `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`).
2. **New Resource → Docker Compose**, connect this repo, set **Docker
   Compose Location** to `/infra/docker-compose.production.yml`.
3. Paste the variables from `infra/.env.production.example` into the
   resource's **Environment Variables** editor — `API_FQDN` / `WEB_FQDN` are
   subdomains under a wildcard already pointed at the Coolify host. Generate
   a real `APP_KEY`. Set `IMAGE_OWNER` to your GitHub org/user, lowercase
   (the GHCR image path Coolify pulls from).
4. **Make the GHCR images pullable**: either make the `coreloom-uml-api` /
   `coreloom-uml-web` packages public on GitHub, or add registry credentials
   for `ghcr.io` in Coolify (a GitHub PAT with `read:packages`) — a private
   package otherwise fails to pull.
5. Publish the dedicated SigNoz dashboard the same way as staging, with its
   own domain: `SERVICE_FQDN_SIGNOZ_8080=https://signoz.example.com`. It's a
   separate instance from staging's, so give the host headroom for a second
   ClickHouse/ZooKeeper (~4 GB).
6. Optionally publish **bull-board** the same way as staging
   (`SERVICE_FQDN_BULLBOARD_3000` + `BULLBOARD_USER` / `BULLBOARD_PASSWORD`).
7. **Deploy the Postgres resource, then the compose resource.** On every
   compose deploy the `migrate` service runs `node ace migration:run --force`
   to completion before `api` and `queue-worker` start.
8. **Error alerting**: once traces are flowing, open the dedicated SigNoz
   dashboard's Alerts section and add rules on the `api` service's error rate
   (5xx) and p95 latency, with a notification channel (email/Slack/webhook —
   SigNoz supports all three). There is no separate error-tracking service —
   this is the alerting layer on top of the traces already being collected.

Like staging, the API and SPA are served from different domains, so
`SESSION_COOKIE_SAME_SITE=none` + `SESSION_COOKIE_SECURE=true`, and
`DB_SSL=false` only holds if the Database resource shares this compose
resource's private network — set `DB_SSL=true` if it's reached over a public
endpoint instead. To harden later, put the API behind the web domain on a
`/api` path so the cookie can go back to `SameSite=lax`.

Deployment is triggered by `.github/workflows/deploy-production.yml` once a
version tag's release succeeds (see
[Releases and production](#releases-and-production)) — gate it behind a
manual approval by adding required reviewers to the GitHub `production`
environment (**Settings → Environments**).
```

- [ ] **Step 3: Confirm the removed bullet is gone and the new section is present**

Run: `grep -c "an \`infra/docker-compose.production.yml\` and matching Coolify" README.md; grep -c "### Production on Coolify" README.md`
Expected: first command outputs `0`, second outputs `1`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: document the production deployment path

Closes the "no production path" gap from "Not yet included" — the
new "Production on Coolify" section covers the full resource setup
order, mirroring the existing staging section.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6crsGSv2JgtmuiWaMmHqy
EOF
)"
```

---

## Task 6: CLAUDE.md — retire the now-closed scope gap

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Remove the outdated bullet from the "Scope" section**

Find and delete this bullet (the `apps/web` component tests bullet in the same section stays — that gap is still open):

```markdown
- There is no production deployment path — only local dev and the non-production Coolify staging stack.
```

- [ ] **Step 2: Confirm it's gone**

Run: `grep -c "There is no production deployment path" CLAUDE.md`
Expected: `0`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: remove the closed "no production path" scope note from CLAUDE.md

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6crsGSv2JgtmuiWaMmHqy
EOF
)"
```

---

## Task 7: Changeset

**Files:**
- Create: `.changeset/<auto-generated-name>.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (satisfies `require-changeset.yml`'s CI gate on the eventual PR).

- [ ] **Step 1: Add an empty changeset**

This change touches no `apps/api`/`apps/web` source — infra, CI and docs only — so it needs no version bump, but `require-changeset.yml` still requires a changeset file to exist.

Run: `pnpm changeset add --empty`
Expected: a new random-named `.md` file appears under `.changeset/`.

- [ ] **Step 2: Verify the file was created**

Run: `git status --porcelain .changeset/`
Expected: exactly one new untracked `.md` file listed.

- [ ] **Step 3: Commit**

```bash
git add .changeset/
git commit -m "$(cat <<'EOF'
chore: add empty changeset for the production deployment path

Infra/CI/docs only — no apps/api or apps/web source changed, so no
version bump.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6crsGSv2JgtmuiWaMmHqy
EOF
)"
```
