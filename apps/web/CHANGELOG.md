# @coreloom-uml/web

## 0.2.0

### Minor Changes

- e992f9c: Agent conventions API: a project can hold one agent configuration (questionnaires, answers,
  accepted rules, notes, target tools) under `/projects/:id/agent-config`, render it into
  immutable generations (AGENTS.md and pointer files, with recommendations) and tell what a change
  would alter (`impact`). The catalog questionnaires are served by `GET /questionnaires`, and
  projects now report `agentConfigCount`. API keys reach these routes; the screens come next.
- 218e237: Agent conventions screen: the project page gets an « Agent conventions » tab to pick a
  questionnaire and target tools, answer it section by section (draft kept in the browser), accept
  rules one by one (written by hand or from an answer's details, ordered, edited, deleted), keep
  notes, generate the files and read them (file tree, viewer, download, changes since the previous
  generation, recommendations), with the « Install in a repository » CLI command. A badge tells when
  the files need to be generated again, and the projects list shows which projects have conventions.
  Uses coreloom-ui's checkbox cards, exclusive choices, inline Markdown and sortable list actions.
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
- 7871b4b: Rule proposals from diagrams: `POST /projects/:id/agent-config/proposals` takes
  `from: 'diagrams'` (and optionally `diagramIds`) to have your model turn the project's diagrams,
  sent as PlantUML without their layout, into architecture rules. Diagrams that do not fit what the
  model can read are left out whole and listed in `skipped`. The configuration lists the project's
  diagrams with content (`diagrams`), and the proposals panel gets a "My notes / My diagrams"
  switch with a diagram picker. The rendered file gains an `Architecture` section, right after
  `Project` (catalog 0.5.0).
- 3e1ca12: Code maps API, behind the `code-maps` feature flag: a project stores maps of its code uploaded as
  graphify's `graph.json` or sent by the CLI (`POST /projects/:id/code-maps`, kept gzipped in object
  storage, the 5 newest per project), lists and reads them with a summary of folders, communities and
  entry points, and matches its diagrams against one (`GET|PUT /code-maps/:id/links?diagramId=`),
  keeping the links the owner confirms or ignores. Projects now report `codeMapCount`.
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
- ec0489a: Import a diagram file, from coreloom-ui:
  
  - The editor's top bar has an **Import** button: a Mermaid, PlantUML or JSON file replaces the open diagram's text.
  - The workspace's Add menu ends with **Import a file…**: the file becomes a new view of the architecture, named after the file, and is saved like any other view. A file whose text can't be read yet opens as a draft, saved once it reads.
- ead6815: Diagram files can be dropped on an architecture's workspace, from coreloom-ui: a dashed hint shows while they are held over it, and each dropped file becomes a new view, named after the file and saved like any other. Several files are added one after the other, in the order they were dropped.
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
- 2cadaeb: The diagram editor fills the window: the architecture page uses the whole width next to the sidebar, and the editor reaches the bottom of the screen on wide displays.
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
- 9f438ea: The UML model and its Mermaid, PlantUML and JSON conversion move to a shared `@coreloom-uml/uml`
  package, which the API can use as well: it adds `validateDiagram`, `parseDiagramText`,
  `formatDiagramText` and `detectDiagramTextFormat`. The web app reads it from there; diagrams behave
  as before.
- ca8f4b2: Use coreloom-ui's new blocks: the editor is the Coreloom diagram workspace (views list, rename,
  reorder, save status) with the Share dialog; the gallery shows diagram cards with thumbnails; share
  links open a read-only diagram viewer, behind the access-code gate when protected. Component and
  package diagrams are accepted.
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

- 6e7dc68: Better answers from the workspace assistant: the model is given the diagram format of every kind (so it can create a view of a kind the architecture has none of), is told which views did not fit instead of ignoring them, sees why an earlier proposed change failed, writes its reply in Markdown and asks a question when a request is ambiguous.
- ec0489a: Diagram editor fixes from coreloom-ui:
  
  - Leaving a diagram's full screen (Escape or the button) puts back the view from before, instead of leaving the diagram off to the side and out of sight.
  - Boxes dragged in a Mermaid or PlantUML diagram keep their place after switching views, reloading or sharing: their positions are now saved, in a comment line of the text (`%% coreloom-layout {…}`).
  - Fit to view works every time, including after dragging a box out of sight.
- 18f2392: Model calls (rule proposals, file import, connection test) no longer fail with "Something went wrong" when the model takes more than 10 seconds: the browser now waits for the API, which bounds each call itself and answers a timeout reason.
- 61a5d19: LLM provider settings keep the chosen provider and model without Save (a new key or server URL
  still waits for Save). `GET /llm/providers` no longer starts the `claude` binary for an account that
  never connected Claude. Claude sign-in: the URL is read in full even when printed in pieces, a
  binary that prints none within 30 s fails with `timeout`, and output past the size limit reads as
  `unknown` instead of `timeout`. Subscription screens announce their status and show why Test is
  disabled.
- dcf16f1: Send signed-out visitors to the sign-in page instead of crashing: the signed-in area now checks the session before any page loads, comes back to the requested page after signing in, and returns to sign-in when the session expires (any 401 from the API).
- 0fa0de3: Type-safety cleanup: removed unsafe `as Type` casts in the avatar controller, i18n language detection, notes editing, TanStack Query hooks, and the app bootstrap, replacing them with real type guards. Also fixes a silent fallback where an unrecognized avatar file extension would serve `application/octet-stream` instead of a real check, and removes a no-op exception handler override.
- ec0489a: UML fixes from coreloom-ui:
  
  - Lines no longer blink or vanish while a box is dragged.
  - A name with brackets, such as "Order (v2)", no longer turns a PlantUML diagram into a use case diagram and wipes it out.
  - "#42" in a PlantUML name, note or transition stays in the text instead of being read as a colour.
  - The ER template reads in PlantUML: an entity without attributes, and an entity's quoted name.
  - Mermaid flowchart text with brackets, braces or a pipe reads; quotes in Mermaid class and ER names show as quotes, not `#quot;`.
  - After Add > Note, focus goes to the note's text.
  - A Mermaid activity diagram no longer offers Note, which Mermaid can't keep.
- 9ff1aee: Agent conventions: the files of a generation show a badge for settings and configuration files as
  they do for pointers, and a downloaded file gets the MIME type of its extension (JSON, TOML,
  JavaScript, plain text) instead of Markdown for all of them.
- Updated dependencies [e992f9c]
- Updated dependencies [a580df0]
- Updated dependencies [8ccf1cf]
- Updated dependencies [e941f65]
- Updated dependencies [438949b]
- Updated dependencies [19f15df]
- Updated dependencies [1c17dba]
- Updated dependencies [1639e4c]
- Updated dependencies [7871b4b]
- Updated dependencies [6d3ebf4]
- Updated dependencies [6e7dc68]
- Updated dependencies [986c163]
- Updated dependencies [3e1ca12]
- Updated dependencies [b57eaa1]
- Updated dependencies [82512f7]
- Updated dependencies [0284957]
- Updated dependencies [191017d]
- Updated dependencies [d0683b6]
- Updated dependencies [0615f80]
- Updated dependencies [15c93fc]
- Updated dependencies [f399d1e]
- Updated dependencies [61a5d19]
- Updated dependencies [cf2df6d]
- Updated dependencies [8a91963]
- Updated dependencies [6458237]
- Updated dependencies [b5d0b7f]
- Updated dependencies [3015e11]
- Updated dependencies [42d01dd]
- Updated dependencies [3ea8692]
- Updated dependencies [acf8909]
- Updated dependencies [ca8f4b2]
- Updated dependencies [2d5ea72]
- Updated dependencies [d2c14d7]
- Updated dependencies [cd8e857]
- Updated dependencies [5893a5e]
- Updated dependencies [aed179e]
- Updated dependencies [c888ba6]
- Updated dependencies [c888ba6]
- Updated dependencies [c888ba6]
- Updated dependencies [0fa0de3]
- Updated dependencies [f1af83d]
- Updated dependencies [55b2d6e]
  - @coreloom-uml/api@0.2.0
