import { DateTime } from 'luxon'
import { LlmSecretPurpose } from '#app/llm-connections/constants/llm-connections'
import LlmApiKey from '#app/llm-connections/models/llm-api-key'
import { openLlmSecret, sealLlmSecret } from '#app/llm-connections/services/llm-secrets'

type Person = { id: number }

/** The stored key of a kind, as a call uses it: the key and the origin it was saved with. */
export type StoredApiKey = { apiKey: string; baseUrl: string | null }

/** A saved key as the settings screen shows it: never the key itself. */
export type SavedKeySummary = {
  kind: string
  keyHint: string
  baseUrl: string | null
  verifiedAt: DateTime
}

/** The last characters of a key, shown by the settings screen (`…abcd`). */
export function keyHintOf(apiKey: string): string {
  return apiKey.slice(-4)
}

/**
 * The key this account saved for this kind, or `null` when it saved none. A row exists for a
 * kind that calls a server without a key too, holding its origin: it answers an empty key. A row
 * the encrypter cannot read (the encryption key changed) reads as "no key saved" the same way.
 * This and the save, delete and summaries below are the only code that reads `llm_api_keys`.
 */
export async function storedApiKey(user: Person, kind: string): Promise<StoredApiKey | null> {
  const row = await LlmApiKey.query().where('user_id', user.id).where('kind', kind).first()
  if (!row) return null
  const apiKey =
    row.sealedKey === null
      ? ''
      : (openLlmSecret(row.sealedKey, LlmSecretPurpose.ApiKey, user) ?? '')
  return { apiKey, baseUrl: row.baseUrl }
}

/**
 * Stores (or replaces) the key this account saves for this kind, one per kind. The caller has
 * already checked the settings (`providerProblem`) and the key with a successful test call;
 * `verifiedAt` records that date. Answers the stored row, so the caller answers its own dates.
 */
export async function saveApiKey(
  user: Person,
  kind: string,
  { apiKey, baseUrl }: { apiKey: string; baseUrl: string | null },
): Promise<LlmApiKey> {
  // An empty key is not stored as a key: the row then holds the origin of a keyless server.
  const stored = apiKey === '' ? null : apiKey
  return LlmApiKey.updateOrCreate(
    { userId: user.id, kind },
    {
      sealedKey: stored === null ? null : sealLlmSecret(stored, LlmSecretPurpose.ApiKey, user),
      baseUrl,
      keyHint: keyHintOf(apiKey),
      verifiedAt: DateTime.now(),
    },
  )
}

/** Deletes the key this account saved for this kind; deleting a missing key does nothing. */
export async function deleteApiKey(user: Person, kind: string): Promise<void> {
  await LlmApiKey.query().where('user_id', user.id).where('kind', kind).delete()
}

/**
 * Every key this account saved, as the settings screen shows them: the hint, the origin and the
 * date of each. Selects no encrypted column, so nothing is decrypted.
 */
export async function savedKeySummaries(user: Person): Promise<SavedKeySummary[]> {
  return LlmApiKey.query()
    .where('user_id', user.id)
    .select('kind', 'key_hint', 'base_url', 'verified_at')
}
