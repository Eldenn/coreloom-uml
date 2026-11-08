/**
 * The kinds of LLM provider a user can bring their own key for, and a few model suggestions
 * per kind for the model picker (the field also takes any other model name).
 *
 * Suggestions verified on 2026-11-08 against each provider's model list. Mistral and Ollama
 * names are the providers' moving aliases; `openai-compatible` has none, since it depends on
 * the server.
 */
export const ProviderKind = {
  Anthropic: 'anthropic',
  OpenAI: 'openai',
  Mistral: 'mistral',
  Ollama: 'ollama',
  OpenAICompatible: 'openai-compatible',
} as const

export type ProviderKind = (typeof ProviderKind)[keyof typeof ProviderKind]

export const PROVIDER_KINDS = Object.values(ProviderKind) as readonly ProviderKind[]

/** Kinds that call a server the user names (`baseUrl`), checked against an allowlist. */
export const PROVIDER_KINDS_WITH_BASE_URL: readonly ProviderKind[] = [
  ProviderKind.Ollama,
  ProviderKind.OpenAICompatible,
]

export const MODEL_SUGGESTIONS_VERIFIED_ON = '2026-11-08'

export const MODEL_SUGGESTIONS: Readonly<Record<ProviderKind, readonly string[]>> = {
  [ProviderKind.Anthropic]: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  [ProviderKind.OpenAI]: ['gpt-6.1-sol', 'gpt-6-luna', 'gpt-5.5'],
  [ProviderKind.Mistral]: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
  [ProviderKind.Ollama]: ['qwen3', 'gpt-oss', 'llama3.3'],
  [ProviderKind.OpenAICompatible]: [],
}
