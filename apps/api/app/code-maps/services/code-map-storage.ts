import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { gunzip, gzip } from 'node:zlib'
import drive from '@adonisjs/drive/services/main'
import type { CodeMap } from '@coreloom-uml/codemap'
import { CODE_MAP_LIMITS, CODE_MAP_STORAGE_FOLDER } from '#app/code-maps/constants/code-map'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

/** The first two bytes of every gzip stream. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

/**
 * Inflates gzip bytes, refusing to produce more than `CODE_MAP_LIMITS.inflatedBytes` (a small
 * file that inflates to gigabytes must not reach memory). Null when it is not valid gzip or too
 * large once inflated.
 */
export async function inflate(bytes: Uint8Array): Promise<Buffer | null> {
  try {
    return await gunzipAsync(bytes, { maxOutputLength: CODE_MAP_LIMITS.inflatedBytes })
  } catch {
    return null
  }
}

/** Stores a checked map, gzipped, under a new key in the project's folder. */
export async function storeCodeMapFile(projectId: number, map: CodeMap): Promise<string> {
  const key = `${CODE_MAP_STORAGE_FOLDER}/${projectId}/${randomUUID()}.json.gz`
  const bytes = await gzipAsync(JSON.stringify(map))
  await drive.use().put(key, bytes, { contentType: 'application/gzip' })
  return key
}

/** Reads a stored map back. It was checked with `parseCodeMap` before it was stored. */
export async function readCodeMapFile(key: string): Promise<CodeMap> {
  const bytes = await drive.use().getBytes(key)
  const json = await gunzipAsync(bytes, { maxOutputLength: CODE_MAP_LIMITS.inflatedBytes })
  return JSON.parse(json.toString('utf8')) as CodeMap
}

/** Deletes stored maps; one already gone is not an error (the row is the source of truth). */
export async function deleteCodeMapFiles(keys: readonly (string | null)[]): Promise<void> {
  const disk = drive.use()
  await Promise.all(
    keys
      .filter((key): key is string => key !== null)
      .map((key) => disk.delete(key).catch(() => {})),
  )
}
