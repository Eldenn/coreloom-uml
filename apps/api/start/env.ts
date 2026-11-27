import { Env } from '@adonisjs/core/env'
import { DRIVE_DISKS } from '#app/shared/drive/drive-disk'

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
  | changed from the app. Both are required in production by the web server and
  | by `account:ensure-default` (`start/default-account.ts`), never by a worker:
  | a worker is not handed the default account (security review I6).
  | Public sign-up is off unless REGISTRATION_ENABLED=true.
  */
  DEFAULT_ACCOUNT_EMAIL: Env.schema.string.optional(),
  DEFAULT_ACCOUNT_PASSWORD: Env.schema.string.optional(),
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
  | Where the skill tagger (`infra/skill-tagger/`) keeps the embedding model it
  | downloads on first use (about 600 MB). Defaults to the app's tmp folder.
  */
  SKILL_TAGGER_CACHE: Env.schema.string.optional(),

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
  /*
  | The keys of the dedicated encrypter that seals every stored LLM secret (saved
  | keys, ChatGPT tokens, Claude subscriptions), comma-separated: the first
  | encrypts, all decrypt, so a key is rotated by prepending the new one.
  | Separate from APP_KEY so one rotating never breaks the other. Development
  | and test fall back to APP_KEY. In production the API refuses to start
  | without it (`start/llm-keys.ts`), and any other process that seals or opens
  | an LLM secret fails at that point: a worker that never does (the skill
  | scanner) is not given it (see `config/encryption.ts`).
  */
  LLM_KEYS_ENCRYPTION_KEYS: Env.schema.string.optional(),

  /*
  | Claude subscriptions are kept in the database; the `claude` binary (Claude
  | Code) runs each launch in a short-lived private folder made under this
  | path, removed when it ends. Defaults to `tmp/claude` inside the app.
  */
  CLAUDE_CODE_HOME: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | GitHub App (private repositories for code maps)
  |--------------------------------------------------------------------------
  | Users install the App on the repositories it may read, then connect it:
  | the server reads those repositories with a token made for each clone, and
  | a push on a followed branch reads it again. The admin can create the App
  | from the settings instead (stored encrypted with APP_KEY); when all six
  | variables are set, they win. With one missing, the settings decide.
  | API_URL is the API's public address, for the App's webhook URL; without
  | it, the address the admin's request came to is used.
  | GITHUB_APP_PRIVATE_KEY is the App's PEM, with its line breaks written \n
  | when the variable holds one line, or base64-encoded whole.
  */
  API_URL: Env.schema.string.optional({ format: 'url', tld: false }),
  GITHUB_APP_ID: Env.schema.string.optional(),
  GITHUB_APP_SLUG: Env.schema.string.optional(),
  GITHUB_APP_CLIENT_ID: Env.schema.string.optional(),
  GITHUB_APP_CLIENT_SECRET: Env.schema.string.optional(),
  GITHUB_APP_PRIVATE_KEY: Env.schema.string.optional(),
  GITHUB_APP_WEBHOOK_SECRET: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | E2B sandboxes
  |--------------------------------------------------------------------------
  | Everything that touches a repository's code or a web page runs in an E2B
  | sandbox: code maps from GitHub (cloned and mapped with graphify), the
  | assistant's repository tools and the web research. A deployment sets
  | E2B_API_KEY; without it importing from GitHub answers 503 (the CLI or an
  | upload remain) and the other two 404. With the key alone the sandboxes are E2B
  | Cloud's; E2B_API_URL and E2B_SANDBOX_URL point at a self-hosted install
  | (e2b-dev/runtime, "Embed"), which prints all three when it starts.
  */
  E2B_API_KEY: Env.schema.string.optional(),
  E2B_API_URL: Env.schema.string.optional({ format: 'url', tld: false }),
  E2B_SANDBOX_URL: Env.schema.string.optional({ format: 'url', tld: false }),

  /*
  | Convention tests: each run gets a private folder (0700) under this path for
  | its trials' workspaces and, on the CLI path, Harbor's job folder, removed
  | when the run ends. It must be a tmpfs on a worker with no swap, since that
  | folder holds what an agent wrote before it is filtered. Defaults to
  | `tmp/convention-evals` inside the app.
  */
  CONVENTION_EVALS_DIR: Env.schema.string.optional(),

  /*
  | Convention tests through a saved Anthropic or OpenAI key (path I: Harbor runs
  | the provider's coding agent CLI in a sandbox with the key). Off unless
  | `enabled`: until #153 lifts it, the plan and the route refuse such a key
  | (`cli_path_unavailable`) and the worker refuses to run one. Subscriptions and
  | the other kinds (path II) do not read it.
  */
  CONVENTION_EVALS_CLI_PATH: Env.schema.enum.optional(['enabled', 'disabled'] as const),
})
