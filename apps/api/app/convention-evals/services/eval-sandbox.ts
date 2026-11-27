import { ALL_TRAFFIC, CommandExitError, Sandbox, Template, TimeoutError } from 'e2b'
import {
  CONVENTION_EVAL_LIMITS,
  EVAL_SANDBOX_METADATA,
} from '#app/convention-evals/constants/convention-evals'
import {
  EVAL_TEMPLATE,
  EVAL_TEMPLATE_NAME,
  evalTemplateCommands,
  evalTemplateUserCommands,
} from '#app/convention-evals/constants/eval-sandbox'
import { RESEARCH_DENIED_RANGES } from '#app/research/constants/research'
import { type ResearchConfig, researchConfig } from '#app/research/services/research-config'

/** Answered for a command the sandbox never answered (gone, unreachable). */
export const GONE_EXIT_CODE = 125
/** Answered for a command that ran out of time, as `timeout(1)` does. */
export const TIMEOUT_EXIT_CODE = 124

export type EvalSandboxUser = 'user' | 'root'

/** One trial's sandbox (path II). */
export type OpenEvalSandbox = {
  sandboxId: string
  /** Runs a fixed command line of `eval-commands.ts`; never throws. */
  run(
    command: string,
    envs: Record<string, string>,
    options?: { user?: EvalSandboxUser; timeoutMs?: number },
  ): Promise<{ exitCode: number; output: string }>
  /** Cuts the sandbox off every network, again: false when E2B did not confirm it. */
  isolate(): Promise<boolean>
  /** Writes bytes to a path of the sandbox; false when E2B refused. */
  upload(path: string, data: Uint8Array, user?: EvalSandboxUser): Promise<boolean>
  /** Pushes its end back by `sandboxTimeoutMs`: called every `sandboxRenewMs` while it works. */
  renew(): Promise<void>
  kill(): Promise<void>
}

/** A sandbox as E2B lists it, for the sweep and the end of a run. */
export type ListedSandbox = {
  sandboxId: string
  metadata: Record<string, string>
  startedAt: Date
}

/**
 * The E2B sandboxes of the convention tests: the harness's own (one per trial, path II) and, for
 * their cleanup, those Harbor creates (path I). With `ResearchSandbox` and `RepositorySandbox`,
 * the only files of the API that import `e2b`. Resolved from the container, so tests swap it and
 * never reach E2B. A harness sandbox starts from `EVAL_TEMPLATE_NAME`, gets no environment
 * variable and no file of ours beyond the trial's workspace and the graders, is cut off every
 * network from its creation (and once more, confirmed, before anything runs), ends by itself
 * `sandboxTimeoutMs` after its last renewal, and is killed when its trial ends.
 */
export default class EvalSandboxes {
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
    if (await Template.exists(EVAL_TEMPLATE_NAME, connection(config))) return 'ready'
    const template = Template()
      .fromTemplate(EVAL_TEMPLATE.from)
      .runCmd(evalTemplateCommands(), { user: 'root' })
      .runCmd(evalTemplateUserCommands(), { user: 'user' })
    await Template.build(template, EVAL_TEMPLATE_NAME, {
      ...connection(config),
      cpuCount: EVAL_TEMPLATE.cpuCount,
      memoryMB: EVAL_TEMPLATE.memoryMB,
    })
    return 'built'
  }

  /** A new trial sandbox with no network at all; null when E2B fails. */
  async create(meta: { runId: number; accountId: number }): Promise<OpenEvalSandbox | null> {
    const config = researchConfig()
    if (!config) return null
    try {
      const sandbox = await Sandbox.create(EVAL_TEMPLATE_NAME, {
        ...connection(config),
        timeoutMs: CONVENTION_EVAL_LIMITS.sandboxTimeoutMs,
        requestTimeoutMs: CONVENTION_EVAL_LIMITS.sandboxStartTimeoutMs,
        metadata: {
          [EVAL_SANDBOX_METADATA.purposeKey]: EVAL_SANDBOX_METADATA.purpose,
          [EVAL_SANDBOX_METADATA.runKey]: String(meta.runId),
          [EVAL_SANDBOX_METADATA.accountKey]: String(meta.accountId),
        },
        network: { denyOut: [ALL_TRAFFIC, ...RESEARCH_DENIED_RANGES] },
        lifecycle: { onTimeout: 'kill' },
      })
      return handle(sandbox)
    } catch {
      return null
    }
  }

  /** Every sandbox E2B lists, running or paused, that carries all of `metadata`. */
  async list(metadata: Record<string, string>): Promise<ListedSandbox[]> {
    const config = researchConfig()
    if (!config) return []
    const paginator = Sandbox.list({
      ...connection(config),
      requestTimeoutMs: CONVENTION_EVAL_LIMITS.sandboxRequestTimeoutMs,
      query: { metadata, state: ['running', 'paused'] },
    })
    const listed: ListedSandbox[] = []
    while (paginator.hasNext) {
      for (const info of await paginator.nextItems()) {
        listed.push({
          sandboxId: info.sandboxId,
          metadata: info.metadata,
          startedAt: info.startedAt,
        })
      }
    }
    return listed
  }

  /** Kills a sandbox; one already gone is not an error. */
  async kill(sandboxId: string): Promise<void> {
    const config = researchConfig()
    if (!config) return
    await Sandbox.kill(sandboxId, {
      ...connection(config),
      requestTimeoutMs: CONVENTION_EVAL_LIMITS.sandboxRequestTimeoutMs,
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

function handle(sandbox: Sandbox): OpenEvalSandbox {
  const requestTimeoutMs = CONVENTION_EVAL_LIMITS.sandboxRequestTimeoutMs
  return {
    sandboxId: sandbox.sandboxId,
    async run(command, envs, options = {}) {
      const timeoutMs = options.timeoutMs ?? CONVENTION_EVAL_LIMITS.shellSeconds * 1000 + 10_000
      try {
        const result = await sandbox.commands.run(command, {
          envs,
          timeoutMs,
          requestTimeoutMs: timeoutMs,
          user: options.user ?? 'user',
        })
        return { exitCode: result.exitCode, output: result.stdout }
      } catch (error) {
        if (error instanceof CommandExitError) {
          return { exitCode: error.exitCode, output: error.stdout }
        }
        if (error instanceof TimeoutError) return { exitCode: TIMEOUT_EXIT_CODE, output: '' }
        return { exitCode: GONE_EXIT_CODE, output: '' }
      }
    },
    async isolate() {
      try {
        await sandbox.updateNetwork(
          { denyOut: [ALL_TRAFFIC, ...RESEARCH_DENIED_RANGES] },
          { requestTimeoutMs },
        )
        return true
      } catch {
        return false
      }
    },
    async upload(path, data, user = 'user') {
      try {
        const bytes = new Uint8Array(data)
        await sandbox.files.write(path, bytes.buffer, { user, requestTimeoutMs })
        return true
      } catch {
        return false
      }
    },
    async renew() {
      await sandbox
        .setTimeout(CONVENTION_EVAL_LIMITS.sandboxTimeoutMs, { requestTimeoutMs })
        .catch(() => undefined)
    },
    async kill() {
      await sandbox.kill({ requestTimeoutMs }).catch(() => false)
    },
  }
}
