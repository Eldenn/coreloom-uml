---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

A Skills screen lists the whole skills catalog as a live dashboard: key figures, installs and
catalog growth at each weekly search, audit and topic breakdowns, trending skills, and a ranked
list with search, filters, sort and a sheet per skill. It reloads by itself when the weekly search
or `skills:block` changes the catalog. New API routes: `GET /skills`, `GET /skills/stats`,
`GET /skills/:slug` and the `GET /skills/events` stream.
