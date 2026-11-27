import { type ChildProcess, spawn } from 'node:child_process'
import type * as Harbor from '@coreloom-uml/catalog/evals/harbor'

export type {
  HarborAgent,
  HarborCommand,
  HarborRunInput,
  HarborTrialInput,
  HarborTrialResult,
} from '@coreloom-uml/catalog/evals/harbor'

/** What the worker uses of `@coreloom-uml/catalog/evals/harbor` (#147's runner of path I). */
export type HarborModule = Pick<
  typeof Harbor,
  'prepareHarborRun' | 'credentialEnvName' | 'readHarborJob'
>

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
 * the caller adds the E2B settings and the credential there, under `credentialEnvName`, and
 * nowhere else. Our Harbor classes then write the key to a file the agent's command reads and
 * removes first thing (`exec_with_secret`, record, section 5, fix g): never a command line, an
 * environment or a standard input. Its output is not read: what Harbor writes is read from its
 * job folder, filtered.
 */
export default class HarborRunner {
  async load(): Promise<HarborModule> {
    return import('@coreloom-uml/catalog/evals/harbor')
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
