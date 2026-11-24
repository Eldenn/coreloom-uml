---
"@coreloom-uml/api": patch
---

The assistant's tool loop no longer times out on a model that takes seconds a step (a Claude
subscription): past half of its time a step may only answer, and the web goes on from there in a
next request. The loop gets 80 seconds instead of 60.
