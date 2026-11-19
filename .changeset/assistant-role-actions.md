---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

The workspace assistant can now propose changes to the roles of agent conventions (add a ready-made role or one written out, edit or remove a role) and render the conventions' files, which you then pull with the CLI. Each proposal waits for your answer: a card names the role or the revision the files are rendered from, says when the oldest generation is dropped to make room, and is refreshed instead of applied if the role or the conventions changed since. Role proposals are offered only while roles are turned on for your account.
