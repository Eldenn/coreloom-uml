---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

The assistant can now propose deleting a project, an architecture or agent conventions, changing who can open an architecture, and replacing an architecture's share link or access code. A deletion's card lists what goes with it (architectures, diagrams, agent conventions, code maps and reviews, rules, roles, generations) and a sharing change shows the visibility before and after; a change that cannot be undone has a red accept button. If what a card says is no longer true when you accept it (the project gained an architecture, the visibility changed), nothing is applied: the card is refreshed for you to read again. The assistant never sees a share link or an access code: you read the new ones on the architecture's sharing screen.
