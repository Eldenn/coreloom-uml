---
"@coreloom-uml/api": minor
"@coreloom-uml/cli": minor
---

Agent conventions now generate a rules file for Codex, `.codex/rules/coreloom-uml.rules`, next to `.codex/config.toml`: it forbids `git push --force`, `rm -rf` and the other package managers, and lets the checks run without asking unless the assistant must always ask first. Codex loads it once the project is trusted. A rule matches the first words of a command only, and cannot forbid reading a file such as `.env`. The CLI writes the file as a `#`-marked block, keeps the rules added outside it, and asks before any change to it.
