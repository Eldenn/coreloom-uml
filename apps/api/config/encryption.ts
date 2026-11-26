import { defineConfig, drivers } from '@adonisjs/core/encryption'
import env from '#start/env'

/** The keys of `LLM_KEYS_ENCRYPTION_KEYS`, comma-separated; empty when it is not set. */
export const llmKeysList = (env.get('LLM_KEYS_ENCRYPTION_KEYS') ?? '')
  .split(',')
  .map((key) => key.trim())
  .filter(Boolean)

/**
 * The dedicated encrypter for every stored LLM secret (saved keys, ChatGPT tokens, Claude
 * subscriptions): separate from `APP_KEY` so rotating one never breaks the other. The first key
 * encrypts, all decrypt (rotate by prepending the new key, then re-saving). It falls back to
 * `APP_KEY` in development and test only. In production without its keys it has none, so it seals
 * and opens nothing: the API refuses to start (`start/llm-keys.ts`) and any other process fails
 * the moment it touches an LLM secret (`llmKeysProblem`), while a worker that never does (the
 * skill scanner) runs without them.
 */
const encryptionConfig = defineConfig({
  default: 'app',
  list: {
    app: drivers.aes256gcm({
      id: 'app',
      keys: [env.get('APP_KEY')],
    }),
    llmKeys: drivers.aes256gcm({
      id: 'llmk',
      keys:
        llmKeysList.length > 0
          ? llmKeysList
          : env.get('NODE_ENV') === 'production'
            ? []
            : [env.get('APP_KEY')],
    }),
  },
})

export default encryptionConfig
