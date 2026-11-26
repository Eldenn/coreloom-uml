import { saveApiKey } from '#app/llm-connections/services/llm-api-keys'

/**
 * The fixture key a test account saves, so its model calls go through `resolveCredential` without
 * a key in a request body (there is none any more): `mistral` is what the suites call, and a kind
 * that is not mistral reads no key and stays as it was.
 */
export const TEST_LLM_KEY = 'sk-test-fixture-key-3456'

/** Saves the fixture `mistral` key for this account. */
export async function saveTestLlmKey(user: { id: number }): Promise<void> {
  await saveApiKey(user, 'mistral', { apiKey: TEST_LLM_KEY, baseUrl: null })
}
