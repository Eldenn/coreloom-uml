import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CliError } from './errors.ts'

/** The manifest's name, at the repository root. It holds no secret and can be committed. */
export const MANIFEST_FILE = '.coreloom-uml.json'

export type ManifestFile = {
  path: string
  /** Hash of the block as the CLI last wrote it: a different local hash means a hand edit. */
  blockHash: string
}

export type Manifest = {
  apiUrl?: string
  projectId: number
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
  let value: Partial<Manifest>
  try {
    value = JSON.parse(text) as Partial<Manifest>
  } catch {
    throw new CliError(`${MANIFEST_FILE} is not valid JSON.`)
  }
  if (
    !Number.isInteger(value.projectId) ||
    !Array.isArray(value.files) ||
    !value.files.every(
      (file) => typeof file?.path === 'string' && typeof file.blockHash === 'string',
    )
  ) {
    throw new CliError(`${MANIFEST_FILE} is malformed: delete it and pull again with --project.`)
  }
  return {
    ...(typeof value.apiUrl === 'string' ? { apiUrl: value.apiUrl } : {}),
    projectId: value.projectId as number,
    generationId: Number(value.generationId) || 0,
    revision: Number(value.revision) || 0,
    files: value.files,
  }
}

export async function writeManifest(root: string, manifest: Manifest): Promise<void> {
  const files = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path))
  await writeFile(
    join(root, MANIFEST_FILE),
    `${JSON.stringify({ ...manifest, files }, null, 2)}\n`,
    'utf8',
  )
}
