import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { excerptSource, type SourceExcerpt, type SourceFile, sourcePaths } from '@coreloom-uml/llm'
import type CodeMap from '#app/code-maps/models/code-map'
import { parseGithubRepository } from '#app/code-maps/services/github-repository'
import GithubApi, { isCommitId, isRepositoryPath } from '#app/github/services/github-api'
import { findGrant } from '#app/github/services/github-grants'
import { repositoryToken } from '#app/github/services/repository-token'
import type User from '#app/users/models/user'

/**
 * The source code of the files a diagram is drawn from, read on GitHub at the map's commit for
 * that one call. It is never stored, logged, traced or returned, and a map still holds none. A
 * private repository is read with an installation token made here and revoked before returning.
 */

/** Why no source was read: the drawing then goes on from the structure only. */
export const SourceAbsence = {
  /** The map names no github.com repository. */
  NoRepository: 'no_repository',
  /** The map has no commit id. */
  NoCommit: 'no_commit',
  /** GitHub refused or could not be reached. */
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
}

type Located = { kind: string; path?: string; line?: number }

/**
 * Reads the files of `nodes` on GitHub at the map's commit; null when the nodes name no file
 * (nothing to read, nothing to say). Never throws, never logs a path, a file or a token.
 */
export async function readSource(
  codeMap: CodeMap,
  user: User,
  nodes: readonly Located[],
): Promise<SourceReading | null> {
  const listed = sourcePaths(nodes)
  if (listed.paths.length === 0) return null
  const started = performance.now()
  const done = (reading: SourceReading) => {
    logger.info(
      {
        codeMapId: codeMap.id,
        files: reading.excerpts.length,
        omitted: reading.omitted,
        absence: reading.absence,
        durationMs: Math.round(performance.now() - started),
      },
      'code source',
    )
    return reading
  }
  const absent = (absence: SourceAbsence) => done({ excerpts: [], omitted: 0, absence })

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
  const files: SourceFile[] = []
  try {
    if (access && !(await stillGranted(access, user.id, repository))) {
      return absent(SourceAbsence.Unreadable)
    }
    const github = access?.github ?? (await app.container.make(GithubApi))
    // One file GitHub fails on is left out like a missing one; none read at all is a refusal.
    const answers = await Promise.all(
      paths.map((path) =>
        github
          .readFile(repository, commit, path, access?.token)
          .catch(() => ({ ok: false as const })),
      ),
    )
    if (answers.every((answer) => !answer.ok)) return absent(SourceAbsence.Unreadable)
    answers.forEach((answer, index) => {
      if (answer.ok && answer.value !== null) {
        files.push({ path: paths[index] as string, text: answer.value })
      }
    })
  } catch {
    return absent(SourceAbsence.Unreadable)
  } finally {
    if (access) await access.github.revokeInstallationToken(access.token).catch(() => {})
  }
  if (files.length === 0) return absent(SourceAbsence.NotFound)
  const excerpts = excerptSource(files, nodes)
  return done({
    excerpts,
    omitted: listed.omitted + listed.paths.length - excerpts.length,
    absence: null,
  })
}

/**
 * A grant is what GitHub listed when the user connected, and only some removals reach us by
 * webhook: before any file is read with the App's token, GitHub says whether that login still
 * reads the repository. A no drops the grant; no answer reads nothing and keeps it.
 */
async function stillGranted(
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
  const { omitted } = reading
  const files = reading.excerpts.length
  if (locale === 'fr') {
    const left = omitted ? `, ${plural(omitted, 'laissé de côté', 'laissés de côté')}` : ''
    return `Code source lu : ${plural(files, 'fichier', 'fichiers')}${left}.`
  }
  return `Source code read: ${plural(files, 'file', 'files')}${omitted ? `, ${String(omitted)} left out` : ''}.`
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
