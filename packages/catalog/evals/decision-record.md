# Decision record: evals of the agent conventions

Status: accepted for the format, the harness and the metric; **open** for how a trial is paid
(section 5), which waits for the owner. Date: 2026-11-27. Follows the decision plan of issue #140;
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
- `src/versions.ts`: Harbor's and the agents' CLI versions.
- `tasks/`: the tasks, their fixtures, their reference and violating solutions.
- `tasks.test.ts`: the offline checks run by `pnpm --filter @coreloom-uml/catalog test`.

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
- `reference` and `violation`: solutions written by hand. On the reference both graders pass; on
  the violation the task is done and `compliance` fails. CI checks both, offline, for every task.

Graders read the outcome, never the path: files, the diff against the base commit, the manifest,
the lockfiles present, the commits of every branch and of `origin`, a hidden test run on the
working tree from outside it. They never read the transcript. Rules that can only be graded from
the transcript (asking first, running the checks) or by a model judge are left out of this suite.

Once the runner exists (ticket 4), each task is exported to a Harbor task folder at run time:
`instruction.md`, `task.toml`, `environment/` built from `createWorkspace`, and `tests/test.sh`
running the two graders and writing `/logs/verifier/reward.json`.

## 4. Harness: Harbor, pinned

Harbor (Apache-2.0, Python 3.12 or later) runs the trials: one container per trial, the built-in
`claude-code` and `codex` agents, `-k` attempts, a network policy per sandbox, recorded
trajectories, an oracle agent that proves a task can be solved. It is not a dependency of the
workspace: `uv tool install harbor==0.27.0` on the machine that runs the trials. The agents' CLIs
are installed in the trial's image at exact versions with `--ak version=<version>` (otherwise
Harbor installs the latest): Claude Code `2.1.322` and Codex `0.167.2`, the versions CI loads the
rendered files into; `tasks.test.ts` keeps `src/versions.ts` equal to `ci.yml`. Raising one is a
change to both files, and a run with a new version is never compared with an older one without
saying so. The task format stays ours, so a change of harness rewrites the exporter only.

Trials run in Harbor's local `docker` sandbox, network limited to the model provider's hosts. The
self-hosted E2B (`infra/e2b/`, `RepositorySandbox`) is not used: `isolate()` cuts every
destination, while the agent must reach its provider, and its template is the code maps'.

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
   `auth.json` inside the trial.
5. **The agent fixes the provider.** Claude Code calls Anthropic and Codex calls OpenAI. A
   configuration on Mistral, Ollama or an OpenAI-compatible endpoint cannot pay for either agent.
   At best the configuration pays for the trials of the agent whose provider it is.

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
  owner on the settings page. The credential is the account's own, given to Harbor on that
  machine: `claude setup-token` for the subscription, or the account's API key in the shell, and
  `codex login` or the key for Codex.
  - The bill goes to the same account, but no secret the app stores is read, so AGENTS.md is
    untouched.
  - The credential still enters the local trial containers. The network policy limits where the
    agent can send it.
  - The providers' terms for automated runs on a subscription are to be checked.
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
