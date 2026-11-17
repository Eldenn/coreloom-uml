---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Create the GitHub App from the settings instead of setting six environment variables. The admin
opens Settings → GitHub App, picks the owner (their account or an organization) and clicks
"Create on GitHub": the browser posts a manifest to GitHub (GitHub's manifest flow), GitHub asks
to confirm the name and comes back to `/github/app-created`, and `POST /admin/github-app` trades
its code for the App's settings and secrets. They are stored encrypted with `APP_KEY` and never
answered or logged. The section shows the App with links to its GitHub pages and removes it
(`DELETE /admin/github-app`, which also forgets every repository read through it). The
`GITHUB_APP_*` variables still win when all six are set. New optional `API_URL` (the API's public
address, for the App's webhook URL); without a public HTTPS address the App is created without a
webhook. The web container's CSP now allows posting a form to `https://github.com`.
