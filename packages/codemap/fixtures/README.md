# Fixtures

Real `graph.json` files written by graphify (`graphifyy` 0.9.108 from PyPI), read by the tests.
graphify ran without any model, so that it only parses code:

```sh
GRAPHIFY_BACKEND=none GRAPHIFY_QUERY_LOG_DISABLE=1 graphify update . --no-cluster
GRAPHIFY_BACKEND=none GRAPHIFY_QUERY_LOG_DISABLE=1 graphify cluster-only . --no-viz --no-label
```

- `adonis-graph.json`: this repository's `apps/api` and `packages/uml`, reduced to the code
  nodes of `start/routes.ts`, `app/architectures/`, `app/projects/`, `app/shared/authorization/`,
  `app/jobs/refresh-skills_job.ts`, `app/skills/services/skills-catalog.ts` and
  `commands/skills-refresh.ts`, plus the outside packages and decorator names they point to, and
  the links between all of these. Everything else graphify wrote is left as it was.
- `frameworks-graph.json`: the small project in `frameworks/` (Express, NestJS, BullMQ, an
  AdonisJS command and job), as graphify wrote it. Its sources are never compiled or linted.

Regenerate them when the importer moves to a newer graphify, and update the tests with what
changed.
