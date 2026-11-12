---
'@coreloom-uml/api': minor
'@coreloom-uml/web': minor
'@coreloom-uml/cli': minor
---

Agent conventions can now render a sandboxed development container for the coding assistant.
The security questionnaire asks where the assistant runs; with "in a sandboxed development
container", a generation also holds `.devcontainer/devcontainer.json` (a pinned Node.js image,
the chosen tools' command lines at exact versions, the workspace as the only folder of your
machine, nothing forwarded from it) and `.devcontainer/init-firewall.sh`, which refuses all
outgoing traffic except DNS, the package registry, GitHub and the hosts of the chosen tools, takes
root access away from the container user, and fails the start when a blocked host answers. With
"never" as the network answer, only the tools' own hosts stay reachable. AGENTS.md tells the
assistant never to touch the firewall, and a recommendation says how to open the container, what
it stops and what it does not. `coreloom-uml pull` writes the script in a managed block (a line
such as `EXTRA_ALLOWED_DOMAINS="uml.example.com"` above it is kept) and asks before any change to
either file.
