import { readFile } from 'node:fs/promises'
import { hashManagedBlock } from '@coreloom-uml/catalog'
import { describeSource, type FetchLike, fetchLatestGeneration } from './api.ts'
import { CliError, ExitCode } from './errors.ts'
import type { Io } from './io.ts'
import { MANIFEST_FILE, readManifest } from './manifest.ts'
import { resolveSafePath } from './paths.ts'
import { locateBlock } from './plan.ts'
import { resolveApiKey, resolveApiUrl } from './settings.ts'

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
 */
export async function status(options: StatusOptions): Promise<ExitCode> {
  const { cwd, io } = options
  const env = options.env ?? process.env
  const manifest = await readManifest(cwd)
  if (!manifest) {
    throw new CliError(`No ${MANIFEST_FILE} here: run "coreloom-uml pull --config <id>" first.`)
  }

  io.log(
    `Generation #${manifest.generationId} (revision ${manifest.revision}) of ${describeSource(manifest)}:`,
  )
  for (const file of manifest.files) {
    io.log(`  ${(await fileState(cwd, file.path, file.blockHash)).padEnd(14)}${file.path}`)
  }

  const apiKey = await resolveApiKey(env)
  if (!apiKey) {
    io.log('\nNo API key: cannot check for a newer generation.')
    return ExitCode.Ok
  }
  try {
    const apiUrl = resolveApiUrl(options.apiUrl, manifest.apiUrl, env)
    const latest = await fetchLatestGeneration({
      apiUrl,
      apiKey,
      source: manifest,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    })
    io.log(
      latest.id === manifest.generationId
        ? '\nUp to date with the latest generation.'
        : `\nA newer generation exists (#${latest.id}, revision ${latest.revision}): run "coreloom-uml pull".`,
    )
  } catch (error) {
    if (!(error instanceof CliError)) throw error
    io.warn(`\nCould not check for a newer generation: ${error.message}`)
  }
  return ExitCode.Ok
}
