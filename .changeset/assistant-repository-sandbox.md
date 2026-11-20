---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

In « Auto », the assistant can now read the GitHub repository of a project to answer a question about its code: it lists, searches and reads its files, and its reply lists the files it really read. The repository is cloned once per conversation in an isolated sandbox that holds no key or token, paused between messages, and removed when you delete the conversation or your account, or after seven days unused. When a reading takes more steps than one message allows, the assistant goes on by itself a few times. Behind the `assistant-repository` and `code-maps` flags.
