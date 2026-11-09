import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
} from '@ai-sdk/provider'
import { LlmCallError, type LlmFailureReason } from './failure.ts'

/**
 * A model of the user's Claude subscription, called through the unmodified `claude` binary
 * (Claude Code) in print mode. The binary holds the user's credentials in its own configuration
 * folder; this code never reads them. Flags checked against Claude Code 2.1.319 on 2026-11-09.
 */

/** What a call with a connected Claude subscription needs: the account's own folder. */
export type ClaudeCodeCredential = { kind: 'claude-code'; configDir: string }

/** Runs `claude` with these arguments in this folder. Never through a shell. */
export type ClaudeRun = (
  args: string[],
  options: { stdin: string; configDir: string; timeoutMs: number },
) => Promise<{
  exitCode: number | null
  stdout: string
  timedOut: boolean
  /** The binary is not installed. */
  missing: boolean
}>

export const CLAUDE_CODE_TIMEOUT_MS = 120_000

/** The JSON object in a text: without a Markdown fence or prose around it. */
export function jsonFromText(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start >= 0 && end > start ? text.slice(start, end + 1) : text.trim()
}

type PrintResult = {
  is_error?: unknown
  result?: unknown
  structured_output?: unknown
  usage?: { input_tokens?: unknown; output_tokens?: unknown }
}

function parse(stdout: string): PrintResult | null {
  try {
    const value = JSON.parse(stdout)
    return value && typeof value === 'object' ? (value as PrintResult) : null
  } catch {
    return null
  }
}

// ponytail: matches the binary's English messages; switch to an error code if a future version
// exposes one.
function reasonOf(result: PrintResult | null): LlmFailureReason {
  const text = typeof result?.result === 'string' ? result.result : ''
  if (/not logged in|\/login|invalid api key|oauth/i.test(text)) return 'subscription_expired'
  if (/credit|usage limit|limit reached|rate limit/i.test(text)) return 'rate_limited'
  return 'unknown'
}

function promptParts(prompt: LanguageModelV4CallOptions['prompt']) {
  const system: string[] = []
  const messages: string[] = []
  for (const message of prompt) {
    if (message.role === 'system') {
      system.push(message.content)
      continue
    }
    const text = message.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .filter(Boolean)
      .join('\n')
    if (text) messages.push(text)
  }
  return { system: system.join('\n\n'), stdin: messages.join('\n\n') }
}

function tokens(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

export function createClaudeCodeModel(
  model: string,
  credential: ClaudeCodeCredential,
  run: ClaudeRun,
): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'claude-code',
    modelId: model,
    supportedUrls: {},
    async doGenerate(options): Promise<LanguageModelV4GenerateResult> {
      const { system, stdin } = promptParts(options.prompt)
      const format = options.responseFormat
      const wantsJson = format?.type === 'json'
      const args = [
        '-p',
        '--output-format',
        'json',
        // One argument, so a name starting with `-` cannot read as a flag.
        `--model=${model}`,
        '--tools',
        '',
        '--no-session-persistence',
        '--safe-mode',
        '--strict-mcp-config',
        ...(system ? ['--system-prompt', system] : []),
        ...(wantsJson && format.schema ? ['--json-schema', JSON.stringify(format.schema)] : []),
      ]
      const outcome = await run(args, {
        stdin,
        configDir: credential.configDir,
        timeoutMs: CLAUDE_CODE_TIMEOUT_MS,
      })
      if (outcome.missing) throw new LlmCallError('unreachable')
      if (outcome.timedOut) throw new LlmCallError('timeout')
      const result = parse(outcome.stdout)
      if (outcome.exitCode !== 0 || !result || result.is_error === true) {
        throw new LlmCallError(reasonOf(result))
      }
      const raw = typeof result.result === 'string' ? result.result : ''
      const text =
        result.structured_output !== undefined && result.structured_output !== null
          ? JSON.stringify(result.structured_output)
          : wantsJson
            ? jsonFromText(raw)
            : raw
      const input = tokens(result.usage?.input_tokens)
      const output = tokens(result.usage?.output_tokens)
      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: {
            total: input,
            noCache: input,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: output, text: output, reasoning: undefined },
        },
        warnings: [],
      }
    },
    async doStream() {
      throw new Error('The claude-code provider does not stream')
    },
  }
}
