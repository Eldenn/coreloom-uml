import { Env } from '@adonisjs/core/env'
import { DRIVE_DISKS } from '#app/shared/drive/drive-disk'

/**
 * A variable that may be left out in development and test, but must be set in
 * production: the API refuses to boot without it there.
 */
function requiredInProduction(name: string, value?: string): string | undefined {
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing environment variable "${name}" (required in production)`)
  }
  return value || undefined
}

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),

  /*
  |--------------------------------------------------------------------------
  | HTTP Server
  |--------------------------------------------------------------------------
  */
  HOST: Env.schema.string({ format: 'host' }),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  APP_NAME: Env.schema.string.optional(),
  LOG_LEVEL: Env.schema.enum.optional(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),

  /*
  |--------------------------------------------------------------------------
  | CORS — Frontend URL
  |--------------------------------------------------------------------------
  */
  FRONTEND_URL: Env.schema.string({ format: 'url', tld: false }),

  /*
  |--------------------------------------------------------------------------
  | Database (PostgreSQL)
  |--------------------------------------------------------------------------
  */
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),
  // Whether to connect over TLS. Defaults to on in production, off otherwise.
  // Set to `false` when Postgres is reachable only on a private network with
  // no TLS (e.g. a Coolify-internal database on the Docker network).
  DB_SSL: Env.schema.boolean.optional(),
  DB_SSL_CA: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Sessions
  |--------------------------------------------------------------------------
  */
  SESSION_DRIVER: Env.schema.enum.optional(['file', 'memory', 'cookie'] as const),

  /*
  |--------------------------------------------------------------------------
  | Session cookie — cross-site controls
  |--------------------------------------------------------------------------
  | When the SPA and the API are served from different domains (e.g. a Coolify
  | staging deploy on api.* and app.*), the browser only keeps the session
  | cookie on cross-site `fetch()` when it is `SameSite=None` and `Secure`.
  | Both default to the safe local-dev behaviour (`lax`, secure in production).
  */
  SESSION_COOKIE_SAME_SITE: Env.schema.enum.optional(['lax', 'strict', 'none'] as const),
  SESSION_COOKIE_SECURE: Env.schema.boolean.optional(),

  /*
  |--------------------------------------------------------------------------
  | Rate limiting
  |--------------------------------------------------------------------------
  | Store backing @adonisjs/limiter. `memory` needs no external service and
  | is the right default until the API runs as more than one instance.
  */
  LIMITER_STORE: Env.schema.enum.optional(['memory'] as const),

  /*
  |--------------------------------------------------------------------------
  | Mail (password reset, email verification)
  |--------------------------------------------------------------------------
  | Local dev / CI point at Mailpit (see infra/docker-compose.yml) — a throwaway
  | SMTP catch-all, no account or API key needed.
  */
  SMTP_HOST: Env.schema.string({ format: 'host' }),
  SMTP_PORT: Env.schema.number(),
  SMTP_USERNAME: Env.schema.string.optional(),
  SMTP_PASSWORD: Env.schema.string.optional(),
  MAIL_FROM_ADDRESS: Env.schema.string(),
  MAIL_FROM_NAME: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Object storage (@adonisjs/drive)
  |--------------------------------------------------------------------------
  | `DRIVE_DISK` picks the active disk. `fs` writes to a local folder and needs
  | no S3 config — that is why the S3_* vars are all optional here (like
  | DB_SSL_CA). With `DRIVE_DISK=s3` they must be set: locally they point at the
  | MinIO container (see infra/docker-compose.yml), in prod at a real
  | S3/R2/Spaces bucket. S3_PUBLIC_URL is an optional CDN/public base URL.
  */
  DRIVE_DISK: Env.schema.enum.optional(DRIVE_DISKS),
  S3_ENDPOINT: Env.schema.string.optional(),
  S3_REGION: Env.schema.string.optional(),
  S3_BUCKET: Env.schema.string.optional(),
  S3_ACCESS_KEY_ID: Env.schema.string.optional(),
  S3_SECRET_ACCESS_KEY: Env.schema.string.optional(),
  S3_PUBLIC_URL: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Redis / background job queue
  |--------------------------------------------------------------------------
  | Backs @adonisjs/redis and the BullMQ job queue (@nemoventures/adonis-jobs).
  | Unlike DRIVE_DISK there is no serviceless fallback — Redis is required for
  | the API and the `queue:work` worker to boot. Local dev / CI point at the
  | `redis` container (see infra/docker-compose.yml). REDIS_PASSWORD is optional
  | (unset on the local and staging containers, which are network-private).
  */
  REDIS_HOST: Env.schema.string({ format: 'host' }),
  REDIS_PORT: Env.schema.number(),
  REDIS_PASSWORD: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Default account and registration
  |--------------------------------------------------------------------------
  | The default account is created (or brought back in line) by
  | `node ace account:ensure-default`, run right after the migrations. The
  | environment is its source of truth: its email and password cannot be
  | changed from the app. Both are required in production.
  | Public sign-up is off unless REGISTRATION_ENABLED=true.
  */
  DEFAULT_ACCOUNT_EMAIL: requiredInProduction,
  DEFAULT_ACCOUNT_PASSWORD: requiredInProduction,
  DEFAULT_ACCOUNT_NAME: Env.schema.string.optional(),
  REGISTRATION_ENABLED: Env.schema.boolean.optional(),

  /*
  |--------------------------------------------------------------------------
  | Skills catalog
  |--------------------------------------------------------------------------
  | `node ace skills:setup` (run after the migrations) schedules the weekly
  | skills.sh search when SKILLS_REFRESH_ENABLED=true. SKILLS_GITHUB_TOKEN is a
  | GitHub token with no scope: it raises GitHub's rate limit so each run can
  | check up to 200 skills instead of 10.
  */
  SKILLS_REFRESH_ENABLED: Env.schema.boolean.optional(),
  SKILLS_GITHUB_TOKEN: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | LLM providers (agent conventions: rule proposals, bring your own key)
  |--------------------------------------------------------------------------
  | The server holds no provider key: each request carries the user's. Hosted
  | providers (Anthropic, OpenAI, Mistral) have a fixed URL; `ollama` and
  | `openai-compatible` call a URL the user names, which is accepted only when
  | its origin (scheme, host, port) is listed here, comma-separated. Empty by
  | default: no such provider can be used until an origin is allowed.
  | Example: LLM_ALLOWED_BASE_URLS=http://localhost:11434,https://llm.internal
  */
  LLM_ALLOWED_BASE_URLS: Env.schema.string.optional(),
})
