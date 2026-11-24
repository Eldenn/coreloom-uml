import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import app from '@adonisjs/core/services/app'
import { CLONE, MAP } from '#app/assistant/services/repository-commands'
import RepositorySandbox, {
  type OpenRepositorySandbox,
} from '#app/assistant/services/repository-sandbox'

/*
 * A stand-in for the sandboxes a GitHub code map import runs in: it records the command lines
 * it is given and answers what a sandbox would (the lines themselves are run for real in
 * `tests/unit/assistant/repository-commands.spec.ts`). E2B is never reached.
 */

/** The commit the fake clone reports. */
export const MAPPED_SHA = '0123456789abcdef0123456789abcdef01234567'

/** graphify's own output on part of this repository (see `packages/codemap/fixtures`). */
const GRAPH = readFileSync(app.makePath('../../packages/codemap/fixtures/adonis-graph.json'))

type Answer = { exitCode: number; output: string }

export class FakeMapSandboxes extends RepositorySandbox {
  /** Every command line run, with its environment as the sandbox would get it. */
  runs: { command: string; envs: Record<string, string> }[] = []
  killed: string[] = []
  /** False: E2B starts no sandbox. */
  available = true
  clone: Answer = { exitCode: 0, output: `${MAPPED_SHA}\n` }
  map: Answer = { exitCode: 0, output: 'main\n' }
  /** What `MAP` left in the sandbox, gzipped. */
  graph: Uint8Array | null = gzipSync(GRAPH)

  /** The environment the clone got, when one ran. */
  get cloned(): Record<string, string> | undefined {
    return this.runs.find((run) => run.command === CLONE)?.envs
  }

  configured() {
    return true
  }

  async create(): Promise<OpenRepositorySandbox | null> {
    if (!this.available) return null
    return {
      sandboxId: 'sbx-map',
      run: async (command, envs) => {
        this.runs.push({ command, envs })
        if (command === CLONE) return this.clone
        if (command === MAP) return this.map
        return { exitCode: 1, output: '' }
      },
      readFile: async () => this.graph,
      isolate: async () => true,
      rest: async () => {},
    }
  }

  async kill(sandboxId: string) {
    this.killed.push(sandboxId)
  }
}

/** Swaps the sandboxes for a fake; the returned function puts the real ones back. */
export function useFakeMapSandboxes(): { sandboxes: FakeMapSandboxes; restore: () => void } {
  const sandboxes = new FakeMapSandboxes()
  app.container.swap(RepositorySandbox, () => sandboxes)
  return { sandboxes, restore: () => app.container.restore(RepositorySandbox) }
}
