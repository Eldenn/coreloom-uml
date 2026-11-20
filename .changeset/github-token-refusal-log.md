---
"@coreloom-uml/api": patch
---

Log why GitHub refuses an installation token (its status and its own message, never the
request), so a map that fails with "The GitHub App no longer reaches this repository" says whether
the App lacks a permission, the repository left the installation, or the App's key or clock is off.
