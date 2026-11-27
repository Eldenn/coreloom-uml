import { promisify } from 'node:util'
import { gunzip, gzip } from 'node:zlib'
import drive from '@adonisjs/drive/services/main'
import { SKILL_NAME, SkillOrigin } from '@coreloom-uml/catalog'
import { DateTime } from 'luxon'
import { SkillStatus, TRUSTING_SOURCE_KINDS } from '#app/skills/constants/skill'
import {
  LICENSE_IN_FOLDER,
  SKILL_VERSION_LIMITS,
  SKILL_VERSIONS_STORAGE_FOLDER,
  SkillVersionStatus,
} from '#app/skills/constants/skill-version'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillVersion from '#app/skills/models/skill-version'
import {
  GITHUB_API,
  GITHUB_RAW,
  Http,
  OPEN_LICENSES,
  parseGithubTreeUrl,
  SkipError,
} from '#app/skills/services/skills-search'
import type User from '#app/users/models/user'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

/** One file of a copy, as Drive holds it. */
export type SkillBundleFile = { path: string; executable: boolean; content: string }

type TreeEntry = { path: string; type: string; sha: string; mode?: string; size?: number }

export type CaptureOptions = {
  /** Only this skill (the admin's "Copy now"), under the same conditions. */
  slug?: string
  fetch?: typeof fetch
  githubToken?: string
  onProgress?: (message: string) => void
}

export type CaptureReport = { captured: string[]; warnings: string[] }

const COMMIT = /^[0-9a-f]{40}$/
const LICENSE_FILE = /^LICEN[CS]E(\.[a-z]+)?$/i
const utf8 = new TextDecoder('utf-8', { fatal: true })

/**
 * Copies the files of every skill that may be suggested (hand-picked, or found and eligible) at
 * the commit its URL pins, when no copy of that folder's content exists yet. A new copy is
 * `pending`: nothing installs it before the admin approves it. A skill that cannot be copied
 * (a symbolic link, a binary file, too large, a licence that does not allow it) gets a warning
 * and no copy; the run goes on.
 */
export async function captureSkillVersions(options: CaptureOptions = {}): Promise<CaptureReport> {
  const report: CaptureReport = { captured: [], warnings: [] }
  const http = new Http(options.fetch ?? fetch, options.githubToken)
  const skills = await capturableSkills()
    .if(options.slug, (query) => query.where('slug', options.slug as string))
    .orderByRaw(`origin = '${SkillOrigin.Manual}' desc`)
    // Then what a trusting source vouches for, which no installs figure would bring up.
    .orderByRaw(
      `exists (select 1 from skill_source_skills l join skill_sources s on s.id = l.skill_source_id
        where l.skill_id = skills.id and s.enabled and s.kind in (${TRUSTING_SOURCE_KINDS.map((kind) => `'${kind}'`).join(', ')})) desc`,
    )
    .orderByRaw('installs desc nulls last')
    .orderBy('id')

  for (const skill of skills) {
    if (report.captured.length >= SKILL_VERSION_LIMITS.capturesPerRun) break
    try {
      const captured = await captureOne(skill, http)
      if (captured) {
        report.captured.push(skill.slug)
        options.onProgress?.(`copied ${skill.slug} at ${captured.commit}`)
      }
    } catch (error) {
      if (!(error instanceof SkipError)) throw error
      report.warnings.push(`${skill.slug}: not copied, ${error.message}`)
    }
  }
  return report
}

/** The skills a copy is made of: active, and hand-picked or found eligible with their content. */
export function capturableSkills() {
  return CatalogSkill.query()
    .where('status', SkillStatus.Active)
    .where((query) =>
      query
        .where('origin', SkillOrigin.Manual)
        .orWhere((found) => found.where('eligible', true).whereNotNull('contentSha')),
    )
}

/** The new copy, or null when one of that content exists already. */
async function captureOne(skill: CatalogSkill, http: Http): Promise<SkillVersion | null> {
  const pin = parseGithubTreeUrl(skill.url)
  if (!pin) throw new SkipError('its URL is not a pinned GitHub folder')
  const repository = `${pin.owner}/${pin.repo}`
  const commit = COMMIT.test(pin.ref)
    ? pin.ref
    : (
        (await http.json(
          `${GITHUB_API}/repos/${repository}/commits/${encodeURIComponent(pin.ref)}`,
        )) as {
          sha?: string
        }
      ).sha
  if (!commit || !COMMIT.test(commit)) throw new SkipError(`cannot resolve ${pin.ref}`)

  const tree = (await http.json(
    `${GITHUB_API}/repos/${repository}/git/trees/${commit}?recursive=1`,
  )) as { tree?: TreeEntry[]; truncated?: boolean }
  if (tree.truncated) throw new SkipError('the repository tree is too large to list')
  const entries = tree.tree ?? []
  const folder = entries.find((entry) => entry.type === 'tree' && entry.path === pin.path)
  if (!folder) throw new SkipError(`no folder ${pin.path} at ${commit}`)

  const existing = await SkillVersion.query()
    .where('skillId', skill.id)
    .where('contentSha', folder.sha)
    .first()
  if (existing) return null

  const inside = entries.filter((entry) => entry.path.startsWith(`${pin.path}/`))
  const odd = inside.find((entry) => entry.mode === '120000' || entry.type === 'commit')
  if (odd) throw new SkipError(`${odd.path} is a symbolic link or a submodule`)
  const blobs = inside
    .filter((entry) => entry.type === 'blob')
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  if (blobs.length > SKILL_VERSION_LIMITS.files) throw new SkipError(`${blobs.length} files`)
  const announced = blobs.reduce((sum, blob) => sum + (blob.size ?? 0), 0)
  if (announced > SKILL_VERSION_LIMITS.bytes) throw new SkipError(`${announced} bytes`)

  const files: SkillBundleFile[] = []
  let bytes = 0
  for (const blob of blobs) {
    const raw = await http.bytes(
      `${GITHUB_RAW}/${repository}/${commit}/${blob.path}`,
      SKILL_VERSION_LIMITS.bytes - bytes,
    )
    bytes += raw.length
    let content: string
    try {
      content = utf8.decode(raw).replace(/^﻿/, '').replaceAll('\r\n', '\n')
    } catch {
      throw new SkipError(`${blob.path} is not UTF-8 text`)
    }
    files.push({
      path: blob.path.slice(pin.path.length + 1),
      executable: blob.mode === '100755',
      content,
    })
  }
  const skillMd = files.find((file) => file.path === 'SKILL.md')
  if (!skillMd) throw new SkipError('no SKILL.md at the root of its folder')

  const license = await licenseOf(http, repository, commit, files, skillMd.content)
  const key = `${SKILL_VERSIONS_STORAGE_FOLDER}/${skill.slug}/${folder.sha}.json.gz`
  await drive.use().put(key, await gzipAsync(JSON.stringify(files)), {
    contentType: 'application/gzip',
  })
  return SkillVersion.create({
    skillId: skill.id,
    contentSha: folder.sha,
    repository,
    commit,
    folder: pin.path,
    license,
    files: files.map((file) => ({
      path: file.path,
      size: Buffer.byteLength(file.content),
      executable: file.executable,
    })),
    bytes: files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0),
    storageKey: key,
    status: SkillVersionStatus.Pending,
  })
}

/**
 * The licence, first found: a licence file in the folder (it is among the files), the
 * repository's (its text is added to the files as `LICENSE`), or the `license:` SKILL.md declares
 * (no text to add: the repository has none). Refused unless it is one of `OPEN_LICENSES`.
 */
async function licenseOf(
  http: Http,
  repository: string,
  commit: string,
  files: SkillBundleFile[],
  skillMd: string,
): Promise<string> {
  if (files.some((file) => LICENSE_FILE.test(file.path))) return LICENSE_IN_FOLDER
  let spdx: string | undefined
  try {
    const found = (await http.json(`${GITHUB_API}/repos/${repository}/license?ref=${commit}`)) as {
      license?: { spdx_id?: string } | null
      content?: string
    }
    spdx = found.license?.spdx_id
    if (spdx && found.content && isOpen(spdx)) {
      files.push({
        path: 'LICENSE',
        executable: false,
        content: Buffer.from(found.content, 'base64').toString('utf8').replaceAll('\r\n', '\n'),
      })
      return spdx
    }
  } catch (error) {
    if (!(error instanceof SkipError)) throw error
  }
  spdx =
    /^---\n[\s\S]*?^license:\s*["']?([\w.+-]+)["']?\s*$[\s\S]*?^---$/m.exec(skillMd)?.[1] ?? spdx
  if (!spdx || !isOpen(spdx)) throw new SkipError(`licence not accepted: ${spdx ?? 'none'}`)
  return spdx
}

function isOpen(spdx: string): boolean {
  return (OPEN_LICENSES as readonly string[]).includes(spdx)
}

/** A copy's files, as they were downloaded. */
export async function readSkillVersionFiles(version: SkillVersion): Promise<SkillBundleFile[]> {
  const bytes = await drive.use().getBytes(version.storageKey)
  // Four times the limit leaves room for the added licence and for JSON escaping.
  const json = await gunzipAsync(bytes, { maxOutputLength: SKILL_VERSION_LIMITS.bytes * 4 })
  return JSON.parse(json.toString('utf8')) as SkillBundleFile[]
}

/** The newest approved copy of the same skill made before this one: what the diff starts from. */
export function previousApproved(version: SkillVersion): Promise<SkillVersion | null> {
  return SkillVersion.query()
    .where('skillId', version.skillId)
    .where('status', SkillVersionStatus.Approved)
    .where('id', '<', version.id)
    .orderBy('id', 'desc')
    .first()
}

/** The newest approved copy of a skill: the only one ever installed. */
export function newestApproved(skillId: number): Promise<SkillVersion | null> {
  return SkillVersion.query()
    .where('skillId', skillId)
    .where('status', SkillVersionStatus.Approved)
    .orderBy('id', 'desc')
    .first()
}

/**
 * The name its folder takes once installed: the `name` SKILL.md declares, which the tools want
 * equal to the folder's, else the skill's slug when that `name` is missing or not a valid one.
 */
export function installName(files: SkillBundleFile[], slug: string): string {
  const skillMd = files.find((file) => file.path === 'SKILL.md')?.content ?? ''
  const name = /^---\n[\s\S]*?^name:[ \t]*["']?([^"'\n]*?)["']?[ \t]*$[\s\S]*?^---$/m.exec(
    skillMd,
  )?.[1]
  return name && SKILL_NAME.test(name) ? name : slug
}

/** The admin's decision on a copy. */
export async function reviewSkillVersion(
  version: SkillVersion,
  status: (typeof SkillVersionStatus)['Approved' | 'Rejected'],
  reviewer: User,
  overrideReason: string | null = null,
): Promise<SkillVersion> {
  return version
    .merge({ status, overrideReason, reviewedBy: reviewer.id, reviewedAt: DateTime.now() })
    .save()
}
