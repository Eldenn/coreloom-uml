import { ProviderKind } from '#app/llm-connections/constants/llm-connections'

/**
 * What a convention test costs, per million tokens and in US dollars, as each provider listed it
 * on `EVAL_PRICES_CHECKED_ON` (standard tier, 5-minute cache writes for Anthropic, 30-minute ones
 * for OpenAI; Mistral lists no cache write, priced as plain input). Re-read `EVAL_PRICE_SOURCES`
 * and raise the date when changing a figure. A subscription is priced as the key of the same
 * provider would be (an equivalent cost, so its cap means the same). A model missing here is
 * priced as its provider's most expensive one listed; a kind with no table (`ollama`,
 * `openai-compatible`) is not priced, and its run is capped in tokens instead.
 */
export const EVAL_PRICES_CHECKED_ON = '2026-11-27'

export const EVAL_PRICE_SOURCES = [
  'https://platform.claude.com/docs/en/about-claude/pricing',
  'https://developers.openai.com/api/docs/pricing',
  'https://docs.mistral.ai/inference/pricing',
] as const

export type EvalPrice = { input: number; cachedInput: number; cacheWrite: number; output: number }

const price = (input: number, output: number, cachedInput: number, cacheWrite: number) =>
  ({ input, output, cachedInput, cacheWrite }) satisfies EvalPrice

/** The provider tables, by model id. */
export const EVAL_PRICES = {
  anthropic: {
    'claude-fable-5-2': price(8, 40, 0.2, 10),
    'claude-fable-5-1': price(10, 50, 0.25, 12.5),
    'claude-opus-5-5': price(4, 20, 0.2, 5),
    'claude-opus-5': price(5, 25, 0.5, 6.25),
    'claude-sonnet-5-5': price(2, 10, 0.1, 2.5),
    'claude-sonnet-5': price(2, 10, 0.2, 2.5),
    // The rate for prompts over 100,000 tokens: a trial's prompts may pass it.
    'claude-haiku-5-5': price(0.5, 2.5, 0.05, 0.625),
  },
  openai: {
    'gpt-6.2-astra': price(8, 40, 0.4, 10),
    'gpt-6.2-sol': price(2, 10, 0.1, 2.5),
    'gpt-6-astra': price(10, 50, 1, 12.5),
    'gpt-6.1-sol': price(2, 10, 0.1, 2.5),
  },
  mistral: {
    'mistral-large-4': price(0.7, 2.1, 0.07, 0.7),
    'mistral-small-2603': price(0.15, 0.6, 0.15, 0.15),
    'codestral-2508': price(0.3, 0.9, 0.3, 0.3),
    'zai-glm-5-3': price(1.4, 4.4, 0.14, 1.4),
    'zai-glm-5-3-flash': price(0.15, 0.5, 0.03, 0.15),
    'deepseek-v4-1-flash-1017': price(0.3, 1.2, 0.007, 0.3),
    'ministral-14b-2512': price(0.2, 0.2, 0.2, 0.2),
    'ministral-8b-2512': price(0.15, 0.15, 0.15, 0.15),
    'ministral-3b-2512': price(0.1, 0.1, 0.1, 0.1),
  },
} as const satisfies Record<string, Record<string, EvalPrice>>

type PriceTable = keyof typeof EVAL_PRICES

/** Which table prices a kind: the provider a subscription calls for the subscriptions. */
export const PRICE_TABLE_OF: Partial<Record<ProviderKind, PriceTable>> = {
  [ProviderKind.Anthropic]: 'anthropic',
  [ProviderKind.ClaudeCode]: 'anthropic',
  [ProviderKind.OpenAI]: 'openai',
  [ProviderKind.OpenAICodex]: 'openai',
  [ProviderKind.Mistral]: 'mistral',
}

/** The model a `claude-code` alias stands for, as the binary resolves it today. */
export const CLAUDE_CODE_ALIASES: Readonly<Record<string, string>> = {
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
  haiku: 'claude-haiku-5-5',
  fable: 'claude-fable-5-2',
}
