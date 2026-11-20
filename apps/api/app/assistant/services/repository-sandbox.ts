import { CommandExitError, Sandbox, TimeoutError } from 'e2b'
import { REPOSITORY_SANDBOX } from '#app/assistant/constants/repository'
import { UNPACK } from '#app/assistant/services/repository-commands'
import { RESEARCH_DENIED_RANGES } from '#app/research/constants/research'
import { type ResearchConfig, researchConfig } from '#app/research/services/research-config'

/** One run of a fixed command line: its exit code and its output, already capped. */
export type RepositoryRun = (
  command: string,
  envs: Record<string, string>,
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
 * E2B. It gets no environment variable and no file of ours but the repository's archive, which
 * the analyzer made (no token, key or credential ever enters it); it runs only the fixed command
 * lines of `repository-commands.ts`, may not reach a private address range, is paused between
 * messages and killed with its conversation, its account, or after `maxIdleDays` unused.
 */
export default class RepositorySandbox {
  /** Whether this server can run sandboxes (`E2B_API_KEY`). */
  configured(): boolean {
    return researchConfig() !== null
  }

  /** A new sandbox holding the archive unpacked at `REPOSITORY_SANDBOX.root`; null when E2B fails. */
  async create(archive: Uint8Array): Promise<OpenRepositorySandbox | null> {
    const config = researchConfig()
    if (!config) return null
    let sandbox: Sandbox
    try {
      sandbox = await Sandbox.create({
        ...connection(config),
        timeoutMs: REPOSITORY_SANDBOX.timeoutMs,
        requestTimeoutMs: REPOSITORY_SANDBOX.startTimeoutMs,
        // The repository needs no network; a private network is never reachable.
        network: { denyOut: [...RESEARCH_DENIED_RANGES] },
      })
    } catch {
      return null
    }
    const open = handle(sandbox)
    try {
      await sandbox.files.write(
        REPOSITORY_SANDBOX.archivePath,
        archive.buffer.slice(
          archive.byteOffset,
          archive.byteOffset + archive.byteLength,
        ) as ArrayBuffer,
      )
      const unpacked = await open.run(UNPACK, {
        ARCHIVE_PATH: REPOSITORY_SANDBOX.archivePath,
        REPO_ROOT: REPOSITORY_SANDBOX.root,
      })
      if (unpacked.exitCode === 0) return open
    } catch {
      // Answered below like a failed unpack.
    }
    await this.kill(sandbox.sandboxId)
    return null
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
    async run(command, envs) {
      try {
        const result = await sandbox.commands.run(command, {
          envs,
          timeoutMs: REPOSITORY_SANDBOX.commandTimeoutMs,
          requestTimeoutMs: REPOSITORY_SANDBOX.commandTimeoutMs,
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
