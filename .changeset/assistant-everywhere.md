---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

The assistant opens from every page: an "Assistant" button in the header shows the same panel and
the same conversations as on an architecture's page. A conversation now belongs to your account
instead of one architecture, so it can cover several of them: each message says which architecture
it is about (or none, for a plain question), and a proposed view change can be accepted, rejected
or undone from any page, with a link to its view. Deleting an architecture keeps its conversations;
their proposed changes simply no longer apply.

"From the web" makes agent conventions from web pages inside the conversation: your model reads the
pages your message names, the steps show live under the message, and the rules it proposes stay in
the conversation, with the pages read, until you have added the ones you keep.
