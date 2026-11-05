---
"@coreloom-uml/api": minor
---

Sign-in with a default account defined in the environment (`DEFAULT_ACCOUNT_EMAIL`, `DEFAULT_ACCOUNT_PASSWORD`, `DEFAULT_ACCOUNT_NAME`), created or updated by `node ace account:ensure-default` after the migrations on every deploy. Its email and password can't be changed from the app, it can't be deleted and gets no reset link. Public sign-up is closed unless `REGISTRATION_ENABLED=true`.
