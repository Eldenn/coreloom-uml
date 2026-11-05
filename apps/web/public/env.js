// Runtime configuration. Vite serves this file verbatim in dev and copies it
// into `dist/` on build; the web container's entrypoint
// (`apps/web/docker/30-render-env-js.sh`) then overwrites it with the real
// values from `$API_URL` before nginx starts. Keeping it empty here lets local
// dev fall back to `import.meta.env.VITE_API_URL` (see `src/lib/client.ts`).
window.__APP_CONFIG__ = {}
