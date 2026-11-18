---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Agent conventions from a web resource (behind the `web-research` flag, with `E2B_API_KEY` on the
server): in the import panel, « The web » takes what to look for and the addresses of the pages to
read. The user's own model reads them through tools that run in an E2B sandbox (E2B Cloud, or a
self-hosted install with `E2B_API_URL` and `E2B_SANDBOX_URL`), then proposes ready-made rules and
rules of the owner's own, reviewed and accepted as for a file, with the pages read listed above
them. While the pages are read, the panel lists each address read and each command run as it happens.
The key never reaches the sandbox and nothing of the research is stored or logged once it ends.
