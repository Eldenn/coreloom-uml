---
"@coreloom-uml/cli": minor
---

`coreloom-uml map push --project <id>` sends a map of the repository's code to a project: it runs
graphify on the machine (`GRAPHIFY_BACKEND=none`, no model and no key), or reads a `graph.json`
with `--graph`, turns the graph into a code map there and uploads it gzipped, so the code itself
never leaves the machine. The map is labelled with the `origin` remote (credentials dropped), the
branch and the commit. The API key needs the `write` ability. The README has a GitHub Actions
workflow that sends a new map on every push.
