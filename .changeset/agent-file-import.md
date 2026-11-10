---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Import a conventions file: `POST /projects/:id/agent-config/imports` has your model read an
existing AGENTS.md, CLAUDE.md or similar file (up to 50,000 characters, managed block left out)
and propose answers to the configured questionnaires, each checked against its question and
quoted from the file, plus rules for the rest. Nothing is stored: the "Import a file" panel
applies the checked answers together (one that would replace yours starts unchecked) and accepts
rules one by one. Provider resolution for these calls is shared in `userLanguageModel`.
