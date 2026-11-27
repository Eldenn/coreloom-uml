import app from '@adonisjs/core/services/app'
import redis from '@adonisjs/redis/services/main'
import { DateTime } from 'luxon'
import { ASSISTANT_SANDBOX_METADATA, REPOSITORY_SANDBOX } from '#app/assistant/constants/repository'
import AssistantSandbox from '#app/assistant/models/assistant-sandbox'
import {
  CLONE,
  cloneKillSeconds,
  writeCloneCredential,
} from '#app/assistant/services/repository-commands'
import RepositorySandbox, {
  type OpenRepositorySandbox,
} from '#app/assistant/services/repository-sandbox'
import { CodeMapStatus } from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import GithubCodeMapFollow from '#app/code-maps/models/github-code-map-follow'
import { stillGranted } from '#app/code-maps/services/code-source'
import { parseGithubRepository } from '#app/code-maps/services/github-repository'
import type GithubApi from '#app/github/services/github-api'
import { isCommitId } from '#app/github/services/github-api'
import { findGrant } from '#app/github/services/github-grants'
import { repositoryToken, revokeToken, TokenFlow } from '#app/github/services/repository-token'
import { findOwnedProject } from '#app/projects/services/owned-project'
import type User from '#app/users/models/user'

/*
 * The repository sandbox of a conversation, for one message: opened on the first repository tool
 * the model calls (resumed when the conversation has one for that repository, else cloned in a
 * new one), left to rest when the message ends (`close`: awake for `idleMs`, then paused by E2B). One message at a time per conversation
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
  /** Tokens made for a clone that has not answered yet: `close` revokes what is left. */
  #tokens = new Set<{ github: GithubApi; token: string }>()
  /** The files the model read in this message, in order: shown under the reply. */
  readonly read: string[] = []
  /** How many commands of its own the model ran in the sandbox in this message. */
  commands = 0

  constructor(
    private user: User,
    private conversationId: number,
  ) {}

  /**
   * Opens and token requests still running: a tool stopped mid-way (Stop, a timeout) leaves its
   * `open` going on its own, and `close` waits for it, so what it makes is paused and revoked.
   */
  #running = new Set<Promise<unknown>>()

  #track<T>(work: Promise<T>): Promise<T> {
    this.#running.add(work)
    void work.finally(() => this.#running.delete(work)).catch(() => {})
    return work
  }

  /** The sandbox of the project's repository, or the sentence the model is told. */
  open(projectId: number): Promise<OpenRepository | string> {
    return this.#track(this.#open(projectId))
  }

  /**
   * The conversation's sandbox as the assistant left it, for the owner's own terminal: never a
   * new clone, so no token is made. 'none' when the conversation has none, 'busy' while a
   * message or another command uses it, 'gone' when it cannot be resumed and cut off. Held, and
   * awake, for `seconds` at most: what the command may take.
   */
  async resume(
    seconds: number = REPOSITORY_SANDBOX.lockSeconds,
  ): Promise<OpenRepository | 'none' | 'busy' | 'gone'> {
    const row = await AssistantSandbox.findBy('conversationId', this.conversationId)
    if (!row) return 'none'
    const taken = await redis.set(lockKey(this.conversationId), '1', 'EX', seconds, 'NX')
    if (taken !== 'OK') return 'busy'
    this.#locked = true
    // A private repository is read again only while the owner keeps a grant on it.
    if (row.private && (await findGrant(this.user.id, row.repositoryUrl)) === null) return 'gone'
    const sandboxes = await app.container.make(RepositorySandbox)
    const resumed = await sandboxes.resume(row.sandboxId, seconds * 1000)
    if (!resumed || !(await resumed.isolate())) return 'gone'
    this.#opened = {
      sandbox: resumed,
      repositoryUrl: row.repositoryUrl,
      commit: row.commitSha,
      row,
    }
    return this.#opened
  }

  async #open(projectId: number): Promise<OpenRepository | string> {
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
      // Cut off again: one paused before the model could run commands still had the network.
      if (resumed && (await resumed.isolate())) {
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
    const access = await this.#auth(repository.url)
    if (typeof access === 'string') return access
    const root = REPOSITORY_SANDBOX.root
    let sandbox: OpenRepositorySandbox | null = null
    let cloned: { exitCode: number; output: string }
    try {
      // Tagged, so the prune job finds it should the API die before its row is written.
      sandbox = await sandboxes.create(REPOSITORY_SANDBOX.timeoutMs, 'pause', {
        ...ASSISTANT_SANDBOX_METADATA,
        conversationId: String(this.conversationId),
      })
      if (!sandbox) return REPOSITORY_SENTENCES.unavailable
      const opened = sandbox
      const clone = async (filter: string, timeoutMs: number) => {
        // The line reads the credential and removes it at once: each try gets it again.
        if (access && !(await writeCloneCredential(opened, root, access.token))) {
          return { exitCode: REPOSITORY_SANDBOX.goneExitCode, output: '' }
        }
        return opened.run(
          CLONE,
          {
            REPO_ROOT: root,
            REPO_URL: `${parsed.url}.git`,
            REPO_BRANCH: repository.branch ?? '',
            REPO_FILTER: filter,
            ...cloneKillSeconds(timeoutMs),
          },
          timeoutMs,
        )
      }
      // Nothing is fetched after the clone, so it takes the files of the whole history when
      // they fit (what show and blame read), else those of the checked-out commit only.
      // ponytail: a large repository pays the first try before the second; remember per
      // repository which one fits if that wait shows.
      cloned = await clone('', REPOSITORY_SANDBOX.fullCloneTimeoutMs)
      if (cloned.exitCode === 4 || cloned.exitCode === 124) {
        cloned = await clone('blob:none', REPOSITORY_SANDBOX.cloneTimeoutMs)
      }
    } finally {
      // The clone is in, or failed: the token has no use left.
      if (access) await this.#revoke(access)
    }
    const commit = cloned.output.trim()
    // The model runs commands in it: no network from here on, and no token ever again.
    if (cloned.exitCode !== 0 || !isCommitId(commit) || !(await sandbox.isolate())) {
      await sandboxes.kill(sandbox.sandboxId)
      return REPOSITORY_SENTENCES.unreadable
    }
    const row = await AssistantSandbox.create({
      conversationId: this.conversationId,
      userId: this.user.id,
      sandboxId: sandbox.sandboxId,
      repositoryUrl: repository.url,
      branch: repository.branch,
      commitSha: commit,
      private: access !== null,
      lastUsedAt: DateTime.now(),
    })
    this.#opened = { sandbox, repositoryUrl: row.repositoryUrl, commit: row.commitSha, row }
    return this.#opened
  }

  /**
   * An installation token for this one repository when the owner reads it through the GitHub
   * App (after GitHub confirms they still do), null for a public one. Held only until its clone
   * answered (`#revoke`, in the `finally` of `#create`); `close` revokes it only when something
   * threw between this and that `try`. Never written to a row or a log, never put in a command
   * line or an environment, and never given to a sandbox that ran anything but the clone: only
   * the clone reads it (`writeCloneCredential`).
   */
  async #auth(
    repositoryUrl: string,
  ): Promise<{ github: GithubApi; token: string } | null | string> {
    const parsed = parseGithubRepository(repositoryUrl)
    if (!parsed) return REPOSITORY_SENTENCES.unreadable
    let access: Awaited<ReturnType<typeof repositoryToken>>
    try {
      access = await repositoryToken(this.user.id, repositoryUrl)
    } catch {
      return REPOSITORY_SENTENCES.unreadable
    }
    if (typeof access === 'string') return REPOSITORY_SENTENCES.unreadable
    if (!access) return null
    if (!(await stillGranted(access, this.user.id, parsed).catch(() => false))) {
      await revokeToken(access, TokenFlow.Assistant)
      return REPOSITORY_SENTENCES.unreadable
    }
    this.#tokens.add(access)
    return access
  }

  /** Revokes a token this session made, once. Never throws. */
  async #revoke(access: { github: GithubApi; token: string }): Promise<void> {
    if (!this.#tokens.delete(access)) return
    await revokeToken(access, TokenFlow.Assistant)
  }

  /** Leaves the sandbox to rest until its next use and frees the conversation. Never throws. */
  async close(): Promise<void> {
    await Promise.allSettled(this.#running)
    const opened = this.#opened
    this.#opened = null
    try {
      if (opened) {
        await opened.sandbox.rest()
        opened.row.lastUsedAt = DateTime.now()
        await opened.row.save()
      }
    } catch {
      // A sandbox that could not be told to rest ends by itself (`REPOSITORY_SANDBOX.timeoutMs`).
    } finally {
      await Promise.all([...this.#tokens].map((access) => this.#revoke(access)))
      if (this.#locked) await redis.del(lockKey(this.conversationId)).catch(() => 0)
      this.#locked = false
    }
  }
}

function same(row: AssistantSandbox, repository: { url: string; branch: string | null }) {
  return row.repositoryUrl === repository.url && row.branch === repository.branch
}

const FILES_READ = { en: 'Files read', fr: 'Fichiers lus' } as const
const COMMANDS_RUN = {
  en: 'Commands run in the sandbox',
  fr: 'Commandes lancées dans la sandbox',
} as const

/**
 * The reply with the repository files the tools really read listed under it, whatever the model
 * says it read (paths only, never what they hold), and how many commands of its own it ran:
 * what those read is not listed, so the count says the list may not be all.
 */
export function withFilesRead(
  reply: string,
  { read, commands }: Pick<RepositorySession, 'read' | 'commands'>,
  locale: 'en' | 'fr',
): string {
  const notes = [
    ...(read.length > 0
      ? [`${FILES_READ[locale]}: ${read.map((path) => `\`${path}\``).join(', ')}`]
      : []),
    ...(commands > 0 ? [`${COMMANDS_RUN[locale]}: ${String(commands)}`] : []),
  ]
  return notes.length === 0 ? reply : `${reply}\n\n_${notes.join('. ')}_`
}
