---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

The file you attach to a message of the assistant can now be a PDF, and can hold up to 600,000 characters of text instead of 60,000. A PDF is read in your browser, and a scanned one, which holds no text, is refused. A long file (past 60,000 characters) is first read by your model part by part, into notes the message then carries: this costs one reading of the file with your key, and the notes keep what it states about systems and rules, not every detail. Neither the file nor the notes are stored.
