/** The rules of the `tooling.package-manager` group. */
export const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun'] as const

/**
 * What a command may hold to be written into a settings file: words, paths and flags. Anything
 * else (a pipe, a redirect, a subshell, a `*` that a permission rule would read as a wildcard)
 * keeps the command out of the settings; AGENTS.md still names it.
 */
const SAFE_COMMAND = /^[\w@./:=+-]+( [\w@./:=+-]+)*$/

/** Splits the checks typed into the `tooling.checks` rule, such as `pnpm lint && pnpm test` into its commands. */
export function splitCommands(checks: string): string[] {
  return [
    ...new Set(
      checks
        .split(/&&|\|\||[;,\n]/)
        .map((command) => command.replace(/[`"]/g, '').replace(/\s+/g, ' ').trim())
        .filter((command) => command.length <= 120 && SAFE_COMMAND.test(command)),
    ),
  ]
}
