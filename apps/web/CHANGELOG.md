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
- 7e1c994: Agent roles screen, behind the `agent-roles` flag: the "Agent conventions" tab lists a
  configuration's roles, adds one from the ready-made roles (searchable) or writes one from scratch,
  edits and deletes them. Ticking a right adds the rights it needs. Each generation shows, per role
  and tool, what the tool enforces, what is only an instruction, and the command that starts it.
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
- 977bc4f: Architecture cards can be ticked, on the page of all architectures and on a project's page, and the
  ticked ones moved to a project or deleted at once from the selection bar.
- b87c6e1: Behind the `assistant-actions` flag, the assistant decides by itself what a message needs: an answer, work on an architecture's diagrams, rules read from the web, or actions on your work. "Auto" becomes the default subject of a message; the other choices stay to force one. The assistant can propose creating or renaming a project, creating, renaming or duplicating an architecture, and adding, editing, removing or holding rules of agent conventions. Each proposal is a card to accept or reject: nothing changes before you accept it.
- 752475b: With code maps on, the assistant reads a project's code maps, how its diagrams match the code and the links of a diagram, and can propose to map a GitHub repository (its full address, branch and follow shown on the card), delete a code map or a conformance review, stop following a repository, add or remove links between a diagram and the code (only the links it names change, each one listed on the card), and mark a review finding done, dismissed or open again. Nothing runs before you accept: the repository is only read once you accept the import. The import's card also says when it pushes out the project's oldest code map and what the project follows now when it changes that; if the import cannot be started, the card says so instead of showing it as accepted. Starting a review, drawing from code and uploading a map stay on the Code tab.
- 4c651cd: Any diagram on request, drawn from a code map, behind the `code-maps` and `diagram-assistant`
  flags. "Ask the assistant" on a project's Code tab opens the assistant of one of its architectures
  with "Draw from the code" switched on; the switch is also there whenever the architecture's project
  has a ready map. With it on, a message is a request for one diagram in the user's own words: their
  model first names the code the request is about, from the outline of the map (now with the
  folders, classes, functions and methods whose name holds a word of the request), then draws that
  part of the map. The view arrives in the conversation as a change to accept, with its links to the
  code; when nothing matches, the assistant says so and draws nothing. Names, paths and links only,
  never source code.
- 507f402: Diagrams drawn from a code map now read the source code of the files concerned, so that they show
  the logic and not only the structure. Before a sequence, activity or class diagram is drawn (a
  message of the assistant with "Draw from the code", "Draw" on a proposed diagram, "Propose a
  diagram" on a process), the server reads on GitHub, at the map's commit, the files of the code the
  view covers: at most 8 files, 12,000 characters each and 48,000 in all, a large file cut to the
  lines around the functions concerned. A private repository is read through the GitHub App with a
  token made for that read and revoked at once; a public one is read anonymously. The code goes to
  the user's own model for that call and is never stored, logged or returned. The answer ends with
  what was read, or why nothing was (no GitHub repository, no commit, repository not readable, files
  not found at that commit), in which case the view is drawn from the structure as before. Package
  and component diagrams read no source.
- 5d991bf: A file you attach to the assistant now stays with the conversation: attach it once, and the next messages go on from it without attaching it again. When you attach it, your model summarizes it part by part. Each message then carries that summary, and the assistant reads only the passages it needs: in « Auto » it searches and reads the file itself, otherwise the passages your request is about are sent with it. The file's text is kept until you delete the conversation or your account, and it is never shown in logs. A conversation holds up to four files.
- c807155: The assistant can now propose deleting a project, an architecture or agent conventions, changing who can open an architecture, and replacing an architecture's share link or access code. A deletion's card lists what goes with it (architectures, diagrams, agent conventions, code maps and reviews, rules, roles, generations) and a sharing change shows the visibility before and after; a change that cannot be undone has a red accept button. If what a card says is no longer true when you accept it (the project gained an architecture, the visibility changed), nothing is applied: the card is refreshed for you to read again. The assistant never sees a share link or an access code: you read the new ones on the architecture's sharing screen.
- 5f83360: The assistant opens from every page: an "Assistant" button in the header shows the same panel and
  the same conversations as on an architecture's page. A conversation now belongs to your account
  instead of one architecture, so it can cover several of them: each message says which architecture
  it is about (or none, for a plain question), and a proposed view change can be accepted, rejected
  or undone from any page, with a link to its view. Deleting an architecture keeps its conversations;
  their proposed changes simply no longer apply.
  
  "From the web" makes agent conventions from web pages inside the conversation: your model reads the
  pages your message names, the steps show live under the message, and the rules it proposes stay in
  the conversation, with the pages read, until you have added the ones you keep.
- 6e566c5: The file you attach to a message of the assistant can now be a PDF, and can hold up to 600,000 characters of text instead of 60,000. A PDF is read in your browser, and a scanned one, which holds no text, is refused. A long file (past 60,000 characters) is first read by your model part by part, into notes the message then carries: this costs one reading of the file with your key, and the notes keep what it states about systems and rules, not every detail. Neither the file nor the notes are stored.
- 4e03f08: You can attach a text file (Markdown, plain text, JSON, YAML…, up to 60,000 characters) to a message of the assistant. In « Auto », it reads the file and proposes what it calls for, each as a card you accept or reject: a project, an architecture, and new agent conventions with the rules the file states (every rule listed on the card, ready-made rules of the catalog preferred), and it names the skills of the catalog that fit, with their links. The views of an architecture are drawn afterwards: accept the architecture, then ask for its views with the file attached again. The file goes to your model with that message only: the conversation keeps its name, never its content.
- 5d991bf: In « Auto », the assistant can now read the GitHub repository of a project to answer a question about its code: it lists, searches and reads its files, and its reply lists the files it really read. The repository is cloned once per conversation in an isolated sandbox that holds no key or token, paused between messages, and removed when you delete the conversation or your account, or after seven days unused. When a reading takes more steps than one message allows, the assistant goes on by itself a few times. Behind the `assistant-repository` and `code-maps` flags.
- 5b915aa: The workspace assistant can now propose changes to the roles of agent conventions (add a ready-made role or one written out, edit or remove a role) and render the conventions' files, which you then pull with the CLI. Each proposal waits for your answer: a card names the role or the revision the files are rendered from, says when the oldest generation is dropped to make room, and is refreshed instead of applied if the role or the conventions changed since. Role proposals are offered only while roles are turned on for your account.
- 60da17f: The web research for agent conventions now works with a connected Claude subscription. The
  `claude` binary still gets no tool: at each step it names which page to read or command to run,
  and the server runs it in the sandbox. A research is slower this way than with an API key.
- 3e1ca12: Code maps API, behind the `code-maps` feature flag: a project stores maps of its code uploaded as
  graphify's `graph.json` or sent by the CLI (`POST /projects/:id/code-maps`, kept gzipped in object
  storage, the 5 newest per project), lists and reads them with a summary of folders, communities and
  entry points, and matches its diagrams against one (`GET|PUT /code-maps/:id/links?diagramId=`),
  keeping the links the owner confirms or ignores. Projects now report `codeMapCount`.
- bc05f7a: Conformance review of a project's diagrams against its code map, behind the `code-maps` flag. A
  new "Conformance review" view in the Code tab starts a review of the chosen package, component,
  class, sequence and C4 diagrams; the browser then asks the user's own model about each diagram in
  turn (`POST /code-reviews/:id/diagrams/:diagramId`, one call each, counted against the LLM limit,
  the key used for that call only). The model reads the diagram, its links to the code, the
  deterministic checks and the slice of the map around the linked places: names, paths and links,
  never the code. Every finding must cite places it was given, or it is set aside. Findings are
  stored with the review, shown as badges on the drawing and as cards with their evidence (linked
  to the repository at the map's commit), and marked done, dismissed or open again. A project keeps
  its ten newest reviews; a review outlives its map.
- 3129f95: Code tab on a project page (behind the `code-maps` flag): add a code map (the CLI command and a GitHub Actions workflow to copy, or a graph.json upload), read it (repository, counts, folders, communities, entry points), compare each diagram with it (a status on every element, links to accept, correct or dismiss, and what the code says the diagram misses) and list the processes no diagram documents. `GET /code-maps/:id/processes` lists those processes. The app's diagrams take coreloom-ui's element annotations and the finding card.
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
- 77531c8: The diagram assistant now reads before it draws: when a request about an architecture's views needs it, it first reads the project's repository and its history, its code maps and their conformance, and the conversation's files, then draws or changes the views from what it read rather than from a README. What it read, and the files it opened, show in the conversation. A request about the views alone reads nothing. Behind the `assistant-actions` flag; the repository needs `assistant-repository` and `code-maps` too.
- ec0489a: Import a diagram file, from coreloom-ui:
  
  - The editor's top bar has an **Import** button: a Mermaid, PlantUML or JSON file replaces the open diagram's text.
  - The workspace's Add menu ends with **Import a file…**: the file becomes a new view of the architecture, named after the file, and is saved like any other view. A file whose text can't be read yet opens as a draft, saved once it reads.
- b0c7418: Proposed diagrams for a code map, behind the `code-maps` flag (drawing also behind
  `diagram-assistant`). When a ready map is first shown with an LLM provider set, the user's own
  model reads an outline of the map (folders and their imports, the most linked classes, where
  processes start: entry points, or functions nothing in the repository calls; never the code) and
  proposes up to 8 views: package, component, class, sequence or activity diagrams. They are listed
  in the Code tab's new "Proposed diagrams" view, which can ask again. Each one is drawn on request
  as a new view in a new assistant conversation, accepted there with its links to the code, or set
  aside. The "Undocumented processes" view now says when no entry point was recognised, and every
  reader of a stored map detects its entry points again with the current rules.
- ead6815: Diagram files can be dropped on an architecture's workspace, from coreloom-ui: a dashed hint shows while they are held over it, and each dropped file becomes a new view, named after the file and saved like any other. Several files are added one after the other, in the order they were dropped.
- d031550: Conformance findings in the architecture editor, behind the `code-maps` flag. When the newest
  review of the project has looked at the open view, its elements carry the review's badges (worst
  finding, open count) and a "Findings" button with the number still open appears in the toolbar.
  The button, or a badge, opens a panel docked beside the workspace like the simulation: the
  findings as cards, narrowed to the element whose badge was pressed, to mark done, dismiss or open
  again, with a link to the review in the Code tab. "Show in diagram" outlines the element on the
  drawing. The Code tab and the editor share the same finding list. Needs `DiagramWorkspace`
  annotations from coreloom-ui.
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
- c0c6b67: Code maps from private GitHub repositories, through a GitHub App. A user installs the App on the
  repositories it may read and connects GitHub from the Code tab ("From GitHub" card):
  `POST /github/connection` trades GitHub's code for a user token, lists the repositories the user
  reaches through the App, revokes the token and keeps only that list. Reading such a repository
  makes an installation token for it alone (`contents: read`), hands it to the analyzer for that
  clone and revokes it; no GitHub token is ever stored. A project can follow a repository
  (`follow: true`, `GET|DELETE /projects/:id/code-maps/github/follow`): the signed
  `POST /github/webhook` reads it again on each push to its branch. Set the six `GITHUB_APP_*`
  variables on the API and the queue worker (see the README); without them only public repositories
  are read.
- 9c7c7ba: Create the GitHub App from the settings instead of setting six environment variables. The admin
  opens Settings → GitHub App, picks the owner (their account or an organization) and clicks
  "Create on GitHub": the browser posts a manifest to GitHub (GitHub's manifest flow), GitHub asks
  to confirm the name and comes back to `/github/app-created`, and `POST /admin/github-app` trades
  its code for the App's settings and secrets. They are stored encrypted with `APP_KEY` and never
  answered or logged. The section shows the App with links to its GitHub pages and removes it
  (`DELETE /admin/github-app`, which also forgets every repository read through it). The
  `GITHUB_APP_*` variables still win when all six are set. New optional `API_URL` (the API's public
  address, for the App's webhook URL); without a public HTTPS address the App is created without a
  webhook. The web container's CSP now allows posting a form to `https://github.com`.
- 587d19b: Code maps from GitHub: a project's Code tab can read a public github.com repository itself.
  `POST /projects/:id/code-maps/github` (`{ url, branch? }`, 202) creates a pending map that
  `ImportGithubCodeMapJob` fills on its own `code-maps` queue, through the new analyzer service
  (`apps/analyzer`, Python with graphify pinned, no secret, never published): a shallow clone with no
  submodules, symlinks, hooks or credentials, at most 200 MB, 20,000 files and 5 minutes, then
  deleted. The web app's "From GitHub" card takes the repository and branch and polls the map until
  it is ready or failed. Set `ANALYZER_URL` (the compose stacks run the `analyzer` service);
  unset, the import answers 503.
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
- 39d6030: Several agent conventions can be merged into new ones, and the ones merged stay as they are. `POST /agent-configs/merge` takes the configurations to merge and a name: ready-made rules, your own rules, notes, roles and tools add up, duplicates dropped, and the result is created outside any project, without a generation. What cannot be held together (the rules of a group, two different roles with one slug) is answered as `conflicts` and nothing is created until `choices` names, for each, the configuration whose version is kept. The Agent conventions page gains a Merge button that asks for those choices.
- b5d0b7f: Agent conventions gain three questionnaires next to the React front end one: `backend-node` (API style and compatibility, input validation at the boundary, error handling, logging, database access, migrations and layering), `git-workflow` (worktrees and branches, commit messages, what the assistant may commit and push, pull request size, what is never committed, history rewriting, crediting the assistant) and `security` (secrets, adding dependencies, exact versions or ranges, untrusted input, destructive commands, network access, authentication and cryptography code). Each feeds only its own slots (`api.*`, `errors.*`, `logging.*`, `database.*`, `git.*`, `security.*`), so any of them can be combined in one configuration, and new conventions can now pick several questionnaires at once. `frontend-react` and the answers already saved are unchanged; the catalog is at 0.6.0.
- aa09083: Undocumented processes proposed as new diagrams, behind the `code-maps` and `diagram-assistant`
  flags. In the Code tab's "Undocumented processes" view, "Propose a diagram" asks the user's own
  model to draw the calls followed from an entry point as a sequence (default) or activity diagram
  (`POST /code-maps/:id/processes/propose`, one call, counted against the LLM limit, the key used
  for that call only). The model reads names, paths and calls, never the code; the diagram is
  checked against the schema with one repair call. The proposal lands in a new conversation of the
  chosen architecture's assistant, which opens on it, to accept, reject or undo like any other
  change. Accepting it stores the code places each element was drawn from as confirmed links, so
  the process no longer shows as undocumented.
- 3ea8692: Projects: the top-level container of an account's design work. Architectures now belong to a project (existing ones are moved into a "Default project" per account), can be moved between projects, and the API gains `/projects` (with API keys) and a `projectId` on architectures. The app opens on the projects list; `/architectures` redirects there.
- f45234b: Agent conventions: ready-made rules replace the questionnaires. The catalog's rules are browsed
  in a library (by pack, searched, filtered) and accepted one by one, like ready-made roles; the
  ones that also produce a settings file, a Git hook, the CI workflow or the container are marked.
  There is nothing left to answer: the questionnaire screen, the stored answers and their "more
  details" notes are removed (stored answers are deleted by the migration), `GET /questionnaires`
  becomes `GET /rule-packs` and `PUT /agent-configs/:id/answers` becomes
  `PUT /agent-configs/:id/ready-rules/:slot`. Importing an existing conventions file now proposes
  ready-made rules to accept, and rule proposals read the diagrams or pasted feedback.
- ab25e2f: Web research: while the model works in its sandbox, the steps are shown as the screen of a small
  terminal (« The assistant's computer »): each page read as the `curl` the sandbox runs, each command
  as typed, then how it ended, following the end as steps arrive. Same data as before: addresses and
  commands only, never a page or an output.
- 457fee8: Activity diagrams can be compared with the code. Their actions are linked to functions (proposed
  by name, or linked by hand in the Code tab; a diagram drawn from a code map already has its links)
  and their partitions to classes, files or folders. The conformance review then reads the source of
  those functions and checks the order of the actions, the decisions and their guards. An action
  described in prose that matches nothing is not reported.
- 457fee8: The conformance review can read the source code. When a review is started with "Read the source
  code of class and sequence diagrams" (checked by default), the files of those diagrams are read on
  GitHub at the map's commit and sent to your model with the map, so it also checks the order of
  calls, conditions, loops and error paths. Nothing of the code is kept; each diagram of the review
  says how many files were read, or why none was. The browser no longer sends code excerpts itself.
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
- 60da17f: Agent conventions from a web resource (behind the `web-research` flag, with `E2B_API_KEY` on the
  server): in the import panel, « The web » takes what to look for and the addresses of the pages to
  read. The user's own model reads them through tools that run in an E2B sandbox (E2B Cloud, or a
  self-hosted install with `E2B_API_URL` and `E2B_SANDBOX_URL`), then proposes ready-made rules and
  rules of the owner's own, reviewed and accepted as for a file, with the pages read listed above
  them. While the pages are read, the panel lists each address read and each command run as it happens.
  The key never reaches the sandbox and nothing of the research is stored or logged once it ends.
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

- 47d5744: Project page: under each architecture, a badge says where its diagrams stand against the project's
  newest code map (in step with the code, behind the code, contradicted by the code) and opens the
  Code tab on the first diagram the code disagrees with.
- 6e7dc68: Better answers from the workspace assistant: the model is given the diagram format of every kind (so it can create a view of a kind the architecture has none of), is told which views did not fit instead of ignoring them, sees why an earlier proposed change failed, writes its reply in Markdown and asks a question when a request is ambiguous.
- b93f9d8: Code tab: the entry points and the reviewed links are tables that can be searched, sorted and read
  ten rows at a time, and the undocumented processes get a search box and pages, instead of lists
  shown whole.
- 72dc33a: Code tab: the map view opens on where the diagrams stand against the code (diagrams compared,
  findings where the code contradicts a diagram, findings where a diagram is behind the code,
  undocumented processes), the « Diagrams » and « Undocumented processes » views show their count on
  their tab, and the project's « Code » tab shows the findings of its newest map.
- 686c937: Code tab header: « Delete this map » moves into a « more actions » menu and asks in a dialog, the
  repository the project follows shows beside the map version, and a map still being read says
  whether it waits or is being read, for which repository and since when.
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
- c8df8ae: Agent conventions are picked for a merge in the list itself: each row has a checkbox, and a bar shows how many are picked with the Merge action. The Merge button of the page header and the picker inside the dialog are gone.
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
- ec09d5d: Pages use more of a large screen: the content area now stops at 1600px instead of 1200px, and the
  architecture list shows a fourth column on very wide screens. In a project's code tab, the views
  and the map they read share one row, the diagram is as tall as the window and stays in view while
  its links or findings scroll, and a long list of findings flows into two columns. The settings
  forms keep a readable width, and a project's tabs scroll on a narrow screen instead of widening
  the page.
- Updated dependencies [e992f9c]
- Updated dependencies [a580df0]
- Updated dependencies [8ccf1cf]
- Updated dependencies [e941f65]
- Updated dependencies [dea89e4]
- Updated dependencies [438949b]
- Updated dependencies [19f15df]
- Updated dependencies [1c17dba]
- Updated dependencies [1639e4c]
- Updated dependencies [7871b4b]
- Updated dependencies [6d3ebf4]
- Updated dependencies [b87c6e1]
- Updated dependencies [752475b]
- Updated dependencies [4c651cd]
- Updated dependencies [507f402]
- Updated dependencies [5d991bf]
- Updated dependencies [c807155]
- Updated dependencies [5f83360]
- Updated dependencies [6e566c5]
- Updated dependencies [4e03f08]
- Updated dependencies [6e7dc68]
- Updated dependencies [fdc2539]
- Updated dependencies [5d991bf]
- Updated dependencies [5b915aa]
- Updated dependencies [59443f3]
- Updated dependencies [60da17f]
- Updated dependencies [986c163]
- Updated dependencies [64b223c]
- Updated dependencies [3e1ca12]
- Updated dependencies [bc05f7a]
- Updated dependencies [dade74e]
- Updated dependencies [3129f95]
- Updated dependencies [b57eaa1]
- Updated dependencies [82512f7]
- Updated dependencies [0284957]
- Updated dependencies [77531c8]
- Updated dependencies [b0c7418]
- Updated dependencies [191017d]
- Updated dependencies [d0683b6]
- Updated dependencies [0615f80]
- Updated dependencies [15c93fc]
- Updated dependencies [c0c6b67]
- Updated dependencies [9c7c7ba]
- Updated dependencies [587d19b]
- Updated dependencies [bc229e6]
- Updated dependencies [f399d1e]
- Updated dependencies [61a5d19]
- Updated dependencies [cf2df6d]
- Updated dependencies [8a91963]
- Updated dependencies [6458237]
- Updated dependencies [39d6030]
- Updated dependencies [b5d0b7f]
- Updated dependencies [3015e11]
- Updated dependencies [aa09083]
- Updated dependencies [42d01dd]
- Updated dependencies [3ea8692]
- Updated dependencies [f45234b]
- Updated dependencies [457fee8]
- Updated dependencies [457fee8]
- Updated dependencies [d500a9a]
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
- Updated dependencies [60da17f]
- Updated dependencies [f1af83d]
- Updated dependencies [55b2d6e]
  - @coreloom-uml/api@0.2.0
