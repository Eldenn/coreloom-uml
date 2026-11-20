import { CommandExitError, Sandbox, TimeoutError } from 'e2b'
import { REPOSITORY_SANDBOX } from '#app/assistant/constants/repository'
import { RESEARCH_DENIED_RANGES } from '#app/research/constants/research'
import { type ResearchConfig, researchConfig } from '#app/research/services/research-config'

/** One run of a fixed command line: its exit code and its output, already capped. */
export type RepositoryRun = (
  command: string,
  envs: Record<string, string>,
  timeoutMs?: number,
) => Promise<{ exitCode: number; output: string }>

export type OpenRepositorySandbox = {
  sandboxId: string
  run: RepositoryRun
  /** Pauses it until the next message (`resume`); the clone stays in it. */
  pause(): Promise<void>
}

/**
 * The E2B sandbox holding a repository for the workspace assistant: with `ResearchSandbox`, the
 * only files that import `e2b`. Resolved from the container, so tests swap it and never reach
 * E2B. It gets no file of ours and no key: the only secret it ever sees is an installation token
 * for its one repository, as an environment variable of one git command (never a file), revoked
 * when the message ends. It runs only the fixed command lines of `repository-commands.ts`, may
 * not reach a private address range, is paused between messages and killed with its
 * conversation, its account, or after `maxIdleDays` unused.
 */
export default class RepositorySandbox {
  /** Whether this server can run sandboxes (`E2B_API_KEY`). */
  configured(): boolean {
    return researchConfig() !== null
  }

  /** A new, empty sandbox (the session clones into it); null when E2B fails. */
  async create(): Promise<OpenRepositorySandbox | null> {
    const config = researchConfig()
    if (!config) return null
    try {
      const sandbox = await Sandbox.create({
        ...connection(config),
        timeoutMs: REPOSITORY_SANDBOX.timeoutMs,
        requestTimeoutMs: REPOSITORY_SANDBOX.startTimeoutMs,
        // It reaches GitHub; a private network is never reachable.
        network: { denyOut: [...RESEARCH_DENIED_RANGES] },
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
    async run(command, envs, timeoutMs = REPOSITORY_SANDBOX.commandTimeoutMs) {
      try {
        const result = await sandbox.commands.run(command, {
          envs,
          timeoutMs,
          requestTimeoutMs: timeoutMs,
        })
        return { exitCode: result.exitCode, output: result.stdout }
      } catch (error) {
        if (error instanceof CommandExitError) return { exitCode: error.exitCode, output: '' }
        if (error instanceof TimeoutError) return { exitCode: 124, output: '' }
        return { exitCode: 1, output: '' }
      }
    },
    async pause() {
      await sandbox
        .pause({ requestTimeoutMs: REPOSITORY_SANDBOX.closeTimeoutMs })
        .catch(() => false)
    },
  }
}
