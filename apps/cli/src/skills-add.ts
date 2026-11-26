import { chmod, lstat, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { SKILL_FOLDERS, SKILL_NAME } from '@coreloom-uml/catalog'
import { errorMessage, type FetchLike, REQUEST_TIMEOUT_MS } from './api.ts'
import { CliError, ExitCode } from './errors.ts'
import type { Io } from './io.ts'
import { readManifest } from './manifest.ts'
import { resolveSafePath } from './paths.ts'
import { requireApiKey } from './pull.ts'
import { resolveApiUrl } from './settings.ts'

/** `GET /skills/:slug/copy`: the newest copy of a skill the admin approved. */
export type SkillCopy = {
  slug: string
  name: string
  repository: string
  commit: string
  license: string
  files: { path: string; executable: boolean; content: string }[]
}

type Target = keyof typeof SKILL_FOLDERS

export type SkillsAddOptions = {
  cwd: string
  io: Io
  slugs: string[]
  /** For a slug, the copy to install (`skill_versions.id`) instead of the newest approved one. */
  versions?: Record<string, number>
  apiUrl?: string
  /** The tools to install for (`SKILL_FOLDERS`); `generic` (`.agents/skills`) when none. */
  targets?: string[]
  dryRun?: boolean
  yes?: boolean
  env?: NodeJS.ProcessEnv
  fetch?: FetchLike
}

/** A skill's slug, as the API's route takes it. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isCopy(value: unknown): value is SkillCopy {
  const copy = value as SkillCopy | null
  return (
    typeof copy?.slug === 'string' &&
    typeof copy.name === 'string' &&
    typeof copy.repository === 'string' &&
    typeof copy.commit === 'string' &&
    typeof copy.license === 'string' &&
    Array.isArray(copy.files) &&
    copy.files.every(
      (file) =>
        typeof file?.path === 'string' &&
        typeof file.content === 'string' &&
        typeof file.executable === 'boolean',
    )
  )
}

/** Fetches the approved copy with the API key; redirects are not followed. */
export async function fetchSkillCopy(options: {
  apiUrl: string
  apiKey: string
  slug: string
  version?: number
  fetch?: FetchLike
}): Promise<SkillCopy> {
  const query = options.version ? `?version=${options.version}` : ''
  let response: Response
  try {
    response = await (options.fetch ?? fetch)(`${options.apiUrl}/skills/${options.slug}/copy${query}`, {
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
    const copy = (body as { copy?: unknown } | null)?.copy
    if (!isCopy(copy)) {
      throw new CliError(`Unexpected answer from ${options.apiUrl}: is it a Coreloom UML API?`)
    }
    // The name becomes a folder: never trust it to be one segment.
    if (!SKILL_NAME.test(copy.name)) throw new CliError(`Refused skill name "${copy.name}".`)
    return copy
  }
  switch (response.status) {
    case 401:
      throw new CliError('The API key was refused: it may be expired or revoked.')
    case 403:
      throw new CliError('The API key lacks the read ability.')
    case 404:
      throw new CliError(
        `${options.slug}: ${errorMessage(body) ?? 'not found'}. Only a copy the admin read and ` +
          'approved is ever installed.',
      )
    case 429:
      throw new CliError('Too many requests: try again in a minute.')
    default:
      if (response.status >= 300 && response.status < 400) {
        throw new CliError(`${options.apiUrl} answered with a redirect: pass the API's own URL.`)
      }
      throw new CliError(`The API answered ${response.status}.`)
  }
}

function resolveTargets(raw: string[] | undefined): Target[] {
  const targets = raw?.length ? raw : ['generic']
  for (const target of targets) {
    if (!(target in SKILL_FOLDERS)) {
      throw new CliError(
        `Unknown target "${target}": one of ${Object.keys(SKILL_FOLDERS).join(', ')}.`,
      )
    }
  }
  return targets as Target[]
}

type Write = { path: string; target: string; content: string; executable: boolean }

/** What installing one copy in one folder changes: files written, files removed. */
type FolderPlan = {
  folder: string
  writes: Write[]
  removals: { path: string; target: string }[]
  /** An existing file changes or goes: the owner is asked first. */
  replaces: boolean
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/** The files already in a skill's folder, relative to it; a symbolic link in it is refused. */
async function existingFiles(root: string, folder: string): Promise<string[]> {
  const absolute = await resolveSafePath(root, folder)
  try {
    if (!(await lstat(absolute)).isDirectory()) {
      throw new CliError(`${folder} exists and is not a folder.`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  // Walked by hand: a recursive `readdir` goes into the folders a symbolic link points to.
  const files: string[] = []
  const walk = async (current: string) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      const path = relative(absolute, full).split(sep).join('/')
      if (entry.isSymbolicLink()) throw new CliError(`${folder}/${path} is a symbolic link.`)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) files.push(path)
    }
  }
  await walk(absolute)
  return files
}

async function planFolder(root: string, folder: string, copy: SkillCopy): Promise<FolderPlan> {
  const plan: FolderPlan = { folder, writes: [], removals: [], replaces: false }
  const kept = new Set<string>()
  for (const file of copy.files) {
    const path = `${folder}/${file.path}`
    const target = await resolveSafePath(root, path)
    kept.add(file.path)
    const current = await readText(target)
    if (current === file.content) continue
    if (current !== null) plan.replaces = true
    plan.writes.push({ path, target, content: file.content, executable: file.executable })
  }
  for (const path of await existingFiles(root, folder)) {
    if (kept.has(path)) continue
    plan.removals.push({
      path: `${folder}/${path}`,
      target: join(root, folder, ...path.split('/')),
    })
    plan.replaces = true
  }
  return plan
}

async function applyFolder(plan: FolderPlan) {
  for (const write of plan.writes) {
    await mkdir(dirname(write.target), { recursive: true })
    await writeFile(write.target, write.content, 'utf8')
    // A script keeps the execute bits it has in the repository, nothing more.
    if (write.executable) await chmod(write.target, 0o755)
  }
  for (const removal of plan.removals) await unlink(removal.target)
}

/**
 * `skills add`: writes the approved copy of each skill into the skills folder of each target
 * (`SKILL_FOLDERS`), as `<folder>/<name>/`. The folder is the skill's own: files the copy no
 * longer holds are removed, and replacing or removing a file there is asked first.
 */
export async function skillsAdd(options: SkillsAddOptions): Promise<ExitCode> {
  const { cwd, io } = options
  if (options.slugs.length === 0) throw new CliError('Name at least one skill.')
  const refused = options.slugs.find((slug) => !SLUG.test(slug))
  if (refused) throw new CliError(`Invalid skill "${refused}": its slug is expected.`)
  const env = options.env ?? process.env
  const targets = resolveTargets(options.targets)
  const manifest = await readManifest(cwd)
  const apiUrl = resolveApiUrl(options.apiUrl, manifest?.apiUrl, env)
  const apiKey = await requireApiKey(env)

  const folders = [...new Set(targets.map((target) => SKILL_FOLDERS[target]))]
  let code: ExitCode = ExitCode.Ok
  for (const slug of options.slugs) {
    const copy = await fetchSkillCopy({
      apiUrl,
      apiKey,
      slug,
      ...(options.versions?.[slug] ? { version: options.versions[slug] } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    })
    io.log(
      `${copy.slug}: approved copy of ${copy.repository} at ${copy.commit.slice(0, 12)} ` +
        `(licence ${copy.license}). An agent follows it as instructions and may run its scripts.`,
    )
    for (const base of folders) {
      const plan = await planFolder(cwd, `${base}/${copy.name}`, copy)
      if (plan.writes.length === 0 && plan.removals.length === 0) {
        io.log(`  up to date    ${plan.folder}`)
        continue
      }
      for (const write of plan.writes) io.log(`  write         ${write.path}`)
      for (const removal of plan.removals) io.log(`  delete        ${removal.path}`)
      if (options.dryRun) continue
      if (plan.replaces && !options.yes) {
        if (!io.interactive) {
          throw new CliError(
            `${plan.folder} already holds other files: run again with --yes to replace them, ` +
              'or with --dry-run to see what changes.',
          )
        }
        if (!(await io.confirm(`${plan.folder}: replace the files listed above?`))) {
          io.warn(`  ${plan.folder} left as it is.`)
          code = ExitCode.EditedBlockKept
          continue
        }
      }
      await applyFolder(plan)
    }
  }
  if (options.dryRun) io.log('\nDry run: nothing written.')
  return code
}
