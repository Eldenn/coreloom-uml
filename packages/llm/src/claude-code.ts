import { randomUUID } from 'node:crypto'
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FunctionTool,
  LanguageModelV4GenerateResult,
} from '@ai-sdk/provider'
import { simulateStreamingMiddleware, wrapLanguageModel } from 'ai'
import { LlmCallError, type LlmFailureReason } from './failure.ts'

/**
 * A model of the user's Claude subscription, called through the unmodified `claude` binary
 * (Claude Code) in print mode. The binary signs in and calls Claude itself; this code never reads
 * its credentials: the caller's runner keeps the binary's state and lends it for each launch.
 * Flags checked against Claude Code 2.1.322 on 2026-11-12.
 *
 * The binary never gets a tool. When the caller has tools (the web research), each call asks
 * it for one action as structured output: which of the caller's tools to run, or the answer.
 * The caller runs the tool and calls again with the result, one launch of the binary a step.
 */

/**
 * What a call with a connected Claude subscription needs: whose subscription it is. The caller's
 * runner keys the binary's state by it; this package never knows where that state lives.
 */
export type ClaudeCodeCredential = { kind: 'claude-code'; owner: number }

/** Runs `claude` with these arguments for this owner's subscription. Never through a shell. */
export type ClaudeRun = (
  args: string[],
  options: { stdin: string; owner: number; timeoutMs: number; signal?: AbortSignal },
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
  usage?: {
    input_tokens?: unknown
    output_tokens?: unknown
    cache_read_input_tokens?: unknown
    cache_creation_input_tokens?: unknown
  }
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
      .map((part) => {
        if (part.type === 'text') return part.text
        // Earlier steps of a call with tools: what was asked, then what came back.
        if (part.type === 'tool-call') {
          return `Action taken: ${JSON.stringify({ action: part.toolName, input: part.input })}`
        }
        if (part.type === 'tool-result') {
          const value = 'value' in part.output ? part.output.value : part.output.type
          const shown = typeof value === 'string' ? value : JSON.stringify(value)
          return `Result of ${part.toolName}:\n${shown}`
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
    if (text) messages.push(text)
  }
  return { system: system.join('\n\n'), stdin: messages.join('\n\n') }
}

/** The action that ends a call with tools. */
const ANSWER_ACTION = 'answer'

function functionTools(tools: LanguageModelV4CallOptions['tools']): LanguageModelV4FunctionTool[] {
  return (tools ?? []).filter((tool) => tool.type === 'function')
}

function actionSchema(tools: LanguageModelV4FunctionTool[]) {
  return {
    type: 'object',
    properties: {
      action: { type: 'string', enum: [...tools.map((tool) => tool.name), ANSWER_ACTION] },
      input: { type: 'object' },
      answer: { type: 'string' },
    },
    required: ['action'],
  }
}

function actionInstructions(tools: LanguageModelV4FunctionTool[]): string {
  return [
    'You cannot do anything yourself. Reply with one action at a time:',
    ...tools.map(
      (tool) =>
        `- "${tool.name}": ${tool.description ?? ''} Its "input" follows ${JSON.stringify(tool.inputSchema)}`,
    ),
    `- "${ANSWER_ACTION}": you are done; your final text goes in "answer".`,
    'After an action, you are called again with its result.',
  ].join('\n')
}

/** What the binary answered a call with tools: one tool call, or the final text. */
function actionContent(
  output: unknown,
  tools: LanguageModelV4FunctionTool[],
): LanguageModelV4Content[] {
  const value = (output && typeof output === 'object' ? output : {}) as Record<string, unknown>
  if (tools.some((tool) => tool.name === value.action)) {
    return [
      {
        type: 'tool-call',
        toolCallId: randomUUID(),
        toolName: String(value.action),
        input: JSON.stringify(value.input ?? {}),
      },
    ]
  }
  // An action that names none of the tools runs nothing: only its text is kept.
  return [{ type: 'text', text: typeof value.answer === 'string' ? value.answer : '' }]
}

function tokens(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

export function createClaudeCodeModel(
  model: string,
  credential: ClaudeCodeCredential,
  run: ClaudeRun,
): LanguageModelV4 {
  const generating: LanguageModelV4 = {
    specificationVersion: 'v4',
    provider: 'claude-code',
    modelId: model,
    supportedUrls: {},
    async doGenerate(options): Promise<LanguageModelV4GenerateResult> {
      const parts = promptParts(options.prompt)
      const stdin = parts.stdin
      // A caller that forbids tools for this call (the last step of a loop) gets a plain answer.
      const tools = options.toolChoice?.type === 'none' ? [] : functionTools(options.tools)
      const system = tools.length
        ? [parts.system, actionInstructions(tools)].filter(Boolean).join('\n\n')
        : parts.system
      // ponytail: a call with tools ignores a response format; no caller asks for both.
      const format = tools.length
        ? ({ type: 'json', schema: actionSchema(tools) } as const)
        : options.responseFormat
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
        owner: credential.owner,
        timeoutMs: CLAUDE_CODE_TIMEOUT_MS,
        // The caller's own timeout (connection test, proposals) stops the binary too.
        signal: options.abortSignal,
      })
      if (outcome.missing) throw new LlmCallError('unreachable')
      if (outcome.timedOut || options.abortSignal?.aborted) throw new LlmCallError('timeout')
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
      // As the Messages API counts them: `input_tokens` are the uncached ones, beside the cache's.
      const noCache = tokens(result.usage?.input_tokens)
      const cacheRead = tokens(result.usage?.cache_read_input_tokens)
      const cacheWrite = tokens(result.usage?.cache_creation_input_tokens)
      const input =
        noCache === undefined && cacheRead === undefined && cacheWrite === undefined
          ? undefined
          : (noCache ?? 0) + (cacheRead ?? 0) + (cacheWrite ?? 0)
      const output = tokens(result.usage?.output_tokens)
      const content: LanguageModelV4Content[] = tools.length
        ? actionContent(parse(text), tools)
        : [{ type: 'text', text }]
      const called = content.some((part) => part.type === 'tool-call')
      return {
        content,
        finishReason: called
          ? { unified: 'tool-calls', raw: 'tool-calls' }
          : { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: input, noCache, cacheRead, cacheWrite },
          outputTokens: { total: output, text: output, reasoning: undefined },
        },
        warnings: [],
      }
    },
    async doStream() {
      throw new Error('Replaced by simulateStreamingMiddleware')
    },
  }
  // The binary answers whole: a stream gets that answer as one delta.
  return wrapLanguageModel({ model: generating, middleware: simulateStreamingMiddleware() })
}
