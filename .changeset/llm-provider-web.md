---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Set your own LLM provider in Settings (kind, model, server URL, key), kept only in this browser,
with « Test » and « Forget the key ». With a provider set, « Propose rules » in the agent
conventions opens a side panel where each proposed rule is accepted, edited then accepted, or
ignored. `GET /llm/providers` lists the provider kinds, model suggestions and allowed server URLs.
