---
'@coreloom-uml/web': patch
---

Model calls (rule proposals, file import, connection test) no longer fail with "Something went wrong" when the model takes more than 10 seconds: the browser now waits for the API, which bounds each call itself and answers a timeout reason.
