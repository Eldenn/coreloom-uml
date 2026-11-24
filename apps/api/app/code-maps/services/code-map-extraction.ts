import app from '@adonisjs/core/services/app'
import { GRAPHIFY_TESTED_VERSION } from '@coreloom-uml/codemap'
import { REPOSITORY_SANDBOX } from '#app/assistant/constants/repository'
import {
  CLONE,
  MAP,
  MAP_EXIT,
  mapFile,
  tokenEnvs,
} from '#app/assistant/services/repository-commands'
import RepositorySandbox from '#app/assistant/services/repository-sandbox'
import {
  CODE_MAP_LIMITS,
  ExtractionError,
  GITHUB_IMPORT_LIMITS,
} from '#app/code-maps/constants/code-map'
import { inflate } from '#app/code-maps/services/code-map-storage'
import { parseGithubRepository } from '#app/code-maps/services/github-repository'
import { isCommitId } from '#app/github/services/github-api'
import { researchConfig } from '#app/research/services/research-config'

/**
 * Maps a GitHub repository in a sandbox of its own (`RepositorySandbox`, the assistant's): the
 * sandbox clones it (one commit) and runs graphify on the clone, with the two fixed command
 * lines `CLONE` and `MAP`, and only graphify's `graph.json` leaves it, gzipped. The code never
 * reaches this server. A private repository comes with an installation token of the GitHub App,
 * made for that one clone (one repository, read only): the clone's environment only, never
 * graphify's, and revoked by the worker once this answered. The sandbox is killed whatever
 * happens.
 */

export type ExtractionResult =
  | {
      ok: true
      graph: unknown
      commit: string
      branch: string | null
      version: string
    }
  /** The repository cannot be mapped: trying again changes nothing. */
  | { ok: false; retry: false; code: ExtractionError }
  /** The sandbox could not be started or stopped answering: worth another attempt. */
  | { ok: false; retry: true; detail: string }

const refused = (code: ExtractionError) => ({ ok: false, retry: false, code }) as const
const again = (detail: string) => ({ ok: false, retry: true, detail }) as const

/** Whether this server can map a repository (`E2B_API_KEY`): GitHub import is off without. */
export function extractionConfigured(): boolean {
  return researchConfig() !== null
}

export async function mapRepository(request: {
  repository: string
  branch: string | null
  ignore: string
  /** An installation token, for a repository the owner reads through the GitHub App. */
  token?: string
}): Promise<ExtractionResult> {
  const parsed = parseGithubRepository(request.repository)
  if (!parsed) return refused(ExtractionError.NotFound)
  const sandboxes = await app.container.make(RepositorySandbox)
  const sandbox = await sandboxes.create(GITHUB_IMPORT_LIMITS.sandboxTimeoutMs)
  if (!sandbox) return again('the sandbox could not be started')
  const root = REPOSITORY_SANDBOX.root
  try {
    const cloned = await sandbox.run(
      CLONE,
      {
        REPO_ROOT: root,
        REPO_URL: `${parsed.url}.git`,
        REPO_BRANCH: request.branch ?? '',
        REPO_DEPTH: '1',
        ...(request.token ? tokenEnvs(request.token) : {}),
      },
      GITHUB_IMPORT_LIMITS.cloneTimeoutMs,
    )
    const commit = cloned.output.trim()
    const cloneFailure = failure(cloned.exitCode)
    if (cloneFailure) return cloneFailure
    // A private or missing repository asks for credentials, which are refused: not found.
    if (cloned.exitCode !== 0 || !isCommitId(commit)) return refused(ExtractionError.NotFound)

    const mapped = await sandbox.run(
      MAP,
      { REPO_ROOT: root, MAP_IGNORE: request.ignore },
      GITHUB_IMPORT_LIMITS.mapTimeoutMs,
    )
    const mapFailure = failure(mapped.exitCode)
    if (mapFailure) return mapFailure
    if (mapped.exitCode === MAP_EXIT.tooManyFiles) return refused(ExtractionError.TooManyFiles)
    if (mapped.exitCode !== 0) return refused(ExtractionError.ExtractionFailed)

    const bytes = await sandbox.readFile(mapFile(root))
    if (!bytes) return again('the map could not be read from the sandbox')
    if (bytes.byteLength > GITHUB_IMPORT_LIMITS.graphBytes) return refused(ExtractionError.TooLarge)
    const inflated = await inflate(bytes)
    if (!inflated) return refused(ExtractionError.TooLarge)
    let graph: unknown
    try {
      graph = JSON.parse(inflated.toString('utf8'))
    } catch {
      return refused(ExtractionError.ExtractionFailed)
    }
    const branch = mapped.output.trim()
    return {
      ok: true,
      graph,
      commit,
      branch:
        branch.length <= CODE_MAP_LIMITS.branch && /^[A-Za-z0-9._/-]+$/.test(branch)
          ? branch
          : null,
      // The template pins it (`REPOSITORY_TEMPLATE`).
      version: GRAPHIFY_TESTED_VERSION,
    }
  } finally {
    await sandboxes.kill(sandbox.sandboxId)
  }
}

/** What an exit code says whichever command line answered it; null for the others. */
function failure(exitCode: number): ExtractionResult | null {
  if (exitCode === REPOSITORY_SANDBOX.goneExitCode) return again('the sandbox stopped answering')
  if (exitCode === 124) return refused(ExtractionError.Timeout)
  // `CLONE` past `cloneMaxBytes`, `MAP` past `graphBytes`.
  if (exitCode === MAP_EXIT.tooLarge) return refused(ExtractionError.TooLarge)
  return null
}
