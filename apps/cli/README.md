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

For each file of the last pull: `unchanged`, `block edited`, `block missing` or `file missing`.
With an API key at hand, also says whether a newer generation exists. Never writes.

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
older version, the project's), the pulled generation and the hash of
each block written. It holds no secret: commit it so that `status` works for everyone.

## Exit codes

| Code | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| 0    | Success                                                                       |
| 1    | Error: network, refused key, unknown id, refused path, broken markers…        |
| 2    | A block edited by hand was left as it was                                     |
