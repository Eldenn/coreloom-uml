import { readFile } from 'node:fs/promises'
import { hashManagedBlock } from '@coreloom-uml/catalog'
import { describeSource, type FetchLike, fetchLatestGeneration } from './api.ts'
import { CliError, ExitCode } from './errors.ts'
import type { Io } from './io.ts'
import { MANIFEST_FILE, readManifest } from './manifest.ts'
import { resolveSafePath } from './paths.ts'
import { locateBlock } from './plan.ts'
import { API_KEY_ENV, resolveApiKey, resolveApiUrl } from './settings.ts'

export const FileState = {
  Unchanged: 'unchanged',
  BlockEdited: 'block edited',
  BlockMissing: 'block missing',
  FileMissing: 'file missing',
} as const

export type FileState = (typeof FileState)[keyof typeof FileState]

export type StatusOptions = {
  cwd: string
  io: Io
  apiUrl?: string
  env?: NodeJS.ProcessEnv
  fetch?: FetchLike
  /** `check`: the exit code tells whether every block matches the latest generation. */
  check?: boolean
  /** With `check`: print one JSON object instead of text. */
  json?: boolean
}

async function fileState(root: string, path: string, blockHash: string): Promise<FileState> {
  let text: string
  try {
    text = await readFile(await resolveSafePath(root, path), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return FileState.FileMissing
    throw error
  }
  const location = locateBlock(path, text)
  if (!location) return FileState.BlockMissing
  return hashManagedBlock(location.block) === blockHash
    ? FileState.Unchanged
    : FileState.BlockEdited
}

/**
 * `status`: compares each managed block with the one the last pull wrote and, when an API key is
 * at hand, says whether a newer generation exists. Never writes.
 *
 * With `check` (the `check` command, for CI), the answer is the exit code: 0 only when every block
 * is unchanged and the pulled generation is the latest one, so a missing key or an unreachable API
 * is an error. A block edited by hand wins over a missing one, which wins over a newer generation.
 */
export async function status(options: StatusOptions): Promise<ExitCode> {
  const { cwd, io, check = false } = options
  const json = check && options.json === true
  const log = json ? () => {} : io.log
  const env = options.env ?? process.env
  const manifest = await readManifest(cwd)
  if (!manifest) {
    throw new CliError(`No ${MANIFEST_FILE} here: run "coreloom-uml pull --config <id>" first.`)
  }

  log(
    `Generation #${manifest.generationId} (revision ${manifest.revision}) of ${describeSource(manifest)}:`,
  )
  const files: { path: string; state: FileState }[] = []
  for (const file of manifest.files) {
    const state = await fileState(cwd, file.path, file.blockHash)
    files.push({ path: file.path, state })
    log(`  ${state.padEnd(14)}${file.path}`)
  }

  const apiKey = await resolveApiKey(env)
  if (!apiKey) {
    if (check) throw new CliError(`No API key: set ${API_KEY_ENV} to check the latest generation.`)
    log('\nNo API key: cannot check for a newer generation.')
    return ExitCode.Ok
  }
  let latestId: number
  try {
    const apiUrl = resolveApiUrl(options.apiUrl, manifest.apiUrl, env)
    const latest = await fetchLatestGeneration({
      apiUrl,
      apiKey,
      source: manifest,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    })
    latestId = latest.id
    log(
      latest.id === manifest.generationId
        ? '\nUp to date with the latest generation.'
        : `\nA newer generation exists (#${latest.id}, revision ${latest.revision}): run "coreloom-uml pull".`,
    )
  } catch (error) {
    if (check || !(error instanceof CliError)) throw error
    io.warn(`\nCould not check for a newer generation: ${error.message}`)
    return ExitCode.Ok
  }
  if (!check) return ExitCode.Ok

  const states = new Set(files.map((file) => file.state))
  let exitCode: ExitCode = ExitCode.Ok
  if (states.has(FileState.BlockEdited)) exitCode = ExitCode.EditedBlockKept
  else if (states.has(FileState.BlockMissing) || states.has(FileState.FileMissing)) {
    exitCode = ExitCode.BlockMissing
  } else if (latestId !== manifest.generationId) exitCode = ExitCode.Stale
  if (json) {
    io.log(
      JSON.stringify({
        ok: exitCode === ExitCode.Ok,
        exitCode,
        generationId: manifest.generationId,
        latestGenerationId: latestId,
        files,
      }),
    )
  }
  return exitCode
}
