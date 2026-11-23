---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

The assistant's reply appears as the model writes it, through the AI SDK's `useChat`: in « Auto », the assistant says when it is reading your work between two steps, and Stop cancels the call (nothing is stored, the message comes back to the field). The API answers the AI SDK's UI message stream when asked for one, and JSON otherwise; the stream carries the reply's text and the names of the tools called, never what a tool read.
