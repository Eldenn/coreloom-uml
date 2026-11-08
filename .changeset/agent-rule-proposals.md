---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Rule proposals with your own LLM key: `POST /projects/:id/agent-config/proposals` asks your
model (Anthropic, OpenAI, Mistral, Ollama or an OpenAI-compatible server) to turn the notes under
your answers into proposed rules, which you accept one by one; `POST /llm/test` checks a
provider and its key. The key is sent with each call and never stored. Servers you name must be
allowed in `LLM_ALLOWED_BASE_URLS`.
