---
"@coreloom-uml/api": minor
---

Share an architecture: private (default), public link, or link protected by an 8-character code made by the server. The owner sees the link and the code (stored encrypted), regenerates either one (the old link stops at once, a new code shuts out everyone who entered the old one), and going private closes the link without changing it. Visitors get the architecture read-only with no owner details; a protected link takes the code (5 tries per link and IP every 15 minutes) and then stays open 24 hours in that browser. A signed-in owner skips the code. Unknown, regenerated and private links all answer the same way, and share responses are marked `noindex`.
