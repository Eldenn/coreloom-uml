---
"@coreloom-uml/web": minor
"@coreloom-uml/api": minor
---

Rebuild the web app on coreloom-ui: every component comes from the `@coreloom` registry, forms use
TanStack Form (`useAppForm`), copy goes through `CoreloomI18nProvider` + `messages.ts`, and lint is
ESLint + Prettier with coreloom-ui's rules. New screens: the architectures gallery (search, create,
duplicate, delete), an interim editor (a tab per diagram, the Coreloom DiagramEditor, autosave with
conflict handling) and settings (profile, password, theme). The API adds `GET /auth/options` and
drops the `notes` example domain; `packages/ui`, React Hook Form, i18next and jsdom are removed.
