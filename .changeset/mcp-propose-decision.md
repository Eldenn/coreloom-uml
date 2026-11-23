---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

A coding agent can tell the owner it had to deviate from the design. With an API key that has the `write` ability, the MCP server offers `propose_decision`: the agent records the question, the options it weighed, the one it went with and, if any, the decision that no longer holds. It is stored as a proposal the owner reviews on the project's Design tab (Keep or Dismiss) and counts for nothing until kept: the assistant, the design reviews, the generated AGENTS.md and the MCP tools leave it out. At most ten wait per project. Behind the `design-records` flag.
