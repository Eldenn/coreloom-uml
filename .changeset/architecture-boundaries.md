---
"@coreloom-uml/api": minor
"@coreloom-uml/cli": minor
---

Architecture rules that can be checked: when a project's package diagrams draw dependencies
between packages, a generation also holds a `.dependency-cruiser.cjs` whose `forbidden` rules
refuse every dependency between two packages that no arrow draws, and the `Architecture` section
of `AGENTS.md` tells the agent to run `npx depcruise <folders>` before handing work back. A
package is matched by its name, read as a folder path from the repository root (`domain` inside
`src` is `src/domain`); packages whose name is not a folder path, and diagrams of other kinds, are
left out. `pull` writes the file in a managed block behind `//`, so rules and options added after
the block are kept (catalog 0.6.0).
