/**
 * The kinds of LLM provider a user can call: with their own key, or with a subscription they
 * connect (`openai-codex` for ChatGPT, `claude-code` for Claude). The model suggestions per kind
 * feed the model picker, most useful first (the first is the default); the field also takes any
 * other model name.
 *
 * Suggestions verified on 2026-11-09 against each provider's model list: every model Anthropic,
 * OpenAI and Mistral list as available and not deprecated, minus the ones reserved to approved
 * organizations (Claude Mythos, GPT cyber models). Anthropic: platform.claude.com/docs models
 * overview and model deprecations; OpenAI: developers.openai.com/api/docs/models/all; Mistral:
 * docs.mistral.ai/models (pinned identifiers, no `-latest` alias listed). Ollama's library has no
 * end: these are its most pulled current text models. `openai-compatible` has none, since it
 * depends on the server. `openai-codex` follows Hermes Agent's default Codex list
 * (`hermes_cli/codex_models.py` at 86b9622f018463e5d2df1a372069ac5778df7dd5;
 * `gpt-5.3-codex-spark` is for ChatGPT Pro only); `claude-code` takes the `claude` binary's
 * aliases first, then the full Claude model names.
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

const CLAUDE_MODELS = [
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
  'claude-fable-5-2',
  'claude-fable-5-1',
  'claude-fable-5',
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-opus-4-5-20251101',
  'claude-haiku-4-5-20251001',
] as const

export const MODEL_SUGGESTIONS: Readonly<Record<ProviderKind, readonly string[]>> = {
  [ProviderKind.Anthropic]: CLAUDE_MODELS,
  [ProviderKind.OpenAI]: [
    'gpt-6.1-sol',
    'gpt-6-astra',
    'gpt-6.1-terra',
    'gpt-6-luna',
    'gpt-6-sol',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
    'gpt-5.5-pro',
    'gpt-5.4',
    'gpt-5.4-pro',
    'gpt-5.4-mini',
    'gpt-5.2',
    'gpt-5.2-pro',
    'gpt-oss-120b',
    'gpt-oss-20b',
  ],
  [ProviderKind.Mistral]: [
    'mistral-large-4',
    'mistral-small-2603',
    'codestral-2508',
    'ministral-14b-2512',
    'ministral-8b-2512',
    'ministral-3b-2512',
    'zai-glm-5-3',
    'zai-glm-5-3-flash',
    'deepseek-v4-1-flash-1017',
  ],
  [ProviderKind.Ollama]: [
    'qwen3',
    'gpt-oss',
    'llama3.3',
    'qwen3.8',
    'qwen3.6',
    'qwen3.5',
    'qwen3-coder',
    'gemma4',
    'gemma3',
    'deepseek-r1',
    'phi4',
    'mistral',
    'mistral-nemo',
    'llama3.2',
    'llama3.1',
    'qwen2.5-coder',
  ],
  [ProviderKind.OpenAICompatible]: [],
  [ProviderKind.OpenAICodex]: [
    'gpt-6-sol',
    'gpt-6-luna',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.3-codex-spark',
  ],
  [ProviderKind.ClaudeCode]: ['sonnet', 'opus', 'haiku', 'fable', ...CLAUDE_MODELS],
}
