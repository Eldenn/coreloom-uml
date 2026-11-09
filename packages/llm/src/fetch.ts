/**
 * `fetch` that never follows a redirect: an allowlisted host cannot bounce the request (and its
 * key or token) somewhere else. A redirect fails like an unreachable server.
 */
export const fetchWithoutRedirects: typeof fetch = (input, init) =>
  fetch(input, { ...init, redirect: 'error' })
