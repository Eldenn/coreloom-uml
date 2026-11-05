<div align="center">

# Coreloom UML

**A light MVC monorepo — the strict necessary to ship an MVP fast.**

AdonisJS v7 · React 19 · TypeScript (strict) · pnpm · Turborepo

[![CI](https://github.com/Eldenn/coreloom-uml/actions/workflows/ci.yml/badge.svg)](https://github.com/Eldenn/coreloom-uml/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/Eldenn/coreloom-uml)](LICENSE)
[![Latest release](https://img.shields.io/github/v/tag/Eldenn/coreloom-uml?label=release)](https://github.com/Eldenn/coreloom-uml/releases)

</div>

---

## Table of Contents

- [What is Coreloom UML?](#what-is-coreloom-uml)
- [Tech Stack](#tech-stack)
- [Repository Layout](#repository-layout)
- [Requirements](#requirements)
- [Getting Started](#getting-started)
- [Common Scripts](#common-scripts)
- [Not yet included](#not-yet-included)
- [API client (Tuyau)](#api-client-tuyau)
- [Authentication](#authentication)
- [Background jobs](#background-jobs)
- [Deploying](#deploying)
- [Differences from coreloom](#differences-from-coreloom)
- [Forward-compatibility notes](#forward-compatibility-notes)
- [Contributing](#contributing)
- [License](#license)

## What is Coreloom UML?

Coreloom UML is [coreloom](https://github.com/eldenn/coreloom) stripped down to what a
first, presentable MVP actually needs: the same core stack, the same
domain-driven folder layout, the same coding conventions — minus every piece
of infrastructure an MVP can live without. See
[Differences from coreloom](#differences-from-coreloom) for the exact list
and the reasoning behind each cut, so pieces can be copied back into
coreloom later with minimal adaptation.

## Tech Stack

| Domain | Choice |
|---|---|
| Package manager | pnpm (workspaces) |
| Monorepo orchestration | Turborepo (local cache only) |
| Backend | AdonisJS v7 |
| Auth | `@adonisjs/auth` session guard, file-backed sessions — no Redis |
| Frontend | React 19 + Vite + react-router |
| Data fetching (web) | TanStack Query (`@tanstack/react-query`) — every API read/write goes through a query/mutation hook wrapping the Tuyau client |
| Forms (web) | React Hook Form for `apps/web`-owned forms; `@coreloom-uml/ui` form components keep their own internal field handling |
| i18n (web) | `i18next` + `react-i18next`, bundled in `apps/web` (`src/i18n/`); `en` source of truth, `fr` shipped. Re-extract into a shared `packages/i18n` only when a second app needs it. |
| API contract | Tuyau (`@tuyau/core`) — end-to-end typed client generated from the AdonisJS routes |
| Request / response validation | VineJS (backend only; the Tuyau client infers `apps/web`'s types from it) |
| Database | PostgreSQL |
| ORM | Lucid |
| Rate limiting | `@adonisjs/limiter`, in-memory store |
| Background jobs | BullMQ via `@nemoventures/adonis-jobs` + Redis (`@adonisjs/redis`). Dedicated `queue:work` worker process; `bull-board` container to inspect / retry / remove jobs. |
| Mail | `@adonisjs/mail` (SMTP), Mailpit locally |
| Object storage | `@adonisjs/drive` (S3 driver); MinIO locally, real S3/R2/Spaces elsewhere. `DRIVE_DISK=fs` falls back to the local filesystem (tests, CI). Account **avatar upload** exercises it end to end — private disk, MIME + 5 MB validation at the boundary, bytes streamed back through an authenticated route. |
| Security headers | `@adonisjs/shield` (API), CSP + hardening headers at nginx (web) |
| Observability | OpenTelemetry traces → SigNoz, opt-in via `OTEL_*` env |
| Code quality | Biome |
| Unit & integration tests | Japa (`apps/api`), Vitest (`packages/ui`). `apps/web` component tests are deliberately deferred — see [Not yet included](#not-yet-included). |
| UI | Tailwind CSS v4 + shadcn/ui (`packages/ui`, copied from coreloom) |

## Repository Layout

```
coreloom-uml/
├── apps/
│   ├── api/                  # AdonisJS v7 backend — same app/ domain layout as coreloom
│   │                         #   app/notes/ is the reference domain — copy it for new user-owned resources
│   └── web/                  # React 19 + Vite SPA (public + auth + account + notes)
├── packages/
│   ├── ui/                   # Shared UI components — copied from coreloom, unmodified
│   ├── config/                # Shared TypeScript config — copied from coreloom, unmodified
│   └── auth-policy/          # Password policy — copied from coreloom (consumed from source, no build step)
└── infra/
    ├── docker-compose.yml         # local dev: postgres + redis + mailpit + minio + bull-board
    ├── docker-compose.staging.yml # Coolify staging stack
    ├── .env.staging.example       # staging environment variables
    └── postgres/init/             # local Postgres init scripts
```

## Requirements

- **Node.js** 26+
- **pnpm** 11+ (via Corepack: `corepack enable`, or `mise install`)
- **Docker** + Docker Compose (for PostgreSQL, Redis, Mailpit, MinIO)

## Getting Started

```bash
# 1. Install
corepack enable
pnpm install

# 2. Set up environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Generate a real APP_KEY (32+ random bytes) rather than shipping a fixed one:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# then set it in apps/api/.env

# 3. Start Postgres, Redis, Mailpit and MinIO
docker compose -f infra/docker-compose.yml up -d

# 4. Run migrations
pnpm --filter @coreloom-uml/api migration:run

# 5. Start everything in dev mode
pnpm dev

# 6. (optional) Run the job queue worker in a separate terminal
pnpm --filter @coreloom-uml/api queue:work
```

By default:

- API runs at `http://localhost:3333`
- Web runs at `http://localhost:5173`
- Mailpit (catches every outgoing email in dev) runs at `http://localhost:8025`
- MinIO (S3-compatible object storage for `@adonisjs/drive`) — S3 API at
  `http://localhost:9000`, web console at `http://localhost:9001`
  (`minioadmin` / `minioadmin`)
- bull-board (job queue dashboard) runs at `http://localhost:8082`

## Common Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run all apps in development mode |
| `pnpm build` | Build every workspace (cached) |
| `pnpm lint` | Lint the whole repo with Biome |
| `pnpm test` | Run tests (Japa for `apps/api`, Vitest for `packages/ui`) |
| `pnpm check-types` | Type-check all workspaces |
| `pnpm changeset` | Add a changeset for the current PR — required, see [Releases and production](#releases-and-production) |

## Not yet included

Deliberate gaps — the scaffolding assumes you'll fill these in for your project:

- **`apps/web` component tests.** Vitest, Testing Library and the jsdom setup
  are wired (`apps/web/vitest.config.ts`, `passWithNoTests: true`), but no test
  files ship yet. `packages/ui` and `apps/api` are covered. Add web tests once
  the screens stop churning.

See [Differences from coreloom](#differences-from-coreloom) for the pieces that
were cut on purpose and how to bring them back.

## API client (Tuyau)

`apps/web` calls the API through a fully typed client — `apps/web/src/lib/client.ts`,
built on `@tuyau/core`. Request bodies/queries come from the route's Vine input
validator, responses and typed errors from the controller's return type, e.g.:

```ts
const { user } = await client.api.auth.login({ body: { email, password } })
```

The type registry lives in `apps/api/.adonisjs/client/registry/` and is
regenerated by an assembler hook (`apps/api/adonisrc.ts`) on `pnpm dev` /
`node ace serve`. It is **committed** (tracked despite `.adonisjs/` being
git-ignored), like a lockfile — re-run the dev server and commit the result
whenever routes, input validators, or controller response shapes change.

## Authentication

Coreloom UML ships its own email/password authentication: `@adonisjs/auth`'s
session guard against a local `users` table, file-backed sessions (no
Redis), and scrypt password hashing. CORS is locked to the web app's exact
origin with `credentials: true`, so the session cookie only ever crosses
that one origin — the same trust boundary coreloom's Logto integration
relies on, just without a second identity service to run locally.

Password strength is enforced with `packages/auth-policy` — the exact same
package coreloom uses to describe its password policy to Logto — so the
policy definition doesn't fork if this ever moves to a hosted IdP.

Registration, forgotten passwords, and email verification all send an email
via `@adonisjs/mail`. Password-reset and verification links are stateless
signed/encrypted tokens (`AdonisJS`'s `encryption` service, see
`app/auth/services/email-token.ts`) — no extra database table, and a reset
link is invalidated the moment the linked password actually changes.

### Security headers

`@adonisjs/shield` (`config/shield.ts`) adds `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff` and HSTS to every API response. CSP and
CSRF are deliberately left **off** on the API: it only serves JSON, and the
CSRF boundary is already the strict CORS origin allowlist plus the forced
`application/json` preflight (see the comments in `config/shield.ts` for when
to turn CSRF on). The SPA gets its own `Content-Security-Policy` and
hardening headers from nginx — see `apps/web/docker/nginx.conf.template`.

## Background jobs

Async work runs on a BullMQ queue (`@nemoventures/adonis-jobs`, Redis-backed).
Config: `apps/api/config/queue.ts` + `apps/api/config/redis.ts`; the connection
comes from `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`.

```bash
# Scaffold a job — the file MUST keep its `_job.ts` suffix (the worker discovers
# jobs from app/**/*_job.ts). Move it under app/jobs/ and kebab-case the rest.
pnpm --filter @coreloom-uml/api exec node ace make:job send-welcome-email

# Run the worker (its own process — not started by `pnpm dev`)
pnpm --filter @coreloom-uml/api queue:work
```

A job is a `default`-exported class extending `Job<Data, Return>` with a
`process()` method; dispatch it with `SomeJob.dispatch(data)` from a
controller/service. `apps/api/app/jobs/example_job.ts` is the reference — copy
it.

**Transactional email already runs on the queue.** `apps/api/start/mail.ts`
registers a `mail.setMessenger` that turns every `mail.sendLater(...)` (email
verification, password reset) into a `SendMailJob` — compiled by
`@adonisjs/mail`, delivered by the worker, retried on SMTP failure, and
replayable from bull-board. Controllers are unchanged; keep new sends on
`sendLater`.

**bull-board** (`http://localhost:8082` in dev) inspects the queue — drill into
a job, retry or remove it, watch throughput. In staging it runs as its own
service behind HTTP basic auth (`BULLBOARD_USER` / `BULLBOARD_PASSWORD`) on the
domain from `SERVICE_FQDN_BULLBOARD_3000`; drop the service for tunnel-only
access. `@nemoventures/adonis-jobs` also bundles an in-app **QueueDash** UI
(`@nemoventures/adonis-jobs/ui/queuedash`) — not mounted here; wire its routes
behind `middleware.auth()` if you want it in-process.

## Deploying

> What follows is the image build recipe, the Coolify **staging** stack
> (continuous, not production-grade), and the Coolify **production** stack
> (release-gated — see [Production on Coolify](#production-on-coolify)).

Each app has a standalone multi-stage `Dockerfile`. Build from the
**monorepo root** (both need the pnpm workspace context to resolve
`@coreloom-uml/*` dependencies):

```bash
docker build -f apps/api/Dockerfile -t coreloom-uml-api .
docker build -f apps/web/Dockerfile -t coreloom-uml-web .
```

`coreloom-uml-api` runs the compiled server (`node --import ./instrumentation.js
bin/server.js`) and expects its environment variables (see
`apps/api/.env.example`) supplied at `docker run` time — never baked into the
image. Run migrations as a separate, dedicated step before starting new
containers:

```bash
docker run --rm --env-file apps/api/.env coreloom-uml-api node ace migration:run --force
```

`coreloom-uml-web` is a static build served by nginx. The API URL is **not**
baked in at build time — set `API_URL` (the bare API origin, e.g.
`https://api.example.com`) at `docker run` time and the container entrypoint
writes it into `/env.js`, which the SPA reads before it boots
(`apps/web/src/lib/client.ts`). The same image promotes across environments
with only a restart. `API_URL` also scopes the CSP `connect-src` in the
generated nginx config.

### Continuous deployment

`.github/workflows/deploy-staging.yml` calls a Coolify deploy webhook after
CI passes on `main` (or on manual `workflow_dispatch`); Coolify then rebuilds
and rolls the staging stack. It is a no-op until two repository secrets are
set — `COOLIFY_WEBHOOK_URL` and `COOLIFY_WEBHOOK_TOKEN` — so a fresh clone
stays green. Create the webhook on the Coolify Docker Compose resource and
paste its URL + an authorized API token into
**Settings → Secrets and variables → Actions**.

### Releases and production

Staging (above) redeploys on **every push to `main`**, unversioned — it is a
continuous preview, not a release. Releases are fully automated with
[Changesets](https://github.com/changesets/changesets) — see
`.changeset/README.md` for the complete picture; nobody bumps a version or
edits a changelog by hand. In short:

1. Every pull request adds a changeset (`pnpm changeset`, or
   `pnpm changeset add --empty` for a change with no user-facing effect) —
   `.github/workflows/require-changeset.yml` fails the PR otherwise.
2. Merging a PR pushes to `main`: staging redeploys immediately (above), and
   `.github/workflows/changesets.yml` opens or updates an auto-generated
   **"Version Packages" pull request** that applies every pending
   changeset's version bump to `apps/api` + `apps/web` (they version
   together — `fixed` in `.changeset/config.json`) and regenerates
   `apps/api/CHANGELOG.md` / `apps/web/CHANGELOG.md`.
3. **Merging that "Version Packages" PR is the release.** With no changesets
   left pending, `changesets.yml` runs `scripts/tag-release.mjs` instead,
   which tags the commit `vX.Y.Z` and pushes the tag — nothing to publish to
   any registry, every workspace package is private.
4. The pushed tag runs **`.github/workflows/release.yml`** (reruns CI against
   the tagged commit, publishes a GitHub Release from the matching changelog
   sections), which on success runs **`.github/workflows/deploy-production.yml`**
   (calls a production Coolify deploy webhook — `COOLIFY_PRODUCTION_WEBHOOK_URL`
   / `COOLIFY_PRODUCTION_WEBHOOK_TOKEN`, no-op without both, same pattern as
   staging). Its `deploy` job declares `environment: production`, so a
   **manual approval gate** is one `production` environment + required
   reviewers away (**Settings → Environments**) if you ever want one — inert
   until configured.

A plain push to `main` never runs `release.yml` or `deploy-production.yml` —
only a pushed version tag does, and only `changesets.yml` pushes one.
`infra/docker-compose.production.yml` and the GHCR image build/push are both
in place (see [Production on Coolify](#production-on-coolify)); until the
Coolify production resource is created and the two secrets above are set,
`deploy-production.yml` still runs as a documented no-op — the
release/GitHub-Release half of the pipeline works today regardless.

### Observability (SigNoz)

The API ships OpenTelemetry tracing (`instrumentation.ts`, loaded via
`node --import`). It is **off** unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set,
so dev, tests and CI are untouched. Point it at a SigNoz OTLP endpoint to
turn it on:

```bash
# self-hosted collector
OTEL_EXPORTER_OTLP_ENDPOINT=http://signoz-otel-collector:4318
# SigNoz Cloud
OTEL_EXPORTER_OTLP_ENDPOINT=https://ingest.<region>.signoz.cloud:443
OTEL_EXPORTER_OTLP_HEADERS=signoz-ingestion-key=<key>
OTEL_SERVICE_NAME=coreloom-uml-api
```

Auto-instrumentation covers HTTP, `pg`/Lucid and `pino` (log ↔ trace
correlation). Metrics and logs pipelines are still out — SigNoz derives RED
metrics from the spans.

On **staging**, SigNoz runs inside the Coolify stack (see below), and the `api`
service exports to `http://signoz-otel-collector:4318` over the Compose network
out of the box — no `OTEL_*` variable to set.

### Staging on Coolify

`infra/docker-compose.staging.yml` deploys the whole stack (Postgres, Redis,
one-shot migrations, API, the `queue:work` worker, web, `bull-board`, Mailpit,
and a bundled SigNoz — ClickHouse, ZooKeeper, the SigNoz app and its OTel
collector) as a single Coolify **Docker Compose** resource. It is a
click-through staging topology, not production: single instance, cookie-based
sessions, in-memory rate limiter, containerised Postgres, Mailpit instead of a
real SMTP provider.

1. In Coolify: **New Resource → Docker Compose**, connect this repo, set
   **Docker Compose Location** to `/infra/docker-compose.staging.yml`.
2. Paste the variables from `infra/.env.staging.example` into the resource's
   **Environment Variables** editor. `API_FQDN` / `WEB_FQDN` are subdomains
   under a wildcard already pointed at the Coolify host — Coolify provisions
   them, wires its proxy to the right container port and issues Let's Encrypt
   certificates. Generate a real `APP_KEY`.
3. Publish the SigNoz dashboard by setting
   `SERVICE_FQDN_SIGNOZ_8080=https://signoz-staging-oratoria.drcode.fr` in the
   same **Environment Variables** editor (the `signoz` service carries the
   matching marker so Coolify knows to proxy container port 8080; a plain
   `expose` is not enough). The other SigNoz containers stay on the Compose
   network with no domain. SigNoz's ClickHouse/ZooKeeper add real memory
   pressure — give the staging host headroom (~4 GB). On first load, SigNoz
   asks you to create the admin account; until then the collector logs
   `cannot create agent without orgId` every 30s, which is expected.
4. Optionally publish **bull-board** the same way — set
   `SERVICE_FQDN_BULLBOARD_3000` and `BULLBOARD_USER` / `BULLBOARD_PASSWORD`
   (basic auth is the dashboard's only gate). Omit the `bull-board` service for
   tunnel-only access.
5. **Deploy.** On every deploy the `migrate` service runs
   `node ace migration:run --force` to completion before `api` and
   `queue-worker` start.

The API and SPA are served from different domains, so the compose file sets
`SESSION_COOKIE_SAME_SITE=none` + `SESSION_COOKIE_SECURE=true` (the browser
otherwise drops the session cookie on cross-site `fetch()`), and `DB_SSL=false`
because Postgres is only reachable on the internal Docker network. To harden
later, put the API behind the web domain on a `/api` path so the cookie can
go back to `SameSite=lax`.

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
   subdomains under a wildcard already pointed at the Coolify host. Attach
   those two domains to the `api` and `web` services in the resource's UI —
   that's what populates the Coolify-managed `SERVICE_URL_API` /
   `SERVICE_URL_WEB` vars the compose file actually reads (`FRONTEND_URL`,
   the SPA's `API_URL`); pasting `API_FQDN`/`WEB_FQDN` alone does nothing.
   `APP_KEY` is generated and held by Coolify automatically
   (`SERVICE_PASSWORD_64_APPKEY`) — no action needed there. Set `IMAGE_OWNER`
   to your GitHub org/user, lowercase (the GHCR image path Coolify pulls
   from).
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
`/api` path so the cookie can go back to `SameSite=lax`. Rate limiting still
runs on the in-memory `LIMITER_STORE` — correct for the single-instance
topology this stack assumes, revisit only if this ever moves to multiple API
replicas.

Deployment is triggered by `.github/workflows/deploy-production.yml` once a
version tag's release succeeds (see
[Releases and production](#releases-and-production)) — gate it behind a
manual approval by adding required reviewers to the GitHub `production`
environment (**Settings → Environments**).

## Differences from coreloom

| Coreloom | Coreloom UML | Why |
|---|---|---|
| Logto (self-hosted OIDC), `apps/login`, `apps/account` | Session-based auth built into `apps/api`, single `apps/web` app. Password reset and email verification (Logto's job in coreloom) are reimplemented directly with `@adonisjs/mail` — still via Mailpit locally, same as coreloom. The **user avatar** — Logto's responsibility in coreloom — is a plain `@adonisjs/drive`-backed `account` route here (`POST`/`GET`/`DELETE /account/avatar`). | Logto's Docker footprint (own DB schema, MinIO, admin console, two SPAs) is the single biggest thing between "clone" and "running MVP". The `auth` domain's public surface (guard name, `User` shape) stays close to what a Logto-backed `auth` domain would expose, so swapping the implementation later is localized to that domain. |
| Redis + BullMQ | **Back** — a BullMQ job queue via `@nemoventures/adonis-jobs` (`@adonisjs/redis` for the connection), a dedicated `queue:work` worker process, and a `bull-board` container to inspect / retry / remove jobs. `@adonisjs/limiter` and `@adonisjs/session` still run on in-memory/file stores — Redis is only wired to the queue. Transactional email runs on the queue: `apps/api/start/mail.ts` routes `mail.sendLater(...)` through a `SendMailJob` (`mail.setMessenger`), so verification / reset emails are retried and replayable. `apps/api/app/jobs/example_job.ts` is the copy-me reference. | A real MVP hits async work early (exports, webhooks, digests); an in-memory queue loses jobs on crash/deploy. BullMQ is the ecosystem with a good off-the-shelf dashboard. |
| OpenTelemetry + SigNoz | **Kept, traces only** — `instrumentation.ts` exports spans to SigNoz over OTLP, opt-in via `OTEL_EXPORTER_OTLP_ENDPOINT` (no-op when unset). Metrics/logs collector pipelines still dropped. | A `500` you cannot see is the thing that actually kills an MVP; traces (with `pino` correlation) cover that with one env var and no infra to run. Full metrics/logs pipelines still wait for traffic. |
| Traefik, multi-service `docker-compose.yml` | `infra/docker-compose.yml` with `postgres`, `redis`, `mailpit`, `minio` and `bull-board` | The only dependencies an MVP actually needs locally. |
| MinIO (part of coreloom's Logto footprint) | **Back as a standalone dev dependency** — a plain S3-compatible store for `@adonisjs/drive`, no Logto attached, wired end to end by the account **avatar upload** (`app/account/controllers/avatar-controller.ts`). One private bucket, created by a one-shot `minio-init`. Prod points `DRIVE_DISK=s3` at a real S3/R2/Spaces bucket; `DRIVE_DISK=fs` skips it entirely. | Object storage is a genuine MVP need (user-uploaded files) and `@adonisjs/drive` keeps the app code storage-agnostic, so swapping MinIO for managed S3 is one env change. |
| `packages/i18n` | **Back**, but not as a shared package — `i18next` + `react-i18next` live directly inside `apps/web` (`src/i18n/`), with `en`/`fr` JSON namespaces (`common`, `auth`, `account`). Re-extract into `packages/i18n` when a second app needs the same catalog. | A single SPA doesn't need a shared package for its own strings; the coreloom `packages/i18n` split earns its keep only across `apps/login` + `apps/account`. |
| Bouncer / per-resource RBAC policies | Dropped. Resource ownership is a flat `userId` check via `app/shared/authorization/assertOwner` (used by `app/notes/` and `/users/:id`); a non-owned resource reads as a 404. No roles, no policy classes. | The `assertOwner` helper covers "a user may only touch their own rows", which is all an MVP needs. Add real RBAC back (`@adonisjs/bouncer` + policy classes, exactly as coreloom does it) once roles/permissions become a requirement. |
| Playwright e2e, Storybook | Dropped | Re-add once core flows stabilize — both churn heavily during early MVP iteration. `packages/ui`'s Vitest component tests are kept; `apps/web` tests are deferred (see [Not yet included](#not-yet-included)). |
| Changesets versioning | **Kept, repurposed** — not for publishing packages (nothing here is published), but as the release-PR automation: every PR adds a changeset, `apps/api` + `apps/web` version together (`fixed` in `.changeset/config.json`), and merging the auto-generated "Version Packages" PR tags and deploys to production. See [Releases and production](#releases-and-production). | An MVP with a real production environment needs *some* deliberate release boundary distinct from continuous staging deploys; Changesets' PR-based flow gives that without any hand-edited version bump or changelog. |
| Tuyau typed API client (`@tuyau/core`) | **Kept** — `apps/web` calls the API through the generated client (`apps/web/src/lib/client.ts`); no OpenAPI docs generation. The registry (`apps/api/.adonisjs/client/registry/`) is generated by an assembler hook on `node ace serve` and committed like a lockfile. | End-to-end type safety with a single source of truth (the Vine input validators + controller return types) beats hand-syncing a `fetch` wrapper against a separate schema package, even at this size. OpenAPI stays out until an external/non-TS consumer needs it. |
| `packages/contracts` (shared Zod schemas) | **Dropped** | Its only real job was supplying `apps/web`'s request/response types, which Tuyau now infers from the API; no runtime Zod validation was in use. Client-side form checks still come from `packages/auth-policy`. |
| `packages/auth-policy` | **Kept**, now consumed straight from TypeScript source (`exports` → `./src`, no `tsup` build) like `packages/ui`; dropped from `apps/api`'s dependencies since only `apps/web` uses it | Small, dependency-free, and now directly useful (it feeds the register/login forms' client-side password validation) rather than only informing Logto's server-side policy. Coreloom builds it because its API consumes it as compiled JS; coreloom-uml's API doesn't consume it at all, so the build step is dead weight. |
| `packages/ui` | **Kept as-is** (minus Storybook config/stories) | Zero coupling to Logto or S3 — pure, framework-agnostic presentation components. |

## Forward-compatibility notes

- The `auth` domain's public surface (guard name `web`, `User` model
  columns `id`/`fullName`/`email`) is kept close to what coreloom's
  Logto-backed `auth` domain exposes, so a future move to Logto is a
  swap of the guard implementation, not a rewrite of callers.
- Any new domain follows coreloom's `app/<domain>/{controllers,validators,
  middleware,models}` shape, so it can be copied into coreloom's `apps/api`
  directly. `app/notes/` is the worked reference for a user-owned resource —
  Lucid model + migration, Vine `*-input`/`*-output`, serializer, RESTful
  controller, routes, functional specs, and an `apps/web` list/detail/create/
  edit slice. It leans on two cross-cutting helpers meant for reuse:
  `app/shared/pagination/` (list endpoints return `{ data, meta }`, `perPage`
  capped) and `app/shared/authorization/` (`assertOwner`). Copy the folder and
  rename for the next resource.
- `packages/ui`, `packages/config`, and `packages/auth-policy` are vendored
  copies of coreloom's, not forks — if one needs to change, consider making
  the change in coreloom first and re-copying it here. The only intentional
  divergence is packaging: they are renamed to the `@coreloom-uml/*` scope and
  `auth-policy` is consumed from source rather than a `tsup` build.

## Contributing

Issues and pull requests are welcome.

1. Fork the repo and create a branch off `main`.
2. Follow the conventions in [`CLAUDE.md`](CLAUDE.md) (naming, folder layout,
   English-only code/comments, pinned versions, etc.) — they're the actual
   style guide, not just AI-assistant instructions.
3. Before opening a PR: `pnpm lint`, `pnpm check-types` and `pnpm test` must
   pass locally (the same checks `ci.yml` runs).
4. Add a changeset (`pnpm changeset`, or `pnpm changeset add --empty` for a
   change with no user-facing effect) — required, see
   [Releases and production](#releases-and-production).
5. Open the PR against `main` with a clear description of the change and why.

## License

Released under the [MIT License](LICENSE).
