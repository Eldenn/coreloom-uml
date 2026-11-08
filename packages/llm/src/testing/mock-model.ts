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
