---
"@coreloom-uml/api": patch
"@coreloom-uml/web": patch
---

LLM provider settings keep the chosen provider and model without Save (a new key or server URL
still waits for Save). `GET /llm/providers` no longer starts the `claude` binary for an account that
never connected Claude. Claude sign-in: the URL is read in full even when printed in pieces, a
binary that prints none within 30 s fails with `timeout`, and output past the size limit reads as
`unknown` instead of `timeout`. Subscription screens announce their status and show why Test is
disabled.
