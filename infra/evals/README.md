# Evals runner

The image that runs the agent convention evals of `packages/catalog/evals/`. Their decision
record is `packages/catalog/evals/decision-record.md`. Nothing of it is installed on the host:
no Python, no uv, no Harbor, no agent CLI.

## What it is

- **Image**: `infra/evals/Dockerfile`, x86_64 only (`--platform=linux/amd64` on every `FROM`),
  two stages that count:
  - `agent` is what a trial's agent runs on: Node on Debian, git, and, from
    `agents/package-lock.json`, the agents' CLIs at exact versions (Claude Code `2.1.322`, Codex
    `0.167.2`, the versions CI loads the rendered files into) and pnpm `11.5.2` (the root
    `package.json`'s `packageManager`). They are installed with `npm ci` into `/opt/agents` by the
    `node` user, so their install scripts never run as root, then copied as root and linked into
    `/usr/local/bin`.
  - `runner` is `agent` plus:
    - Harbor `0.27.0` on Python 3.12, from `requirements.lock`, every package checked by its hash
      and installed from a wheel only (`--no-build`: no package runs a build script);
    - the Docker client and its Compose plugin, copied from the official `docker:<v>-cli` and
      `docker/compose-bin:v<v>` images, pinned by digest (the `cli` image holds an older Compose
      than the one pinned, so the plugin comes from `compose-bin`);
    - `HARBOR_TELEMETRY=off` (Harbor 0.27.0 otherwise sends a usage event to PostHog at the end
      of each command and job, `harbor/telemetry.py`) and `LITELLM_LOCAL_MODEL_COST_MAP=True`
      (LiteLLM otherwise fetches its model cost map from GitHub when it is imported);
    - the catalog with the tasks and graders. Only the catalog, `packages/config` and the files
      its tests read are copied (CI's workflow and the API's Dockerfile, for the versions they
      pin), never an app's code or a `.env`.

  What is verified, and how:
  - the BuildKit frontend (`# syntax=`) and every image by digest;
  - the npm packages by the sha512 integrity of their lock;
  - the Python packages by their SHA-256 in `requirements.lock`, and Python itself by the SHA-256
    uv ships for its builds;
  - git and ca-certificates by exact Debian version only: apt checks them against the signed
    Release file of the base image's Debian, not against a hash of ours.

  The image runs as `node`.
- **Service**: `evals` in `infra/docker-compose.yml`, behind the `evals` profile, built as
  `coreloom-uml-evals:local`. Started on its own, it runs the offline grader tests and checks that
  its tools are the pinned ones (`EVALS_IMAGE=1`), then exits.
- **What it holds**: no env file, no credential, no Docker socket, and it is not on the project's
  network. Two questions stay open until the owner decides them (decision record, sections 4 and 5):
  - how the runner reaches a Docker daemon to start one container per trial;
  - how a trial is paid.

## Running it

```sh
docker compose -f infra/docker-compose.yml --profile evals run --build --rm evals
```

The first build takes about a minute and a half and the image is about 3.3 GB (836 MB compressed): the two agent
CLIs and Harbor's dependencies make most of it.

## Raising a version

Every version is set in one place, and `packages/catalog/evals/versions.test.ts` keeps the copies
equal (and checks the pins: `# syntax=` and images by digest, `--checksum` on any `ADD` of a URL).

- **Harbor**:
  1. Write the new version in `requirements.in`, in `HARBOR_VERSION` (`packages/catalog/evals/src/versions.ts`) and in the Dockerfile's `ARG HARBOR_VERSION`.
  2. Raise `EXCLUDE_NEWER` in `lock.Dockerfile` to the current time (UTC): the lock only takes
     files published before it, so the same inputs give the same lock.
  3. Regenerate the lock without Python on the host:
     `docker build -f infra/evals/lock.Dockerfile --output type=local,dest=infra/evals infra/evals`
  4. Build and run the service. Read Harbor's changelog for the task format and the `--ak version` behaviour, and check that `HARBOR_TELEMETRY` is still the variable `harbor/telemetry.py` reads.
- **An agent CLI or pnpm**: change it in `agents/package.json` and, for a CLI, in `ci.yml` and `AGENT_CLI_VERSIONS` (Claude Code's also in the API image, `apps/api/Dockerfile`); for pnpm, in the root `package.json`'s `packageManager`. Then regenerate the lock in a container, never on the host:

  ```sh
  docker run --rm --platform=linux/amd64 -u node -v "$PWD/infra/evals/agents:/w" -w /w \
    node:26.3.0-slim@sha256:95a34da32a840bd9b3b09a5b773591c16923e350174b1c50e1200c75bf15eaa9 \
    npm install --package-lock-only --ignore-scripts --no-audit --no-fund
  ```
- **Docker client or Compose plugin**: change the tag and the digest of the `docker-cli` or
  `compose-bin` stage together (`docker buildx imagetools inspect docker:<v>-cli`,
  `docker buildx imagetools inspect docker/compose-bin:v<v>`). If a `docker:<v>-cli` image holds
  the Compose version wanted, its plugin (`/usr/local/libexec/docker/cli-plugins/docker-compose`)
  may be copied instead.
- **Base images and the BuildKit frontend**: change the tag and the digest together (`docker buildx imagetools inspect <image>:<tag>`), in both Dockerfiles.
- **git and ca-certificates**: the Debian package versions are pinned, and the image builds only
  while Debian's mirror still serves them. A Debian point release, or a security update of
  either package, replaces the pinned version and breaks the build: take the new candidate
  (`apt-cache policy git ca-certificates` in the base image) and raise the base image with it.
  Until then a security fix of git waits for that bump: there is no `snapshot.debian.org` source
  for now.
