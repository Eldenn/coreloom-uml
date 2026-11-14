---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Code maps API, behind the `code-maps` feature flag: a project stores maps of its code uploaded as
graphify's `graph.json` or sent by the CLI (`POST /projects/:id/code-maps`, kept gzipped in object
storage, the 5 newest per project), lists and reads them with a summary of folders, communities and
entry points, and matches its diagrams against one (`GET|PUT /code-maps/:id/links?diagramId=`),
keeping the links the owner confirms or ignores. Projects now report `codeMapCount`.
