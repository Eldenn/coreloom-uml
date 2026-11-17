# @coreloom-uml/cli

Writes [Coreloom UML](https://github.com/Eldenn/coreloom-uml) agent conventions into a
repository: the `AGENTS.md` that coding assistants read, plus a short pointer file for each tool
that does not read `AGENTS.md` natively. The conventions are written and generated in the
Coreloom UML app; this CLI only pulls the latest generation. It also sends a map of the
repository's code to a project, without the code itself (`map push`, below).

Only a **managed block** is written, between these markers:

```md
<!-- coreloom-uml:begin · managed block, edits inside it are replaced on the next pull -->
…
<!-- coreloom-uml:end -->
```

Everything outside the block is yours and is never touched.

The generation can also hold **settings files**, which make a tool enforce part of the
conventions (commands it may run without asking, what it must never read or run, checks run
before it hands back): `.claude/settings.json`, `.gemini/settings.json`, `.codex/config.toml` and
`.codex/rules/coreloom-uml.rules`.

- In a TOML file, the block uses `#` markers and is put at the top of the file, before any table.
  A file that already sets one of the block's keys is refused: remove that line first.
- In a Codex rules file (`.rules`, Starlark), the block uses `#` markers too; rules you add
  outside it are kept.
- A JSON file cannot hold markers, so the CLI owns **entries** instead: its entries are merged
  into your file (objects key by key, lists as sets), and `.coreloom-uml.json` records them. The
  next pull takes out the entries it wrote and adds the new ones; everything else in the file is
  kept. The file is rewritten as plain JSON: comments are not supported.

Because a settings file decides what the assistant may run on your machine, every change to one
is shown and confirmed first (or accepted with `--yes`).

When the project's package diagrams draw dependencies between packages, the generation also holds a
`.dependency-cruiser.cjs` for [dependency-cruiser](https://github.com/sverweij/dependency-cruiser):
its block uses `//` markers, so rules and options you add after the block
(`module.exports.forbidden.push(…)`) are kept. A package is matched by its name, read as a folder
path from the repository root. The file is code that dependency-cruiser runs, so every change to
it is shown and confirmed first too.

The generation also holds gates that apply to every commit, whatever tool wrote it:

- **Git hooks**, `.githooks/pre-commit` (your checks, and the dependency rules when there are
  some) and `.githooks/commit-msg` (the commit message format and the refusal to credit an
  assistant, when the conventions say so). The block uses `#` markers; lines you add before or
  after it are kept. When the CLI creates the file it writes `#!/bin/sh` as its first line, and
  it makes the file executable on every write (on Windows, where there is no such bit, run
  `git update-index --chmod=+x` on each hook once). A block is never added to an existing hook
  written in another language than shell. **The CLI never changes Git's configuration**: the
  hooks run only once you have told Git to read the folder, in each clone:

  ```sh
  git config core.hooksPath .githooks
  ```

  If another tool already owns the hooks path (Husky, for instance), call the scripts from its
  hooks instead: `sh .githooks/commit-msg "$1"`.
- **A GitHub Actions workflow**, `.github/workflows/agent-conventions.yml`, when the Git
  workflow questionnaire asks for it: it runs `check` (below), then your checks. The block uses `#` markers; steps you add after it, at the same
  indentation, are kept. `check` needs the `CORELOOM_UML_API_KEY` repository secret: without it (a pull request from a
  fork, or a secret not configured) that step is skipped with a warning and the others still
  run. An existing file of that name without a block is refused rather than appended to.

Both are code that runs on your machine or in your CI, so every change to one is shown and
confirmed first (or accepted with `--yes`).

When the security questionnaire asks for a sandboxed development container, the generation also
holds `.devcontainer/devcontainer.json` (merged entry by entry like any JSON file, so it cannot hold
comments) and `.devcontainer/init-firewall.sh`, the container's firewall. The script's block uses
`#` markers: a line you add above it, such as `EXTRA_ALLOWED_DOMAINS="uml.example.com"`, is kept.
It is run with `bash`, so the CLI does not make it executable. Both files decide what runs in the
container, so every change to them is shown and confirmed first too.

Requires Node.js 22 or newer.

## Quick start

1. In the app, under **Settings → API keys**, create a key. The `read` ability is enough.
2. Make it available to the CLI, without putting it in your shell history:

   ```sh
   export CORELOOM_UML_API_KEY=clu_…        # or store it once:
   npx @coreloom-uml/cli config set-key      # reads the key, hidden, or from standard input
   ```

3. At the root of your repository:

   ```sh
   npx @coreloom-uml/cli pull --api-url https://coreloom.example.com/api --config 12
   ```

   The id is in the URL of the agent conventions page (`/agent-configs/12`). Both values are
   remembered in `.coreloom-uml.json`, so later pulls are just `npx @coreloom-uml/cli pull`.
   Conventions that sit in a project can also be named by the project's id, with `--project`.

## Commands

### `pull [--api-url <url>] [--config <id> | --project <id>] [--dry-run] [--yes] [--force]`

Fetches the conventions' latest generation and, for each file:

| The file…                                   | What happens                                              |
| ------------------------------------------- | --------------------------------------------------------- |
| does not exist                              | it is created with the block alone                        |
| exists without markers                      | the block is added at its end, after a confirmation       |
| holds the block the last pull wrote         | the block is replaced                                     |
| holds a block edited by hand                | the diff is shown and a confirmation asked                |
| left the generation (a target was removed)  | its block is removed, and the file deleted if left empty |
| is a settings file, a hook or a workflow with new content | the diff is shown and a confirmation asked |
| is a JSON file missing an entry it was given | it counts as edited by hand: same as a block edited by hand |

- `--dry-run` shows the plan and the diffs, and writes nothing.
- `--yes` answers yes to every question, except for a block edited by hand: the CLI then writes
  nothing and exits with code 2. Add `--force` to overwrite such blocks too.
- Without a terminal (CI, a pipe), a pull that needs a confirmation stops and asks for `--yes`.

Every path the server sends must be relative, normalized and inside the current folder, with no
symbolic link on the way; anything else is refused before any write.

The recommendations of the generation (settings to change by hand, for instance) and the
compatible skills are printed at the end. Skills are third-party resources, not checked by
Coreloom UML: links only, never a command to run.

### `status [--api-url <url>]`

For each file of the last pull: `unchanged`, `block edited`, `keys edited` (a JSON settings file
that lost an entry the last pull wrote), `block missing` or `file missing`.
With an API key at hand, also says whether a newer generation exists. Never writes.

### `check [--api-url <url>] [--json]`

For CI: the same comparison as `status`, answered by the exit code. It exits with 0 only when
every managed block is the one the last pull wrote **and** that pull is the latest generation.
It needs the committed `.coreloom-uml.json` and an API key (`read` is enough), never asks
anything and never writes.

| Code | Meaning                                                                      |
| ---- | ---------------------------------------------------------------------------- |
| 0    | Every block matches the latest generation                                    |
| 1    | Could not check: no manifest, no key, network, refused key…                  |
| 2    | A block was edited by hand                                                   |
| 3    | A newer generation exists: run `pull` and commit                             |
| 4    | A block, or its file, is missing                                             |

When several apply, the first of 2, 4, 3 is returned (edited, then missing, then stale). `--json` prints one object instead of text: `ok`, `exitCode`, `generationId`,
`latestGenerationId` and `files` (`path`, `state`).

When the Git workflow questionnaire asks for it, the generation holds a GitHub Actions workflow
that runs it, then your own checks: `.github/workflows/agent-conventions.yml`, written by `pull`.
It reads the key from the `CORELOOM_UML_API_KEY` repository secret. In another CI, run
`npx @coreloom-uml/cli@<version> check` with that variable set (pin the version you use).

### `check --conformance [--api-url <url>] [--project <id>] [--map <id> | --push [--graph <path>]] [--fail-on error|warning] [--json]`

For CI: checks that the project's **diagrams still match the code**. The API matches every
diagram the map can check (package, component, class, sequence, C4) against a code map, the
project's newest ready one by default, and weighs each finding. No model is called and no code is
sent: the match is deterministic, the same map and diagrams always give the same answer.

| Level     | Finding                                                                          |
| --------- | -------------------------------------------------------------------------------- |
| `error`   | An element nothing in the code matches; a dependency drawn that the code lacks   |
| `warning` | A link to code that is gone; a dependency the code has that the diagram omits    |

It exits with 5 when a finding reaches `--fail-on` (`error` by default; `warning` counts errors
too), 0 otherwise. Undocumented processes are counted, never failed on. Links you confirm or
ignore in the app's Code tab are taken into account, so a false finding is fixed there once.

- `--project` can be left out when `.coreloom-uml.json` names a project. The key needs `read`.
- `--map <id>` checks a given map of the project.
- `--push` first maps the repository and sends the map, as `map push` does (the key then needs
  `write`, and graphify must be installed unless `--graph` names a `graph.json`), then checks
  against that map: the check always reads the commit being built.
- `--json` prints one object: `ok`, `exitCode`, `failOn`, `projectId`, `codeMap`, `counts`,
  `diagrams` (each with its `findings`: `kind`, `level`, `message` and the elements or code keys
  involved), `notChecked` and `undocumentedProcesses`. Everything else goes to stderr.

A workflow that checks every pull request against a map of its own commit (pin the CLI version
you use; `CORELOOM_UML_API_KEY` needs `write` because of `--push`):

```yaml
name: Diagram conformance

on:
  pull_request:

permissions:
  contents: read

jobs:
  conformance:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 22
      - run: pipx install graphifyy==0.9.108
      - run: npx --yes @coreloom-uml/cli@<version> check --conformance --push --project 7
        env:
          CORELOOM_UML_API_URL: ${{ vars.CORELOOM_UML_API_URL }}
          CORELOOM_UML_API_KEY: ${{ secrets.CORELOOM_UML_API_KEY }}
```

Without `--push`, the check reads the newest map the project has (sent by `map push` on `main`,
or read by the server from GitHub) and needs only `read`.

### `map push [--api-url <url>] [--project <id>] [--graph <path>] [--repository <url>] [--branch <name>] [--commit <sha>] [--dry-run]`

Sends a **map of the repository's code** to a project, so that the app can match its diagrams
against the code. Run it at the repository root. The map is read on your machine by
[graphify](https://github.com/Graphify-Labs/graphify), which parses the code with tree-sitter;
the CLI then turns graphify's graph into a Coreloom UML code map and sends that, gzipped. **The
code itself never leaves the machine**: a map holds file paths, the names of classes, functions
and methods, their line numbers and the links between them (imports, calls, inheritance), never
a line of source.

```sh
uv tool install graphifyy==0.9.108     # once (or pipx install graphifyy==0.9.108); Python 3.10+
npx @coreloom-uml/cli map push --api-url https://coreloom.example.com/api --project 7
```

The project id is in the URL of the project page (`/projects/7`). The key needs the **`write`**
ability, and code maps must be turned on for your account.

- graphify runs with `GRAPHIFY_BACKEND=none` and its query log off, so no model is called and
  no key is needed; no variable whose name ends in `API_KEY`, `_TOKEN` or `_SECRET` is passed to
  it. It writes `graphify-out/` (add it to `.gitignore`) and reads `.gitignore`. When there is no
  `.graphifyignore`, the CLI writes one that leaves out dependencies and build output.
- Without graphify, the CLI sends the `graphify-out/graph.json` an earlier run left, and warns
  that it may be older than the code. `--graph <path>` sends a given `graph.json` and does not run
  graphify. Only graphify 0.9.108's format is read (`schema_version` 1); another version is
  used with a warning, and a graph the CLI cannot read is refused before anything is sent.
- The map is labelled with the `origin` remote as a web address (`git@github.com:acme/app.git`
  becomes `https://github.com/acme/app`; a user name or token in the URL is dropped), the branch
  and the commit. `--repository`, `--branch` and `--commit` set them instead. In a detached
  checkout, the branch comes from `GITHUB_HEAD_REF` or `GITHUB_REF_NAME`. When the working tree
  has uncommitted changes, the CLI warns that the map holds them but names the last commit.
- `--project` can be left out when `.coreloom-uml.json` names a project (`pull --project`).
- `--dry-run` reads the code and prints the map's size, and needs neither a key nor a project.
- A project keeps its five newest maps.

To send a new map on every push to `main`, add a workflow such as this one, with an API key that
has the `write` ability in the `CORELOOM_UML_API_KEY` secret and the API URL in the
`CORELOOM_UML_API_URL` variable (pin the CLI version you use):

```yaml
name: Code map

on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  code-map:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 22
      - run: pipx install graphifyy==0.9.108
      - run: npx --yes @coreloom-uml/cli@<version> map push --project 7
        env:
          CORELOOM_UML_API_URL: ${{ vars.CORELOOM_UML_API_URL }}
          CORELOOM_UML_API_KEY: ${{ secrets.CORELOOM_UML_API_KEY }}
```

### `config set-key`

Reads an API key (hidden in a terminal, or from standard input) and stores it in
`$XDG_CONFIG_HOME/coreloom-uml/config.json` (`~/.config/coreloom-uml/config.json` by default),
readable by you only. `CORELOOM_UML_API_KEY` takes precedence over it.

## Settings

| Setting  | Read from, in order                                                          |
| -------- | ---------------------------------------------------------------------------- |
| API URL  | `--api-url`, `CORELOOM_UML_API_URL`, `.coreloom-uml.json`. No default.       |
| API key  | `CORELOOM_UML_API_KEY`, then the config file. Never an argument.             |
| Source   | `--config` or `--project`, then `.coreloom-uml.json`.                        |
| Project  | `map push`, `check --conformance`: `--project`, then the manifest's project. |

`.coreloom-uml.json` holds the API URL, the conventions' id (or, for a manifest written by an
older version, the project's), the pulled generation, the hash of
each block written and the entries merged into each JSON settings file. It holds no secret: commit it so that `status` works for everyone.

## Exit codes

| Code | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| 0    | Success                                                                       |
| 1    | Error: network, refused key or map, unknown id, refused path, broken markers  |
| 2    | A block edited by hand was left as it was (`pull`) or found (`check`)         |
| 3    | `check`: a newer generation exists                                            |
| 4    | `check`: a managed block, or its file, is missing                             |
| 5    | `check --conformance`: a finding reaches the `--fail-on` level                |
