import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { defaultGraphifyIgnore } from '@coreloom-uml/codemap'
import { Job } from '@nemoventures/adonis-jobs'
import type { BullJobsOptions } from '@nemoventures/adonis-jobs/types'
import {
  CODE_MAP_LIMITS,
  CODE_MAPS_QUEUE,
  CodeMapSource,
  CodeMapStatus,
  GITHUB_IMPORT_FAILURES,
} from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import { analyzeRepository } from '#app/code-maps/services/code-map-analyzer'
import { pruneCodeMaps } from '#app/code-maps/services/code-map-pruning'
import { deleteCodeMapFiles, storeCodeMapFile } from '#app/code-maps/services/code-map-storage'
import { readCodeMapValue } from '#app/code-maps/services/code-map-upload'
import { GithubFailure } from '#app/github/constants/github'
import GithubApi from '#app/github/services/github-api'
import { githubAppConfig } from '#app/github/services/github-app-config'
import { findGrant } from '#app/github/services/github-grants'

/**
 * Maps a GitHub repository for a `pending` code map (`POST /projects/:id/code-maps/github`, or a
 * push the project follows): the analyzer service clones it and runs graphify, then the map is
 * checked and stored like an upload. When the owner reads the repository through the GitHub App,
 * an installation token is made here, for this repository only and read only, handed to the
 * analyzer in the request and revoked once it answered: it never reaches Redis, the database or
 * a log. A repository that cannot be mapped fails the map at once; an analyzer that cannot be
 * reached is tried again, and fails the map after the last attempt. No model is called.
 */
/** A failed attempt worth retrying, with the reason the map gets after the last one. */
class ImportAttemptError extends Error {
  constructor(
    message: string,
    readonly reason: string,
  ) {
    super(message)
  }
}

export type ImportGithubCodeMapJobData = {
  codeMapId: number
}

export default class ImportGithubCodeMapJob extends Job<ImportGithubCodeMapJobData, void> {
  static defaultQueue = CODE_MAPS_QUEUE

  static options: BullJobsOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  }

  async process(): Promise<void> {
    const codeMap = await CodeMap.find(this.data.codeMapId)
    // Deleted meanwhile, already read, or not a GitHub map: nothing to do.
    if (!codeMap || codeMap.source !== CodeMapSource.Github) return
    if (codeMap.status === CodeMapStatus.Ready || codeMap.status === CodeMapStatus.Failed) return
    if (!codeMap.repositoryUrl) return this.markFailed(codeMap, GITHUB_IMPORT_FAILURES.not_found)

    codeMap.status = CodeMapStatus.Running
    await codeMap.save()

    const access = await this.githubToken(codeMap.userId, codeMap.repositoryUrl)
    if (access === GithubFailure.Denied)
      return this.markFailed(codeMap, GITHUB_IMPORT_FAILURES.githubAccess)
    if (typeof access === 'string') {
      throw new ImportAttemptError(
        `code map ${String(codeMap.id)}: GitHub unreachable`,
        GITHUB_IMPORT_FAILURES.githubUnreachable,
      )
    }

    let result: Awaited<ReturnType<typeof analyzeRepository>>
    try {
      result = await analyzeRepository({
        repository: codeMap.repositoryUrl,
        branch: codeMap.branch,
        ignore: defaultGraphifyIgnore(),
        ...(access ? { token: access.token } : {}),
      })
    } finally {
      // It would expire within the hour anyway.
      if (access) await access.github.revokeInstallationToken(access.token).catch(() => undefined)
    }
    if (!result.ok) {
      if (!result.retry) return this.markFailed(codeMap, GITHUB_IMPORT_FAILURES[result.code])
      // BullMQ tries again; `onFailed` fails the map after the last attempt.
      throw new ImportAttemptError(
        `code map ${String(codeMap.id)}: ${result.detail}`,
        GITHUB_IMPORT_FAILURES.unreachable,
      )
    }

    const branch = codeMap.branch ?? result.branch ?? undefined
    const commit = result.commit ?? undefined
    const read = readCodeMapValue(result.graph, {
      repository: codeMap.repositoryUrl,
      ...(branch ? { branch } : {}),
      ...(commit ? { commit } : {}),
    })
    if (!read.ok) {
      const reason = `${GITHUB_IMPORT_FAILURES.refused}: ${read.problems.join(' ')}`
      return this.markFailed(codeMap, reason)
    }

    const { header } = read.map
    let storageKey: string
    try {
      storageKey = await storeCodeMapFile(codeMap.projectId, read.map)
    } catch (error) {
      throw new ImportAttemptError(
        `code map ${String(codeMap.id)}: ${(error as Error).message}`,
        GITHUB_IMPORT_FAILURES.storage,
      )
    }
    let dropped: (string | null)[] = []
    try {
      const stored = await db.transaction(async (trx) => {
        const row = await CodeMap.query({ client: trx }).where('id', codeMap.id).forUpdate().first()
        if (!row) return false
        row.merge({
          status: CodeMapStatus.Ready,
          failureReason: null,
          branch: header.branch ?? null,
          commitSha: header.commit ?? null,
          extractor: header.extractor.name,
          extractorVersion: result.version ?? header.extractor.version,
          nodeCount: header.nodeCount,
          edgeCount: header.edgeCount,
          storageKey,
        })
        await row.useTransaction(trx).save()
        dropped = await pruneCodeMaps(row.projectId, trx)
        return true
      })
      // The map was deleted while it was read: its file goes too.
      if (!stored) dropped = [storageKey]
    } catch (error) {
      await deleteCodeMapFiles([storageKey])
      throw error
    }
    await deleteCodeMapFiles(dropped)
    this.logger.info(
      { codeMapId: codeMap.id, nodes: header.nodeCount, edges: header.edgeCount },
      'GitHub code map stored',
    )
  }

  async onFailed(): Promise<void> {
    this.logger.error({ err: this.error, codeMapId: this.data.codeMapId }, 'GitHub code map failed')
    if (!this.allAttemptsMade()) return
    const codeMap = await CodeMap.find(this.data.codeMapId)
    if (codeMap && codeMap.status !== CodeMapStatus.Ready) {
      const reason =
        this.error instanceof ImportAttemptError
          ? this.error.reason
          : GITHUB_IMPORT_FAILURES.unexpected
      await this.markFailed(codeMap, reason)
    }
  }

  /**
   * A read-only token for this one repository when the owner reaches it through the GitHub App,
   * null for a repository read anonymously (public, or no App on this server), or why GitHub
   * refused one.
   */
  private async githubToken(
    userId: number,
    repositoryUrl: string,
  ): Promise<{ github: GithubApi; token: string } | null | GithubFailure> {
    const config = githubAppConfig()
    if (!config) return null
    const grant = await findGrant(userId, repositoryUrl)
    if (!grant) return null
    const github = await app.container.make(GithubApi)
    const token = await github.installationToken(config, grant.installationId, grant.repositoryId)
    return token.ok ? { github, token: token.value } : token.failure
  }

  private async markFailed(codeMap: CodeMap, reason: string): Promise<void> {
    codeMap.status = CodeMapStatus.Failed
    codeMap.failureReason = reason.slice(0, CODE_MAP_LIMITS.failureReason)
    await codeMap.save()
    this.logger.warn({ codeMapId: codeMap.id, reason }, 'GitHub code map could not be read')
  }
}
