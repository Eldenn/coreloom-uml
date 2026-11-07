# @coreloom-uml/web

## 0.2.0

### Minor Changes

- 1c17dba: API keys per account: scripts and agents can use the architectures API with a named key (read and/or write, optional expiry, revocable, rate-limited per key), managed from the Settings page.
- ec0489a: Import a diagram file, from coreloom-ui:
  
  - The editor's top bar has an **Import** button: a Mermaid, PlantUML or JSON file replaces the open diagram's text.
  - The workspace's Add menu ends with **Import a file…**: the file becomes a new view of the architecture, named after the file, and is saved like any other view. A file whose text can't be read yet opens as a draft, saved once it reads.
- 0615f80: Rebuild the web app on coreloom-ui: every component comes from the `@coreloom` registry, forms use
  TanStack Form (`useAppForm`), copy goes through `CoreloomI18nProvider` + `messages.ts`, and lint is
  ESLint + Prettier with coreloom-ui's rules. New screens: the architectures gallery (search, create,
  duplicate, delete), an interim editor (a tab per diagram, the Coreloom DiagramEditor, autosave with
  conflict handling) and settings (profile, password, theme). The API adds `GET /auth/options` and
  drops the `notes` example domain; `packages/ui`, React Hook Form, i18next and jsdom are removed.
- 2cadaeb: The diagram editor fills the window: the architecture page uses the whole width next to the sidebar, and the editor reaches the bottom of the screen on wide displays.
- 3ea8692: Projects: the top-level container of an account's design work. Architectures now belong to a project (existing ones are moved into a "Default project" per account), can be moved between projects, and the API gains `/projects` (with API keys) and a `projectId` on architectures. The app opens on the projects list; `/architectures` redirects there.
- 9f438ea: The UML model and its Mermaid, PlantUML and JSON conversion move to a shared `@coreloom-uml/uml`
  package, which the API can use as well: it adds `validateDiagram`, `parseDiagramText`,
  `formatDiagramText` and `detectDiagramTextFormat`. The web app reads it from there; diagrams behave
  as before.
- ca8f4b2: Use coreloom-ui's new blocks: the editor is the Coreloom diagram workspace (views list, rename,
  reorder, save status) with the Share dialog; the gallery shows diagram cards with thumbnails; share
  links open a read-only diagram viewer, behind the access-code gate when protected. Component and
  package diagrams are accepted.

### Patch Changes

- ec0489a: Diagram editor fixes from coreloom-ui:
  
  - Leaving a diagram's full screen (Escape or the button) puts back the view from before, instead of leaving the diagram off to the side and out of sight.
  - Boxes dragged in a Mermaid or PlantUML diagram keep their place after switching views, reloading or sharing: their positions are now saved, in a comment line of the text (`%% coreloom-layout {…}`).
  - Fit to view works every time, including after dragging a box out of sight.
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
- Updated dependencies [1c17dba]
- Updated dependencies [6d3ebf4]
- Updated dependencies [82512f7]
- Updated dependencies [191017d]
- Updated dependencies [0615f80]
- Updated dependencies [3015e11]
- Updated dependencies [42d01dd]
- Updated dependencies [3ea8692]
- Updated dependencies [ca8f4b2]
- Updated dependencies [2d5ea72]
- Updated dependencies [0fa0de3]
  - @coreloom-uml/api@0.2.0
