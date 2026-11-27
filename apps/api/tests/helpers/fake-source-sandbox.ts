import app from '@adonisjs/core/services/app'
import { REPOSITORY_SANDBOX } from '#app/assistant/constants/repository'
import {
  CLONE_AT,
  cloneSecretFile,
  READ_FILE,
  SHELL,
} from '#app/assistant/services/repository-commands'
import RepositorySandbox, {
  type OpenRepositorySandbox,
} from '#app/assistant/services/repository-sandbox'

/*
 * A stand-in for the sandbox the source of a drawing or a review is read in (`readSource`): it
 * records what it is asked and answers each file through `read`. The command lines themselves
 * run for real in `tests/unit/assistant/repository-commands.spec.ts`. E2B is never reached.
 */

/**
 * One file asked for: `owner/name`, the commit fetched and the credential written for the fetch
 * (`cloneCredential`), if any.
 */
export type SourceRead = {
  repository: string
  commit: string
  path: string
  credential: string | undefined
}

/** The file's text, null for a file the sandbox does not give, 'gone' when it stops answering. */
export type SourceAnswer = string | null | 'gone'

export class FakeSourceSandboxes extends RepositorySandbox {
  /** The environment of every fetch of a commit. */
  fetches: Record<string, string>[] = []
  /** Every command line run, with its environment. */
  runs: { command: string; envs: Record<string, string> }[] = []
  /** Every secret written to a sandbox (`writeSecret`), in order. */
  writes: { path: string; content: string }[] = []
  killed = 0
  /** False: E2B starts no sandbox. */
  available = true
  /** True: the sandbox does not take a secret (`writeSecret` answers false). */
  writeFails = false
  /** What fetching the commit exits with. */
  fetchExitCode = 0
  /** What happened in the sandboxes, in order: 'fetch', 'read', 'isolate', then each command of the model. */
  events: string[] = []
  /** What a command of the model prints. */
  shellOutput = 'src/ledger.ts:4: charge()\n'

  constructor(private read: (read: SourceRead) => SourceAnswer) {
    super()
  }

  configured() {
    return true
  }

  async create(): Promise<OpenRepositorySandbox | null> {
    if (!this.available) return null
    let fetched: Record<string, string> = {}
    let written: string | undefined
    let credential: string | undefined
    return {
      sandboxId: 'sbx-source',
      run: async (command, envs) => {
        this.runs.push({ command, envs })
        if (command === CLONE_AT) {
          fetched = envs
          // The line reads the file and removes it.
          credential = written
          written = undefined
          this.fetches.push(envs)
          this.events.push('fetch')
          return { exitCode: this.fetchExitCode, output: `${envs.REPO_COMMIT ?? ''}\n` }
        }
        if (command === SHELL) {
          this.events.push(`$ ${envs.SHELL_COMMAND ?? ''}`)
          // Nothing of ours but the command and where to run it.
          return Object.keys(envs).sort().join() === 'REPO_ROOT,SHELL_COMMAND'
            ? { exitCode: 0, output: this.shellOutput }
            : { exitCode: 1, output: '' }
        }
        if (command !== READ_FILE) return { exitCode: 1, output: '' }
        if (!this.events.includes('read')) this.events.push('read')
        const answer = this.read({
          repository: (fetched.REPO_URL ?? '').replace(/^https:\/\/github\.com\/|\.git$/g, ''),
          commit: fetched.REPO_COMMIT ?? '',
          path: envs.READ_PATH ?? '',
          credential,
        })
        if (answer === 'gone') return { exitCode: REPOSITORY_SANDBOX.goneExitCode, output: '' }
        return answer === null ? { exitCode: 1, output: '' } : { exitCode: 0, output: answer }
      },
      readFile: async () => null,
      writeSecret: async (path, content) => {
        this.writes.push({ path, content })
        if (this.writeFails) return false
        if (path === cloneSecretFile(REPOSITORY_SANDBOX.root)) written = content
        return true
      },
      isolate: async () => {
        this.events.push('isolate')
        return true
      },
      rest: async () => {},
    }
  }

  async kill() {
    this.killed += 1
  }
}

/** Swaps the sandboxes for a fake answering through `read`; restore `RepositorySandbox` after. */
export function useFakeSourceSandbox(read: (read: SourceRead) => SourceAnswer) {
  const sandboxes = new FakeSourceSandboxes(read)
  app.container.swap(RepositorySandbox, () => sandboxes)
  return sandboxes
}
