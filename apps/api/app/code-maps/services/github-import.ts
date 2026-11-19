import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { GRAPHIFY_TESTED_VERSION } from '@coreloom-uml/codemap'
import { DateTime } from 'luxon'
import {
  CodeMapSource,
  CodeMapStatus,
  GITHUB_EXTRACTOR,
  GITHUB_IMPORT_FAILURES,
  GITHUB_IMPORT_LIMITS,
} from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import GithubCodeMapFollow from '#app/code-maps/models/github-code-map-follow'
import { analyzerUrl } from '#app/code-maps/services/code-map-analyzer'
import { pruneCodeMaps } from '#app/code-maps/services/code-map-pruning'
import { deleteCodeMapFiles } from '#app/code-maps/services/code-map-storage'
import { parseGithubRepository } from '#app/code-maps/services/github-repository'
import { githubAppConfig } from '#app/github/services/github-app-config'
import { findGrant } from '#app/github/services/github-grants'
import ImportGithubCodeMapJob from '#app/jobs/import-github-code-map_job'
import type Project from '#app/projects/models/project'
import type User from '#app/users/models/user'

type ImportStart = {
  projectId: number
  userId: number
  repositoryUrl: string
  branch: string | null
}

/**
 * Starts reading a GitHub repository into a new `pending` map of a project, for a request
 * (`POST /projects/:id/code-maps/github`) or a push the project follows (`FollowGithubPushJob`).
 * Returns null while the project already has a map being read: one extraction at a time.
 */
export async function startGithubImport(input: ImportStart): Promise<CodeMap | null> {
  const created = await db.transaction((trx) => createGithubImport(input, trx))
  if (!created) return null
  await created.queue()
  return created.codeMap
}

/**
 * The `pending` map, created in `trx`, and `queue`: what must wait until `trx` has committed
 * (the files of the maps it pruned, and the job, which reads the map). Null while the project
 * already has a map being read.
 */
export async function createGithubImport(
  input: ImportStart,
  trx: TransactionClientContract,
): Promise<{ codeMap: CodeMap; queue: () => Promise<void> } | null> {
  // One extraction at a time per project: the lock serializes two clicks, or a click and a push.
  await trx.from('projects').where('id', input.projectId).forUpdate().first()
  // A map still being read long after any job could have finished (no worker running, a
  // queue lost with Redis) is failed, so that it does not block the project for good.
  await CodeMap.query({ client: trx })
    .where('projectId', input.projectId)
    .whereIn('status', [CodeMapStatus.Pending, CodeMapStatus.Running])
    .where(
      'updatedAt',
      '<',
      DateTime.now().minus({ minutes: GITHUB_IMPORT_LIMITS.staleMinutes }).toSQL(),
    )
    .update({
      status: CodeMapStatus.Failed,
      failureReason: GITHUB_IMPORT_FAILURES.stale,
      updatedAt: DateTime.now().toSQL(),
    })
  const running = await CodeMap.query({ client: trx })
    .where('projectId', input.projectId)
    .whereIn('status', [CodeMapStatus.Pending, CodeMapStatus.Running])
    .first()
  if (running) return null
  const codeMap = await CodeMap.create(
    {
      projectId: input.projectId,
      userId: input.userId,
      source: CodeMapSource.Github,
      repositoryUrl: input.repositoryUrl,
      branch: input.branch,
      commitSha: null,
      extractor: GITHUB_EXTRACTOR,
      extractorVersion: GRAPHIFY_TESTED_VERSION,
      status: CodeMapStatus.Pending,
      failureReason: null,
      nodeCount: 0,
      edgeCount: 0,
      storageKey: null,
    },
    { client: trx },
  )
  const dropped = await pruneCodeMaps(input.projectId, trx)
  return {
    codeMap,
    queue: async () => {
      await deleteCodeMapFiles(dropped)
      try {
        await ImportGithubCodeMapJob.dispatch({ codeMapId: codeMap.id })
      } catch (error) {
        await CodeMap.query().where('id', codeMap.id).delete()
        throw error
      }
    },
  }
}

/** Why a GitHub import is refused, before anything is written. */
export const GithubImportRefusal = {
  /** The server has no analyzer. */
  Off: 'off',
  NotGithub: 'not_github',
  /** Following needs a grant of the GitHub App on the repository. */
  FollowRefused: 'follow_refused',
  /** A map of the project is still being read. */
  Running: 'running',
} as const
export type GithubImportRefusal = (typeof GithubImportRefusal)[keyof typeof GithubImportRefusal]

/** What the owner (or the assistant's model) is told of each refusal. */
export const GITHUB_IMPORT_REFUSALS = {
  [GithubImportRefusal.Off]: 'Importing from GitHub is not set up on this server.',
  [GithubImportRefusal.NotGithub]: 'Not a GitHub repository',
  [GithubImportRefusal.FollowRefused]:
    'Following pushes needs the GitHub App: install it on this repository, then connect GitHub.',
  [GithubImportRefusal.Running]: 'A repository is already being read for this project.',
} as const

/**
 * `POST /projects/:id/code-maps/github`, in `trx`: the pending map, and the project's follow set
 * (`follow: true`, which needs the owner's grant of the GitHub App on the repository) or dropped
 * (`false`). `queue` runs once `trx` has committed. Calls neither GitHub nor the analyzer.
 */
export async function importGithubRepository(
  project: Project,
  user: User,
  input: { url: string; branch?: string | null; follow?: boolean },
  trx: TransactionClientContract,
): Promise<{ refused: GithubImportRefusal } | { codeMap: CodeMap; queue: () => Promise<void> }> {
  if (!analyzerUrl()) return { refused: GithubImportRefusal.Off }
  const repository = parseGithubRepository(input.url)
  if (!repository) return { refused: GithubImportRefusal.NotGithub }
  const grant = (await githubAppConfig()) ? await findGrant(user.id, repository.url) : null
  if (input.follow === true && !grant) return { refused: GithubImportRefusal.FollowRefused }
  // The name as GitHub spells it, when the App lists the repository.
  const repositoryUrl = grant?.url ?? repository.url
  const branch = input.branch ?? null

  const created = await createGithubImport(
    { projectId: project.id, userId: user.id, repositoryUrl, branch },
    trx,
  )
  if (!created) return { refused: GithubImportRefusal.Running }

  if (input.follow === true && grant) {
    await GithubCodeMapFollow.updateOrCreate(
      { projectId: project.id },
      { userId: user.id, repositoryId: grant.repositoryId, repositoryUrl, branch },
      { client: trx },
    )
  } else if (input.follow === false) {
    await GithubCodeMapFollow.query({ client: trx }).where('projectId', project.id).delete()
  }
  return created
}

/** `DELETE /projects/:id/code-maps/github/follow`: false when the project follows nothing. */
export async function stopFollowing(
  project: Project,
  client?: TransactionClientContract,
): Promise<boolean> {
  const follow = await GithubCodeMapFollow.query({ client }).where('projectId', project.id).first()
  if (!follow) return false
  await follow.delete()
  return true
}
