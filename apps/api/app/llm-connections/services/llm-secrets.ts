import encryption from '@adonisjs/core/services/encryption'
import type { LlmSecretPurpose } from '#app/llm-connections/constants/llm-connections'
import { llmKeysList } from '#config/encryption'
import env from '#start/env'

/** The account a stored LLM secret belongs to. */
type Owner = { id: number }

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
 * What a secret is bound to: its kind and its owner's account. A ciphertext copied to another
 * column, table or account's row never decrypts there.
 */
export function ownedPurpose(purpose: LlmSecretPurpose, owner: Owner): string {
  return `${purpose}:${owner.id}`
}

/**
 * Every stored LLM secret (saved keys, ChatGPT tokens, the Claude binary's state) is sealed by the
 * dedicated `llmKeys` encrypter (`LLM_KEYS_ENCRYPTION_KEYS`), bound to its kind and its owner
 * (`ownedPurpose`). This module is the only code that uses that encrypter, but for the migrations
 * that moved older ciphertexts to it.
 */
export function sealLlmSecret(value: string, purpose: LlmSecretPurpose, owner: Owner): string {
  return llmKeys().encrypt(value, { purpose: ownedPurpose(purpose, owner) })
}

/**
 * The secret, or `null` when the ciphertext cannot be read: another key, another kind, another
 * account, or a ciphertext from before (`APP_KEY`, or no owner), which only its migration reads.
 */
export function openLlmSecret(
  value: string,
  purpose: LlmSecretPurpose,
  owner: Owner,
): string | null {
  return llmKeys().decrypt<string>(value, ownedPurpose(purpose, owner)) ?? null
}
