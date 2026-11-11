import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Source } from './api.ts'
import { CliError } from './errors.ts'

/** The manifest's name, at the repository root. It holds no secret and can be committed. */
export const MANIFEST_FILE = '.coreloom-uml.json'

export type ManifestFile = {
  path: string
  /** Hash of the block as the CLI last wrote it: a different local hash means a hand edit. */
  blockHash: string
}

/** `configId` since configurations can stand outside a project; older manifests hold `projectId`. */
export type Manifest = Source & {
  apiUrl?: string
  generationId: number
  revision: number
  files: ManifestFile[]
}

export async function readManifest(root: string): Promise<Manifest | null> {
  let text: string
  try {
    text = await readFile(join(root, MANIFEST_FILE), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  let value: Record<string, unknown>
  try {
    value = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new CliError(`${MANIFEST_FILE} is not valid JSON.`)
  }
  const source = readSource(value)
  if (
    !source ||
    !Array.isArray(value.files) ||
    !value.files.every(
      (file) => typeof file?.path === 'string' && typeof file.blockHash === 'string',
    )
  ) {
    throw new CliError(`${MANIFEST_FILE} is malformed: delete it and pull again with --config.`)
  }
  return {
    ...(typeof value.apiUrl === 'string' ? { apiUrl: value.apiUrl } : {}),
    ...source,
    generationId: Number(value.generationId) || 0,
    revision: Number(value.revision) || 0,
    files: value.files,
  }
}

function readSource(value: Record<string, unknown>): Source | null {
  if (Number.isInteger(value.configId)) return { configId: value.configId as number }
  if (Number.isInteger(value.projectId)) return { projectId: value.projectId as number }
  return null
}

export async function writeManifest(root: string, manifest: Manifest): Promise<void> {
  const files = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path))
  await writeFile(
    join(root, MANIFEST_FILE),
    `${JSON.stringify({ ...manifest, files }, null, 2)}\n`,
    'utf8',
  )
}
