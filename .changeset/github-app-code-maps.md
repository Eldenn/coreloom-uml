---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Code maps from private GitHub repositories, through a GitHub App. A user installs the App on the
repositories it may read and connects GitHub from the Code tab ("From GitHub" card):
`POST /github/connection` trades GitHub's code for a user token, lists the repositories the user
reaches through the App, revokes the token and keeps only that list. Reading such a repository
makes an installation token for it alone (`contents: read`), hands it to the analyzer for that
clone and revokes it; no GitHub token is ever stored. A project can follow a repository
(`follow: true`, `GET|DELETE /projects/:id/code-maps/github/follow`): the signed
`POST /github/webhook` reads it again on each push to its branch. Set the six `GITHUB_APP_*`
variables on the API and the queue worker (see the README); without them only public repositories
are read.
