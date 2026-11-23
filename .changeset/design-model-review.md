---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

The review on a project's Design tab can now ask your own model: it reads the views of each architecture against the project's requirements and decisions, one call per architecture with your key, and reports where a view goes against an accepted decision or leaves a requirement unaddressed. Each finding names the requirement or decision it is about and the view that shows it, and you mark it done or dismiss it. A new review of an architecture replaces its earlier findings. Behind the `design-records` flag.
