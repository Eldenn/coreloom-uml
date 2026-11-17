import { errorMessage, type FetchLike } from './api.ts'
import { CliError } from './errors.ts'

/** What the CLI reads of `POST /projects/:id/code-maps`'s answer. */
export type StoredCodeMap = {
  id: number
  projectId: number
  nodeCount: number
  edgeCount: number
  branch: string | null
  commitSha: string | null
}

/** An upload is bigger and slower than a read: the server checks and stores the whole map. */
const UPLOAD_TIMEOUT_MS = 5 * 60_000

/** The name the gzipped map is sent under; the API accepts `.json` and `.gz`. */
export const CODE_MAP_UPLOAD_NAME = 'code-map.json.gz'

function isStoredCodeMap(value: unknown): value is StoredCodeMap {
  const map = value as StoredCodeMap | null
  return (
    typeof map?.id === 'number' &&
    typeof map.projectId === 'number' &&
    typeof map.nodeCount === 'number' &&
    typeof map.edgeCount === 'number'
  )
}

/**
 * Sends a gzipped code map to `POST /projects/:id/code-maps`, as the multipart form the API
 * reads (`file`, then `repositoryUrl`, `branch` and `commitSha` when known). The key needs the
 * `write` ability. Redirects are not followed, so the key is never sent to another host.
 */
export async function uploadCodeMap(options: {
  apiUrl: string
  apiKey: string
  projectId: number
  gzipped: Uint8Array
  repositoryUrl?: string
  branch?: string
  commitSha?: string
  fetch?: FetchLike
}): Promise<StoredCodeMap> {
  const form = new FormData()
  form.append(
    'file',
    // A Node `Buffer` never sits on a SharedArrayBuffer.
    new Blob([options.gzipped as Uint8Array<ArrayBuffer>], { type: 'application/gzip' }),
    CODE_MAP_UPLOAD_NAME,
  )
  if (options.repositoryUrl) form.append('repositoryUrl', options.repositoryUrl)
  if (options.branch) form.append('branch', options.branch)
  if (options.commitSha) form.append('commitSha', options.commitSha)

  const doFetch = options.fetch ?? fetch
  let response: Response
  try {
    response = await doFetch(`${options.apiUrl}/projects/${options.projectId}/code-maps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiKey}`, Accept: 'application/json' },
      body: form,
      redirect: 'manual',
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new CliError(`Could not reach ${options.apiUrl}: ${reason}`)
  }

  const body: unknown = await response.json().catch(() => null)
  if (response.ok) {
    const codeMap = (body as { codeMap?: unknown } | null)?.codeMap
    if (!isStoredCodeMap(codeMap)) {
      throw new CliError(`Unexpected answer from ${options.apiUrl}: is it a Coreloom UML API?`)
    }
    return codeMap
  }

  const message = errorMessage(body)
  switch (response.status) {
    case 401:
      throw new CliError('The API key was refused: it may be expired or revoked.')
    case 403:
      throw new CliError('The API key lacks the write ability: create one that has it.')
    case 404:
      throw new CliError(
        `${message && message !== 'Not found' ? message : 'Not found'} (project ` +
          `${options.projectId}). Check the id, and that code maps are turned on for your account.`,
      )
    case 413:
      throw new CliError('The code map is too large for the API.')
    case 422: {
      const lead = (message ?? 'The code map was refused').replace(/\.$/, '')
      throw new CliError([`${lead}.`, ...problemsOf(body).map((p) => `  - ${p}`)].join('\n'))
    }
    case 429:
      throw new CliError('Too many requests: try again in a minute.')
    default:
      if (response.status >= 300 && response.status < 400) {
        throw new CliError(`${options.apiUrl} answered with a redirect: pass the API's own URL.`)
      }
      throw new CliError(`The API answered ${response.status}${message ? `: ${message}` : ''}.`)
  }
}

/**
 * The reasons of a 422: `error.problems` when the map was read and refused, `errors[].message`
 * when the form itself was (a file too large, a malformed commit).
 */
function problemsOf(body: unknown): string[] {
  const value = body as { error?: { problems?: unknown }; errors?: unknown } | null
  const problems = value?.error?.problems
  if (Array.isArray(problems)) return problems.filter((p): p is string => typeof p === 'string')
  if (Array.isArray(value?.errors)) {
    return value.errors
      .map((error) => (error as { message?: unknown } | null)?.message)
      .filter((message): message is string => typeof message === 'string')
  }
  return []
}
