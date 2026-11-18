import { MockLanguageModelV4 } from 'ai/test'

/**
 * Stand-in models for tests, built on the AI SDK's own mock: no test ever calls a real provider.
 */

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
}

/** A model that answers every call with this text (JSON for structured output). */
export function answeringModel(text: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: USAGE,
      warnings: [],
    }),
  })
}

/** A model whose every call throws this error. */
export function failingModel(error: unknown): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async () => {
      throw error
    },
  })
}

/** To simulate a provider's HTTP errors (401, 404, 429, 500…). */
export { APICallError } from 'ai'
export { MockLanguageModelV4 }

/** One step of a tool-calling model: the tools it calls, or the text it ends with. */
export type ModelStep =
  | { calls: { tool: string; input: unknown }[] }
  | { text: string }
  /** Never answers: the call ends when the caller's timeout aborts it. */
  | { hang: true }

/** A model whose n-th call answers the n-th step, and the last step ever after. */
export function toolCallingModel(steps: readonly ModelStep[]): MockLanguageModelV4 {
  let index = 0
  return new MockLanguageModelV4({
    doGenerate: async (options) => {
      const step = steps[Math.min(index, steps.length - 1)]
      if (!step) throw new Error('toolCallingModel needs at least one step')
      const id = index++
      if ('hang' in step) {
        return new Promise((_, reject) => {
          const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          if (options.abortSignal?.aborted) abort()
          options.abortSignal?.addEventListener('abort', abort)
        })
      }
      if ('text' in step) {
        return {
          content: [{ type: 'text', text: step.text }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: USAGE,
          warnings: [],
        }
      }
      return {
        content: step.calls.map((call, n) => ({
          type: 'tool-call' as const,
          toolCallId: `call-${id}-${n}`,
          toolName: call.tool,
          input: JSON.stringify(call.input),
        })),
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage: USAGE,
        warnings: [],
      }
    },
  })
}
