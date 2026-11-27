---
'@coreloom-uml/api': patch
---

A private repository's installation token no longer reaches a sandbox in a command's
environment, where E2B's envd recorded it in the sandbox logs: the clone reads it from a file it
removes at once, the token is revoked as soon as the clone answered, and the vendored E2B install
masks command environments and standard input in its logs (GHSA-g8f8-chgf-xcxc).
