# @coreloom-uml/cli

Writes [Coreloom UML](https://github.com/Eldenn/coreloom-uml) agent conventions into a
repository: the `AGENTS.md` that coding assistants read, plus a short pointer file for each tool
that does not read `AGENTS.md` natively. The conventions are written and generated in the
Coreloom UML app; this CLI only pulls the latest generation.

Only a **managed block** is written, between these markers:

```md
<!-- coreloom-uml:begin · managed block, edits inside it are replaced on the next pull -->
…
<!-- coreloom-uml:end -->
```

Everything outside the block is yours and is never touched.

The generation can also hold **settings files**, which make a tool enforce part of the
conventions (commands it may run without asking, what it must never read or run, checks run
before it hands back): `.claude/settings.json`, `.gemini/settings.json` and `.codex/config.toml`.

- In a TOML file, the block uses `#` markers and is put at the top of the file, before any table.
  A file that already sets one of the block's keys is refused: remove that line first.
- A JSON file cannot hold markers, so the CLI owns **entries** instead: its entries are merged
  into your file (objects key by key, lists as sets), and `.coreloom-uml.json` records them. The
  next pull takes out the entries it wrote and adds the new ones; everything else in the file is
  kept. The file is rewritten as plain JSON: comments are not supported.

Because a settings file decides what the assistant may run on your machine, every change to one
is shown and confirmed first (or accepted with `--yes`).

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
| is a settings file with new content         | the diff is shown and a confirmation asked                |
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

As a GitHub Actions step, with the key stored as a repository secret (pin the version you use):

```yaml
- name: Check the agent conventions
  run: npx @coreloom-uml/cli@0.1.0 check
  env:
    CORELOOM_UML_API_KEY: ${{ secrets.CORELOOM_UML_API_KEY }}
```

The app shows the same steps, followed by your own checks, in the generation's recommendations.

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

`.coreloom-uml.json` holds the API URL, the conventions' id (or, for a manifest written by an
older version, the project's), the pulled generation, the hash of
each block written and the entries merged into each JSON settings file. It holds no secret: commit it so that `status` works for everyone.

## Exit codes

| Code | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| 0    | Success                                                                       |
| 1    | Error: network, refused key, unknown id, refused path, broken markers…        |
| 2    | A block edited by hand was left as it was (`pull`) or found (`check`)         |
| 3    | `check`: a newer generation exists                                            |
| 4    | `check`: a managed block, or its file, is missing                             |
