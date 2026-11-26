import encryption from '@adonisjs/core/services/encryption'
import type { LlmSecretPurpose } from '#app/llm-connections/constants/llm-connections'
import { llmKeysList } from '#config/encryption'
import env from '#start/env'

/**
 * Why no LLM secret can be sealed or opened here, or `null`: production has no fallback key, so
 * it needs `LLM_KEYS_ENCRYPTION_KEYS`. Pure, so it is tested without a production process.
 */
export function llmKeysProblem(nodeEnv: string, keys: readonly string[]): string | null {
  return nodeEnv === 'production' && keys.length === 0
    ? 'LLM_KEYS_ENCRYPTION_KEYS is required in production to seal or open a stored LLM secret'
    : null
}

function llmKeys() {
  const problem = llmKeysProblem(env.get('NODE_ENV'), llmKeysList)
  if (problem) throw new Error(problem)
  return encryption.use('llmKeys')
}

/**
 * Every stored LLM secret (saved keys, ChatGPT tokens, the Claude binary's state) is sealed by the
 * dedicated `llmKeys` encrypter (`LLM_KEYS_ENCRYPTION_KEYS`), bound to its purpose. This module
 * is the only code that uses that encrypter.
 */
export function sealLlmSecret(value: string, purpose: LlmSecretPurpose): string {
  return llmKeys().encrypt(value, { purpose })
}

/** The secret, or `null` when the ciphertext cannot be read (another key, another purpose). */
export function openLlmSecret(value: string, purpose: LlmSecretPurpose): string | null {
  return llmKeys().decrypt<string>(value, purpose) ?? null
}

/**
 * A ChatGPT token sealed before they moved to `llmKeys`: encrypted with `APP_KEY` and no purpose.
 * Read only to move such a row, by its migration and by the model until it is rewritten.
 */
export function openLegacyAppSecret(value: string): string | null {
  return encryption.decrypt<string>(value) ?? null
}
