export { PROVIDER_KINDS, ProviderKind } from '@coreloom-uml/catalog'
export { LLM_FAILURE_REASONS, LlmFailureReason } from '@coreloom-uml/llm'

/** Calls to a provider (tests and proposals together) per user and per minute. */
export const LLM_REQUESTS_PER_MINUTE = 10
/** Longest model name accepted. */
export const LLM_MODEL_MAX_LENGTH = 200
/** Longest base URL accepted. */
export const LLM_BASE_URL_MAX_LENGTH = 2000
/** Longest provider key accepted. */
export const LLM_API_KEY_MAX_LENGTH = 1000
