import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  describeSource,
  type FetchLike,
  fetchLatestGeneration,
  type Generation,
  type Source,
} from './api.ts'
import { lineDiff } from './diff.ts'
import { CliError, ExitCode } from './errors.ts'
import type { Io } from './io.ts'
import { type Manifest, type ManifestFile, readManifest, writeManifest } from './manifest.ts'
import {
  ChangeAction,
  type FileChange,
  isJson,
  isSettings,
  needsConfirmation,
  planPull,
} from './plan.ts'
import { API_KEY_ENV, resolveApiKey, resolveApiUrl } from './settings.ts'

export type PullOptions = {
  cwd: string
  io: Io
  apiUrl?: string
  /** The configuration's id (in its page URL). */
  config?: string
  /** The id of the project the configuration sits in, instead of `config`. */
  project?: string
  dryRun?: boolean
  yes?: boolean
  force?: boolean
  env?: NodeJS.ProcessEnv
  fetch?: FetchLike
}

export function parseId(raw: string, what: string): number {
  const id = Number(raw)
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(id) || id < 1) {
    throw new CliError(`Invalid ${what} id: ${raw} (a positive whole number is expected).`)
  }
  return id
}

/** `--config`, else `--project`, else what the manifest holds. */
function resolveSource(options: PullOptions, manifest: Manifest | null): Source {
  if (options.config && options.project) {
    throw new CliError('Pass --config or --project, not both.')
  }
  if (options.config) return { configId: parseId(options.config, 'configuration') }
  if (options.project) return { projectId: parseId(options.project, 'project') }
  if (manifest)
    return 'configId' in manifest
      ? { configId: manifest.configId }
      : { projectId: manifest.projectId }
  throw new CliError(
    'No configuration yet: pass --config <id> (the id is in the agent conventions page URL).',
  )
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
  // In a JSON settings file the CLI owns entries, not a block.
  const what = isJson(change.path) ? 'keys ' : 'block'
  switch (change.action) {
    case ChangeAction.Create:
      return `create        ${change.path}`
    case ChangeAction.Append:
      return `add ${what} to  ${change.path} (the rest of the file is kept)`
    case ChangeAction.Update:
      return `update ${what}  ${change.path}${edited}`
    case ChangeAction.Unchanged:
      return `up to date    ${change.path}`
    case ChangeAction.Remove:
      return change.after === null
        ? `delete        ${change.path}${edited}`
        : `remove ${what}  ${change.path}${edited}`
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
  // Links only, and only https ones: a skill is never installed nor run from here.
  const skills = generation.skills.compatible.filter(
    (skill) =>
      typeof skill.name === 'string' &&
      typeof skill.url === 'string' &&
      skill.url.startsWith('https://'),
  )
  if (skills.length > 0) {
    io.log('\nCompatible skills (third-party resources, not checked by Coreloom UML):')
    for (const skill of skills) io.log(`- ${skill.name}: ${skill.url}`)
  }
}

/**
 * `pull`: writes the configuration's latest generation into the repository at `cwd`, one managed block
 * per file. Returns the exit code.
 */
export async function pull(options: PullOptions): Promise<ExitCode> {
  const { cwd, io } = options
  const env = options.env ?? process.env
  const manifest = await readManifest(cwd)

  const source = resolveSource(options, manifest)
  const apiUrl = resolveApiUrl(options.apiUrl, manifest?.apiUrl, env)
  const apiKey = await requireApiKey(env)

  const generation = await fetchLatestGeneration({
    apiUrl,
    apiKey,
    source,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  })
  const changes = await planPull(cwd, generation, manifest)

  io.log(
    `Generation #${generation.id} (revision ${generation.revision}) of ${describeSource(source)}:`,
  )
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
        '(and --force to overwrite what was edited by hand), or with --dry-run to review them.',
    )
  }

  const skipped = new Set<FileChange>()
  if (!options.yes) {
    for (const change of pending) {
      if (change.edited || isSettings(change.path)) showDiff(io, change)
      const question = change.edited
        ? `${change.path}: overwrite what was edited by hand?`
        : isSettings(change.path)
          ? `${change.path}: write these settings? They decide what the assistant may run.`
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
      files.push({
        path: change.path,
        blockHash: change.blockHash,
        ...(change.content !== undefined && { content: change.content }),
      })
    }
  }
  const next: Manifest = {
    apiUrl,
    ...source,
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
