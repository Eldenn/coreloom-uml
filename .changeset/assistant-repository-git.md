---
"@coreloom-uml/api": minor
---

The assistant's sandbox now clones the repository itself, and the assistant can read its history: the commits that touched a file or folder, one commit's changes, and who last changed each line. A private repository is cloned with a token valid for that repository only, which is never written down and is revoked when the message ends. Reading a repository no longer needs the code map analyzer.
