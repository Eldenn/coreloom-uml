# @coreloom-uml/api

## 0.2.0

### Minor Changes

- e992f9c: Agent conventions API: a project can hold one agent configuration (questionnaires, answers,
  accepted rules, notes, target tools) under `/projects/:id/agent-config`, render it into
  immutable generations (AGENTS.md and pointer files, with recommendations) and tell what a change
  would alter (`impact`). The catalog questionnaires are served by `GET /questionnaires`, and
  projects now report `agentConfigCount`. API keys reach these routes; the screens come next.
- a580df0: Agent conventions now suggest skills. Each generation lists up to 5 third-party skills that fit
  the answers and up to 3 that go against them, with the reasons, from a catalog of 8 hand-checked
  Agent Skills pinned to a tag or a commit. The generation screen shows them as links, marked as
  third-party resources not checked by Coreloom, and `coreloom-uml pull` prints the compatible ones.
- 8ccf1cf: Agent conventions now generate settings files that the tools enforce by themselves, next to AGENTS.md: `.claude/settings.json` for Claude Code (the checks allowed and run in a `Stop` hook, the other package managers denied, and a fixed deny list: reading `.env*` and `secrets/`, `git push --force`, `rm -rf`), `.codex/config.toml` for Codex (approval policy and sandbox mode from the autonomy answer) and `.gemini/settings.json` for Gemini CLI (the checks allowed). They replace the Claude Code permissions recommendation. The CLI merges its entries into a JSON settings file and keeps everything else in it, writes a `#`-marked block at the top of a TOML one, asks before any change to a settings file, and `status` reports `keys edited` when an entry it wrote is gone.
- e941f65: Import a conventions file: `POST /projects/:id/agent-config/imports` has your model read an
  existing AGENTS.md, CLAUDE.md or similar file (up to 50,000 characters, managed block left out)
  and propose answers to the configured questionnaires, each checked against its question and
  quoted from the file, plus rules for the rest. Nothing is stored: the "Import a file" panel
  applies the checked answers together (one that would replace yours starts unchecked) and accepts
  rules one by one. Provider resolution for these calls is shared in `userLanguageModel`.
- 438949b: Rule proposals with your own LLM key: `POST /projects/:id/agent-config/proposals` asks your
  model (Anthropic, OpenAI, Mistral, Ollama or an OpenAI-compatible server) to turn the notes under
  your answers into proposed rules, which you accept one by one; `POST /llm/test` checks a
  provider and its key. The key is sent with each call and never stored. Servers you name must be
  allowed in `LLM_ALLOWED_BASE_URLS`.
- 1c17dba: API keys per account: scripts and agents can use the architectures API with a named key (read and/or write, optional expiry, revocable, rate-limited per key), managed from the Settings page.
- 1639e4c: Architecture rules that can be checked: when a project's package diagrams draw dependencies
  between packages, a generation also holds a `.dependency-cruiser.cjs` whose `forbidden` rules
  refuse every dependency between two packages that no arrow draws, and the `Architecture` section
  of `AGENTS.md` tells the agent to run `npx depcruise <folders>` before handing work back. A
  package is matched by its name, read as a folder path from the repository root (`domain` inside
  `src` is `src/domain`); packages whose name is not a folder path, and diagrams of other kinds, are
  left out. `pull` writes the file in a managed block behind `//`, so rules and options added after
  the block are kept (catalog 0.6.0).
- 7871b4b: Rule proposals from diagrams: `POST /projects/:id/agent-config/proposals` takes
  `from: 'diagrams'` (and optionally `diagramIds`) to have your model turn the project's diagrams,
  sent as PlantUML without their layout, into architecture rules. Diagrams that do not fit what the
  model can read are left out whole and listed in `skipped`. The configuration lists the project's
  diagrams with content (`diagrams`), and the proposals panel gets a "My notes / My diagrams"
  switch with a diagram picker. The rendered file gains an `Architecture` section, right after
  `Project` (catalog 0.5.0).
- 6d3ebf4: Architectures and their UML diagrams: create (with a first, empty diagram), list with search and a visibility filter (each row with its diagram count and first diagram as cover), rename, describe, duplicate as a private copy and delete. Diagrams are added, renamed, reordered and deleted (an architecture keeps at least one); saving a diagram's coreloom-ui UML JSON (up to 1 MB) names the version it was based on and gets a 409 when another tab saved in between.
- 3e1ca12: Code maps API, behind the `code-maps` feature flag: a project stores maps of its code uploaded as
  graphify's `graph.json` or sent by the CLI (`POST /projects/:id/code-maps`, kept gzipped in object
  storage, the 5 newest per project), lists and reads them with a summary of folders, communities and
  entry points, and matches its diagrams against one (`GET|PUT /code-maps/:id/links?diagramId=`),
  keeping the links the owner confirms or ignores. Projects now report `codeMapCount`.
- b57eaa1: Agent conventions now generate a rules file for Codex, `.codex/rules/coreloom-uml.rules`, next to `.codex/config.toml`: it forbids `git push --force`, `rm -rf` and the other package managers, and lets the checks run without asking unless the assistant must always ask first. Codex loads it once the project is trusted. A rule matches the first words of a command only, and cannot forbid reading a file such as `.env`. The CLI writes the file as a `#`-marked block, keeps the rules added outside it, and asks before any change to it.
- 82512f7: Sign-in with a default account defined in the environment (`DEFAULT_ACCOUNT_EMAIL`, `DEFAULT_ACCOUNT_PASSWORD`, `DEFAULT_ACCOUNT_NAME`), created or updated by `node ace account:ensure-default` after the migrations on every deploy. Its email and password can't be changed from the app, it can't be deleted and gets no reset link. Public sign-up is closed unless `REGISTRATION_ENABLED=true`.
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
- 191017d: The API checks and converts diagrams with `@coreloom-uml/uml`. Every save of a diagram's content
  is checked against the UML schema, and a 422 lists each problem (`error.problems`: line, severity,
  code, text) instead of storing something the editor can't read. A diagram can be read and written
  as Mermaid, PlantUML or JSON text with `GET` / `PUT /architectures/:id/diagrams/:diagramId/source`
  (`?format=`; the `PUT` names the `version` it was based on, like a content save), created from a
  text with `source` (and an optional `format`) on `POST /architectures/:id/diagrams`, and checked
  without being stored with `POST /uml/validate`. A new diagram's response now carries its format
  and version.
- d0683b6: Feature flags: the default account gets a Feature flags screen to turn each flag on or off, roll
  it out to a share of accounts or target accounts by email or id, with the history of changes.
  The API enforces flags and the web app hides what is off. First flags, both off:
  `llm-subscription-chatgpt` and `llm-subscription-claude`. New API routes: `GET /features`,
  `GET /admin/feature-flags` and `PUT /admin/feature-flags/:key`; `GET /auth/me` now tells
  whether the user is the admin (`isAdmin`). `node ace skills:refresh` reports its progress, and a
  skills.sh or GitHub request that takes over 30 seconds now fails instead of blocking the run.
- 0615f80: Rebuild the web app on coreloom-ui: every component comes from the `@coreloom` registry, forms use
  TanStack Form (`useAppForm`), copy goes through `CoreloomI18nProvider` + `messages.ts`, and lint is
  ESLint + Prettier with coreloom-ui's rules. New screens: the architectures gallery (search, create,
  duplicate, delete), an interim editor (a tab per diagram, the Coreloom DiagramEditor, autosave with
  conflict handling) and settings (profile, password, theme). The API adds `GET /auth/options` and
  drops the `notes` example domain; `packages/ui`, React Hook Form, i18next and jsdom are removed.
- 15c93fc: Agent conventions now generate gates that hold whatever tool wrote the change. Git hooks in `.githooks/`: `pre-commit` runs your checks and the dependency rules, `commit-msg` enforces Conventional Commits and refuses a message that credits an assistant, each only when the answers say so. A GitHub Actions workflow, `.github/workflows/agent-conventions.yml`, replaces the steps that were only recommended, when a new optional question of the Git workflow questionnaire asks for it: it checks that the conventions are current (skipped with a warning when the `CORELOOM_UML_API_KEY` secret is missing), installs the dependencies, runs your checks (quoted, so a `:` no longer breaks the file), and scans for secrets with a pinned gitleaks binary when secrets must stay out of the repository. The CLI writes them as `#`-marked blocks, starts a new hook with `#!/bin/sh`, makes it executable and asks before any change to them. It never changes Git's configuration: it prints `git config core.hooksPath .githooks` for you to run.
- f399d1e: Set your own LLM provider in Settings (kind, model, server URL, key), kept only in this browser,
  with « Test » and « Forget the key ». With a provider set, « Propose rules » in the agent
  conventions opens a side panel where each proposed rule is accepted, edited then accepted, or
  ignored. `GET /llm/providers` lists the provider kinds, model suggestions and allowed server URLs.
- cf2df6d: LLM subscriptions: besides an API key, each account can connect its own ChatGPT subscription
  (OpenAI's device code; tokens stored encrypted with `APP_KEY` in the new `llm_connections` table)
  or Claude subscription (signed in and held by the official `claude` binary, pinned in the API image,
  in one folder per account under `CLAUDE_CODE_HOME`). Behind the `llm-subscription-chatgpt` and
  `llm-subscription-claude` flags. New routes under `/llm/connections/openai-codex` and
  `/llm/connections/claude-code`; `GET /llm/providers` now gives each kind's `auth` and `connected`;
  a new failure reason, `subscription_expired`. Deploys need a persistent volume for
  `CLAUDE_CODE_HOME` (`/data/claude` in the Compose stacks).
- 8a91963: An MCP server at `/mcp`, behind the `mcp-server` flag (off by default): a coding agent signed in with an account API key (`read` is enough) lists the account's projects and their diagrams, reads a diagram as Mermaid, PlantUML or JSON, and reads the latest generated AGENTS.md of a project, live instead of from a copy. Generated agent conventions now recommend how to register it in Claude Code, Codex, Cursor, Gemini CLI and GitHub Copilot (catalog 0.6.0).
- b5d0b7f: Agent conventions gain three questionnaires next to the React front end one: `backend-node` (API style and compatibility, input validation at the boundary, error handling, logging, database access, migrations and layering), `git-workflow` (worktrees and branches, commit messages, what the assistant may commit and push, pull request size, what is never committed, history rewriting, crediting the assistant) and `security` (secrets, adding dependencies, exact versions or ranges, untrusted input, destructive commands, network access, authentication and cryptography code). Each feeds only its own slots (`api.*`, `errors.*`, `logging.*`, `database.*`, `git.*`, `security.*`), so any of them can be combined in one configuration, and new conventions can now pick several questionnaires at once. `frontend-react` and the answers already saved are unchanged; the catalog is at 0.6.0.
- 3ea8692: Projects: the top-level container of an account's design work. Architectures now belong to a project (existing ones are moved into a "Default project" per account), can be moved between projects, and the API gains `/projects` (with API keys) and a `projectId` on architectures. The app opens on the projects list; `/architectures` redirects there.
- acf8909: Rule proposals from review feedback: `POST /agent-configs/:id/proposals` takes
  `from: 'feedback'` with a `feedback` text (pull request review comments, notes on what the coding
  assistant got wrong, up to 20,000 characters) and has your model turn the mistakes worth
  preventing into rules, leaving out the ones already present. The text is sent to the model and
  never stored or logged. The proposals panel gets a "Review feedback" source next to "My notes"
  and "My diagrams"; an accepted proposal becomes a rule like any other.
- ca8f4b2: Use coreloom-ui's new blocks: the editor is the Coreloom diagram workspace (views list, rename,
  reorder, save status) with the Share dialog; the gallery shows diagram cards with thumbnails; share
  links open a read-only diagram viewer, behind the access-code gate when protected. Component and
  package diagrams are accepted.
- 2d5ea72: Share an architecture: private (default), public link, or link protected by an 8-character code made by the server. The owner sees the link and the code (stored encrypted), regenerates either one (the old link stops at once, a new code shuts out everyone who entered the old one), and going private closes the link without changing it. Visitors get the architecture read-only with no owner details; a protected link takes the code (5 tries per link and IP every 15 minutes) and then stays open 24 hours in that browser. A signed-in owner skips the code. Unknown, regenerated and private links all answer the same way, and share responses are marked `noindex`.
- d2c14d7: Agent conventions suggest skills that fit the project's diagrams too (C4, Mermaid…) and show each
  skill's skills.sh security audits. The skills catalog now lives in the database: a weekly job
  searches skills.sh, keeps every skill it finds with its history, and suggests the ones whose
  installs, audits, licence and `SKILL.md` pass (`node ace skills:setup`, `skills:refresh`,
  `skills:block`).
- cd8e857: A Skills screen lists the whole skills catalog as a live dashboard: key figures, installs and
  catalog growth at each weekly search, audit and topic breakdowns, trending skills, and a ranked
  list with search, filters, sort and a sheet per skill. It reloads by itself when the weekly search
  or `skills:block` changes the catalog. New API routes: `GET /skills`, `GET /skills/stats`,
  `GET /skills/:slug` and the `GET /skills/events` stream.
- 5893a5e: Agent conventions no longer have to live in a project, like architectures. Each configuration has a name and is addressed by its own id under `/agent-configs` (`GET`/`POST /agent-configs`, `GET`/`PATCH`/`DELETE /agent-configs/:id` and its answers, rules, generations, proposals and imports); `PATCH { projectId }` moves one into a project (still at most one per project, 409 otherwise) or out of it with `null`. Outside a project, a configuration reads from the account's architectures outside any project. The app gains an Agent conventions page listing them all; the project tab keeps working. The CLI pulls with `--config <id>`; `--project <id>` and manifests written by earlier versions keep working through `GET /projects/:id/agent-config/generations/latest`.
- aed179e: Architectures no longer have to live in a project. `POST /architectures` without a `projectId` (or with `null`) creates one outside any project instead of in a "Default project", and `PATCH /architectures/:id { projectId: null }` takes one out of its project. The app gains an Architectures page (`/architectures`, in the sidebar and ⌘K) listing every architecture with the project that holds it, if any, where a new one can be created with or without a project.
- c888ba6: State diagrams keep the concurrent regions of a composite state (the `--` separator in Mermaid, `--` or `||` in PlantUML) when they are imported from or exported to Mermaid and PlantUML.
- c888ba6: A state diagram can now be simulated from the editor: fire its events, choose which way each guard goes, and follow the active states, the actions run and the steps taken, without changing the diagram.
- c888ba6: A state diagram can now be downloaded from the editor as an XState v5 machine config (JSON), with composite states, regions, choices and forks/joins turned into nested, parallel and eventless states, and a clear list of reasons when a diagram can't be exported.
- f1af83d: Agent conventions ask far more: 279 questions instead of 34. Five questionnaires are new (system
  design, software design and architecture, AI engineering, AI agents, front-end performance), and
  the front-end and back-end ones grow from 11 to 50 and from 9 to 52 questions (HTML, CSS and
  accessibility, rendering, data, front-end security; HTTP and caching, authentication and web
  security, runtime and operations). Every added question is optional, so a configuration that
  exists stays valid; it is listed as answered against an older version until it is opened again.
  One save can carry 500 answers instead of 200, and importing an existing conventions file sends
  up to 32,000 tokens instead of 16,000, so that the questions leave room for the file.
- 55b2d6e: A workspace assistant in the architecture editor, behind the `diagram-assistant` flag: conversations kept per architecture, answered by the user's own model, that read the architecture's views and propose view changes shown as diffs to accept, reject or undo, with a context gauge and a way to continue a long conversation in a new one from its summary.

### Patch Changes

- 19f15df: Run the API image and the offline end-to-end suite on the same Codex and Claude Code versions the generated development container installs.
- 6e7dc68: Better answers from the workspace assistant: the model is given the diagram format of every kind (so it can create a view of a kind the architecture has none of), is told which views did not fit instead of ignoring them, sees why an earlier proposed change failed, writes its reply in Markdown and asks a question when a request is ambiguous.
- 986c163: `coreloom-uml check` lets CI verify that a repository's agent conventions are applied and up to
  date: it exits with 0 only when every managed block matches the latest generation, 2 when a block
  was edited by hand, 3 when a newer generation exists and 4 when a block or its file is missing
  (`--json` for a machine-readable answer). Each generation now also recommends the GitHub Actions
  steps that run it with `CORELOOM_UML_API_KEY` from the secrets, followed by the project's own
  checks (catalog 0.6.0).
- 61a5d19: LLM provider settings keep the chosen provider and model without Save (a new key or server URL
  still waits for Save). `GET /llm/providers` no longer starts the `claude` binary for an account that
  never connected Claude. Claude sign-in: the URL is read in full even when printed in pieces, a
  binary that prints none within 30 s fails with `timeout`, and output past the size limit reads as
  `unknown` instead of `timeout`. Subscription screens announce their status and show why Test is
  disabled.
- 6458237: MCP: list agent conventions and read conventions outside any project by their id.
- 3015e11: The local Docker stack creates the dev and test databases on every `docker compose up` when they
  are missing, including on a Postgres volume that already exists.
- 42d01dd: Document the default account variables in `infra/.env.production.example`.
- 0fa0de3: Type-safety cleanup: removed unsafe `as Type` casts in the avatar controller, i18n language detection, notes editing, TanStack Query hooks, and the app bootstrap, replacing them with real type guards. Also fixes a silent fallback where an unrecognized avatar file extension would serve `application/octet-stream` instead of a real check, and removes a no-op exception handler override.
