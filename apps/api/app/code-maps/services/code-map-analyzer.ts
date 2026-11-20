import {
  AnalyzerError,
  CODE_MAP_LIMITS,
  GITHUB_IMPORT_LIMITS,
} from '#app/code-maps/constants/code-map'
import { inflate } from '#app/code-maps/services/code-map-storage'
import env from '#start/env'

/**
 * The analyzer service (`apps/analyzer`): it clones a GitHub repository, runs graphify on it and
 * answers the `graph.json`, gzipped. It holds no secret; the worker stores what it answers. A
 * private repository comes with an installation token of the GitHub App, made for that one clone
 * (one repository, read only) and revoked by the worker once the analyzer answered.
 */

export type AnalyzerResult =
  | {
      ok: true
      graph: unknown
      commit: string | null
      branch: string | null
      version: string | null
    }
  /** The repository cannot be mapped: trying again changes nothing. */
  | { ok: false; retry: false; code: AnalyzerError }
  /** The analyzer is down, busy or broke: worth another attempt. */
  | { ok: false; retry: true; detail: string }

const ANALYZER_ERRORS = new Set<string>(Object.values(AnalyzerError))

/** The analyzer's base URL, or null when this server has none (GitHub import is then off). */
export function analyzerUrl(): string | null {
  return env.get('ANALYZER_URL')?.replace(/\/+$/, '') || null
}

export async function analyzeRepository(request: {
  repository: string
  branch: string | null
  ignore: string
  /** An installation token, for a repository the owner reads through the GitHub App. */
  token?: string
}): Promise<AnalyzerResult> {
  const base = analyzerUrl()
  if (!base) return { ok: false, retry: true, detail: 'ANALYZER_URL is not set' }

  let response: Response
  try {
    response = await fetch(`${base}/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        repository: request.repository,
        ...(request.branch ? { branch: request.branch } : {}),
        ignore: request.ignore,
        ...(request.token ? { token: request.token } : {}),
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(GITHUB_IMPORT_LIMITS.analyzerTimeoutMs),
    })
  } catch (error) {
    return { ok: false, retry: true, detail: (error as Error).message }
  }

  if (response.status === 422) {
    const code = await errorCode(response)
    if (code && ANALYZER_ERRORS.has(code))
      return { ok: false, retry: false, code: code as AnalyzerError }
    return { ok: false, retry: false, code: AnalyzerError.ExtractionFailed }
  }
  if (!response.ok) {
    await response.body?.cancel()
    return { ok: false, retry: true, detail: `analyzer answered ${String(response.status)}` }
  }

  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > GITHUB_IMPORT_LIMITS.responseBytes) {
    await response.body?.cancel()
    return { ok: false, retry: false, code: AnalyzerError.TooLarge }
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > GITHUB_IMPORT_LIMITS.responseBytes) {
    return { ok: false, retry: false, code: AnalyzerError.TooLarge }
  }
  const inflated = await inflate(bytes)
  if (!inflated) return { ok: false, retry: false, code: AnalyzerError.TooLarge }
  let graph: unknown
  try {
    graph = JSON.parse(inflated.toString('utf8'))
  } catch {
    return { ok: false, retry: false, code: AnalyzerError.ExtractionFailed }
  }
  return {
    ok: true,
    graph,
    commit: header(response, 'x-commit-sha', /^[0-9a-f]{7,64}$/),
    branch: header(response, 'x-branch', /^[A-Za-z0-9._/-]+$/, CODE_MAP_LIMITS.branch),
    version: header(response, 'x-graphify-version', /^[0-9A-Za-z.+-]+$/, 200),
  }
}

async function errorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } }
    return typeof body.error?.code === 'string' ? body.error.code : null
  } catch {
    return null
  }
}

function header(response: Response, name: string, pattern: RegExp, max = 64): string | null {
  const value = response.headers.get(name)
  return value && value.length <= max && pattern.test(value) ? value : null
}
