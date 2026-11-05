/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Runtime configuration injected by `/env.js` before the app bundle runs.
 * See `apps/web/public/env.js` and `apps/web/docker/30-render-env-js.sh`.
 */
interface Window {
  __APP_CONFIG__?: {
    apiUrl?: string
  }
}
