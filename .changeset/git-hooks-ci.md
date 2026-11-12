---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
"@coreloom-uml/cli": minor
---

Agent conventions now generate gates that hold whatever tool wrote the change. Git hooks in `.githooks/`: `pre-commit` runs your checks and the dependency rules, `commit-msg` enforces Conventional Commits and refuses a message that credits an assistant, each only when the answers say so. A GitHub Actions workflow, `.github/workflows/agent-conventions.yml`, replaces the steps that were only recommended, when a new optional question of the Git workflow questionnaire asks for it: it checks that the conventions are current (skipped with a warning when the `CORELOOM_UML_API_KEY` secret is missing), installs the dependencies, runs your checks (quoted, so a `:` no longer breaks the file), and scans for secrets with a pinned gitleaks binary when secrets must stay out of the repository. The CLI writes them as `#`-marked blocks, starts a new hook with `#!/bin/sh`, makes it executable and asks before any change to them. It never changes Git's configuration: it prints `git config core.hooksPath .githooks` for you to run.
