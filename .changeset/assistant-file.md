---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

You can attach a file to a message of the assistant: a PDF or a text file (Markdown, plain text, JSON, YAML…), up to 600,000 characters of text. A PDF is read in your browser, and a scanned one, which holds no text, is refused. A long file (past 60,000 characters) is first read by your model part by part, into notes the message then carries: this costs one reading of the file with your key, and the notes keep what it states about systems and rules, not every detail. In « Auto », the assistant reads the file and proposes what it calls for, each as a card you accept or reject: a project, an architecture, and new agent conventions with the rules the file states (every rule listed on the card, ready-made rules of the catalog preferred), and it names the skills of the catalog that fit, with their links. The views of an architecture are drawn afterwards: accept the architecture, then ask for its views with the file attached again. The file goes to your model with that message only: the conversation keeps its name, never its content.
