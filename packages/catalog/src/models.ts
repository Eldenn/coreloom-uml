/**
 * The kinds of LLM provider a user can call: with their own key, or with a subscription they
 * connect (`openai-codex` for ChatGPT, `claude-code` for Claude). A few model suggestions per kind
 * feed the model picker (the field also takes any other model name).
 *
 * Suggestions verified on 2026-11-09 against each provider's model list. Mistral and Ollama
 * names are the providers' moving aliases; `openai-compatible` has none, since it depends on
 * the server. `openai-codex` follows Hermes Agent's default Codex list
 * (`hermes_cli/codex_models.py` at 86b9622f018463e5d2df1a372069ac5778df7dd5); `claude-code` takes
 * the `claude` binary's aliases.
 */
export const ProviderKind = {
  Anthropic: 'anthropic',
  OpenAI: 'openai',
  Mistral: 'mistral',
  Ollama: 'ollama',
  OpenAICompatible: 'openai-compatible',
  OpenAICodex: 'openai-codex',
  ClaudeCode: 'claude-code',
} as const

export type ProviderKind = (typeof ProviderKind)[keyof typeof ProviderKind]

export const PROVIDER_KINDS = Object.values(ProviderKind) as readonly ProviderKind[]

/** Kinds that call a server the user names (`baseUrl`), checked against an allowlist. */
export const PROVIDER_KINDS_WITH_BASE_URL: readonly ProviderKind[] = [
  ProviderKind.Ollama,
  ProviderKind.OpenAICompatible,
]

/** How a kind authenticates: a key sent with each call, or a subscription connected once. */
export const ProviderAuth = {
  ApiKey: 'apiKey',
  Subscription: 'subscription',
} as const

export type ProviderAuth = (typeof ProviderAuth)[keyof typeof ProviderAuth]

/** Kinds that take no key and no base URL: the user connects their subscription instead. */
export const PROVIDER_KINDS_WITH_SUBSCRIPTION: readonly ProviderKind[] = [
  ProviderKind.OpenAICodex,
  ProviderKind.ClaudeCode,
]

export function providerAuth(kind: ProviderKind): ProviderAuth {
  return PROVIDER_KINDS_WITH_SUBSCRIPTION.includes(kind)
    ? ProviderAuth.Subscription
    : ProviderAuth.ApiKey
}

export const MODEL_SUGGESTIONS_VERIFIED_ON = '2026-11-09'

export const MODEL_SUGGESTIONS: Readonly<Record<ProviderKind, readonly string[]>> = {
  [ProviderKind.Anthropic]: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  [ProviderKind.OpenAI]: ['gpt-6.1-sol', 'gpt-6-luna', 'gpt-5.5'],
  [ProviderKind.Mistral]: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
  [ProviderKind.Ollama]: ['qwen3', 'gpt-oss', 'llama3.3'],
  [ProviderKind.OpenAICompatible]: [],
  [ProviderKind.OpenAICodex]: ['gpt-6-sol', 'gpt-6-luna', 'gpt-5.5'],
  [ProviderKind.ClaudeCode]: ['sonnet', 'opus', 'haiku'],
}
