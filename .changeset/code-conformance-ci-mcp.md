---
"@coreloom-uml/api": minor
"@coreloom-uml/cli": minor
---

Conformance of diagrams to the code, without any model: `GET /projects/:id/code-maps/conformance` weighs how every diagram of a project matches a code map (`error` when the code contradicts the diagram, `warning` when the diagram is behind it), `coreloom-uml check --conformance` fails a CI build on it (`--fail-on error|warning`, `--push` to send a fresh map first, `--json`, exit code 5), and the MCP server gains `get_code_conformance` (open review findings and the match, per diagram) and `list_undocumented_processes`, listed when code maps are turned on. Generated agent conventions mention both tools (catalog 0.17.0).
