# Production deployment path — design

Status: approved (chat), pending implementation plan.

## Context

Coreloom UML's README documents two intentional gaps for a "functional MVP
repo": `apps/web` component tests, and a production deployment path (see
`README.md` → "Not yet included"). This spec covers the second gap.

Today, `infra/docker-compose.staging.yml` gives a click-through Coolify
staging stack that is explicitly not production-grade: single instance,
in-memory rate limiter, containerised Postgres with no backups, Mailpit
instead of a real SMTP provider, and Coolify building images on the host
from `build:` directives. `.github/workflows/deploy-production.yml` already
exists and calls a Coolify webhook, but is a documented no-op — there is no
`infra/docker-compose.production.yml`, no production Coolify resource, and
no real secrets wired up.

## Decisions

Made collaboratively; each one was a genuine fork, not an implementation
detail — recorded here so the plan doesn't re-litigate them.

| Axis | Decision | Why |
|---|---|---|
| Hosting | Same Coolify host as staging, a second independent Docker Compose resource | No new infra to operate; matches `deploy-production.yml`'s existing webhook-per-environment shape |
| API replicas | Single instance, cookie-based sessions (no Redis session store) | Same as staging; multi-replica is a future upgrade, not needed now |
| Postgres | A dedicated Coolify **Database** resource (not a `postgres:` service in our compose file) | Only Coolify's native Database resource type exposes scheduled backups to an S3 target — a plain compose service doesn't get that button |
| Backups | Configured entirely in the Coolify Database resource's UI (schedule + S3-compatible target credentials), pointing at a dedicated R2 bucket | Native, zero extra code/containers |
| SMTP | Resend | Simple API/SMTP relay, good free tier, common in the Node/Adonis ecosystem |
| Object storage | Cloudflare R2 | S3-compatible, no egress fees, cheap for avatar-scale volume |
| Backup bucket | Same provider (R2), separate bucket from object storage | One account to manage; avatars and DB dumps stay isolated from each other |
| Secrets | Coolify's own environment variables editor, same mechanism as staging | Already encrypted at rest by Coolify; no new dependency to operate |
| Error alerting | SigNoz alert rules on error-rate/latency traces | SigNoz is already self-hosted for traces; no new service |
| SigNoz topology | A **dedicated** SigNoz/ClickHouse/ZooKeeper instance for production (full copy of the staging block), not shared with staging | Full observability isolation between environments — an incident on one SigNoz stack never blinds the other. Costs ~4 GB extra RAM on the host, accepted. |
| Image build | CI builds and pushes `apps/api` and `apps/web` images to GHCR; Coolify pulls, never builds on the host | README's own documented gap; removes host build load and gives immutable, auditable release artifacts |
| Approval gate | Activate the GitHub `production` environment with required reviewers | First real production environment; `deploy-production.yml` already declares `environment: production`, inert until configured — pure repo-settings change, no code |

## Architecture

### Topology

One new Coolify Docker Compose resource, `infra/docker-compose.production.yml`,
sibling to the staging resource on the same host, plus one Coolify Database
(PostgreSQL) resource it connects to over the Coolify project's internal
network.

```
Coolify host
├── staging (existing) — unchanged
├── production compose resource (new)
│   ├── migrate        (image, one-shot, runs migrations)
│   ├── api             (image, exposes 3333)
│   ├── queue-worker     (image, same image as api, `queue:work`)
│   ├── redis            (BullMQ only — no session store)
│   ├── bull-board       (queue dashboard, basic auth)
│   ├── web              (image, static SPA behind nginx)
│   └── signoz-*          (dedicated ClickHouse/ZooKeeper/collector/UI — copy of staging's block)
└── production Postgres (new Coolify Database resource)
    └── scheduled backups → R2 bucket (Coolify-native, UI-configured)
```

No `mailpit` (real SMTP via Resend), no `minio*` (real object storage via
R2), no `postgres:` service (external Coolify Database resource instead).

### CI/CD changes

- `release.yml` gains a `docker` job (`needs: ci`, runs alongside `publish`):
  builds `apps/api` and `apps/web` with their existing Dockerfiles from the
  monorepo root, logs into `ghcr.io` with `GITHUB_TOKEN`, and pushes each
  image under two tags: `${{ github.ref_name }}` (immutable, e.g. `v0.2.0`)
  and `production-latest` (moving). Image names: `ghcr.io/<owner>/coreloom-uml-api`
  and `ghcr.io/<owner>/coreloom-uml-web` — `coreloom-uml` here is just another
  token `scripts/rename.mjs` already rewrites, so add it to that script's
  replacement list. `<owner>` must be lowercased (`${{ github.repository_owner }}`
  as-is is `Eldenn`, but Docker registry paths reject uppercase) — the CI
  step lowercases it before building the image reference.
- `infra/docker-compose.production.yml`'s `api`, `queue-worker`, `migrate`
  and `web` services use `image: ghcr.io/<owner>/coreloom-uml-{api,web}:${IMAGE_TAG:-production-latest}`
  instead of `build:`. `IMAGE_TAG` defaults to the moving tag so a plain
  Coolify redeploy always pulls the latest release; it can be overridden in
  Coolify's environment editor to pin/rollback to a specific `vX.Y.Z`.
- `deploy-production.yml` needs no code change — `environment: production`
  is already declared. Activating the gate is a repo-settings action:
  **Settings → Environments → production → add required reviewers.**
- `ci.yml` gains one step: `docker compose -f infra/docker-compose.production.yml config --quiet`
  (with dummy env defaults so it runs without real secrets) to catch
  YAML/interpolation mistakes before they reach a real deploy — the only
  meaningful "test" for infra YAML.
- One-time manual setup (documented, not code): the GHCR packages must be
  pullable by Coolify — either make them public, or add registry
  credentials in Coolify pointing at a PAT with `read:packages`.

### Environment & secrets

New `infra/.env.production.example`, mirroring `.env.staging.example`:
`APP_KEY`, `API_FQDN`/`WEB_FQDN` (or the `SERVICE_URL_*` Coolify magic vars,
matching the staging file's convention), Resend SMTP credentials, R2
object-storage credentials (`S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`),
`BULLBOARD_USER`/`BULLBOARD_PASSWORD`, the production SigNoz JWT secret,
and `IMAGE_TAG` (optional, defaults to `production-latest`).

Postgres connection details and the backup-bucket credentials live in the
Coolify Database resource's own config (connection info + backup tab), not
in this file — they're resource-scoped, not compose-stack-scoped.

Session cookie config stays the same shape as staging
(`SESSION_COOKIE_SAME_SITE=none`, `SESSION_COOKIE_SECURE=true`) since API
and web stay on separate subdomains — the README's existing note about
hardening to `SameSite=lax` via a shared domain + `/api` path remains a
valid future step, out of scope here.

### Documentation

- README: replace the production bullet in "Not yet included" with a new
  "Production on Coolify" section, mirroring the structure of "Staging on
  Coolify" (resource creation steps, env vars to paste, backup setup note,
  GHCR pull-access note, approval-gate note).
- `SETUP.md`: no change expected — it already treats prod/staging
  identically as "figure this out for your project" scaffolding notes.

## Out of scope

- Multi-replica API / Redis-backed sessions.
- A dedicated secrets manager (explicitly declined in favor of Coolify's
  built-in env vars).
- Hardening the session cookie to `SameSite=lax` via shared-domain routing.
- Metrics/logs OTel pipelines (traces only, same as staging — pre-existing
  documented gap, not part of this change).
- `apps/web` component tests (the other documented MVP gap — separate spec).

## Verification

No app logic changes, so no unit tests. Verification is:
1. `docker compose -f infra/docker-compose.production.yml config --quiet`
   passes in CI (new step above) — catches syntax/interpolation errors.
2. A real dry-run: create the Coolify resources, deploy once, confirm
   `/health` responds, an email actually sends via Resend, an avatar upload
   round-trips through R2, and a trace shows up in the dedicated production
   SigNoz.
