# Evals runner

The image that runs the agent convention evals of `packages/catalog/evals/`. Their decision
record is `packages/catalog/evals/decision-record.md`. Nothing of it is installed on the host:
no Python, no uv, no Harbor, no agent CLI.

## What it is

- **Image**: `infra/evals/Dockerfile`, two stages, x86_64 only:
  - `agent` is what a trial's agent runs on: Node on Debian, git, and the agents' CLIs at exact
    versions (Claude Code `2.1.322`, Codex `0.167.2`, the versions CI loads the rendered files
    into).
  - `runner` is `agent` plus:
    - Harbor `0.27.0` on Python 3.12, from `requirements.lock`, every package checked by its hash;
    - the Docker client and its Compose plugin, each checked by its SHA-256;
    - pnpm;
    - the catalog with the tasks and graders. Only the catalog, `packages/config` and the files
      its tests read are copied, never an app or a `.env`.

  The base images are pinned by tag and digest. The image runs as `node`.
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

The first build takes about a minute and a half and the image is about 3.5 GB: the two agent
CLIs and Harbor's dependencies make most of it.

## Raising a version

Every version is set in one place, and a test of `packages/catalog/evals/tasks.test.ts` keeps the
copies equal.

- **Harbor**:
  1. Write the new version in `requirements.in`, in `HARBOR_VERSION` (`packages/catalog/evals/src/versions.ts`) and in the Dockerfile's `ARG HARBOR_VERSION`.
  2. Regenerate the lock without Python on the host:
     `docker build -f infra/evals/lock.Dockerfile --output type=local,dest=infra/evals infra/evals`
  3. Build and run the service. Read Harbor's changelog for the task format and the `--ak version` behaviour.
- **An agent CLI**: change it in `ci.yml`, in `AGENT_CLI_VERSIONS` and in the Dockerfile's `ARG` together. Claude Code's also stays equal to the API image's (`apps/api/Dockerfile`).
- **Docker client or Compose plugin**: change the `ARG` and its `--checksum`.
  - Compose publishes its SHA-256 beside each release asset.
  - Docker publishes none for its static archives: download the archive and compute it.
- **Base images**: change the tag and the digest together (`docker buildx imagetools inspect <image>:<tag>`).
- **git and ca-certificates**: the Debian package versions are pinned. A build that fails on them means Debian has replaced them: take the new candidate (`apt-cache policy`).
