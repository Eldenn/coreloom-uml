import { LlmCallError, LlmFailureReason, type ResearchTools } from '@coreloom-uml/llm'
import { CommandExitError, Sandbox, TimeoutError } from 'e2b'
import {
  RESEARCH_COMMAND_TIMEOUT_MS,
  RESEARCH_DENIED_RANGES,
  RESEARCH_SANDBOX_CLOSE_TIMEOUT_MS,
  RESEARCH_SANDBOX_START_TIMEOUT_MS,
  RESEARCH_SANDBOX_TIMEOUT_MS,
  RESEARCH_TIMEOUT_EXIT_CODE,
} from '#app/research/constants/research'
import { isWebUrl, pageFromHtml } from '#app/research/services/page-text'
import type { ResearchConfig } from '#app/research/services/research-config'
import { FETCH_PAGE, RUN_COMMAND } from '#app/research/services/sandbox-commands'

export type OpenSandbox = { tools: ResearchTools; close(): Promise<void> }

/**
 * The E2B sandbox a web research runs its tools in: the only file that imports `e2b`. Resolved
 * from the container, so tests swap it (`app.container.swap(ResearchSandbox, ...)`) and never
 * reach E2B.
 *
 * It runs two fixed command lines only (`sandbox-commands.ts`): a URL or the model's command
 * reaches them as an environment variable of that one run. The sandbox itself gets no
 * environment variable and no file of ours: it holds nothing worth taking,
 * and it is killed when the research ends (`close`), or by E2B itself after
 * `RESEARCH_SANDBOX_TIMEOUT_MS` should the API die first.
 */
export default class ResearchSandbox {
  async open(config: ResearchConfig): Promise<OpenSandbox> {
    let sandbox: Sandbox
    try {
      sandbox = await Sandbox.create({
        apiKey: config.e2bApiKey,
        // Deprecated in the SDK, but the only way to reach a self-hosted install with e2b 2.x.
        ...(config.e2bApiUrl ? { apiUrl: config.e2bApiUrl } : {}),
        ...(config.e2bSandboxUrl ? { sandboxUrl: config.e2bSandboxUrl } : {}),
        timeoutMs: RESEARCH_SANDBOX_TIMEOUT_MS,
        requestTimeoutMs: RESEARCH_SANDBOX_START_TIMEOUT_MS,
        // The web, never a private network: on a self-hosted install that is the operator's.
        network: { denyOut: [...RESEARCH_DENIED_RANGES] },
      })
    } catch {
      // The SDK's error may name the key or the install: only the reason leaves this file.
      throw new LlmCallError(LlmFailureReason.SandboxUnavailable)
    }

    const run = async (command: string, envs: Record<string, string>, signal?: AbortSignal) => {
      try {
        const result = await sandbox.commands.run(command, {
          envs,
          timeoutMs: RESEARCH_COMMAND_TIMEOUT_MS,
          // A sandbox that stopped answering is given up on with the command, not a minute later.
          requestTimeoutMs: RESEARCH_COMMAND_TIMEOUT_MS,
          signal,
        })
        return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }
      } catch (error) {
        if (error instanceof CommandExitError) {
          return { exitCode: error.exitCode, stdout: error.stdout, stderr: error.stderr }
        }
        if (error instanceof TimeoutError) {
          return { exitCode: RESEARCH_TIMEOUT_EXIT_CODE, stdout: '', stderr: 'Timed out.' }
        }
        // The sandbox is gone (ended, unreachable): the tool fails, the research goes on.
        return { exitCode: 1, stdout: '', stderr: 'The sandbox did not answer.' }
      }
    }

    return {
      tools: {
        async readPage(url, signal) {
          if (!isWebUrl(url)) return null
          const fetched = await run(FETCH_PAGE, { PAGE_URL: url }, signal)
          // A binary body is not a page.
          if (fetched.exitCode !== 0 || fetched.stdout.includes('\u0000')) return null
          return pageFromHtml(fetched.stdout, url)
        },
        async run(command, signal) {
          const outcome = await run(RUN_COMMAND, { RESEARCH_COMMAND: command }, signal)
          return {
            exitCode: outcome.exitCode,
            output: [outcome.stdout, outcome.stderr].filter(Boolean).join('\n'),
          }
        },
      },
      async close() {
        await sandbox
          .kill({ requestTimeoutMs: RESEARCH_SANDBOX_CLOSE_TIMEOUT_MS })
          .catch(() => false)
      },
    }
  }
}
