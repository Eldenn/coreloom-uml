---
'@coreloom-uml/api': minor
'@coreloom-uml/web': minor
---

The administrator sees the background jobs in the header: what runs, what waits and what ended in
the last ten minutes, from every queue (`GET /admin/jobs`, names, states and times only, never a
job's data; mail is left out). The panel opens by itself when a job is launched from the Skills
screen (a catalog search, scans, a skill's sync), and is read again every two seconds while one
runs.
