---
"@coreloom-uml/api": patch
---

Workers start in production without the default account: only the web server and `account:ensure-default` (run by `migrate`) refuse to start without `DEFAULT_ACCOUNT_EMAIL` and `DEFAULT_ACCOUNT_PASSWORD`.
