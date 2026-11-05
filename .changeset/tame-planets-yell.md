---
"@coreloom-uml/api": patch
"@coreloom-uml/web": patch
---

Type-safety cleanup: removed unsafe `as Type` casts in the avatar controller, i18n language detection, notes editing, TanStack Query hooks, and the app bootstrap, replacing them with real type guards. Also fixes a silent fallback where an unrecognized avatar file extension would serve `application/octet-stream` instead of a real check, and removes a no-op exception handler override.
