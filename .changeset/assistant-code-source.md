---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Diagrams drawn from a code map now read the source code of the files concerned, so that they show
the logic and not only the structure. Before a sequence, activity or class diagram is drawn (a
message of the assistant with "Draw from the code", "Draw" on a proposed diagram, "Propose a
diagram" on a process), the server reads on GitHub, at the map's commit, the files of the code the
view covers: at most 8 files, 12,000 characters each and 48,000 in all, a large file cut to the
lines around the functions concerned. A private repository is read through the GitHub App with a
token made for that read and revoked at once; a public one is read anonymously. The code goes to
the user's own model for that call and is never stored, logged or returned. The answer ends with
what was read, or why nothing was (no GitHub repository, no commit, repository not readable, files
not found at that commit), in which case the view is drawn from the structure as before. Package
and component diagrams read no source.
