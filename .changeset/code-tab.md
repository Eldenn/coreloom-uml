---
'@coreloom-uml/web': minor
'@coreloom-uml/api': minor
---

Code tab on a project page (behind the `code-maps` flag): add a code map (the CLI command and a GitHub Actions workflow to copy, or a graph.json upload), read it (repository, counts, folders, communities, entry points), compare each diagram with it (a status on every element, links to accept, correct or dismiss, and what the code says the diagram misses) and list the processes no diagram documents. `GET /code-maps/:id/processes` lists those processes. The app's diagrams take coreloom-ui's element annotations and the finding card.
