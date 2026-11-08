import type { AgentContextFile, Recommendation } from '@coreloom-uml/catalog'
import { CliError } from './errors.ts'

/** A skill as the API lists it; the list stays empty until skills land in the catalog. */
export type GenerationSkill = { name?: unknown; url?: unknown }

/** `GET /projects/:id/agent-config/generations/latest`, reduced to what the CLI reads. */
export type Generation = {
  id: number
  revision: number
  catalogVersion: string
  files: AgentContextFile[]
  recommendations: Recommendation[]
  skills: { compatible: GenerationSkill[]; conflicting: GenerationSkill[] }
}

export type FetchLike = typeof fetch

/** Longest wait for the API before giving up. */
const REQUEST_TIMEOUT_MS = 30_000

function latestGenerationUrl(apiUrl: string, projectId: number): string {
  return `${apiUrl}/projects/${projectId}/agent-config/generations/latest`
}

/** The message of an `{ error: { message } }` body, if the API sent one. */
function errorMessage(body: unknown): string | null {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message
  return typeof message === 'string' ? message : null
}

function isGeneration(value: unknown): value is Generation {
  const generation = value as Generation | null
  return (
    typeof generation?.id === 'number' &&
    typeof generation.revision === 'number' &&
    Array.isArray(generation.files) &&
    generation.files.every(
      (file) =>
        typeof file?.path === 'string' &&
        typeof file.content === 'string' &&
        typeof file.blockHash === 'string',
    )
  )
}

/**
 * Fetches the project's latest generation with the API key (`read` ability is enough). Redirects
 * are not followed, so the key is never sent to another host.
 */
export async function fetchLatestGeneration(options: {
  apiUrl: string
  apiKey: string
  projectId: number
  fetch?: FetchLike
}): Promise<Generation> {
  const doFetch = options.fetch ?? fetch
  let response: Response
  try {
    response = await doFetch(latestGenerationUrl(options.apiUrl, options.projectId), {
      headers: { Authorization: `Bearer ${options.apiKey}`, Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new CliError(`Could not reach ${options.apiUrl}: ${reason}`)
  }

  const body: unknown = await response.json().catch(() => null)
  if (response.ok) {
    const generation = (body as { generation?: unknown } | null)?.generation
    if (!isGeneration(generation)) {
      throw new CliError(`Unexpected answer from ${options.apiUrl}: is it a Coreloom UML API?`)
    }
    return {
      ...generation,
      recommendations: Array.isArray(generation.recommendations) ? generation.recommendations : [],
      skills: {
        compatible: Array.isArray(generation.skills?.compatible)
          ? generation.skills.compatible
          : [],
        conflicting: Array.isArray(generation.skills?.conflicting)
          ? generation.skills.conflicting
          : [],
      },
    }
  }

  switch (response.status) {
    case 401:
      throw new CliError('The API key was refused: it may be expired or revoked.')
    case 403:
      throw new CliError('The API key lacks the read ability.')
    case 404:
      throw new CliError(
        `${errorMessage(body) ?? 'Not found'} (project ${options.projectId}). Check the project id, ` +
          'and generate the conventions in the app first.',
      )
    case 429:
      throw new CliError('Too many requests: try again in a minute.')
    default:
      if (response.status >= 300 && response.status < 400) {
        throw new CliError(`${options.apiUrl} answered with a redirect: pass the API's own URL.`)
      }
      throw new CliError(
        `The API answered ${response.status}${errorMessage(body) ? `: ${errorMessage(body)}` : ''}.`,
      )
  }
}
