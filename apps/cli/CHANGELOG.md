# @coreloom-uml/cli

## 0.1.0

### Minor Changes

- eadaa2b: First release of `@coreloom-uml/cli`: `npx @coreloom-uml/cli pull --api-url <url> --project <id>`
  writes a project's latest agent conventions generation (AGENTS.md and pointer files) into the
  current repository, inside a managed block, leaving the rest of each file alone. `status` compares
  the local blocks with the last pull and checks for a newer generation; `config set-key` stores an
  API key read on standard input.
- 8ccf1cf: Agent conventions now generate settings files that the tools enforce by themselves, next to AGENTS.md: `.claude/settings.json` for Claude Code (the checks allowed and run in a `Stop` hook, the other package managers denied, and a fixed deny list: reading `.env*` and `secrets/`, `git push --force`, `rm -rf`), `.codex/config.toml` for Codex (approval policy and sandbox mode from the autonomy answer) and `.gemini/settings.json` for Gemini CLI (the checks allowed). They replace the Claude Code permissions recommendation. The CLI merges its entries into a JSON settings file and keeps everything else in it, writes a `#`-marked block at the top of a TOML one, asks before any change to a settings file, and `status` reports `keys edited` when an entry it wrote is gone.
- c8702f3: `pull` manages role files whole: it replaces a role file instead of adding a second copy of it, and
  deletes it once the role is gone. A role file edited by hand is only replaced or deleted after a
  confirmation. `status` and `check` compare role files whole and report `file edited`.
- 1639e4c: Architecture rules that can be checked: when a project's package diagrams draw dependencies
  between packages, a generation also holds a `.dependency-cruiser.cjs` whose `forbidden` rules
  refuse every dependency between two packages that no arrow draws, and the `Architecture` section
  of `AGENTS.md` tells the agent to run `npx depcruise <folders>` before handing work back. A
  package is matched by its name, read as a folder path from the repository root (`domain` inside
  `src` is `src/domain`); packages whose name is not a folder path, and diagrams of other kinds, are
  left out. `pull` writes the file in a managed block behind `//`, so rules and options added after
  the block are kept (catalog 0.6.0).
- 986c163: `coreloom-uml check` lets CI verify that a repository's agent conventions are applied and up to
  date: it exits with 0 only when every managed block matches the latest generation, 2 when a block
  was edited by hand, 3 when a newer generation exists and 4 when a block or its file is missing
  (`--json` for a machine-readable answer). Each generation now also recommends the GitHub Actions
  steps that run it with `CORELOOM_UML_API_KEY` from the secrets, followed by the project's own
  checks (catalog 0.6.0).
- d846978: `coreloom-uml map push --project <id>` sends a map of the repository's code to a project: it runs
  graphify on the machine (`GRAPHIFY_BACKEND=none`, no model and no key), or reads a `graph.json`
  with `--graph`, turns the graph into a code map there and uploads it gzipped, so the code itself
  never leaves the machine. The map is labelled with the `origin` remote (credentials dropped), the
  branch and the commit. The API key needs the `write` ability. The README has a GitHub Actions
  workflow that sends a new map on every push.
- 64b223c: Conformance of diagrams to the code, without any model: `GET /projects/:id/code-maps/conformance` weighs how every diagram of a project matches a code map (`error` when the code contradicts the diagram, `warning` when the diagram is behind it), `coreloom-uml check --conformance` fails a CI build on it (`--fail-on error|warning`, `--push` to send a fresh map first, `--json`, exit code 5), and the MCP server gains `get_code_conformance` (open review findings and the match, per diagram) and `list_undocumented_processes`, listed when code maps are turned on. Generated agent conventions mention both tools (catalog 0.17.0).
- b57eaa1: Agent conventions now generate a rules file for Codex, `.codex/rules/coreloom-uml.rules`, next to `.codex/config.toml`: it forbids `git push --force`, `rm -rf` and the other package managers, and lets the checks run without asking unless the assistant must always ask first. Codex loads it once the project is trusted. A rule matches the first words of a command only, and cannot forbid reading a file such as `.env`. The CLI writes the file as a `#`-marked block, keeps the rules added outside it, and asks before any change to it.
- 0284957: Agent conventions can now render a sandboxed development container for the coding assistant.
  The security questionnaire asks where the assistant runs; with "in a sandboxed development
  container", a generation also holds `.devcontainer/devcontainer.json` (a pinned Node.js image,
  the chosen tools' command lines at exact versions, the workspace as the only folder of your
  machine, nothing forwarded from it) and `.devcontainer/init-firewall.sh`, which refuses all
  outgoing traffic except DNS, the package registry, GitHub and the hosts of the chosen tools, takes
  root access away from the container user, and fails the start when a blocked host answers. With
  "never" as the network answer, only the tools' own hosts stay reachable. AGENTS.md tells the
  assistant never to touch the firewall, and a recommendation says how to open the container, what
  it stops and what it does not. `coreloom-uml pull` writes the script in a managed block (a line
  such as `EXTRA_ALLOWED_DOMAINS="uml.example.com"` above it is kept) and asks before any change to
  either file.
- 15c93fc: Agent conventions now generate gates that hold whatever tool wrote the change. Git hooks in `.githooks/`: `pre-commit` runs your checks and the dependency rules, `commit-msg` enforces Conventional Commits and refuses a message that credits an assistant, each only when the answers say so. A GitHub Actions workflow, `.github/workflows/agent-conventions.yml`, replaces the steps that were only recommended, when a new optional question of the Git workflow questionnaire asks for it: it checks that the conventions are current (skipped with a warning when the `CORELOOM_UML_API_KEY` secret is missing), installs the dependencies, runs your checks (quoted, so a `:` no longer breaks the file), and scans for secrets with a pinned gitleaks binary when secrets must stay out of the repository. The CLI writes them as `#`-marked blocks, starts a new hook with `#!/bin/sh`, makes it executable and asks before any change to them. It never changes Git's configuration: it prints `git config core.hooksPath .githooks` for you to run.
- 5893a5e: Agent conventions no longer have to live in a project, like architectures. Each configuration has a name and is addressed by its own id under `/agent-configs` (`GET`/`POST /agent-configs`, `GET`/`PATCH`/`DELETE /agent-configs/:id` and its answers, rules, generations, proposals and imports); `PATCH { projectId }` moves one into a project (still at most one per project, 409 otherwise) or out of it with `null`. Outside a project, a configuration reads from the account's architectures outside any project. The app gains an Agent conventions page listing them all; the project tab keeps working. The CLI pulls with `--config <id>`; `--project <id>` and manifests written by earlier versions keep working through `GET /projects/:id/agent-config/generations/latest`.

### Patch Changes

- a580df0: Agent conventions now suggest skills. Each generation lists up to 5 third-party skills that fit
  the answers and up to 3 that go against them, with the reasons, from a catalog of 8 hand-checked
  Agent Skills pinned to a tag or a commit. The generation screen shows them as links, marked as
  third-party resources not checked by Coreloom, and `coreloom-uml pull` prints the compatible ones.
- 457fee8: Activity diagrams can be compared with the code. Their actions are linked to functions (proposed
  by name, or linked by hand in the Code tab; a diagram drawn from a code map already has its links)
  and their partitions to classes, files or folders. The conformance review then reads the source of
  those functions and checks the order of the actions, the decisions and their guards. An action
  described in prose that matches nothing is not reported.
