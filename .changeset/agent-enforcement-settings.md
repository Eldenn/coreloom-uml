---
"@coreloom-uml/api": minor
"@coreloom-uml/cli": minor
---

Agent conventions now generate settings files that the tools enforce by themselves, next to AGENTS.md: `.claude/settings.json` for Claude Code (the checks allowed and run in a `Stop` hook, the other package managers denied, and a fixed deny list: reading `.env*` and `secrets/`, `git push --force`, `rm -rf`), `.codex/config.toml` for Codex (approval policy and sandbox mode from the autonomy answer) and `.gemini/settings.json` for Gemini CLI (the checks allowed). They replace the Claude Code permissions recommendation. The CLI merges its entries into a JSON settings file and keeps everything else in it, writes a `#`-marked block at the top of a TOML one, asks before any change to a settings file, and `status` reports `keys edited` when an entry it wrote is gone.
