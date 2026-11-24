import { ALL_TRAFFIC, CommandExitError, Sandbox, Template, TimeoutError } from 'e2b'
import {
  REPOSITORY_SANDBOX,
  REPOSITORY_TEMPLATE,
  REPOSITORY_TEMPLATE_NAME,
} from '#app/assistant/constants/repository'
import { RESEARCH_DENIED_RANGES } from '#app/research/constants/research'
import { type ResearchConfig, researchConfig } from '#app/research/services/research-config'

/** One run of a fixed command line: its exit code and its output, already capped. */
export type RepositoryRun = (
  command: string,
  envs: Record<string, string>,
  timeoutMs?: number,
  /** Called with each piece of the output as the command prints it. */
  onOutput?: (text: string) => void,
) => Promise<{ exitCode: number; output: string }>

export type OpenRepositorySandbox = {
  sandboxId: string
  run: RepositoryRun
  /**
   * Cuts the sandbox off every network, for good (it holds after a pause): false when E2B did
   * not confirm it. Called once the clone is in, before the model runs anything in it.
   */
  isolate(): Promise<boolean>
  /** The bytes of a file a command line left in the sandbox; null when it cannot be read. */
  readFile(path: string): Promise<Uint8Array | null>
  /**
   * Leaves it awake for `idleMs`, after which E2B pauses it by itself (`resume` wakes it);
   * the clone stays in it. Paused at once when E2B refuses the delay.
   */
  rest(): Promise<void>
}

/**
 * The E2B sandbox holding a repository, for the workspace assistant and for a GitHub code map
 * import: with `ResearchSandbox`, the only files that import `e2b`. Resolved from the container,
 * so tests swap it and never reach E2B. It starts from the template of
 * `REPOSITORY_TEMPLATE` (E2B's base and graphify, nothing of ours) and gets no file of ours and no key:
 * the only secret it ever sees is an installation token for its one repository, as an
 * environment variable of one git command (never a file), revoked when the message or the import
 * ends. It runs only the fixed command lines of `repository-commands.ts`, one of which (`SHELL`)
 * runs a command of the model: only in a sandbox cut off every network (`isolate`), which never
 * gets a token again. Until then it may not reach a private address range. A conversation's
 * stays awake `idleMs` after its last use, then is paused by E2B, and is killed with its conversation, its account, after `maxIdleDays` unused, or as
 * soon as an import or a reading is over.
 */
export default class RepositorySandbox {
  /** Whether this server can run sandboxes (`E2B_API_KEY`). */
  configured(): boolean {
    return researchConfig() !== null
  }

  /**
   * Builds the template on this E2B install unless it holds it already (`assistant:setup`).
   * Throws when E2B cannot build it; null without `E2B_API_KEY`.
   */
  async ensureTemplate(): Promise<'ready' | 'built' | null> {
    const config = researchConfig()
    if (!config) return null
    if (await Template.exists(REPOSITORY_TEMPLATE_NAME, connection(config))) return 'ready'
    const template = Template()
      .fromTemplate(REPOSITORY_TEMPLATE.from)
      .pipInstall([REPOSITORY_TEMPLATE.graphify])
    await Template.build(template, REPOSITORY_TEMPLATE_NAME, {
      ...connection(config),
      cpuCount: REPOSITORY_TEMPLATE.cpuCount,
      memoryMB: REPOSITORY_TEMPLATE.memoryMB,
      minFreeDiskMb: REPOSITORY_TEMPLATE.minFreeDiskMb,
    })
    return 'built'
  }

  /**
   * A new, empty sandbox (the caller clones into it); null when E2B fails. It ends by itself
   * after `timeoutMs` should the API die first: killed, or paused for one that is kept
   * (a conversation's, which `rest` leaves to that timeout).
   */
  async create(
    timeoutMs: number = REPOSITORY_SANDBOX.timeoutMs,
    onTimeout: 'kill' | 'pause' = 'kill',
  ): Promise<OpenRepositorySandbox | null> {
    const config = researchConfig()
    if (!config) return null
    try {
      const sandbox = await Sandbox.create(REPOSITORY_TEMPLATE_NAME, {
        ...connection(config),
        timeoutMs,
        requestTimeoutMs: REPOSITORY_SANDBOX.startTimeoutMs,
        // It reaches GitHub; a private network is never reachable.
        network: { denyOut: [...RESEARCH_DENIED_RANGES] },
        // Never woken by traffic: only `resume` does it, which cuts the network again.
        lifecycle: { onTimeout, ...(onTimeout === 'pause' ? { autoResume: false } : {}) },
      })
      return handle(sandbox)
    } catch {
      return null
    }
  }

  /** The paused (or running) sandbox again, or null when it is gone. */
  async resume(sandboxId: string): Promise<OpenRepositorySandbox | null> {
    const config = researchConfig()
    if (!config) return null
    try {
      const sandbox = await Sandbox.connect(sandboxId, {
        ...connection(config),
        timeoutMs: REPOSITORY_SANDBOX.timeoutMs,
        requestTimeoutMs: REPOSITORY_SANDBOX.startTimeoutMs,
      })
      return handle(sandbox)
    } catch {
      return null
    }
  }

  /** Kills a sandbox; one already gone is not an error. */
  async kill(sandboxId: string): Promise<void> {
    const config = researchConfig()
    if (!config) return
    await Sandbox.kill(sandboxId, {
      ...connection(config),
      requestTimeoutMs: REPOSITORY_SANDBOX.closeTimeoutMs,
    }).catch(() => false)
  }
}

function connection(config: ResearchConfig) {
  return {
    apiKey: config.e2bApiKey,
    // Deprecated in the SDK, but the only way to reach a self-hosted install with e2b 2.x.
    ...(config.e2bApiUrl ? { apiUrl: config.e2bApiUrl } : {}),
    ...(config.e2bSandboxUrl ? { sandboxUrl: config.e2bSandboxUrl } : {}),
  }
}

function handle(sandbox: Sandbox): OpenRepositorySandbox {
  return {
    sandboxId: sandbox.sandboxId,
    async run(command, envs, timeoutMs = REPOSITORY_SANDBOX.commandTimeoutMs, onOutput) {
      try {
        const result = await sandbox.commands.run(command, {
          envs,
          timeoutMs,
          requestTimeoutMs: timeoutMs,
          ...(onOutput ? { onStdout: onOutput } : {}),
        })
        return { exitCode: result.exitCode, output: result.stdout }
      } catch (error) {
        // What a failing command printed is still its output (a command of the model, mostly).
        if (error instanceof CommandExitError) {
          return { exitCode: error.exitCode, output: error.stdout }
        }
        if (error instanceof TimeoutError) return { exitCode: 124, output: '' }
        return { exitCode: REPOSITORY_SANDBOX.goneExitCode, output: '' }
      }
    },
    async isolate() {
      try {
        await sandbox.updateNetwork(
          { denyOut: [ALL_TRAFFIC] },
          { requestTimeoutMs: REPOSITORY_SANDBOX.closeTimeoutMs },
        )
        return true
      } catch {
        return false
      }
    },
    async readFile(path) {
      try {
        return await sandbox.files.read(path, {
          format: 'bytes',
          requestTimeoutMs: REPOSITORY_SANDBOX.commandTimeoutMs,
        })
      } catch {
        return null
      }
    },
    async rest() {
      const requestTimeoutMs = REPOSITORY_SANDBOX.closeTimeoutMs
      try {
        await sandbox.setTimeout(REPOSITORY_SANDBOX.idleMs, { requestTimeoutMs })
      } catch {
        await sandbox.pause({ requestTimeoutMs }).catch(() => false)
      }
    },
  }
}
