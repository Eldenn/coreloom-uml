# @coreloom-uml/api

## 0.2.0

### Minor Changes

- 1c17dba: API keys per account: scripts and agents can use the architectures API with a named key (read and/or write, optional expiry, revocable, rate-limited per key), managed from the Settings page.
- 6d3ebf4: Architectures and their UML diagrams: create (with a first, empty diagram), list with search and a visibility filter (each row with its diagram count and first diagram as cover), rename, describe, duplicate as a private copy and delete. Diagrams are added, renamed, reordered and deleted (an architecture keeps at least one); saving a diagram's coreloom-ui UML JSON (up to 1 MB) names the version it was based on and gets a 409 when another tab saved in between.
- 82512f7: Sign-in with a default account defined in the environment (`DEFAULT_ACCOUNT_EMAIL`, `DEFAULT_ACCOUNT_PASSWORD`, `DEFAULT_ACCOUNT_NAME`), created or updated by `node ace account:ensure-default` after the migrations on every deploy. Its email and password can't be changed from the app, it can't be deleted and gets no reset link. Public sign-up is closed unless `REGISTRATION_ENABLED=true`.
- 191017d: The API checks and converts diagrams with `@coreloom-uml/uml`. Every save of a diagram's content
  is checked against the UML schema, and a 422 lists each problem (`error.problems`: line, severity,
  code, text) instead of storing something the editor can't read. A diagram can be read and written
  as Mermaid, PlantUML or JSON text with `GET` / `PUT /architectures/:id/diagrams/:diagramId/source`
  (`?format=`; the `PUT` names the `version` it was based on, like a content save), created from a
  text with `source` (and an optional `format`) on `POST /architectures/:id/diagrams`, and checked
  without being stored with `POST /uml/validate`. A new diagram's response now carries its format
  and version.
- 0615f80: Rebuild the web app on coreloom-ui: every component comes from the `@coreloom` registry, forms use
  TanStack Form (`useAppForm`), copy goes through `CoreloomI18nProvider` + `messages.ts`, and lint is
  ESLint + Prettier with coreloom-ui's rules. New screens: the architectures gallery (search, create,
  duplicate, delete), an interim editor (a tab per diagram, the Coreloom DiagramEditor, autosave with
  conflict handling) and settings (profile, password, theme). The API adds `GET /auth/options` and
  drops the `notes` example domain; `packages/ui`, React Hook Form, i18next and jsdom are removed.
- 3ea8692: Projects: the top-level container of an account's design work. Architectures now belong to a project (existing ones are moved into a "Default project" per account), can be moved between projects, and the API gains `/projects` (with API keys) and a `projectId` on architectures. The app opens on the projects list; `/architectures` redirects there.
- ca8f4b2: Use coreloom-ui's new blocks: the editor is the Coreloom diagram workspace (views list, rename,
  reorder, save status) with the Share dialog; the gallery shows diagram cards with thumbnails; share
  links open a read-only diagram viewer, behind the access-code gate when protected. Component and
  package diagrams are accepted.
- 2d5ea72: Share an architecture: private (default), public link, or link protected by an 8-character code made by the server. The owner sees the link and the code (stored encrypted), regenerates either one (the old link stops at once, a new code shuts out everyone who entered the old one), and going private closes the link without changing it. Visitors get the architecture read-only with no owner details; a protected link takes the code (5 tries per link and IP every 15 minutes) and then stays open 24 hours in that browser. A signed-in owner skips the code. Unknown, regenerated and private links all answer the same way, and share responses are marked `noindex`.

### Patch Changes

- 3015e11: The local Docker stack creates the dev and test databases on every `docker compose up` when they
  are missing, including on a Postgres volume that already exists.
- 42d01dd: Document the default account variables in `infra/.env.production.example`.
- 0fa0de3: Type-safety cleanup: removed unsafe `as Type` casts in the avatar controller, i18n language detection, notes editing, TanStack Query hooks, and the app bootstrap, replacing them with real type guards. Also fixes a silent fallback where an unrecognized avatar file extension would serve `application/octet-stream` instead of a real check, and removes a no-op exception handler override.
