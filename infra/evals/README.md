# Convention evals runner

What runs the agent convention evals of `packages/catalog/evals/` from the app: the decision
record is `packages/catalog/evals/decision-record.md`. Each trial runs in an E2B sandbox driven by
Harbor, from the `convention-evals` worker of the API. Nothing of it is installed on the host: no
Python, no uv, no Harbor, no agent CLI.

## What it is

- **Worker image**: stage `convention-evals` of `apps/api/Dockerfile` (image
  `coreloom-uml-convention-evals`, built by `release.yml`). The API's build on Node's Debian slim
  image, plus:
  - Harbor `0.27.0` with its `e2b` extra on Python 3.12 from uv, from `requirements.lock`, every
    package checked by its hash and installed from a wheel only (`--no-build`);
  - our Harbor classes, `coreloom_harbor/` (below), copied into Harbor's `site-packages`;
  - Claude Code at the API image's version, for the runs of a Claude subscription (path II of the
    record, ticket 9);
  - `HARBOR_TELEMETRY=off` (Harbor 0.27.0 otherwise sends a usage event to PostHog,
    `harbor/telemetry.py`) and `LITELLM_LOCAL_MODEL_COST_MAP=True` (LiteLLM otherwise fetches its
    cost map from GitHub when imported).

  It runs as `node` and its command is `queue:work --queues=convention-evals` (`pnpm --filter
  @coreloom-uml/api queue:evals` outside Docker): no other worker names that queue
  (`config/queue.ts`, the `queue:work` script, the `queue-worker` services). No Docker client,
  Compose or daemon: no trial runs on this machine.
- **Service**: `convention-evals` in every compose file, behind the `evals` profile locally. It
  holds the database, Redis, its own `APP_KEY`, `LLM_KEYS_ENCRYPTION_KEYS` (it resolves the
  account's key itself) and `E2B_*`; no GitHub, Drive or mail setting (the mail ones are
  placeholders the API's settings require). A run's folder (`/runs`, `CONVENTION_EVALS_DIR`) and
  the Claude launches' folder (`/data/claude`, `CLAUDE_CODE_HOME`) are `tmpfs` mounts, since a key
  sits in Harbor's process while it runs.
  **No swap**: `memswap_limit` equals `mem_limit`, so Docker gives the container no swap of its
  own. A `tmpfs` can still be swapped out if the host has swap: the host must run with no swap
  (or with swap encrypted), which is a requirement of the deployment, not something a compose
  file can enforce.
  Locally the worker reaches the self-hosted E2B of `infra/e2b/` on the host through
  `host.docker.internal` (`E2B_API_URL=http://host.docker.internal:3000`,
  `E2B_SANDBOX_URL=http://host.docker.internal:3002`).
- **Templates**: `templates/<agent>/` (`claude-code`, `codex`), one E2B template per agent. Each is
  Node slim, git, pnpm and that agent's CLI, nothing else, each npm package by the sha512 of
  `package-lock.json`, the base image by digest. The exporter copies the folder as is into every
  task's `environment/`, so Harbor builds it once and finds it again by its hash: nothing of a
  task, a condition or an account is ever in it. This replaces the `agent` stage of the former
  `infra/evals/Dockerfile`, which is removed with its `runner` stage and its `agents/` lock.
- **Exporter and reader**: `packages/catalog/evals/src/harbor/`
  (`@coreloom-uml/catalog/evals/harbor`). `prepareHarborRun` writes one Harbor task per (task,
  condition) under the run's folder (the template, `task.toml`, `instruction.md`, the fixture
  workspace with the condition's files, `coreloom.json`, and for the oracle `solution/`) and
  answers the `harbor run` command line and its environment, none naming a credential: the job
  adds the key to that environment itself. `readHarborJob` reads Harbor's job folder back: per
  trial its error, duration, usage, every text Harbor wrote (for the job's leak filter) and the
  final workspace, downloaded by Harbor as the `/work` artifact, as a `FinalState` for the
  graders. Grading is the caller's: Harbor runs with `--disable-verification`.
- **Harbor classes**: `coreloom_harbor/`, given to Harbor by import path
  (`--env coreloom_harbor.environment:ConventionEvalsE2BEnvironment`,
  `--agent coreloom_harbor.agents:ConventionEvals{ClaudeCode,Codex}`). The fixes a to g of the
  record's section 5:
  - the environment drops every credential name from the sandbox's startup environment, labels
    the sandbox (`coreloom.purpose=convention-evals`, `coreloom.run`, `coreloom.account`), keeps
    300 s / 60 s for its timeout and renewal, and before the agent starts reads back the policy E2B
    holds and fails the trial unless it is exactly `[provider host]` with `deny_out` of
    `RESEARCH_DENIED_RANGES`, `169.254.0.0/16` and `192.0.2.0/24` (no network for the setup and
    the verifier). At setup it uploads the trial's workspace to `/work` for the `node` user and
    releases the root file system's reserved blocks (`tune2fs -r 0`: 256 MB of the install's
    952 MB, more than a template leaves free; the sandbox is thrown away after the trial). A
    creation the install refuses for lack of memory ("Failed to place sandbox") is tried again;
  - the Claude Code agent runs the template's CLI only (never installs one), with
    `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` and the API key as its only credential;
  - the Codex agent runs `codex exec` and writes no `auth.json`; it lists `$CODEX_HOME` into the
    trial's logs before removing it;
  - **the key is never in a command's envs nor its command line** (fix g): envd logs every command
    it starts with its envs into the install's logs. Both agents start their own command through
    `exec_with_secret` of the environment, which sends the key on that command's standard input
    and closes it; the command's fixed first line reads it into its own environment
    (`IFS= read -r ANTHROPIC_API_KEY; export ANTHROPIC_API_KEY; exec 0</dev/null; …`, or
    `CODEX_API_KEY`). Every other command goes through `_dispatch_command`, which drops every
    credential name from its envs;
  - **the agent's user is not root**: E2B's template builder adds a user `user` with passwordless
    sudo and leaves root's and its password empty. At setup, as root, the environment locks every
    empty password and clears every set-id bit, then checks as `node` that `sudo` and `su` fail,
    that no set-id file is left and that no root process's environment is readable; else the
    trial fails.

  Its tests (`coreloom_harbor/tests/`, Python's `unittest`) run in CI (job `harbor-classes`,
  stage `harbor` of `apps/api/Dockerfile`, as `node`, about 45 s), or here:

  ```sh
  docker run --name evals-tests -v "$PWD/infra/evals:/src:ro" -w /src \
    --entrypoint /opt/harbor/bin/python coreloom-uml-convention-evals \
    -m unittest discover -s coreloom_harbor/tests -t .
  docker rm evals-tests
  ```

## Live check

`live-check/run.sh <claude-code|codex> <oracle|fake>` replays the live checks of the record
(section 13) against an E2B install, with the E2B settings taken from the environment
(`E2B_API_KEY`, `E2B_API_URL`, `E2B_SANDBOX_URL`) and a made-up key it generates: `oracle` runs
every exported task with Harbor's oracle agent, `fake` one trial with the fake key, then checks the
provider's 401, the key in no file of the job folder, no `auth.json`, and 0 rows of the install's
`sandbox_logs` holding it against 1 for a control canary sent as an env of the same sandbox
(`live-check/envlog_probe.py`). Manual only, never in CI.

## Disk of the templates

The install gives each sandbox a 952 MB root file system. Measured on 2026-11-27 (`df -k /` in a
sandbox of each template, before and after `tune2fs -r 0`):

| Template | Used | Free for the agent before | after |
|---|---|---|---|
| `claude-code` | 720 MB | 0 | 216 MB |
| `codex` | 783 MB | 0 | 153 MB |

To fit, the templates remove git's Perl and its manual, run no install script (Claude Code's
would copy its 330 MB binary a second time), keep npm's cache in `/dev/shm` during the install,
and Codex's drops its voice host. A larger disk on the install is the owner's decision (record,
section 13), only if a template stops fitting.

## Raising a version

Every version is set in one place, and `packages/catalog/evals/versions.test.ts` keeps the copies
equal (and checks the pins).

- **Harbor**:
  1. Write the new version in `requirements.in`, in `HARBOR_VERSION`
     (`packages/catalog/evals/src/versions.ts`) and in the `convention-evals` stage's
     `ARG HARBOR_VERSION`.
  2. Raise `EXCLUDE_NEWER` in `lock.Dockerfile` to the current time (UTC): the lock only takes
     files published before it, so the same inputs give the same lock.
  3. Regenerate the lock without Python on the host:
     `docker build -f infra/evals/lock.Dockerfile --output type=local,dest=infra/evals infra/evals`
  4. Re-read what `coreloom_harbor` subclasses (`environments/e2b.py`, `environments/base.py`,
     `agents/installed/claude_code.py`, `agents/installed/codex.py`, `trial/trial.py`), run its
     tests in the new image, then an oracle run and a fake-key trial on `infra/e2b/`. Check that
     `HARBOR_TELEMETRY` is still the variable `harbor/telemetry.py` reads.
- **An agent CLI or pnpm**: change it in `templates/<agent>/package.json` and, for a CLI, in
  `ci.yml`, `AGENT_CLI_VERSIONS` and `coreloom_harbor/agents.py` (Claude Code's also in the API
  image); for pnpm, in the root `package.json`'s `packageManager`. Regenerate the lock in a
  container, never on the host:

  ```sh
  docker run --name evals-lock --platform=linux/amd64 -u node \
    -v "$PWD/infra/evals/templates/codex:/w" -w /w \
    node:26.3.0-slim@sha256:95a34da32a840bd9b3b09a5b773591c16923e350174b1c50e1200c75bf15eaa9 \
    npm install --package-lock-only --ignore-scripts --no-audit --no-fund
  docker rm evals-lock
  ```

  Then measure the template's free disk again (the table above): Harbor builds a new template on
  the next run, since the folder's hash changed.
- **Base image**: change the tag and the digest together (`docker buildx imagetools inspect
  <image>:<tag>`), in both templates and `lock.Dockerfile`.
- **git, ca-certificates, e2fsprogs**: the Debian package versions are pinned, and a template
  builds only while Debian's mirror still serves them. A point release or a security update
  replaces the pinned version and breaks the build: take the new candidate (`apt-cache policy
  <package>` in the base image) and raise the base image with it.
