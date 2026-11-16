---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Code maps from GitHub: a project's Code tab can read a public github.com repository itself.
`POST /projects/:id/code-maps/github` (`{ url, branch? }`, 202) creates a pending map that
`ImportGithubCodeMapJob` fills on its own `code-maps` queue, through the new analyzer service
(`apps/analyzer`, Python with graphify pinned, no secret, never published): a shallow clone with no
submodules, symlinks, hooks or credentials, at most 200 MB, 20,000 files and 5 minutes, then
deleted. The web app's "From GitHub" card takes the repository and branch and polls the map until
it is ready or failed. Set `ANALYZER_URL` (the compose stacks run the `analyzer` service);
unset, the import answers 503.
