import {
  type CodexTokens,
  exchangeAuthorizationCode,
  fetchWithoutRedirects,
  pollDeviceAuthorization,
  refreshCodexTokens,
  requestDeviceCode,
} from '@coreloom-uml/llm'

/**
 * OpenAI's sign-in endpoints for a ChatGPT subscription. Resolved from the container, so tests
 * swap `fetch` for a fake server (`tests/functional/llm-connections/fakes.ts`) and never reach
 * OpenAI.
 */
export default class CodexOAuth {
  fetch: typeof fetch = fetchWithoutRedirects

  requestDeviceCode() {
    return requestDeviceCode(this.fetch)
  }

  poll(attempt: { deviceAuthId: string; userCode: string }) {
    return pollDeviceAuthorization(this.fetch, attempt)
  }

  exchange(code: { authorizationCode: string; codeVerifier: string }): Promise<CodexTokens> {
    return exchangeAuthorizationCode(this.fetch, code, new Date())
  }

  refresh(refreshToken: string): Promise<CodexTokens> {
    return refreshCodexTokens(this.fetch, refreshToken, new Date())
  }
}
