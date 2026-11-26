import { DateTime } from 'luxon'
import LlmApiKey from '#app/llm-connections/models/llm-api-key'

type Person = { id: number }

/** The stored key of a kind, as a call uses it: the key and the origin it was saved with. */
export type StoredApiKey = { apiKey: string; baseUrl: string | null }

/** The last characters of a key, shown by the settings screen (`…abcd`). */
export function keyHintOf(apiKey: string): string {
  return apiKey.slice(-4)
}

/**
 * The key this account saved for this kind, or `null` when it saved none or the row cannot be
 * decrypted (the encryption key changed, which reads as "no key saved"). This and the save and
 * delete below are the only code that reads `llm_api_keys`.
 */
export async function storedApiKey(user: Person, kind: string): Promise<StoredApiKey | null> {
  const row = await LlmApiKey.query().where('user_id', user.id).where('kind', kind).first()
  if (!row?.apiKey) return null
  return { apiKey: row.apiKey, baseUrl: row.baseUrl }
}

/**
 * Stores (or replaces) the key this account saves for this kind, one per kind. The caller has
 * already checked the settings (`providerProblem`) and the key with a successful test call;
 * `verifiedAt` records that date.
 */
export async function saveApiKey(
  user: Person,
  kind: string,
  { apiKey, baseUrl }: { apiKey: string; baseUrl: string | null },
): Promise<void> {
  await LlmApiKey.updateOrCreate(
    { userId: user.id, kind },
    { apiKey, baseUrl, keyHint: keyHintOf(apiKey), verifiedAt: DateTime.now() },
  )
}

/** Deletes the key this account saved for this kind; deleting a missing key does nothing. */
export async function deleteApiKey(user: Person, kind: string): Promise<void> {
  await LlmApiKey.query().where('user_id', user.id).where('kind', kind).delete()
}
