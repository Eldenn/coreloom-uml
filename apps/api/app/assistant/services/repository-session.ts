import app from '@adonisjs/core/services/app'
import redis from '@adonisjs/redis/services/main'
import { DateTime } from 'luxon'
import { REPOSITORY_SANDBOX } from '#app/assistant/constants/repository'
import AssistantSandbox from '#app/assistant/models/assistant-sandbox'
import RepositorySandbox, {
  type OpenRepositorySandbox,
} from '#app/assistant/services/repository-sandbox'
import { CodeMapStatus } from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import GithubCodeMapFollow from '#app/code-maps/models/github-code-map-follow'
import { archiveRepository } from '#app/code-maps/services/code-map-analyzer'
import { stillGranted } from '#app/code-maps/services/code-source'
import { parseGithubRepository } from '#app/code-maps/services/github-repository'
import { findGrant } from '#app/github/services/github-grants'
import { repositoryToken } from '#app/github/services/repository-token'
import { findOwnedProject } from '#app/projects/services/owned-project'
import type User from '#app/users/models/user'

/*
 * The repository sandbox of a conversation, for one message: opened on the first repository tool
 * the model calls (resumed when the conversation has one for that repository, else made from a
 * fresh archive), paused when the message ends (`close`). One message at a time per conversation
 * (a Redis key that ends by itself). The code lives in the sandbox only: nothing here keeps,
 * logs or traces a file or an output.
 */

/** What the model is told instead of a result. */
export const REPOSITORY_SENTENCES = {
  noRepository:
    'This project follows no GitHub repository and has no code map read from one: there is no repository to read.',
  busy: 'Another message of this conversation is reading the repository: try again once it is answered.',
  unreadable:
    'The repository could not be read: it is gone, private and out of the GitHub App’s reach, or larger than the sandbox takes.',
  unavailable: 'The repository sandbox is unavailable right now.',
} as const

export type OpenRepository = {
  sandbox: OpenRepositorySandbox
  repositoryUrl: string
  commit: string
}

const lockKey = (conversationId: number) => `assistant:repository:${String(conversationId)}`

/** The repository a project's code is read from: the one it follows, else its newest map's. */
export async function projectRepository(
  projectId: number,
  user: User,
): Promise<{ url: string; branch: string | null } | null> {
  const project = await findOwnedProject(projectId, user)
  if (!project) return null
  const follow = await GithubCodeMapFollow.query().where('projectId', project.id).first()
  const source =
    follow ??
    (await CodeMap.query()
      .where('projectId', project.id)
      .where('status', CodeMapStatus.Ready)
      .whereNotNull('repositoryUrl')
      .orderBy('id', 'desc')
      .first())
  const parsed = source?.repositoryUrl ? parseGithubRepository(source.repositoryUrl) : null
  return parsed ? { url: parsed.url, branch: source?.branch ?? null } : null
}

/** Kills the sandboxes of these rows; the rows are the caller's to delete (or the cascade's). */
export async function killSandboxes(rows: readonly AssistantSandbox[]): Promise<void> {
  if (rows.length === 0) return
  const sandboxes = await app.container.make(RepositorySandbox)
  await Promise.all(rows.map((row) => sandboxes.kill(row.sandboxId)))
}

export class RepositorySession {
  #opened: (OpenRepository & { row: AssistantSandbox }) | null = null
  #locked = false
  /** The files the model read in this message, in order: shown under the reply. */
  readonly read: string[] = []

  constructor(
    private user: User,
    private conversationId: number,
  ) {}

  /** The sandbox of the project's repository, or the sentence the model is told. */
  async open(projectId: number): Promise<OpenRepository | string> {
    const repository = await projectRepository(projectId, this.user)
    if (!repository) return REPOSITORY_SENTENCES.noRepository
    const current = this.#opened
    if (current && same(current.row, repository)) return current
    if (!this.#locked) {
      const taken = await redis.set(
        lockKey(this.conversationId),
        '1',
        'EX',
        REPOSITORY_SANDBOX.lockSeconds,
        'NX',
      )
      if (taken !== 'OK') return REPOSITORY_SENTENCES.busy
      this.#locked = true
    }
    const sandboxes = await app.container.make(RepositorySandbox)
    const row = await AssistantSandbox.findBy('conversationId', this.conversationId)
    if (row && same(row, repository)) {
      // A private repository is read again only while the owner keeps a grant on it.
      const allowed = !row.private || (await findGrant(this.user.id, row.repositoryUrl)) !== null
      const resumed = allowed ? await sandboxes.resume(row.sandboxId) : null
      if (resumed) {
        this.#opened = {
          sandbox: resumed,
          repositoryUrl: row.repositoryUrl,
          commit: row.commitSha,
          row,
        }
        return this.#opened
      }
    }
    if (row) {
      await sandboxes.kill(row.sandboxId)
      await row.delete()
    }
    if (current) this.#opened = null
    return this.#create(sandboxes, repository)
  }

  async #create(
    sandboxes: RepositorySandbox,
    repository: { url: string; branch: string | null },
  ): Promise<OpenRepository | string> {
    const parsed = parseGithubRepository(repository.url)
    if (!parsed) return REPOSITORY_SENTENCES.unreadable
    let access: Awaited<ReturnType<typeof repositoryToken>>
    try {
      access = await repositoryToken(this.user.id, repository.url)
    } catch {
      return REPOSITORY_SENTENCES.unreadable
    }
    if (typeof access === 'string') return REPOSITORY_SENTENCES.unreadable
    let archived: Awaited<ReturnType<typeof archiveRepository>>
    try {
      if (access && !(await stillGranted(access, this.user.id, parsed))) {
        return REPOSITORY_SENTENCES.unreadable
      }
      // The token goes to the analyzer for this one clone and never into the sandbox.
      archived = await archiveRepository(
        { repository: repository.url, branch: repository.branch, token: access?.token },
        {
          maxBytes: REPOSITORY_SANDBOX.archiveMaxBytes,
          timeoutMs: REPOSITORY_SANDBOX.archiveTimeoutMs,
        },
      )
    } finally {
      if (access) await access.github.revokeInstallationToken(access.token).catch(() => {})
    }
    if ('failure' in archived) {
      return archived.failure === 'unavailable'
        ? REPOSITORY_SENTENCES.unavailable
        : REPOSITORY_SENTENCES.unreadable
    }
    const sandbox = await sandboxes.create(archived.archive)
    if (!sandbox) return REPOSITORY_SENTENCES.unavailable
    const row = await AssistantSandbox.create({
      conversationId: this.conversationId,
      userId: this.user.id,
      sandboxId: sandbox.sandboxId,
      repositoryUrl: repository.url,
      branch: repository.branch,
      commitSha: archived.commit,
      private: access !== null,
      lastUsedAt: DateTime.now(),
    })
    this.#opened = { sandbox, repositoryUrl: row.repositoryUrl, commit: row.commitSha, row }
    return this.#opened
  }

  /** Pauses the sandbox until the next message and frees the conversation. Never throws. */
  async close(): Promise<void> {
    const opened = this.#opened
    this.#opened = null
    try {
      if (opened) {
        await opened.sandbox.pause()
        opened.row.lastUsedAt = DateTime.now()
        await opened.row.save()
      }
    } catch {
      // A sandbox that could not be paused ends by itself (`REPOSITORY_SANDBOX.timeoutMs`).
    } finally {
      if (this.#locked) await redis.del(lockKey(this.conversationId)).catch(() => 0)
      this.#locked = false
    }
  }
}

function same(row: AssistantSandbox, repository: { url: string; branch: string | null }) {
  return row.repositoryUrl === repository.url && row.branch === repository.branch
}

const FILES_READ = { en: 'Files read', fr: 'Fichiers lus' } as const

/**
 * The reply with the repository files the tools really read listed under it, whatever the model
 * says it read (paths only, never what they hold).
 */
export function withFilesRead(
  reply: string,
  paths: readonly string[],
  locale: 'en' | 'fr',
): string {
  if (paths.length === 0) return reply
  const listed = paths.map((path) => `\`${path}\``).join(', ')
  return `${reply}\n\n_${FILES_READ[locale]}: ${listed}_`
}
