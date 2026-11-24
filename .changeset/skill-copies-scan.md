---
'@coreloom-uml/api': minor
'@coreloom-uml/web': minor
---

Each copy of a skill is scanned with NVIDIA's SkillSpector before the admin may approve it. The scan
runs in a new `skill-scanner` worker (the API's worker in its own image, with SkillSpector pinned)
on the `skill-scans` queue; the review screen shows the verdict and every finding, and a copy that
is not scanned whole or that SkillSpector recommends not installing can only be rejected.
