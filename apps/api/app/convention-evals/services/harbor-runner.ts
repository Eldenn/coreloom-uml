import { type ChildProcess, spawn } from 'node:child_process'
import type { Condition, EvalTask, FinalState } from '@coreloom-uml/catalog/evals'

/*
 * The contract of `@coreloom-uml/catalog/evals/harbor` (the runner of path I, built beside this
 * code), kept here until that export lands: names and shapes are fixed by both sides.
 */

export type HarborAgent = 'claude-code' | 'codex'

export type HarborTrialInput = {
  task: EvalTask
  condition: Condition
  /** The rendered convention files for that condition ({} for `none`). */
  files: Readonly<Record<string, string>>
}

export type HarborRunInput = {
  /** Per-run folder on a tmpfs, 0700, created by the caller. */
  dir: string
  agent: HarborAgent
  model: string
  providerHost: string
  trials: readonly HarborTrialInput[]
  attempts: number
  concurrency: number
  runId: string
  accountId: number
}

export type HarborCommand = {
  file: string
  args: readonly string[]
  env: Readonly<Record<string, string>>
  jobDir: string
}

export type HarborTrialResult = {
  taskId: string
  condition: Condition
  attempt: number
  /** The final workspace copied back from the sandbox. */
  state: FinalState | null
  /** Every text Harbor wrote for that trial, unfiltered. */
  outputs: readonly { path: string; text: string }[]
  usage: { input: number; cachedInput: number; cacheWrite: number; output: number } | null
  /** Harbor's exception class name only. */
  error: string | null
  durationMs: number
}

export type HarborModule = {
  prepareHarborRun(input: HarborRunInput): Promise<HarborCommand>
  credentialEnvName(agent: HarborAgent): 'ANTHROPIC_API_KEY' | 'CODEX_API_KEY'
  readHarborJob(jobDir: string): Promise<readonly HarborTrialResult[]>
}

/** Where the runner of path I is exported from. */
const HARBOR_MODULE = '@coreloom-uml/catalog/evals/harbor'

/** A running `harbor run`, in a process group of its own. */
export type HarborProcess = {
  /** Settles when the process has exited, whatever its code. */
  exited: Promise<number | null>
  /** Signals the whole process group (Harbor and what it started). */
  kill(signal: NodeJS.Signals): void
}

/**
 * Starts Harbor for path I. Resolved from the container, so tests swap it and never start
 * Harbor or reach E2B or a provider. The child is started without a shell, in a process group of
 * its own (so a kill reaches every process it started), with exactly the environment it is given:
 * the caller adds the credential there, under `credentialEnvName`, and nowhere else. Its output
 * is not read: what Harbor writes is read from its job folder, filtered.
 */
export default class HarborRunner {
  async load(): Promise<HarborModule> {
    const specifier: string = HARBOR_MODULE
    return (await import(specifier)) as HarborModule
  }

  start(command: { file: string; args: readonly string[]; env: Record<string, string> }) {
    const child: ChildProcess = spawn(command.file, [...command.args], {
      env: command.env,
      detached: true,
      shell: false,
      stdio: 'ignore',
    })
    const exited = new Promise<number | null>((resolve) => {
      child.once('exit', (code) => resolve(code))
      child.once('error', () => resolve(null))
    })
    return {
      exited,
      kill(signal: NodeJS.Signals) {
        if (child.pid === undefined) return
        try {
          process.kill(-child.pid, signal)
        } catch {
          // Already gone.
        }
      },
    } satisfies HarborProcess
  }
}
