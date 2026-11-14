import { readFile } from 'node:fs/promises'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import { type CodeMap, importGraphify, parseCodeMap } from '@coreloom-uml/codemap'
import { inflate, isGzip } from '#app/code-maps/services/code-map-storage'

export type CodeMapUploadOptions = {
  repository?: string
  branch?: string
  commit?: string
}

export type CodeMapUploadResult = { ok: true; map: CodeMap } | { ok: false; problems: string[] }

/**
 * Reads an uploaded file into a checked `CodeMap`: graphify's `graph.json` (through
 * `importGraphify`) or a map the CLI already normalized (through `parseCodeMap`), either one
 * plain or gzipped. Nothing in it is run; anything else is a list of problems for a 422.
 */
export async function readUploadedCodeMap(
  file: MultipartFile,
  options: CodeMapUploadOptions,
): Promise<CodeMapUploadResult> {
  if (!file.tmpPath) return { ok: false, problems: ['The upload could not be read.'] }
  let bytes: Buffer = await readFile(file.tmpPath)
  if (isGzip(bytes)) {
    const inflated = await inflate(bytes)
    if (!inflated) {
      return { ok: false, problems: ['The gzip file is damaged or too large once inflated.'] }
    }
    bytes = inflated
  }

  let value: unknown
  try {
    value = JSON.parse(bytes.toString('utf8'))
  } catch {
    return { ok: false, problems: ['The file is not JSON.'] }
  }
  return readCodeMapValue(value, options)
}

/** Tells a graphify graph from a `CodeMap` by their top-level fields. */
export function readCodeMapValue(
  value: unknown,
  options: CodeMapUploadOptions,
): CodeMapUploadResult {
  if (isObject(value) && 'header' in value) {
    const parsed = parseCodeMap(value)
    if (!parsed.ok) return parsed
    const header = { ...parsed.map.header }
    if (options.repository) header.repository = options.repository
    if (options.branch) header.branch = options.branch
    if (options.commit) header.commit = options.commit
    return { ok: true, map: { ...parsed.map, header } }
  }
  const imported = importGraphify(value, options)
  if (!imported.ok) return imported
  return { ok: true, map: imported.map }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
