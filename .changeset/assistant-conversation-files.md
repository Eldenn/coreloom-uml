---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

A file you attach to the assistant now stays with the conversation: attach it once, and the next messages go on from it without attaching it again. When you attach it, your model summarizes it part by part. Each message then carries that summary, and the assistant reads only the passages it needs: in « Auto » it searches and reads the file itself, otherwise the passages your request is about are sent with it. The file's text is kept until you delete the conversation or your account, and it is never shown in logs. A conversation holds up to four files.
