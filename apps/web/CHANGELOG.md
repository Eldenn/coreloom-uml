# @coreloom-uml/web

## 0.2.1

### Patch Changes

- cc870e2: Agent conventions can be deleted from their list: right-click a row and choose Remove, with the same confirmation as on their own page.
- Updated dependencies [825bd4b]
  - @coreloom-uml/api@0.2.1

## 0.2.0

### Minor Changes

- 1cebc8b: Agent conventions hold skills chosen freely among those with an approved copy, suggested or not:
  an "Installed skills" card adds and removes them (`PUT /agent-configs/:id/skills`, the
  `installable` filter of `GET /skills`), each generation records them, and `coreloom-uml pull`
  installs their approved copies into the skills folders of the conventions' coding tools.
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
- d93a1cf: An architecture now has a history: the « History » button of the editor keeps the current state of all its views as a named milestone (a release, a target, a state before a migration). A milestone can be compared, view by view, with the current state or with another milestone, restored (the views go back to it, and the ones added since are deleted) or deleted. An architecture keeps at most fifty milestones.
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
- 5525ea1: The assistant manages agent conventions at every level: it can change their name, notes, tools and project, stop holding a ready-made rule, add or remove the skills they hold, merge several of them (asking which source to keep for each conflict) and suggest roles. It also reads their tools, notes and skills, and `find_skills` says which skills they can hold.
- e87b192: The assistant's reply appears as the model writes it, through the AI SDK's `useChat`: in « Auto », the assistant says when it is reading your work between two steps, and Stop cancels the call (nothing is stored, the message comes back to the field). The API answers the AI SDK's UI message stream when asked for one, and JSON otherwise; the stream carries the reply's text and the names of the tools called, never what a tool read.
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
- 53fa400: The assistant floats over every page: one launcher in the corner opens it in a card that never takes room beside the page, in place of the "Assistant" buttons of the header, of an architecture's toolbar and of a project's Code tab (drawing from a code map moves to the map's menu). A right-click on a project, an architecture or agent conventions opens its usual actions and adds it to the assistant's context; a message can hold up to eight items, which the assistant reads and compares. The "About" picker is gone: one architecture alone goes to its diagrams, anything else is left to the assistant.
- 5d991bf: In « Auto », the assistant can now read the GitHub repository of a project to answer a question about its code: it lists, searches and reads its files, and its reply lists the files it really read. The repository is cloned once per conversation in an isolated sandbox that holds no key or token, paused between messages, and removed when you delete the conversation or your account, or after seven days unused. When a reading takes more steps than one message allows, the assistant goes on by itself a few times. Behind the `assistant-repository` and `code-maps` flags.
- 5b915aa: The workspace assistant can now propose changes to the roles of agent conventions (add a ready-made role or one written out, edit or remove a role) and render the conventions' files, which you then pull with the CLI. Each proposal waits for your answer: a card names the role or the revision the files are rendered from, says when the oldest generation is dropped to make room, and is refreshed instead of applied if the role or the conventions changed since. Role proposals are offered only while roles are turned on for your account.
- 0985603: The assistant's chat now shows what it is doing while it writes a reply: each tool it calls, as it
  starts and ends, and for the repository sandbox what it asks of it (the file read, the text
  searched, the commit shown, the command run) and what a command prints, as it comes. The API sends
  it as `data-activity` parts of the streamed reply; it is shown live only and never stored, so it
  is gone once the reply is. A file's text and the result of a tool that reads the account are still
  never sent.
- dd48a8a: The owner gets a terminal of their own in the sandbox where the assistant reads a conversation's
  repository: « Sandbox terminal » in the chat opens it, and each command is run there the way a
  command of the assistant is (from the clone, 30 seconds at most, its output capped, no network).
  It uses the sandbox as the assistant left it and never clones: before the assistant has opened a
  repository in the conversation, the terminal says so. Nothing typed or printed is stored.
- 60da17f: The web research for agent conventions now works with a connected Claude subscription. The
  `claude` binary still gets no tool: at each step it names which page to read or command to run,
  and the server runs it in the sandbox. A research is slower this way than with an API key.
- 3e1ca12: Code maps API, behind the `code-maps` feature flag: a project stores maps of its code uploaded as
  graphify's `graph.json` or sent by the CLI (`POST /projects/:id/code-maps`, kept gzipped in object
  storage, the 5 newest per project), lists and reads them with a summary of folders, communities and
  entry points, and matches its diagrams against one (`GET|PUT /code-maps/:id/links?diagramId=`),
  keeping the links the owner confirms or ignores. Projects now report `codeMapCount`.
- 2bef10b: Code maps from GitHub are now read in an E2B sandbox, the same kind the assistant reads a
  repository in, and the analyzer service is gone (`apps/analyzer`, its image and `ANALYZER_URL`).
  `ImportGithubCodeMapJob` opens one sandbox per import, which clones one commit of the repository
  and runs graphify on it with two fixed command lines; only graphify's `graph.json` leaves the
  sandbox, and the code never reaches the server. A private repository's token goes to the clone
  only, never to graphify. The limits are unchanged (200 MB, 20,000 files, 5 minutes).
  
  The source read for a drawing or a conformance review goes the same way: a sandbox fetches the
  map's commit and the files are read there, so the server asks GitHub for no file any more. A map
  whose commit id is shortened (one uploaded by hand) is drawn from the structure only.
  
  The owner's model can now run commands of its own on the code. The workspace assistant gets
  `run_repository_command` (one bash command in the conversation's sandbox), and before a diagram
  is drawn from a code map or checked against it, the model may run a few commands at the map's
  commit: what they printed is read with the source files. A sandbox is cut off every network
  before the model runs anything in it, and holds no secret: a private repository's token goes to
  the clone only. So nothing is fetched after the clone any more: it now takes the files of the
  whole history when they fit, and for a larger repository `show` and `blame` say they lack the
  older files. The `openai-codex` subscription, which carries no tool call, draws as before.
  
  **E2B is now a prerequisite of a deployment.** Set `E2B_API_KEY` (and `E2B_API_URL` /
  `E2B_SANDBOX_URL` for a self-hosted install) on the `migrate`, `api` and `queue-worker` services:
  the staging and production stacks refuse to start without it, and without it importing from GitHub
  answers 503. Remove `ANALYZER_URL` and the `analyzer` service. `node ace assistant:setup`, already
  run on every deploy, builds the sandbox template (E2B's base template plus graphify, pinned) on
  the E2B install the first time; run it once locally too.
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
- 9901695: With several elements, relations or sequence steps selected in a drawing (Ctrl or Cmd-click, or Select area), a right-click on one of them acts on all of them: Duplicate and Delete take the whole selection, and "Add N to the assistant's context" adds each as its own chip.
- 44a0f2b: The admin sets the cost cap of a convention test for the whole instance in Settings (between 1 and 100 US dollars, 5 until changed). A test already running keeps the cap it started with.
- 676bf0b: A decision can name parts of the diagrams it shapes, not only whole diagrams: an element, a relation, a member or a step, each by its diagram and the one line that names it there (`parts` on `POST /projects/:id/decisions` and `PATCH /decisions/:id`, listed in a decision's output, in `list_decisions` and in the diagram assistant's prompt). The decision form lists the parts of the diagrams picked; the Design tab shows them next to their view and marks a part its view no longer has, which the design review reports too. The assistant's `add_decision` and `supersede_decision` can name parts, shown on their card.
- 90b2fdc: The assistant can now work on a project's requirements and decisions. It reads them, proposes a requirement, proposes a decision with the options weighed, and proposes to replace a decision that no longer holds: the new one is recorded and the old one stays, marked as superseded by it. Nothing is written before the owner accepts the card, which shows every option with what speaks for and against it. Behind the `design-records` flag.
- 676bf0b: « Design from a brief » on a project's Design tab: the owner says what they need to build, and the assistant leads a new conversation from it, one step at a time, to requirements, then to one decision with its options weighed, then to an architecture and its views. It asks first when the brief leaves out what the design depends on, and every step is a card the owner accepts. Behind the `design-records`, `assistant-actions` and `diagram-assistant` flags.
- b50626f: The review on a project's Design tab can now ask your own model: it reads the views of each architecture against the project's requirements and decisions, one call per architecture with your key, and reports where a view goes against an accepted decision or leaves a requirement unaddressed. Each finding names the requirement or decision it is about and the view that shows it, and you mark it done or dismiss it. A new review of an architecture replaces its earlier findings. Behind the `design-records` flag.
- 8625e1c: A project now holds its requirements and its architecture decisions, in a new « Design » tab. A requirement is one sentence someone can check (a quality to reach or a constraint to keep), with the measure that says it is met when there is one. A decision keeps the question, the options weighed with what speaks for and against each, the one chosen, what it costs, and the requirements and diagrams it is about; a decision replaced by another one stays, marked as superseded. The assistant reads both before it draws a view of the project: it keeps to the accepted decisions and says so when a request goes against a requirement. Behind the `design-records` flag.
- e80ee04: A project's Design tab now opens with a review of its requirements and decisions: a requirement that must hold and that no accepted decision serves, an accepted decision that names no diagram, a superseded decision still named on diagrams. It is read from what is written there each time, with no model call, and the assistant can read it too. Behind the `design-records` flag.
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
- b343bef: Diagrams are easier to read: a line now goes round the boxes instead of through them, lines that
  share a path run side by side, and a label is placed where it covers no box and no other label.
- ec0489a: Import a diagram file, from coreloom-ui:
  
  - The editor's top bar has an **Import** button: a Mermaid, PlantUML or JSON file replaces the open diagram's text.
  - The workspace's Add menu ends with **Import a file…**: the file becomes a new view of the architecture, named after the file, and is saved like any other view. A file whose text can't be read yet opens as a draft, saved once it reads.
- d9c21bf: Diagrams: the Download menu of a view (editor and shared viewer) has a PDF entry, which opens the
  browser's print dialog on the drawing alone, in the light theme, on a page of its size. SVG and PNG
  images are fixed: an SVG has its background behind the whole picture (a strip was left without it
  along the top and the left), and an image holds the lines and labels that go around the boxes
  instead of cutting them at the outermost box.
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
- fe5ddb3: A generation lists the files of the skills its convention holds, as `coreloom-uml pull` installs them, to read and download like the other files.
- cbe7297: When a background job of the admin's header ends, the screens showing what it changed read it
  again: the skills catalog after a search, a sync, a scan or a tagging, the Watch after a refresh,
  a project's code maps after an import or a push.
- 2025c8c: Every LLM credential is now kept in the database, sealed by a dedicated encrypter
  (`LLM_KEYS_ENCRYPTION_KEYS`, separate from `APP_KEY`), whatever the provider:
  
  - Provider API keys are saved to the account (`PUT` / `DELETE /llm/api-keys/:kind`, one per kind,
    saved only after a successful test call) and read by every model call; a request body no longer
    carries a key or a base URL, and the settings screen saves, replaces and deletes the key. A key
    an older browser entry still holds is offered for saving once, then dropped.
  - ChatGPT subscription tokens move from `APP_KEY` to the dedicated encrypter (a migration seals the
    existing ones again; the code no longer reads an `APP_KEY` token).
  - Every stored LLM secret is bound to its owner's account as well as its kind: a ciphertext copied
    to another account's row never decrypts there. A migration seals the saved keys again that way.
  - A Claude subscription is still signed in and called by the official `claude` binary alone, but its
    state now lives in the new `claude_code_states` table instead of a folder per account: each launch
    of the binary gets it in a short-lived private folder, writes back the tokens it refreshed, and
    the launches of one account run one at a time. `node ace claude:import`, run at every start in the
    Compose stacks, moves the existing account folders into the database and removes them.
  
  Deploying this version takes a maintenance window, once:
  
  1. Set `LLM_KEYS_ENCRYPTION_KEYS` (the API refuses to start in production without it; `migrate`
     and `queue-worker` get it too, the skill workers do not need it).
  2. Stop `api` and `queue-worker` before the deploy starts, and start them only on the new image.
     The image before cannot read the tokens and keys the migrations seal again (it deletes a
     ChatGPT connection it cannot read), and it uses the Claude folders without the lock that
     `claude:import` takes: running while `migrate` runs, it signs accounts out.
  3. Deploy: `migrate` runs the migrations, then `claude:import`, which moves the Claude account
     folders of the `/data/claude` volume into the database. Its log line counts the folders moved,
     left in place (credentials that cannot be read whole) and purged.
  4. `api` now keeps its launch folders in memory (`tmpfs`); the volume is only `migrate`'s, and can
     be dropped once the import has run.
  
  Rolling back is not free: `migration:rollback` seals the ChatGPT tokens with `APP_KEY` again and
  the saved keys for their kind alone, but drops `claude_code_states`, whose folders the import
  removed, so every Claude subscription has to be connected again. An image rolled back without the
  migrations' rollback reads none of the tokens and keys, and deletes every ChatGPT connection.
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
- 676bf0b: A coding agent can tell the owner it had to deviate from the design. With an API key that has the `write` ability, the MCP server offers `propose_decision`: the agent records the question, the options it weighed, the one it went with and, if any, the decision that no longer holds. It is stored as a proposal the owner reviews on the project's Design tab (Keep or Dismiss) and counts for nothing until kept: the assistant, the design reviews, the generated AGENTS.md and the MCP tools leave it out. At most ten wait per project. Behind the `design-records` flag.
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
- df45b81: The administrator sees the background jobs in the header: what runs, what waits and what ended in
  the last ten minutes, from every queue (`GET /admin/jobs`, names, states and times only, never a
  job's data; mail is left out). The panel opens by itself when a job is launched from the Skills
  screen (a catalog search, scans, a skill's sync), and is read again every two seconds while one
  runs.
- 174ee4c: The sandbox terminal shows what a command prints as it prints it, and gives a command more room.
  
  - What a command prints appears in the terminal as it comes, instead of all at once when the
    command ends.
  - A command of the terminal may run two minutes (30 seconds before) and print 200 000 bytes
    (20 000 before). The assistant's own commands keep their limits.
- 4d6a0b6: The sandbox terminal behaves like one, and a conversation's sandbox stays awake between uses.
  
  - A conversation's repository sandbox stays awake five minutes after its last use (a message or a
    command of the terminal), then pauses by itself: the next use within that time waits for no
    resume. A sandbox made before this change is cloned again the first time it is used past that
    delay.
  - The terminal keeps the folder you `cd` into from one command to the next and shows it in its
    prompt (a variable is not kept), and Ctrl+C stops the command in the sandbox.
  - « Sandbox terminal » is shown only once the assistant has opened a repository in the
    conversation.
  - The terminal has its own limit, 60 commands a minute.
  - Fixed: every route of an assistant conversation counted in the limit of calls to a model (10 a
    minute), and a message counted twice. Only the routes that call a model count now, once.
- 9f438ea: The UML model and its Mermaid, PlantUML and JSON conversion move to a shared `@coreloom-uml/uml`
  package, which the API can use as well: it adds `validateDiagram`, `parseDiagramText`,
  `formatDiagramText` and `detectDiagramTextFormat`. The web app reads it from there; diagrams behave
  as before.
- ca8f4b2: Use coreloom-ui's new blocks: the editor is the Coreloom diagram workspace (views list, rename,
  reorder, save status) with the Share dialog; the gallery shows diagram cards with thumbnails; share
  links open a read-only diagram viewer, behind the access-code gate when protected. Component and
  package diagrams are accepted.
- 0401e3b: The admin reviews computed skill affinities. Behind `computed-skill-affinities`, the Skills page
  has an « Affinities to review » tab: the pairs of a skill and a ready-made rule the search
  proposed, the ones already suggested by themselves first, then the skills no written affinity ties
  to a rule, then by cosine. Each is accepted, rejected or marked as going against, and a skill's
  sheet lists its own pairs, decided or not, so a decision can be undone
  (`GET`/`PATCH /admin/skill-affinity-reviews`). A generation whose rules no skill fits says so and
  sends the owner to the skills they can pick themselves.
- ecd0fa9: The weekly skills refresh copies the files of every skill it may suggest, once per content, and the admin reads each copy against the last approved one before approving or rejecting it: only an approved copy will ever be installed.
- 9b6c3fe: Each copy of a skill is scanned with NVIDIA's SkillSpector before the admin may approve it. The scan
  runs in a new `skill-scanner` worker (the API's worker in its own image, with SkillSpector pinned)
  on the `skill-scans` queue; the review screen shows the verdict and every finding, and a copy that
  is not scanned whole can only be rejected; one SkillSpector recommends not installing too, unless
  the admin approves it despite the scan with a written reason, kept on that copy only.
- daf4b7a: The review of a skill's copy opens on the CodeReview block: a fixed-height dialog with the scan's verdict on top, the files in a tree beside one scroll of diffs (SKILL.md first, unified or side by side, "Viewed" per file, an executable file and the scan's findings marked in the tree), and Approve / Reject always in view with the count of changed files not yet marked as viewed.
- 001f057: Skills the admin approved can be installed. `GET /skills/:slug/copy` serves the newest approved
  copy of an active, eligible skill (never a pending one, never from GitHub), and the new
  `coreloom-uml skills add <id>... --target <tools>` writes it into each tool's skills folder
  (`.agents/skills`, `.claude/skills` or `.github/skills`), asking before it replaces or deletes a
  file there. `pull` and the generation page show each skill's id.
- bb3a208: The admin can ask their own model to read a skill copy next to SkillSpector's scan: it says of each finding and each unchecked passage whether it sees a risk there. A help to read, never a condition for approving.
- 4fcfdaf: The skills catalog reads Smithery as a second registry beside skills.sh (its top skills, only
  those of a verified publisher with a good quality score, trusted like a repository; it can be
  switched off, never removed), and a trusted GitHub repository with a
  `.claude-plugin/marketplace.json` is read as that marketplace says, the plugins it lists from
  other repositories included.
- bb3a208: A skill copy's sheet lists the passages SkillSpector left unchecked (file, lines and why). A copy whose scan is missing, failed, incomplete or recommends against it can still be approved: a dialog warns the admin and takes their written reason.
- 54f23d1: A GitHub source is added from its github.com address (a repository or one of its folders), and
  `anthropics/skills` is a trusted source of every install.
- 58fb73d: The skills catalog reads several sources: skills.sh by default and the GitHub repositories of
  trusted publishers, which the administrator adds, switches off or removes from the Skills screen's
  **Sources** (`/admin/skill-sources`). A skill a trusted repository lists needs no installs or audit
  to be suggested (a bad skills.sh audit still counts), its copy is scanned and approved like any
  other, a source that fails no longer stops the others, and with skills.sh switched off its skills
  keep their last figures. A skill's sheet says which sources found it.
- 43ec4f2: Skills are tagged by a classifier that learns from tags set by hand: an embedding model
  (Qwen3-Embedding-0.6B, pinned) reads each skill once, and a regression fitted on every label tags
  the catalog, in a new `skill-tagger` worker. It starts from 224 skills tagged by hand, and the
  admin sets a skill's tags from its sheet: they replace the tagger's at once, and the tagger learns
  from them within a minute. Its tags replace those of the search queries, which stay while a skill
  is not tagged; a name or description naming React, TypeScript or a mobile stack keeps that narrow
  tag. A skill not read on GitHub takes the description of its skills.sh page, so it can be tagged.
- 966c9e2: Tags cross agent conventions with skills and roles. Each ready-made rule is tagged through its
  slot, each found skill through the search that found it, each ready-made role by hand. A skill
  sharing a tag with the rules held is now suggested (after the ones whose affinities fit, never as
  conflicting), the role picker puts the roles sharing tags first with the skills that go with them,
  and the assistant's role and skill searches can filter by tag.
- 2b23da9: The admin runs the skills commands from the Skills page: start the skills.sh search, scan the copies waiting for a verdict or one copy again, stop suggesting a skill (with a reason) or suggest it again. "Sync now" in a skill's sheet replaces "Copy now": it reads the skill's audits and its pin again before copying it, for any skill that is not blocked.
- d2c14d7: Agent conventions suggest skills that fit the project's diagrams too (C4, Mermaid…) and show each
  skill's skills.sh security audits. The skills catalog now lives in the database: a weekly job
  searches skills.sh, keeps every skill it finds with its history, and suggests the ones whose
  installs, audits, licence and `SKILL.md` pass (`node ace skills:setup`, `skills:refresh`,
  `skills:block`).
- 3754c00: Skills page: the catalog comes first, under the four figures, and the charts move to a "Trends"
  tab (`?view=overview`). A topic of the Topics chart opens the catalog filtered on it, rows answer
  the pointer and keep their installs on the title's line, and the figures stand two by two on a
  phone.
- 361a22f: Skill copies are read from the Skills page: the admin filters the skills by their copies, opens a copy from the skill's sheet and can ask for a copy now. The separate "Skill copies" page is gone.
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
- 88c2ca1: A Watch page, behind the `tech-watch` flag: articles on AI and software engineering from the RSS
  and Atom feeds and the web searches (the instance's Linkup key) the admin picks, read once a day
  and kept 90 days (title, link, site, date and a short excerpt, never the page). The skill tagger
  tags them with the same topics as the ready-made rules and the skills; the admin corrects a tag,
  hides an article or blocks a site from its sheet. The workspace assistant reads them with
  `find_articles`.
- 140feb1: Each article of the Watch names the source that brought it: the feed (its title, else its address) or the web search (its query).
- 60da17f: Agent conventions from a web resource (behind the `web-research` flag, with `E2B_API_KEY` on the
  server): in the import panel, « The web » takes what to look for and the addresses of the pages to
  read. The user's own model reads them through tools that run in an E2B sandbox (E2B Cloud, or a
  self-hosted install with `E2B_API_URL` and `E2B_SANDBOX_URL`), then proposes ready-made rules and
  rules of the owner's own, reviewed and accepted as for a file, with the pages read listed above
  them. While the pages are read, the panel lists each address read and each command run as it happens.
  The key never reaches the sandbox and nothing of the research is stored or logged once it ends.
- 1353ea3: The web research and the assistant can search the web (behind the `web-search` flag): the admin
  saves one web search service for the instance (Linkup) in Settings, its key checked with the
  service first, sealed and never shown back. The research searches before it reads the pages worth
  it, each search listed with its steps; in « Auto », the assistant searches for what the owner asks
  about the outside world, shows each query as it runs and ends its reply with the number of
  searches. Only the query leaves; an account runs at most 50 searches a day, and no query or result
  is logged or stored.
- f1af83d: Agent conventions ask far more: 279 questions instead of 34. Five questionnaires are new (system
  design, software design and architecture, AI engineering, AI agents, front-end performance), and
  the front-end and back-end ones grow from 11 to 50 and from 9 to 52 questions (HTML, CSS and
  accessibility, rendering, data, front-end security; HTTP and caching, authentication and web
  security, runtime and operations). Every added question is optional, so a configuration that
  exists stays valid; it is listed as answered against an older version until it is opened again.
  One save can carry 500 answers instead of 200, and importing an existing conventions file sends
  up to 32,000 tokens instead of 16,000, so that the questions leave room for the file.
- 55b2d6e: A workspace assistant in the architecture editor, behind the `diagram-assistant` flag: conversations kept per architecture, answered by the user's own model, that read the architecture's views and propose view changes shown as diffs to accept, reject or undo, with a context gauge and a way to continue a long conversation in a new one from its summary.
- 68c57d8: A right-click in an architecture's workspace opens a menu on a view, an element, a relation, a member or a step of a sequence: its editing actions, then "Add to the assistant's context". A view or a part of one becomes a chip next to the prompt, and a message about items of one architecture goes straight to its diagram assistant with those views and the parts pointed at.

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
- 5905550: Architecture page: with the assistant open, the diagram editor lays out on the width it is given
  instead of the screen's, so it no longer spills to the right and the bottom. The list of views
  moves into its « Views » sheet, the text goes above the drawing and the drawing is fitted again
  when its box shrinks (coreloom-ui#81, ported by hand: the installed copies carry `highlighted`,
  which coreloom-ui doesn't have yet).
- 18f2392: Model calls (rule proposals, file import, connection test) no longer fail with "Something went wrong" when the model takes more than 10 seconds: the browser now waits for the API, which bounds each call itself and answers a timeout reason.
- 61a5d19: LLM provider settings keep the chosen provider and model without Save (a new key or server URL
  still waits for Save). `GET /llm/providers` no longer starts the `claude` binary for an account that
  never connected Claude. Claude sign-in: the URL is read in full even when printed in pieces, a
  binary that prints none within 30 s fails with `timeout`, and output past the size limit reads as
  `unknown` instead of `timeout`. Subscription screens announce their status and show why Test is
  disabled.
- c8df8ae: Agent conventions are picked for a merge in the list itself: each row has a checkbox, and a bar shows how many are picked with the Merge action. The Merge button of the page header and the picker inside the dialog are gone.
- c49b2b2: Every coreloom-ui component of the web app is back on the registry's current version: the highlighted elements and the concurrent regions of a state diagram now come from coreloom-ui, where they were added, and the chat widget is the published one.
- dcf16f1: Send signed-out visitors to the sign-in page instead of crashing: the signed-in area now checks the session before any page loads, comes back to the requested page after signing in, and returns to sign-in when the session expires (any 401 from the API).
- 0d1aa33: In the review of a skill's copy, choosing a file in the tree no longer scrolls the dialog: the scan's verdict above the files stays in view, and only the files scroll to the one chosen.
- 29dbd44: Reviewing a skill's copy: the dialog is wider, the scan and the model's reading sit in a column
  beside the files on a wide screen (above them otherwise), and the admin can fold that column away
  to give the files the whole width.
- 048560a: A skill's sheet reads in one glance: the admin's tools (tags, copies, stopping the suggestion) move to
  an Administration tab, with stopping the suggestion last and set apart; the facts no longer repeat
  the tags and leave out an empty diagram list; audit dates use the body font and the tag chips are
  smaller.
- 0fa0de3: Type-safety cleanup: removed unsafe `as Type` casts in the avatar controller, i18n language detection, notes editing, TanStack Query hooks, and the app bootstrap, replacing them with real type guards. Also fixes a silent fallback where an unrecognized avatar file extension would serve `application/octet-stream` instead of a real check, and removes a no-op exception handler override.
- ec0489a: UML fixes from coreloom-ui:
  
  - Lines no longer blink or vanish while a box is dragged.
  - A name with brackets, such as "Order (v2)", no longer turns a PlantUML diagram into a use case diagram and wipes it out.
  - "#42" in a PlantUML name, note or transition stays in the text instead of being read as a colour.
  - The ER template reads in PlantUML: an entity without attributes, and an entity's quoted name.
  - Mermaid flowchart text with brackets, braces or a pipe reads; quotes in Mermaid class and ER names show as quotes, not `#quot;`.
  - After Add > Note, focus goes to the note's text.
  - A Mermaid activity diagram no longer offers Note, which Mermaid can't keep.
- ffb4ec0: The browser tab shows Coreloom UML's mark.
- 9ff1aee: Agent conventions: the files of a generation show a badge for settings and configuration files as
  they do for pointers, and a downloaded file gets the MIME type of its extension (JSON, TOML,
  JavaScript, plain text) instead of Markdown for all of them.
- ec09d5d: Pages use more of a large screen: the content area now stops at 1600px instead of 1200px, and the
  architecture list shows a fourth column on very wide screens. In a project's code tab, the views
  and the map they read share one row, the diagram is as tall as the window and stays in view while
  its links or findings scroll, and a long list of findings flows into two columns. The settings
  forms keep a readable width, and a project's tabs scroll on a narrow screen instead of widening
  the page.
- Updated dependencies [1cebc8b]
- Updated dependencies [e992f9c]
- Updated dependencies [a580df0]
- Updated dependencies [8ccf1cf]
- Updated dependencies [e941f65]
- Updated dependencies [dea89e4]
- Updated dependencies [438949b]
- Updated dependencies [19f15df]
- Updated dependencies [1c17dba]
- Updated dependencies [1639e4c]
- Updated dependencies [d93a1cf]
- Updated dependencies [7871b4b]
- Updated dependencies [6d3ebf4]
- Updated dependencies [b87c6e1]
- Updated dependencies [5525ea1]
- Updated dependencies [e87b192]
- Updated dependencies [752475b]
- Updated dependencies [4c651cd]
- Updated dependencies [507f402]
- Updated dependencies [5d991bf]
- Updated dependencies [c807155]
- Updated dependencies [5f83360]
- Updated dependencies [6e566c5]
- Updated dependencies [4e03f08]
- Updated dependencies [53fa400]
- Updated dependencies [be3f13b]
- Updated dependencies [6e7dc68]
- Updated dependencies [fdc2539]
- Updated dependencies [5d991bf]
- Updated dependencies [5b915aa]
- Updated dependencies [0985603]
- Updated dependencies [dd48a8a]
- Updated dependencies [ea62718]
- Updated dependencies [59443f3]
- Updated dependencies [19362fb]
- Updated dependencies [168eec8]
- Updated dependencies [60da17f]
- Updated dependencies [986c163]
- Updated dependencies [6d07383]
- Updated dependencies [64b223c]
- Updated dependencies [3e1ca12]
- Updated dependencies [2bef10b]
- Updated dependencies [bc05f7a]
- Updated dependencies [dade74e]
- Updated dependencies [3129f95]
- Updated dependencies [b57eaa1]
- Updated dependencies [44a0f2b]
- Updated dependencies [676bf0b]
- Updated dependencies [82512f7]
- Updated dependencies [90b2fdc]
- Updated dependencies [5c0703d]
- Updated dependencies [676bf0b]
- Updated dependencies [b50626f]
- Updated dependencies [8625e1c]
- Updated dependencies [e80ee04]
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
- Updated dependencies [fe5ddb3]
- Updated dependencies [2025c8c]
- Updated dependencies [f399d1e]
- Updated dependencies [61a5d19]
- Updated dependencies [cf2df6d]
- Updated dependencies [676bf0b]
- Updated dependencies [8a91963]
- Updated dependencies [6458237]
- Updated dependencies [39d6030]
- Updated dependencies [e2d2a2d]
- Updated dependencies [b5d0b7f]
- Updated dependencies [3015e11]
- Updated dependencies [aa09083]
- Updated dependencies [42d01dd]
- Updated dependencies [3ea8692]
- Updated dependencies [6ecfbef]
- Updated dependencies [93f26ea]
- Updated dependencies [f45234b]
- Updated dependencies [457fee8]
- Updated dependencies [457fee8]
- Updated dependencies [d500a9a]
- Updated dependencies [acf8909]
- Updated dependencies [df45b81]
- Updated dependencies [174ee4c]
- Updated dependencies [4d6a0b6]
- Updated dependencies [ca8f4b2]
- Updated dependencies [2d5ea72]
- Updated dependencies [0401e3b]
- Updated dependencies [2c3cf41]
- Updated dependencies [ecd0fa9]
- Updated dependencies [9b6c3fe]
- Updated dependencies [93506e4]
- Updated dependencies [001f057]
- Updated dependencies [bb3a208]
- Updated dependencies [4fcfdaf]
- Updated dependencies [bb3a208]
- Updated dependencies [81cfd28]
- Updated dependencies [54f23d1]
- Updated dependencies [58fb73d]
- Updated dependencies [18f084c]
- Updated dependencies [43ec4f2]
- Updated dependencies [966c9e2]
- Updated dependencies [2b23da9]
- Updated dependencies [d2c14d7]
- Updated dependencies [361a22f]
- Updated dependencies [cd8e857]
- Updated dependencies [5893a5e]
- Updated dependencies [aed179e]
- Updated dependencies [c888ba6]
- Updated dependencies [c888ba6]
- Updated dependencies [c888ba6]
- Updated dependencies [0fa0de3]
- Updated dependencies [88c2ca1]
- Updated dependencies [140feb1]
- Updated dependencies [60da17f]
- Updated dependencies [1353ea3]
- Updated dependencies [f1af83d]
- Updated dependencies [880e321]
- Updated dependencies [55b2d6e]
  - @coreloom-uml/api@0.2.0
