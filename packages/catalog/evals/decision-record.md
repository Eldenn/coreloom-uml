# Decision record: evals of the agent conventions

Status: accepted for the format, the harness and the metric; **open** for how the runner reaches
a Docker daemon (section 4) and how a trial is paid (section 5), which wait for the owner. Date: 2026-11-27. Follows the decision plan of issue #140;
implemented by issue #142.

## 1. Context

`e2e/generated-files.test.ts` proves that what `renderAgentContext` writes is well formed: the
settings load into Claude Code and Codex, the Git hooks run on real commits, the workflow reads
as YAML. Nothing measures whether a coding agent that reads those files follows the ready-made
rules. This suite measures that, for the rules a program can grade on the final state of a
repository. It is internal to the catalog: what it finds changes the rules' lines, the gates or
`APPLIED_RULES`. A user-facing "test my conventions" waits until this suite has shown that the
measure is sound.

## 2. Where it lives

`packages/catalog/evals/`, beside `src/` and `e2e/`, in the package that renders what it measures:

- `src/task.ts`: the format (`EvalTask`, `Condition`, `Polarity`, `Verdict`).
- `src/workspace.ts`: one fresh repository per trial, its conventions rendered at that moment.
- `src/graders.ts`: the readers and checks of a final state (manifest, lockfiles, history).
- `src/git.ts`: Git with none of the machine's configuration, for the same result everywhere.
- `src/versions.ts`: Harbor's and the agents' CLI versions; `versions.test.ts` keeps every copy equal.
- `tasks/`: the tasks, their fixtures, their reference and violating solutions.
- `tasks.test.ts`: the offline checks run by `pnpm --filter @coreloom-uml/catalog test`.

The runner's image and service are in `infra/evals/` and `infra/docker-compose.yml` (section 4).

The rendered files (AGENTS.md, CLAUDE.md, settings, hooks) exist only in the temporary repository
of a trial, never in this one: no fixture holds a generated file.

## 3. Task format

A task is one TypeScript object (`EvalTask`):

- `rule`: the ready-made rule graded (slot and rule id of the catalog, checked with
  `acceptedProblem`); `context`: other rules held and not graded.
- `polarity`: `applies` (the task makes the rule matter), `idle` (it does not, and acting on the
  rule is a change nobody asked for) or `flip` (the other rule of the slot, against the usual habit).
  Every graded slot has an `applies` task and an `idle` or `flip` one.
- `instruction`: what a user who says nothing of the conventions would ask.
- `files`: a neutral fixture (no lockfile, no `packageManager`, one `Initial commit`) committed once
  on `main` and pushed to a bare `origin`.
- `success` and `compliance`: two graders of the final state. `compliance` answers `pass`, `fail`
  or `not-applicable` when the agent did not reach the part the rule is about. A task is written
  so that `success` passing implies `compliance` applies: a refusal to work never counts as
  following the rule.
- Solutions written by hand, which CI grades offline for every task:
  - `reference`, and `alternatives` (other correct ways, such as pnpm leaving a dependency-free
    lockfile): both graders pass;
  - `violations`: several named ways to do the task while breaking the rule, for each of which
    `success` passes and `compliance` fails;
  - `incomplete`: named half-done states (a dependency declared without the file using it, the
    fix left uncommitted), on which `success` must not pass;
  - `untouched`: the verdict `compliance` gives on the fixture as it is (`not-applicable` when the
    task never reached the rule).

  The grader tests are themselves checked by mutation: 37 of 41 mutants of the graders are
  killed, the 4 others being equivalent.

Graders read the outcome, never the path:
- files, the diff against the base commit, the manifest, and the lockfiles present and what they
  name;
- the commits of every branch, of `HEAD` and of the bare `origin`, merges left out, each subject
  read as the rendered `commit-msg` hook reads it, with the same pattern and exemptions
  (`CONVENTIONAL_SUBJECT_PATTERN`, `EXEMPT_SUBJECT_PREFIXES` from `src/render/gates.ts`);
- a hidden test run from outside the repository, on the working tree, or on an export of `HEAD`
  when the task asks for a commit.

Git runs with none of the machine's configuration (no global or system file, an empty `HOME`, so
no global ignore or attributes). They never read the transcript. Rules that can only be graded from
the transcript (asking first, running the checks) or by a model judge are left out of this suite.

Once the runner exists (ticket 4), each task is exported to a Harbor task folder at run time:
`instruction.md`, `task.toml`, `environment/` built from `createWorkspace`, and `tests/test.sh`
running the two graders and writing `/logs/verifier/reward.json`.

## 4. Harness: Harbor, pinned, in a service of the compose file

Harbor runs the trials. It is Apache-2.0 and needs Python 3.12 or later. It gives us:
- one container per trial;
- the built-in `claude-code` and `codex` agents;
- `-k` attempts;
- a network policy per sandbox;
- recorded trajectories;
- an oracle agent that proves a task can be solved.

Nothing of it is installed on the host or in the pnpm workspace. It lives in the image of the
`evals` service (`infra/evals/Dockerfile`, profile `evals` of `infra/docker-compose.yml`, see
`infra/evals/README.md`). The image has two stages:

- `agent`: Node on Debian, git, pnpm `11.5.2` and the agents' CLIs at exact versions: Claude Code
  `2.1.322` and Codex `0.167.2`, the versions CI loads the rendered files into. They are installed
  with `npm ci` from `infra/evals/agents/package-lock.json` (sha512 integrity), their install
  scripts running as `node`, and owned by root so the agent cannot change them. A trial's image is
  built from this stage. Harbor is also given `--ak version=<version>`, so it reuses the CLI the
  image holds instead of installing the latest.
- `runner`: `agent` plus:
  - Harbor `0.27.0` on Python 3.12, from `requirements.lock`, wheels only, every package checked
    by its hash. The lock is regenerated in a container (`lock.Dockerfile`, `--exclude-newer`).
  - The Docker client `29.6.1` and Compose `5.3.0`, copied from their official images pinned by
    digest.
  - Harbor's telemetry off (`HARBOR_TELEMETRY=off`; without it Harbor reports every command to
    PostHog) and LiteLLM's model cost map read locally (`LITELLM_LOCAL_MODEL_COST_MAP=True`).
  - The catalog with the tasks and graders. Only the catalog, `packages/config` and the files its
    tests read are copied: no app, no `.env`.

The BuildKit frontend and every image are pinned by tag and digest, for `linux/amd64`. The image
runs as `node`. `versions.test.ts` keeps the versions of `src/versions.ts`, `ci.yml`, the API's
image, the Dockerfile and the locks equal. Inside the image (`EVALS_IMAGE=1`) it also checks that
the tools answer those versions. Raising one changes all of them together, and a run with a new
version is never compared with an older one without saying so.

The task format stays ours, so a change of harness rewrites the exporter only. Started on its own,
`docker compose -f infra/docker-compose.yml --profile evals run --build --rm evals` runs the offline
grader tests and the image checks, then exits.

### Reaching a Docker daemon (open: the owner decides)

Harbor's `docker` sandbox drives trials through the Docker client and Compose. From inside the
`evals` container it needs a daemon. The service ships with **none**: no socket, no privileged
mode, no credential. In that state it runs the offline tests and the Harbor commands that need no
sandbox, but no trial.

What any option opens on this kind of host (Docker Engine inside WSL 2):
- Root on the kernel means root in the WSL utility VM, which every distribution shares.
- With WSL interop on, whoever can write the distribution's home (`~/.bashrc`, a user unit) runs
  Windows programs as the user, beyond reading `/mnt/c`.
- With `networkingMode=mirrored`, containers reach the LAN with Windows' address, and the bridge
  gateway reaches every WSL service listening on `0.0.0.0`.

The ways to give the runner a daemon:

- **S1. The host's socket** (`/var/run/docker.sock` mounted into the service, plus `group_add`
  for the socket's group so `node` may use it).
  - Whatever runs in the runner can start a privileged container that mounts `/` of the host.
    That means Harbor, its 114 Python packages, pnpm's packages and our runner. It also reads the
    development stack's secrets (`docker inspect`, the Postgres volume, so the sealed LLM keys).
  - Trials share the daemon with that stack, and a cleanup bug can remove its containers.
  - Paths are resolved on the host.
  - Simplest, and the most it hands over. Refused by default.
- **S2. A Docker-in-Docker sidecar** (`docker:29.6.1-dind` pinned by digest, `privileged: true`).
  - It keeps the trials and their cleanup away from the host's daemon and the development stack.
    An escape from a trial lands in the sidecar first, and removing its volume wipes everything.
  - It does **not** protect against a compromised runner: whoever drives the inner daemon can
    start an inner privileged container, as privileged as the sidecar, which sees the VM's
    devices, the distribution's disk and its home (`~/.ssh`, tokens). Against the runner's own
    supply chain, S2 is no better than S1.
  - Required with it:
    - no TCP API that a trial can reach: dockerd listens on a Unix socket in a volume shared with
      the runner only (`DOCKER_HOST=unix://…`), or on TLS with client verification, the runner
      holding the client certificates read-only;
    - the runner and the sidecar on an `internal` network of their own, only the sidecar with a
      way out (pulls, and the trials' allowlist below);
    - `userns-remap` in the inner daemon (a trial's root is an unprivileged uid);
    - memory, PID and CPU limits on the sidecar;
    - named volumes only, mounted at the same path in both, never a host bind mount;
    - trials never privileged, with every capability dropped, checked with `docker inspect` on
      the first run, as is the fact that Harbor mounts neither the socket nor the certificates
      into a trial;
    - the sidecar started for one run, then `down -v`.
  - First variant to try: `docker:29.6.1-dind-rootless`. Its outer container is still
    privileged, but the daemon runs as uid 1000, so a compromised API or an escaped trial arrives
    without capabilities. Whether Harbor's egress rules work under rootlesskit is to be checked.
- **S3. Sysbox.** A runtime installed on the host, which this setup refuses.
- **S4. A remote sandbox instead of Docker** (Harbor's `e2b` environment on the self-hosted install
  of `infra/e2b/`).
  - Each trial is a microVM, the best isolation per trial.
  - The privilege moves rather than disappears: that install itself runs privileged on the host's
    network, and its key drives every sandbox of the install, the app's (research, assistant)
    included.
  - Not checked: that Harbor's `e2b` environment works against a self-hosted install.
- **S5. A dedicated virtual machine** (Hyper-V, or a separate host) running S1 or S2 inside it.
  - The only solid boundary for regular trials: what escapes reaches a throwaway VM, not the
    workstation.
  - It costs setting the VM up once.

Recommendation: **S2 for the pilot, rootless first**, with every requirement above in place
before the first trial; **S5** if trials become regular; **never S1**. Whichever is chosen is
added to the service then, in a compose file of its own that the start command names. Nothing of
S1, S2 or S5 is in the repository until the owner chooses.

### What a trial may reach

Harbor's Docker sandbox applies a network policy per phase (public, no network, or an allowlist,
through an nftables sidecar; to confirm for 0.27.0 on the first run). Before any credential
enters a trial:
- the environment's setup and the verifier get **no network**: the CLIs are already in the image;
- the agent's phase gets an **allowlist**: the provider's API host only (`api.anthropic.com` or
  `api.openai.com`), and the npm registry only for a task that needs an install;
- private ranges and the gateways are refused (`10/8`, `172.16/12`, `192.168/16`, `169.254/16`,
  `100.64/10`, `fc00::/7`);
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` is set in the trial;
- the agent's container holds neither `NET_ADMIN` nor `NET_RAW`.

What stays open, accepted for the pilot: an allowlist by address lets through domain fronting
behind a shared CDN, and the allowed resolver permits exfiltration over DNS. The runner itself
runs with Harbor's telemetry off and LiteLLM's model cost map read locally. Where Harbor 0.27.0
allows it, the verifier runs in a sandbox separate from the agent's
(`verifier.environment_mode = "separate"`), so that what the agent did to git, Node or
`/logs/verifier` cannot change the grade.

The self-hosted E2B is not used through `RepositorySandbox`: `isolate()` cuts every
destination, while the agent must reach its provider, and its template is the code maps'.

The service never gets a credential from an env file, a committed file or the image. It gets one
only through the way section 5 settles, once the owner has accepted it.

## 5. Who pays: the owner's LLM configuration (open)

The owner chose that trials are paid by the LLM configuration chosen in the app's settings (the
provider and model, with the saved key or the subscription). As AGENTS.md stands, no way of doing
it respects both that choice and the credential rules, for these reasons:

1. **The agent is what calls the model, inside the trial's container.** Harbor hands the
   credential to the agent's environment (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or
   `CLAUDE_CODE_OAUTH_TOKEN` for Claude Code; `OPENAI_API_KEY` or `CODEX_API_KEY` for Codex), and
   the agent runs with its permissions bypassed: it can read that variable. A credential of the
   app's there is a credential in a sandbox, which AGENTS.md forbids.
2. **A saved key never leaves the API.** It is read only by `resolveCredential`, never returned,
   logged, traced, put in a job's data, Redis or a sandbox. No route can hand it to a runner on a
   development machine, and the provider and model the owner chose live in the browser
   (`localStorage`, `llm-provider`), where no script reads them.
3. **A Claude subscription is the binary's own files.** They are sealed in `claude_code_states`
   and only ever borrowed by `withClaudeFolder`, under `withClaudeLock`, by the unmodified binary
   in the API. Our code never parses them, so it cannot extract a token for
   `CLAUDE_CODE_OAUTH_TOKEN`. Copying the files into a trial would put a credential on a disk
   outside the lock: the binary in the trial refreshes its tokens, and the sealed row keeps a
   refresh token already spent, which disconnects the subscription.
4. **A ChatGPT subscription is our tokens, used by our `codexFetch`.** Those tokens are sealed in
   `llm_connections` and never given to the Codex CLI, which would need them in its own
   `auth.json` inside the trial. The CLI refreshes those tokens itself, so a copy would spend the
   refresh token the sealed row keeps, as in reason 3.
5. **The agent narrows the provider.** Claude Code calls an Anthropic-style API (Anthropic, or
   another through `ANTHROPIC_BASE_URL`, Bedrock, Vertex), and Codex an OpenAI-style one (its
   `model_providers`, Ollama included). Some configurations of the app could therefore pay for
   one of the agents, never for both. This does not lift reason 2, which is enough on its own.

The options, for the owner to decide:

- **A. Credential-injecting proxy in the API (saved keys only).** The trial gets a short-lived
  token of its own, capped in spend and revoked at the end of the run, and a base URL
  (`ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`) pointing at an API route. That route resolves the
  saved key with `resolveCredential` and forwards the call.
  - The key never leaves the API, but a token that spends the account's money enters a container
    whose agent runs with its permissions bypassed.
  - It needs new rules in AGENTS.md (the token, its cap, the route), a security review, and an API
    reachable from the trials. The local API only, since the production proxy closes requests at
    100 seconds.
  - It does not cover subscriptions: that would mean parsing the sealed files.
  - Against D it narrows what a leak costs (a capped, short-lived, revocable token), but it adds
    attack surface to the app. Missing from it so far:
    - it must not be an open relay: one path (`/v1/messages` or `/v1/responses`) and the chosen
      model only, no batch, files or admin endpoints, the client's headers filtered, a bounded
      request size;
    - a cap that holds under concurrency and streaming (pre-authorized on `max_tokens`, a bounded
      number of trials at once);
    - a token outside the `api` guard (it reaches no other route), stored hashed, bound to the
      account and the run, sealed like the other secrets;
    - no logging of prompts, which carry the fixtures' code;
    - an allowlist entry from the trials to the API, one host and port.
  - About 3 to 5 days.
- **B. Trials run by the API, the key resolved in `process()`.** A job resolving the key is not
  enough: the agent still needs the key in its environment, so the key enters a sandbox anyway.
  Running the agent inside the worker would put a permission-bypassing agent next to
  `LLM_KEYS_ENCRYPTION_KEYS`. It would also need Harbor (Python) and Docker in the API's image.
  Not viable on its own: at best it is the orchestrator of A.
- **C. A documented exception: an admin export of the admin's own key for local runs.** It breaks
  "never returned", the rule that keeps a stolen session from taking a key. Not recommended.
- **D. The app's choice of provider and model, the same account's credential given on the machine
  that runs the trials.** The runner takes the provider and the model as arguments, read by the
  owner on the settings page. The credential is the account's own: a token from
  `claude setup-token` for the subscription, or the account's API key, and a key for Codex. It is
  handed to the `evals` service for one run only, from the owner's shell (`docker compose run -e
  CLAUDE_CODE_OAUTH_TOKEN …`, the variable named, its value never on the command line), and Harbor
  passes it to the trial's agent. It is never in an env file, a committed file or the image.
  - The bill goes to the same account, but no secret the app stores is read, so AGENTS.md is
    untouched. It honours the owner's choice for the provider, the model and the account billed,
    not for the credential the app stores: the owner accepts that difference explicitly.
  - Prefer a key made for the run: an Anthropic Console workspace or an OpenAI project with a
    spending cap and the model restricted, deleted after the run. A `claude setup-token` token
    lives long, is hard to revoke, and its terms for automated runs are to be checked. If it is
    used anyway, make one for the pilot and revoke it afterwards.
  - Harbor collects the credential from the service's environment. It is never passed as
    `--agent-env K=V` or any argument, which would put it in `/proc/*/cmdline` and possibly in the
    job's configuration on disk. It is typed without echo (`read -rs`) or read from a secrets
    manager, never written to the shell's history.
  - The credential still enters the trial containers, and a permission-bypassing agent may print
    it into the transcript. So the output folder is `0700`, outside the repository and outside
    `/mnt/c` (no OneDrive sync). It is scanned for secrets after each run (and the key rotated if
    one is found), never uploaded to a Harbor hub, and purged once read.
  - It is acceptable only with the network policy of section 4 in place before the first trial.
  - No work beyond the runner.

Recommendation: **D** for this internal suite and its pilot, and **A** only if the user-facing
"test my conventions" goes ahead. That is where the app must pay with a user's saved key, and it
warrants its own review. Nothing of tickets 1 and 2 depends on this choice.

## 6. Conditions

Each task runs in three conditions, the same fixture each time:

- `none`: no convention file.
- `instructions`: AGENTS.md and the pointer each tool reads it through (CLAUDE.md), rendered for
  Claude Code and Codex. Nothing a tool enforces.
- `full`: every file the catalog renders for those tools (settings, rules, Git hooks), with the
  hooks turned on by the command the catalog recommends (`git config core.hooksPath .githooks`).

`instructions` against `none` measures what the text does; `full` against `instructions`, what
the settings and hooks add. An `idle` task that passes in `none` and fails in `instructions`
means the conventions caused a change nobody asked for.

## 7. Metric

- A trial passes when `success` and `compliance` both pass.
- Each task runs k = 5 times per agent and condition. The main figure is **pass^k**: the share
  of tasks whose k trials all pass, since a convention is worth something only when it holds every
  time.
- Beside it, per condition and agent:
  - the pass rate per trial, with a 95 % Wilson interval;
  - the `success` rate alone, so a failure of capability is not read as a failure of compliance;
  - the `compliance` rate over the trials where it applies.
- A difference between conditions is reported only with its intervals. With some 80 trials per
  condition and agent for the full lot, only differences of 15 to 20 points or more show.
- A run's report names the catalog version, the agent's CLI version, the model and Harbor's
  version. Two runs are compared only when they differ in one of these.

## 8. Clean trials and traces

- Every trial starts from a new container and a new repository, built by `createWorkspace` with
  fixed dates. The base commit is the same on every machine, and nothing of an earlier trial
  remains.
- Hidden tests are written outside the repository, run against it, and never shown to the agent.
- Transcripts (Harbor's trajectories, Claude Code's `stream-json`, Codex's `--json`) and the
  verifier's output are kept with the grades, outside this repository (under the runner's output
  folder), and never committed.
- Every failure, and a sample of passes, is read before a score is trusted: a task that fails
  every time is first suspected of being broken.

## 9. Where and when it runs

- Never in CI: no test calls a provider. CI runs `tasks.test.ts` offline (formats, graders,
  reference and violating solutions, version pins).
- Trials run by hand, or at night on a development machine, when one of their inputs changes:
  - a `CATALOG_VERSION` that touches a rule of the lot;
  - a new pinned CLI;
  - a new default model.
- The paid pilot (one pair, the three conditions, k = 3, one agent: 18 trials) waits for the
  owner's approval of its budget. The rest of the lot is written only if the pilot shows a
  measurable difference between conditions.
