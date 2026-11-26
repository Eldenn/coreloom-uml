import { defineConfig, drivers } from '@adonisjs/core/encryption'
import env from '#start/env'

/**
 * The dedicated encrypter for the provider keys an account saved (`llm_api_keys`): separate from
 * `APP_KEY` so rotating one never breaks the other. `LLM_KEYS_ENCRYPTION_KEYS` lists keys
 * comma-separated; the first encrypts, all decrypt (rotate by prepending the new key, then
 * re-saving). It falls back to `APP_KEY` in development and test only: production must set its
 * own (`requiredInProduction` in `start/env.ts`).
 */
const llmKeys = (env.get('LLM_KEYS_ENCRYPTION_KEYS') ?? '')
  .split(',')
  .map((key) => key.trim())
  .filter(Boolean)

const encryptionConfig = defineConfig({
  default: 'app',
  list: {
    app: drivers.aes256gcm({
      id: 'app',
      keys: [env.get('APP_KEY')],
    }),
    llmKeys: drivers.aes256gcm({
      id: 'llmk',
      keys: llmKeys.length > 0 ? llmKeys : [env.get('APP_KEY')],
    }),
  },
})

export default encryptionConfig
