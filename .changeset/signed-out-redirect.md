---
'@coreloom-uml/web': patch
---

Send signed-out visitors to the sign-in page instead of crashing: the signed-in area now checks the session before any page loads, comes back to the requested page after signing in, and returns to sign-in when the session expires (any 401 from the API).
