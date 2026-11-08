import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { type FetchLike, fetchLatestGeneration, type Generation } from './api.ts'
import { lineDiff } from './diff.ts'
import { CliError, ExitCode } from './errors.ts'
import type { Io } from './io.ts'
import { type Manifest, type ManifestFile, readManifest, writeManifest } from './manifest.ts'
import { ChangeAction, type FileChange, needsConfirmation, planPull } from './plan.ts'
import { API_KEY_ENV, resolveApiKey, resolveApiUrl } from './settings.ts'

export type PullOptions = {
  cwd: string
  io: Io
  apiUrl?: string
  project?: string
  dryRun?: boolean
  yes?: boolean
  force?: boolean
  env?: NodeJS.ProcessEnv
  fetch?: FetchLike
}

export function parseProjectId(raw: string): number {
  const id = Number(raw)
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(id) || id < 1) {
    throw new CliError(`Invalid project id: ${raw} (a positive whole number is expected).`)
  }
  return id
}

export async function requireApiKey(env: NodeJS.ProcessEnv): Promise<string> {
  const key = await resolveApiKey(env)
  if (!key) {
    throw new CliError(
      `No API key: export ${API_KEY_ENV}, or store one with "coreloom-uml config set-key". ` +
        'Create it under Settings, API keys; the read ability is enough.',
    )
  }
  return key
}

function describe(change: FileChange): string {
  const edited = change.edited ? ' (edited by hand)' : ''
  switch (change.action) {
    case ChangeAction.Create:
      return `create        ${change.path}`
    case ChangeAction.Append:
      return `add block to  ${change.path} (the rest of the file is kept)`
    case ChangeAction.Update:
      return `update block  ${change.path}${edited}`
    case ChangeAction.Unchanged:
      return `up to date    ${change.path}`
    case ChangeAction.Remove:
      return change.after === null
        ? `delete        ${change.path}${edited}`
        : `remove block  ${change.path}${edited}`
  }
}

function showDiff(io: Io, change: FileChange) {
  io.log(`--- ${change.path}`)
  io.log(lineDiff(change.oldBlock ?? '', change.newBlock ?? ''))
}

async function apply(change: FileChange) {
  if (change.action === ChangeAction.Unchanged) return
  if (change.after === null) {
    await unlink(change.target)
    return
  }
  await mkdir(dirname(change.target), { recursive: true })
  await writeFile(change.target, change.after, 'utf8')
}

function printOutcome(io: Io, generation: Generation) {
  if (generation.recommendations.length > 0) {
    io.log('\nRecommendations:')
    for (const item of generation.recommendations) {
      io.log(`- [${item.target}] ${item.title}`)
      for (const line of item.body.split('\n')) io.log(`    ${line}`)
    }
  }
  const skills = generation.skills.compatible.filter(
    (skill) => typeof skill.name === 'string' && typeof skill.url === 'string',
  )
  if (skills.length > 0) {
    io.log('\nCompatible skills (third-party resources, not checked by Coreloom UML):')
    for (const skill of skills) io.log(`- ${skill.name}: ${skill.url}`)
  }
}

/**
 * `pull`: writes the project's latest generation into the repository at `cwd`, one managed block
 * per file. Returns the exit code.
 */
export async function pull(options: PullOptions): Promise<ExitCode> {
  const { cwd, io } = options
  const env = options.env ?? process.env
  const manifest = await readManifest(cwd)

  const rawProject = options.project ?? (manifest ? String(manifest.projectId) : undefined)
  if (!rawProject) {
    throw new CliError('No project yet: pass --project <id> (the id is in the project page URL).')
  }
  const projectId = parseProjectId(rawProject)
  const apiUrl = resolveApiUrl(options.apiUrl, manifest?.apiUrl, env)
  const apiKey = await requireApiKey(env)

  const generation = await fetchLatestGeneration({
    apiUrl,
    apiKey,
    projectId,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  })
  const changes = await planPull(cwd, generation, manifest)

  io.log(`Generation #${generation.id} (revision ${generation.revision}) of project ${projectId}:`)
  for (const change of changes) io.log(`  ${describe(change)}`)

  if (options.dryRun) {
    for (const change of changes) {
      if (change.action !== ChangeAction.Unchanged) showDiff(io, change)
    }
    io.log('\nDry run: nothing written.')
    return ExitCode.Ok
  }

  const edited = changes.filter((change) => change.edited)
  if (options.yes && !options.force && edited.length > 0) {
    for (const change of edited) showDiff(io, change)
    io.warn(
      `\n${edited.length} block(s) edited by hand: nothing written. Move your edits outside the ` +
        'block, or pass --force to overwrite them.',
    )
    return ExitCode.EditedBlockKept
  }

  const pending = changes.filter(needsConfirmation)
  if (pending.length > 0 && !options.yes && !io.interactive) {
    throw new CliError(
      'Some changes need a confirmation and there is no terminal to ask in: run again with --yes ' +
        '(and --force to overwrite blocks edited by hand), or with --dry-run to review them.',
    )
  }

  const skipped = new Set<FileChange>()
  if (!options.yes) {
    for (const change of pending) {
      if (change.edited) showDiff(io, change)
      const question = change.edited
        ? `${change.path}: overwrite the block edited by hand?`
        : `${change.path} exists without a managed block: add one at its end?`
      if (!(await io.confirm(question))) skipped.add(change)
    }
  }

  for (const change of changes) {
    if (!skipped.has(change)) await apply(change)
  }

  const previous = new Map(manifest?.files.map((file) => [file.path, file]))
  const files: ManifestFile[] = []
  for (const change of changes) {
    if (skipped.has(change)) {
      const kept = previous.get(change.path)
      if (kept) files.push(kept)
    } else if (change.blockHash) {
      files.push({ path: change.path, blockHash: change.blockHash })
    }
  }
  const next: Manifest = {
    apiUrl,
    projectId,
    generationId: generation.id,
    revision: generation.revision,
    files,
  }
  await writeManifest(cwd, next)

  const written = changes.filter(
    (change) => !skipped.has(change) && change.action !== ChangeAction.Unchanged,
  ).length
  io.log(`\n${written} file(s) written, ${skipped.size} left as they were.`)
  printOutcome(io, generation)

  const keptEdited = [...skipped].some((change) => change.edited)
  return keptEdited ? ExitCode.EditedBlockKept : ExitCode.Ok
}
