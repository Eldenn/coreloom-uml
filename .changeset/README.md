# Changesets

This directory is managed by [Changesets](https://github.com/changesets/changesets).
Every pull request must add one changeset file here describing what changed
from a user's point of view — that description becomes the entry in
`apps/api/CHANGELOG.md` / `apps/web/CHANGELOG.md` and, eventually, the
GitHub Release notes. Nothing here is edited by hand afterwards.

```bash
pnpm changeset
```

Answer the prompts: which package(s) changed (`@coreloom-uml/api`, `@coreloom-uml/web`,
or both — they version together, see `.changeset/config.json`'s `fixed`
group), the bump type (patch/minor/major), and a one- or two-line summary.
A change to the CLI picks `@coreloom-uml/cli`: it is the only package
published to npm and versions on its own (outside the `fixed` group), with its
own `apps/cli/CHANGELOG.md`; `changesets.yml` publishes it once the "Version
Packages" PR is merged, when the `NPM_TOKEN` secret exists.

This writes a random-named `.md` file under `.changeset/` — commit it as part
of the PR. `.github/workflows/require-changeset.yml` fails CI on pull
requests that don't add one.

For a change with no user-facing effect (docs, CI, refactors, internal
tests) that still shouldn't need a version bump, add an **empty** changeset
instead of skipping this step:

```bash
pnpm changeset add --empty
```

## What happens next (fully automated — see `.github/workflows/changesets.yml`)

1. Every push to `main` (i.e. every merged PR, changeset included) redeploys
   **staging** immediately, regardless of pending changesets
   (`deploy-staging.yml`) — that is not a release.
2. As long as changesets are pending, that same push updates an
   auto-generated **"Version Packages" pull request** — it applies every
   pending changeset's version bump, regenerates
   `apps/api/CHANGELOG.md` / `apps/web/CHANGELOG.md`, and deletes the
   consumed changeset files. Nobody edits this PR by hand; more feature PRs
   merging in the meantime keep updating it.
3. Merging the **"Version Packages" PR** is the release: with no changesets
   left pending, the next push to `main` tags the commit `vX.Y.Z` and pushes
   the tag, which runs `release.yml` (CI + GitHub Release) and then
   `deploy-production.yml`.
