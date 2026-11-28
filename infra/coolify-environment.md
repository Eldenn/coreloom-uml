# Coolify gives every service the whole environment

**Status: a known risk, not fixed.** For now the project is not deployed to production on Coolify,
by the maintainer's decision. Read this before the staging or production compose files
(`infra/docker-compose.staging.yml`, `infra/docker-compose.production.yml`) go onto a Coolify host.

Checked on 2026-11-28 against Coolify **v4.7.9**, the latest release at that date, and against the
compose files of this repository at that date. This page describes a known, public upstream behaviour and the
options this repository has. It says nothing about any running server.

## The problem

When Coolify v4 deploys a Docker Compose resource, it writes one `.env` file that holds the
resource's variables and adds it to the `env_file` list of **every** service. Every container
therefore receives every variable of the resource, whatever that service's `environment:` block
names. Our compose files declare no `env_file` of their own: the whole spread comes from the `.env`
Coolify adds.

Two kinds of use are mixed together:

- `${VAR}` interpolation in the compose file reads that same `.env`, which is expected and harmless.
- The `env_file` entry also puts every name in that file into each container's environment. That is
  the leak.

Sources:

- Coolify documentation, *Docker Compose*: "Coolify adds its own `.env` file after the env files of
  each service, so the variables of the resource override the values in them."
  <https://coolify.io/docs/applications/builds/docker-compose>
- Coolify source at `v4.7.9`, `bootstrap/helpers/parsers.php`: `composeEnvFilesWithCoolifyEnv()`
  (about line 207) pushes `.env` onto a service's `env_file`. It is called for every service, in the
  application parser (about line 2565) and in the service parser (about line 3815).
  <https://github.com/coollabsio/coolify/blob/v4.7.9/bootstrap/helpers/parsers.php>
- coollabsio/coolify#7655, *Do not share all environment variables across all containers in a
  Compose project*: open at the date above.
  <https://github.com/coollabsio/coolify/issues/7655>
- coollabsio/coolify#8219, closed as a duplicate of #7655: it shows the rendered compose file, with
  `.env` under each service. <https://github.com/coollabsio/coolify/issues/8219>
- coollabsio/coolify#12585, *scope environment variables to Docker Compose services*: merged into
  the `next` branch on 2026-11-23. It is not in `v4.7.9`.
  <https://github.com/coollabsio/coolify/pull/12585>

## What each service receives that it does not need

At least the variables our compose files reference end up in the resource, since Coolify creates a
resource variable for each `${VAR}` it reads. Below are the secret-bearing ones: names only, from the
production file.

The staging file differs in three ways:

- its services name `SERVICE_PASSWORD_POSTGRES` where the production file names `DB_PASSWORD`;
- no `${SMTP_PASSWORD}` is referenced: `api` and `queue-worker` set `SMTP_USERNAME` and
  `SMTP_PASSWORD` to `''`, which Coolify fills from the resource's variable of that name when it holds
  a value (see "What does not work");
- pasting `infra/.env.staging.example` also adds `APP_KEY`, `DB_PASSWORD`, `SMTP_USERNAME` and
  `SMTP_PASSWORD` to the staging resource: no staging service references them, yet every container
  receives them.

The resource holds these secret-bearing names:
`DEFAULT_ACCOUNT_PASSWORD`, `SERVICE_PASSWORD_64_APPKEY` (the API's `APP_KEY`),
`LLM_KEYS_ENCRYPTION_KEYS`, `E2B_API_KEY`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`,
`GITHUB_APP_WEBHOOK_SECRET`, `SKILLS_GITHUB_TOKEN`, `SMTP_PASSWORD`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, `DB_PASSWORD`, `BULLBOARD_PASSWORD`, `SERVICE_PASSWORD_64_SIGNOZJWT`,
`SERVICE_PASSWORD_64_SKILLSCANNERKEY`, `SERVICE_PASSWORD_64_SKILLTAGGERKEY`,
`SERVICE_PASSWORD_64_CONVENTIONEVALSKEY`.

| Service | Secrets its `environment:` names | Secrets it also receives through Coolify's `.env` |
|---|---|---|
| `skill-scanner` | `DB_PASSWORD`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `SERVICE_PASSWORD_64_SKILLSCANNERKEY` | `DEFAULT_ACCOUNT_PASSWORD`, `SERVICE_PASSWORD_64_APPKEY`, `LLM_KEYS_ENCRYPTION_KEYS`, `E2B_API_KEY`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `SKILLS_GITHUB_TOKEN`, `SMTP_PASSWORD`, `BULLBOARD_PASSWORD`, `SERVICE_PASSWORD_64_SIGNOZJWT`, the other two workers' keys |
| `skill-tagger` | `DB_PASSWORD`, `SERVICE_PASSWORD_64_SKILLTAGGERKEY` | `DEFAULT_ACCOUNT_PASSWORD`, `SERVICE_PASSWORD_64_APPKEY`, `LLM_KEYS_ENCRYPTION_KEYS`, `E2B_API_KEY`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `SKILLS_GITHUB_TOKEN`, `SMTP_PASSWORD`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `BULLBOARD_PASSWORD`, `SERVICE_PASSWORD_64_SIGNOZJWT`, `SERVICE_PASSWORD_64_SKILLSCANNERKEY`, `SERVICE_PASSWORD_64_CONVENTIONEVALSKEY` |
| `convention-evals` | `DB_PASSWORD`, `LLM_KEYS_ENCRYPTION_KEYS`, `E2B_API_KEY`, `SERVICE_PASSWORD_64_CONVENTIONEVALSKEY` | `DEFAULT_ACCOUNT_PASSWORD`, `SERVICE_PASSWORD_64_APPKEY`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `SKILLS_GITHUB_TOKEN`, `SMTP_PASSWORD`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `BULLBOARD_PASSWORD`, `SERVICE_PASSWORD_64_SIGNOZJWT`, the other two workers' keys |
| `queue-worker` | everything but those in the next column | `DEFAULT_ACCOUNT_PASSWORD`, `BULLBOARD_PASSWORD`, `SERVICE_PASSWORD_64_SIGNOZJWT`, the three workers' keys |
| `api` | everything but those in the next column | `BULLBOARD_PASSWORD`, `SERVICE_PASSWORD_64_SIGNOZJWT`, the three workers' keys |
| `migrate` | `DEFAULT_ACCOUNT_PASSWORD`, `SERVICE_PASSWORD_64_APPKEY`, `LLM_KEYS_ENCRYPTION_KEYS`, `E2B_API_KEY`, `SKILLS_GITHUB_TOKEN`, `DB_PASSWORD` | `GITHUB_APP_*` secrets, `SMTP_PASSWORD`, `S3_*` keys, `BULLBOARD_PASSWORD`, `SERVICE_PASSWORD_64_SIGNOZJWT`, the three workers' keys |
| `bull-board`, `signoz`, `postgres` (staging) | their own password or key only | every other name in the list above |
| `web`, `redis`, `signoz-*` (the others), `mailpit` (staging) | none | every name in the list above |

The "names" column comes from each service's `environment:` block. What a process really reads can be
narrower.

## Why it matters

Three workers read content this project does not trust:

- `skill-scanner` scans third-party skill copies with SkillSpector.
- `skill-tagger` reads third-party skill descriptions and watch articles.
- `convention-evals` handles what a coding agent wrote in a sandbox.

The skill scanner rule of AGENTS.md says: "never give the service a secret it does not need (its own
`APP_KEY`; no GitHub, E2B, account or mail setting)". The local `infra/docker-compose.yml` gives
`convention-evals` "only what the worker needs (security review I6)". The staging and production
files keep each worker's `environment:` block to its own settings. On Coolify v4.7.9 these limits do
not hold. A fault in one of these workers would expose secrets that belong to other services,
including:

- the default account's password;
- the API's `APP_KEY`;
- the GitHub App's private key;
- the key that seals the accounts' LLM credentials.

Several images that are not ours (`redis`, SigNoz, `bull-board`) receive them too.

## What does not work

Declaring a name with an empty value in a service's `environment:` block, to mask it
(`DEFAULT_ACCOUNT_PASSWORD: ''`), does not hide it. In `applicationParser`, `parsers.php` at `v4.7.9`
(about lines 2353 to 2382) replaces an empty value with the resource's stored value of that name
when that value is not empty. The code comment there reads "Empty string - allow database override
for backward compatibility". The mask would put the secret into the container explicitly.

A `null` value (`DEFAULT_ACCOUNT_PASSWORD:` with nothing after it) does not help either. Compose
treats it as a pass-through and fills it from the `.env` that Coolify passes with `--env-file`, and
the `.env` in `env_file` provides the name anyway.

## Options

No option is chosen yet.

**A. One Coolify resource per worker.** `skill-scanner`, `skill-tagger` and `convention-evals` each
move to a Coolify resource of their own, per environment. Each resource has a compose file of its own
(for example `infra/docker-compose.<worker>.<environment>.yml`) and holds only that worker's
variables, so its `.env` carries no other service's secret. One resource for all three would not be
enough: its `.env` would still reach each of them.

- **Network.** A worker reaches `redis`, `signoz-otel-collector` and, in staging, `postgres` by
  joining the main resource's own network, which Coolify names after the main resource's UUID and
  creates as attachable. The worker's compose file declares it `external`, its name given by a
  variable such as `CORE_NETWORK`.
- **Not the predefined network.** Do not use *Connect To Predefined Network* for this. It attaches
  services to the destination network (`coolify` by default), which databases, the proxy and every
  resource with that setting share. For the workers to reach Redis there, the main resource would
  have to join it too. That would expose Redis, which has no password, to all of them, and two
  environments on one server would answer to the same service name.
- **Deployment order.** `depends_on` cannot cross resources. The main resource, with `migrate`, is
  deployed first and the workers after it, through Coolify's API from the deploy workflows. The main
  resource must have been deployed before any worker, since Docker Compose refuses an `external`
  network that does not exist. If the main resource is recreated, its UUID changes and
  `CORE_NETWORK` must be updated in each worker resource. The workers' queue clients reconnect to
  Redis by themselves.
- **Generated values.** Coolify generates each `SERVICE_PASSWORD_*` value per resource, so a worker's
  resource cannot reuse the main resource's (`SERVICE_PASSWORD_POSTGRES` in staging). Such a value is
  copied into a plain variable of the worker's resource. Only the worker's own key can stay generated
  there.
- **Cost.** Four resources per environment instead of one, secrets held in more than one resource,
  which a rotation must update in each, and a two-step deployment. This changes the deployment
  topology, so it needs a decision record before the change.

**B. Wait for a stable Coolify release that ships #12585.** That pull request lets each variable be
restricted to chosen containers. A new variable still goes to all containers by default, so each
secret would have to be restricted by hand and kept so. No release date is known.

The two can be combined: A for the three workers, B for what A leaves (`api`, `queue-worker`,
`migrate`, `web`, `bull-board`, SigNoz, `redis`).

**Next, in either case.** Separating environment variables does not separate data. Every worker
still connects to Redis, which has no password, and to Postgres with the application's full role.
Per-service Redis ACLs and per-service Postgres roles are the following step.

## How to check a host

Run these on the Coolify host. They print variable **names**, never values. Use them with the
compose project of the resource, which is the resource's UUID for a Coolify application:
`docker ps -a` shows it in the `com.docker.compose.project` label.

List the containers with their compose project and service:

```bash
docker ps -a --format '{{.Names}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.service"}}' | sort -k2
```

List the names each container of a project received (replace `<project>`):

```bash
for c in $(docker ps -a --filter label=com.docker.compose.project=<project> --format '{{.Names}}'); do
  echo "== $c"
  docker inspect --format '{{range .Config.Env}}{{index (split . "=") 0}}{{println}}{{end}}' "$c" | sort
done
```

Show whether a name is set, still without its value:

```bash
docker inspect --format '{{range .Config.Env}}{{$n := index (split . "=") 0}}{{$n}} {{if eq . $n}}UNSET{{else if eq . (printf "%s=" $n)}}EMPTY{{else}}SET{{end}}{{println}}{{end}}' <container>
```

`.Config.Env` is a list of whole `NAME=value` strings, and the templates keep what comes before the
first `=`, so a value spread over several lines (a PEM key) prints none of its lines. These commands
work on a stopped container and in an image without a shell. The lists also show the image's own
`ENV` names and Coolify's own variables: those are expected.

Do **not** use `docker exec <container> env | cut -d= -f1`. `env` prints a multi-line value over
several lines, and `cut` then prints every line of the value up to its first `=`, which means pieces
of a private key. `cut -s` does not help: the last base64 line of a key often ends with `=` padding.
`docker inspect` without `--format` and `docker compose config` print values: never paste their
output anywhere.

## When to read this again

- When a Coolify release includes coollabsio/coolify#12585, or #7655 is closed: check the
  documentation and `parsers.php` at that tag, and update this page, its date and its version.
- When a service or a secret is added to, or removed from, the staging or production compose files:
  update the table.
