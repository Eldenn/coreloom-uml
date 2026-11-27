import app from '@adonisjs/core/services/app'
import type { TrialGrades } from '@coreloom-uml/catalog/evals'
import { GRADE, SETUP, SHELL, STOP_AGENT } from '#app/convention-evals/services/eval-commands'
import EvalSandboxes, {
  type ListedSandbox,
  type OpenEvalSandbox,
} from '#app/convention-evals/services/eval-sandbox'

export const PASSING_GRADES: TrialGrades = {
  success: { verdict: 'pass', reason: 'every check passed' },
  compliance: { verdict: 'pass', reason: 'every subject is a Conventional Commit' },
}

type Run = { command: string; envs: Record<string, string>; user: string }

/**
 * Stands in for E2B in the convention tests' specs: every sandbox is a record of what was asked
 * of it. The fixed command lines answer as a working sandbox would (`SETUP` and `STOP_AGENT`
 * succeed, `GRADE` answers `grades`), a command of the model answers `shell(command)`.
 */
export class FakeEvalSandboxes {
  created: { runId: number; accountId: number }[] = []
  isolated = 0
  killed: string[] = []
  runs: Run[] = []
  uploads: { path: string; bytes: number; user: string }[] = []
  /** What `list` answers, by the metadata it is asked for (all of it must match). */
  listed: ListedSandbox[] = []
  listQueries: Record<string, string>[] = []

  constructor(
    readonly options: {
      shell?: (command: string) => { exitCode: number; output: string }
      grades?: TrialGrades | null
      createFails?: boolean
      isolateFails?: boolean
    } = {},
  ) {}

  install() {
    app.container.swap(EvalSandboxes, () => {
      const fake = new EvalSandboxes()
      fake.configured = () => true
      fake.ensureTemplate = async () => 'ready'
      fake.create = async (meta) => this.create(meta)
      fake.list = async (metadata) => {
        this.listQueries.push(metadata)
        return this.listed.filter((item) =>
          Object.entries(metadata).every(([key, value]) => item.metadata[key] === value),
        )
      }
      fake.kill = async (sandboxId) => {
        this.killed.push(sandboxId)
      }
      return fake
    })
    return this
  }

  restore() {
    app.container.restore(EvalSandboxes)
  }

  /** The commands of the model, in the order they ran. */
  get modelCommands(): string[] {
    return this.runs
      .filter((run) => run.command === SHELL)
      .map((run) => run.envs.SHELL_COMMAND ?? '')
  }

  private create(meta: { runId: number; accountId: number }): OpenEvalSandbox | null {
    if (this.options.createFails) return null
    this.created.push(meta)
    const sandboxId = `sbx-${String(this.created.length)}`
    return {
      sandboxId,
      run: async (command, envs, runOptions = {}) => {
        this.runs.push({ command, envs, user: runOptions.user ?? 'user' })
        if (command === SETUP || command === STOP_AGENT) return { exitCode: 0, output: '' }
        if (command === GRADE) {
          const grades = this.options.grades === undefined ? PASSING_GRADES : this.options.grades
          return grades
            ? { exitCode: 0, output: `${JSON.stringify(grades)}\n` }
            : { exitCode: 1, output: '' }
        }
        if (command === SHELL) {
          return this.options.shell?.(envs.SHELL_COMMAND ?? '') ?? { exitCode: 0, output: 'ok' }
        }
        return { exitCode: 127, output: '' }
      },
      isolate: async () => {
        this.isolated++
        return !this.options.isolateFails
      },
      upload: async (path, data, user = 'user') => {
        this.uploads.push({ path, bytes: data.byteLength, user })
        return true
      },
      renew: async () => {},
      kill: async () => {
        this.killed.push(sandboxId)
      },
    }
  }
}
