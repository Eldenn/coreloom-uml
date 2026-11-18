import { LlmCallError, LlmFailureReason, type ResearchTools } from '@coreloom-uml/llm'
import { CommandExitError, Sandbox, TimeoutError } from 'e2b'
import {
  RESEARCH_COMMAND_TIMEOUT_MS,
  RESEARCH_PAGE_MAX_BYTES,
  RESEARCH_PAGE_TIMEOUT_SECONDS,
  RESEARCH_SANDBOX_TIMEOUT_MS,
  RESEARCH_TIMEOUT_EXIT_CODE,
} from '#app/research/constants/research'
import { isWebUrl, pageFromHtml } from '#app/research/services/page-text'
import type { ResearchConfig } from '#app/research/services/research-config'

/**
 * Fetches one page. The URL comes in as an environment variable of this one command, never as
 * part of the command line, so nothing a page or a model writes is ever read by the shell.
 * Redirects are followed only to http and https.
 */
const FETCH_PAGE = [
  'curl -sSL --compressed',
  `--max-time ${RESEARCH_PAGE_TIMEOUT_SECONDS}`,
  `--max-filesize ${RESEARCH_PAGE_MAX_BYTES}`,
  "--proto '=http,https' --proto-redir '=http,https'",
  '-- "$PAGE_URL"',
].join(' ')

export type OpenSandbox = { tools: ResearchTools; close(): Promise<void> }

/**
 * The E2B sandbox a web research runs its tools in: the only file that imports `e2b`. Resolved
 * from the container, so tests swap it (`app.container.swap(ResearchSandbox, ...)`) and never
 * reach E2B.
 *
 * The sandbox gets no environment variable and no file of ours: it holds nothing worth taking,
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
      })
    } catch {
      // The SDK's error may name the key or the install: only the reason leaves this file.
      throw new LlmCallError(LlmFailureReason.SandboxUnavailable)
    }

    const run = async (command: string, envs?: Record<string, string>) => {
      try {
        const result = await sandbox.commands.run(command, {
          envs,
          timeoutMs: RESEARCH_COMMAND_TIMEOUT_MS,
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
        async readPage(url) {
          if (!isWebUrl(url)) return null
          const fetched = await run(FETCH_PAGE, { PAGE_URL: url })
          // A binary body is not a page.
          if (fetched.exitCode !== 0 || fetched.stdout.includes('\u0000')) return null
          return pageFromHtml(fetched.stdout, url)
        },
        async run(command) {
          const outcome = await run(command)
          return {
            exitCode: outcome.exitCode,
            output: [outcome.stdout, outcome.stderr].filter(Boolean).join('\n'),
          }
        },
      },
      async close() {
        await sandbox.kill().catch(() => false)
      },
    }
  }
}
