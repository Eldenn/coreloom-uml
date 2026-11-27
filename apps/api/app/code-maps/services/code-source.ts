import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import {
  excerptSource,
  exploreSource,
  type LanguageModel,
  type SourceExcerpt,
  type SourceFile,
  sourcePaths,
} from '@coreloom-uml/llm'
import { REPOSITORY_SANDBOX } from '#app/assistant/constants/repository'
import {
  CLONE_AT,
  cloneKillSeconds,
  READ_FILE,
  SHELL,
  writeCloneCredential,
} from '#app/assistant/services/repository-commands'
import RepositorySandbox from '#app/assistant/services/repository-sandbox'
import { SOURCE_READ_LIMITS } from '#app/code-maps/constants/code-map'
import type CodeMap from '#app/code-maps/models/code-map'
import { parseGithubRepository } from '#app/code-maps/services/github-repository'
import { GITHUB_SOURCE_LIMITS } from '#app/github/constants/github'
import type GithubApi from '#app/github/services/github-api'
import { isCommitId, isRepositoryPath } from '#app/github/services/github-api'
import { findGrant } from '#app/github/services/github-grants'
import { repositoryToken, revokeOnce, TokenFlow } from '#app/github/services/repository-token'
import { ProviderKind } from '#app/llm-connections/constants/llm-connections'
import type User from '#app/users/models/user'

/**
 * The source code of the files a diagram is drawn from, read at the map's commit for that one
 * call, in a sandbox of its own (`RepositorySandbox`, the assistant's): the sandbox fetches that
 * commit from GitHub and the files are read there with one fixed command line each; this server
 * never asks GitHub for a file. The source is never stored, logged, traced or returned, and a
 * map still holds none. A private repository is fetched with an installation token made here,
 * given to that one fetch (`writeCloneCredential`) and revoked as soon as it answered. The
 * sandbox is killed whatever happens.
 *
 * With an explorer, the owner's model then looks at the repository by itself (`exploreSource`):
 * it runs commands of its own in that sandbox, which is first cut off every network and gets no
 * token (the fetch had it, before any command of the model), and what they printed joins the
 * files read. Nothing else leaves the sandbox.
 */

/** Why no source was read: the drawing then goes on from the structure only. */
export const SourceAbsence = {
  /** The map names no github.com repository. */
  NoRepository: 'no_repository',
  /** The map has no commit id. */
  NoCommit: 'no_commit',
  /** GitHub refused, or the sandbox could not fetch the commit. */
  Unreadable: 'unreadable',
  /** No file of the slice exists at that commit. */
  NotFound: 'not_found',
} as const
export type SourceAbsence = (typeof SourceAbsence)[keyof typeof SourceAbsence]

export type SourceReading = {
  excerpts: SourceExcerpt[]
  /** Files left out: beyond the limits, missing, too large or not text. */
  omitted: number
  absence: SourceAbsence | null
  /** Commands of its own the model ran in the sandbox whose output joined the excerpts. */
  commands: number
}

/** The owner's model looking at the repository before the call that draws or reviews. */
export type SourceExplorer = { model: LanguageModel; task: string }

/** Null for a model that carries no tool call from one step to the next (`openai-codex`). */
export function sourceExplorer(
  kind: string,
  model: LanguageModel,
  task: string,
): SourceExplorer | null {
  return kind === ProviderKind.OpenAICodex ? null : { model, task }
}

/** The nodes named to the explorer, at most. */
const SUBJECT_MAX = 40

type Located = { kind: string; path?: string; line?: number }

/**
 * Reads the files of `nodes` at the map's commit, in a sandbox; null when the nodes name no file
 * (nothing to read, nothing to say). Never throws, never logs a path, a file or a token.
 */
export async function readSource(
  codeMap: CodeMap,
  user: User,
  nodes: readonly Located[],
  explorer: SourceExplorer | null = null,
): Promise<SourceReading | null> {
  const listed = sourcePaths(nodes)
  if (listed.paths.length === 0) return null
  const started = performance.now()
  const done = (reading: SourceReading) => {
    logger.info(
      {
        codeMapId: codeMap.id,
        files: reading.excerpts.length - reading.commands,
        commands: reading.commands,
        omitted: reading.omitted,
        absence: reading.absence,
        durationMs: Math.round(performance.now() - started),
      },
      'code source',
    )
    return reading
  }
  const absent = (absence: SourceAbsence) =>
    done({ excerpts: [], omitted: 0, absence, commands: 0 })

  const repository = codeMap.repositoryUrl ? parseGithubRepository(codeMap.repositoryUrl) : null
  if (!repository) return absent(SourceAbsence.NoRepository)
  const commit = codeMap.commitSha
  if (!commit || !isCommitId(commit)) return absent(SourceAbsence.NoCommit)
  const paths = listed.paths.filter(isRepositoryPath)
  if (paths.length === 0) return absent(SourceAbsence.NotFound)

  let access: Awaited<ReturnType<typeof repositoryToken>>
  try {
    access = await repositoryToken(user.id, repository.url)
  } catch {
    return absent(SourceAbsence.Unreadable)
  }
  if (typeof access === 'string') return absent(SourceAbsence.Unreadable)
  const revoke = revokeOnce(access, TokenFlow.Source)
  const files: SourceFile[] = []
  let outputs: SourceExcerpt[] = []
  try {
    if (access && !(await stillGranted(access, user.id, repository))) {
      return absent(SourceAbsence.Unreadable)
    }
    const sandboxes = await app.container.make(RepositorySandbox)
    const sandbox = await sandboxes.create(SOURCE_READ_LIMITS.sandboxTimeoutMs)
    if (!sandbox) return absent(SourceAbsence.Unreadable)
    try {
      const root = REPOSITORY_SANDBOX.root
      if (access && !(await writeCloneCredential(sandbox, root, access.token))) {
        return absent(SourceAbsence.Unreadable)
      }
      const fetched = await sandbox.run(
        CLONE_AT,
        {
          REPO_ROOT: root,
          REPO_URL: `${repository.url}.git`,
          REPO_COMMIT: commit,
          ...cloneKillSeconds(SOURCE_READ_LIMITS.cloneTimeoutMs),
        },
        SOURCE_READ_LIMITS.cloneTimeoutMs,
      )
      // The commit is in, or never will be: the token has no use left.
      await revoke()
      if (fetched.exitCode !== 0) return absent(SourceAbsence.Unreadable)
      // The files are in the sandbox: reading one needs no token.
      const answers = await Promise.all(
        paths.map((path) => sandbox.run(READ_FILE, { REPO_ROOT: root, READ_PATH: path })),
      )
      // A file the sandbox does not give (missing, binary, too large) is left out; a sandbox
      // that answers for none is a refusal.
      if (answers.every((answer) => answer.exitCode === REPOSITORY_SANDBOX.goneExitCode)) {
        return absent(SourceAbsence.Unreadable)
      }
      answers.forEach((answer, index) => {
        const whole = Buffer.byteLength(answer.output) <= GITHUB_SOURCE_LIMITS.fileBytes
        if (answer.exitCode === 0 && whole && !answer.output.includes('\u0000')) {
          files.push({ path: paths[index] as string, text: answer.output })
        }
      })
      // The model's commands run only once the sandbox is cut off, and nothing with the token
      // runs after them.
      if (explorer && files.length > 0 && (await sandbox.isolate())) {
        outputs = await exploreSource(explorer.model, {
          task: explorer.task,
          subject: nodes
            .slice(0, SUBJECT_MAX)
            .map(
              (node) =>
                `${node.kind} ${node.path ?? ''}${node.line ? `:${String(node.line)}` : ''}`,
            ),
          files: files.map((file) => file.path),
          run: (command) =>
            sandbox.run(
              SHELL,
              { REPO_ROOT: root, SHELL_COMMAND: command },
              (REPOSITORY_SANDBOX.shellSeconds + 5) * 1000,
            ),
        })
      }
    } finally {
      await sandboxes.kill(sandbox.sandboxId)
    }
  } catch {
    return absent(SourceAbsence.Unreadable)
  } finally {
    await revoke()
  }
  if (files.length === 0) return absent(SourceAbsence.NotFound)
  const excerpts = excerptSource(files, nodes)
  return done({
    excerpts: [...excerpts, ...outputs],
    omitted: listed.omitted + listed.paths.length - excerpts.length,
    absence: null,
    commands: outputs.length,
  })
}

/**
 * A grant is what GitHub listed when the user connected, and only some removals reach us by
 * webhook: before any file is read with the App's token, GitHub says whether that login still
 * reads the repository. A no drops the grant; no answer reads nothing and keeps it.
 */
export async function stillGranted(
  access: { github: GithubApi; token: string },
  userId: number,
  repository: { owner: string; name: string; url: string },
): Promise<boolean> {
  const grant = await findGrant(userId, repository.url)
  if (!grant) return false
  const allowed = await access.github.canRead(repository, grant.githubLogin, access.token)
  if (allowed.ok && !allowed.value) await grant.delete()
  return allowed.ok && allowed.value
}

const plural = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`

const STRUCTURE_ONLY = {
  en: 'Drawn from the structure only.',
  fr: 'Dessiné d’après la structure seule.',
} as const

const NOT_READ = {
  en: {
    no_repository: 'Source code not read: this map names no GitHub repository.',
    no_commit: 'Source code not read: this map has no commit.',
    unreadable: 'Source code not read: the repository could not be read on GitHub.',
    not_found: 'Source code not read: the files were not found at this commit.',
  },
  fr: {
    no_repository: 'Code source non lu : cette carte ne nomme aucun dépôt GitHub.',
    no_commit: 'Code source non lu : cette carte n’a pas de commit.',
    unreadable: 'Code source non lu : le dépôt n’a pas pu être lu sur GitHub.',
    not_found: 'Code source non lu : les fichiers sont introuvables à ce commit.',
  },
} as const satisfies Record<'en' | 'fr', Record<SourceAbsence, string>>

/** What the stored answer says about the source: read or not, and why. Empty for no reading. */
export function sourceSentence(reading: SourceReading | null, locale: 'en' | 'fr'): string {
  if (!reading) return ''
  if (reading.absence) return `${NOT_READ[locale][reading.absence]} ${STRUCTURE_ONLY[locale]}`
  const { omitted, commands } = reading
  const files = reading.excerpts.length - commands
  if (locale === 'fr') {
    const left = omitted ? `, ${plural(omitted, 'laissé de côté', 'laissés de côté')}` : ''
    const ran = commands ? `, ${plural(commands, 'commande lancée', 'commandes lancées')}` : ''
    return `Code source lu : ${plural(files, 'fichier', 'fichiers')}${left}${ran}.`
  }
  const ran = commands ? `, ${plural(commands, 'command run', 'commands run')}` : ''
  return `Source code read: ${plural(files, 'file', 'files')}${omitted ? `, ${String(omitted)} left out` : ''}${ran}.`
}

/** The answer's text followed by what was read of the source. */
export function withSourceSentence(
  text: string,
  reading: SourceReading | null,
  locale: 'en' | 'fr',
): string {
  const sentence = sourceSentence(reading, locale)
  return sentence ? `${text}\n\n${sentence}` : text
}
