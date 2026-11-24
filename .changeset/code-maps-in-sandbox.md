---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Code maps from GitHub are now read in an E2B sandbox, the same kind the assistant reads a
repository in, and the analyzer service is gone (`apps/analyzer`, its image and `ANALYZER_URL`).
`ImportGithubCodeMapJob` opens one sandbox per import, which clones one commit of the repository
and runs graphify on it with two fixed command lines; only graphify's `graph.json` leaves the
sandbox, and the code never reaches the server. A private repository's token goes to the clone
only, never to graphify. The limits are unchanged (200 MB, 20,000 files, 5 minutes).

The source read for a drawing or a conformance review goes the same way: a sandbox fetches the
map's commit and the files are read there, so the server asks GitHub for no file any more. A map
whose commit id is shortened (one uploaded by hand) is drawn from the structure only.

The owner's model can now run commands of its own on the code. The workspace assistant gets
`run_repository_command` (one bash command in the conversation's sandbox), and before a diagram
is drawn from a code map or checked against it, the model may run a few commands at the map's
commit: what they printed is read with the source files. A sandbox is cut off every network
before the model runs anything in it, and holds no secret: a private repository's token goes to
the clone only. So nothing is fetched after the clone any more: it now takes the files of the
whole history when they fit, and for a larger repository `show` and `blame` say they lack the
older files. The `openai-codex` subscription, which carries no tool call, draws as before.

**E2B is now a prerequisite of a deployment.** Set `E2B_API_KEY` (and `E2B_API_URL` /
`E2B_SANDBOX_URL` for a self-hosted install) on the `migrate`, `api` and `queue-worker` services:
the staging and production stacks refuse to start without it, and without it importing from GitHub
answers 503. Remove `ANALYZER_URL` and the `analyzer` service. `node ace assistant:setup`, already
run on every deploy, builds the sandbox template (E2B's base template plus graphify, pinned) on
the E2B install the first time; run it once locally too.
