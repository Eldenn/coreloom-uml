# Skill scanner

Each copy of a skill (`skill_versions`, see `apps/api/app/skills/services/skill-versions.ts`) is
scanned with [SkillSpector](https://github.com/NVIDIA/SkillSpector) (NVIDIA, Apache 2.0) before
the admin may approve it. SkillSpector is a Python program; this service is how it runs here.

## What it is

Not a service of its own code: the API's queue worker, in an image of its own.

- **Image**: stage `skill-scanner` of `apps/api/Dockerfile`, the API's `runtime` image plus
  SkillSpector, installed from its source at one commit with the dependencies of
  `requirements.lock` (each pinned with its hash), on Python 3.12 installed by uv (Alpine's own
  Python is too new for YARA's prebuilt wheels). Published as `coreloom-uml-skill-scanner` by
  `release.yml`.
- **Command**: `queue:work --queues=skill-scans`. It takes `ScanSkillVersionJob` only; every other
  worker names its queues without `skill-scans` (the `queue:work` script, the `queue-worker`
  services), since no other image holds the binary.
- **What a job does** (`scanSkillVersion`, `apps/api/app/skills/services/skill-scans.ts`): reads
  the copy from Drive, writes its files to a temporary folder, runs
  `skillspector scan <folder> --no-llm --format json --output <report>` (no shell, an empty
  environment, killed after `SKILL_SCAN_LIMITS.timeoutMs`), reads the report back and stores the
  verdict on the row, then deletes the folder. A scan that gives no verdict is stored `failed`;
  the next skills refresh queues it again.
- **What it holds**: the database, Redis and Drive settings the worker needs, an `APP_KEY` of its
  own (`SERVICE_PASSWORD_64_SKILLSCANNERKEY`), and nothing else: no GitHub, E2B, model or mail
  credential. SkillSpector itself gets none of them. The image runs as `node`, not root.
- **Network**: `--no-llm` calls no model. SkillSpector looks dependencies up on OSV.dev (package
  names and versions only) when a skill holds a dependency file, and falls back to its own list
  when it cannot reach it.

## Running it

- Locally: `docker compose -f infra/docker-compose.yml --profile skills up -d skill-scanner`
  (reads `apps/api/.env`), or `pnpm --filter @coreloom-uml/api queue:scan` with `skillspector` on
  your `PATH`. Without either, copies stay unscanned and are approved only with the admin's written reason.
- Staging and production: the `skill-scanner` service of their compose files.

## Raising SkillSpector's version

1. Pick the release's commit (`gh api repos/NVIDIA/SkillSpector/git/ref/tags/<tag>`) and put it in
   the `ADD` line of the `skill-scanner` stage.
2. Regenerate `requirements.lock` from that commit's `pyproject.toml`, with hatchling (its build
   backend) added:

   ```sh
   git clone https://github.com/NVIDIA/SkillSpector.git /tmp/ss && git -C /tmp/ss checkout <commit>
   echo hatchling > /tmp/build.in
   uv pip compile /tmp/ss/pyproject.toml /tmp/build.in --generate-hashes --python-version 3.12 \
     --python-platform x86_64-unknown-linux-musl --no-header --no-annotate -o requirements.lock
   ```

   then put the header comment back.
3. Raise `SKILLSPECTOR_TESTED_VERSION` (`apps/api/app/skills/constants/skill-scan.ts`).
4. Build the stage, scan a known-bad and a known-clean skill with the image (network off), and
   check that `readScanReport` still reads the report (the fixture in
   `apps/api/tests/fixtures/skillspector-report.json` comes from such a scan: regenerate it).
