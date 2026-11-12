import type { Target } from '../targets.ts'

/** Advice the renderer cannot write as a file (a setting, a choice to make by hand). */
export type Recommendation = {
  target: Target
  title: string
  /** Markdown, rendered without raw HTML. */
  body: string
}

/** What a target's settings and recommendations are derived from: answers, read by slot. */
export type TargetContext = {
  /** `tooling.checks`, split into the commands that are safe to allow and to run in a hook. */
  checks: string[]
  /** Every package manager but the `tooling.package-manager` answer; empty without one. */
  otherPackageManagers: string[]
  /** `workflow.autonomy`: 1 (decides alone) to 5 (asks first), `null` without an answer. */
  autonomy: number | null
}

/**
 * A tool's settings file. `content` is either a JSON object, of which the CLI owns only the
 * entries listed (it merges them into the file), or a managed block in `HASH_MARKERS` (TOML, or
 * a Codex `.rules` file).
 */
export type TargetSettings = { path: string; content: string }

/**
 * How a command-line tool is installed and used in the sandboxed development container
 * (`render/sandbox.ts`): its npm package at an exact version, the hosts the firewall lets it
 * reach (inference and sign-in, never telemetry), the environment that keeps it from updating
 * itself or calling blocked hosts, how it gets its credential, and the command that skips its
 * own prompts, which is only acceptable inside the container.
 */
export type TargetSandbox = {
  package: string
  version: string
  hosts: readonly string[]
  env?: Readonly<Record<string, string>>
  /** Markdown, one clause: how the credential reaches the tool inside the container. */
  credential: string
  unattended: string
}

/**
 * How Coreloom UML renders files for one coding tool. `verifiedOn` is the date its
 * documentation (`sources`) was last read to confirm what it loads; re-read it and update the
 * date whenever the tool's behaviour may have changed.
 */
export type TargetTemplate = {
  target: Target
  name: string
  verifiedOn: string
  sources: readonly string[]
  /** Whether the tool loads the repository's root AGENTS.md without any pointer. */
  readsAgentsMd: boolean
  /** The pointer file for a tool that does not read AGENTS.md: its path and its block body. */
  pointer?: { path: string; body: string }
  /** What the tool enforces by itself, whatever the model does; `null` when nothing applies. */
  settings?: (context: TargetContext) => TargetSettings | TargetSettings[] | null
  recommendations: (context: TargetContext) => Omit<Recommendation, 'target'>[]
  /** Only for a tool that runs as a command inside the container. */
  sandbox?: TargetSandbox
}

/**
 * The pointer for a tool that can neither read AGENTS.md nor import a file. Never a copy of the
 * sections: AGENTS.md holds all the content.
 */
export const TEXT_POINTER = 'Read and follow AGENTS.md at the repository root.'
