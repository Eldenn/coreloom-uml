import { readFile } from 'node:fs/promises'
import {
  findManagedBlock,
  HASH_MARKERS,
  hashManagedBlock,
  MARKDOWN_MARKERS,
  type ManagedBlockLocation,
  SLASH_MARKERS,
} from '@coreloom-uml/catalog'
import type { Generation } from './api.ts'
import { CliError } from './errors.ts'
import {
  containsJson,
  formatJson,
  type JsonObject,
  mergeJson,
  parseJsonObject,
  sameJson,
  withoutJson,
} from './json-settings.ts'
import type { Manifest } from './manifest.ts'
import { resolveSafePath } from './paths.ts'

export const ChangeAction = {
  /** The file does not exist: it is created with the block alone. */
  Create: 'create',
  /** The file has no managed block: the block is added at its end. */
  Append: 'append',
  /** The block is replaced. */
  Update: 'update',
  /** The block already holds the new content. */
  Unchanged: 'unchanged',
  /** The file left the generation: its block is taken out, and the file deleted if emptied. */
  Remove: 'remove',
} as const

export type ChangeAction = (typeof ChangeAction)[keyof typeof ChangeAction]

export type FileChange = {
  path: string
  /** Absolute path, checked by `resolveSafePath`. */
  target: string
  action: ChangeAction
  /** The local block differs from the one the last pull wrote: it was edited by hand. */
  edited: boolean
  /** The file's text now (`null` when absent) and after the change (`null` = delete it). */
  before: string | null
  after: string | null
  /** The block now and after the change, for the diff. */
  oldBlock: string | null
  newBlock: string | null
  /** What the manifest records once written; `null` when the file leaves the manifest. */
  blockHash: string | null
  /** For a JSON settings file, the generation's object, which the manifest records too. */
  content?: string
}

/** A JSON settings file: the CLI merges entries into it instead of writing a block. */
export const isJson = (path: string) => path.endsWith('.json')
/** A TOML settings file: its block uses `#` markers and sits at the top, before any table. */
const isToml = (path: string) => path.endsWith('.toml')
/** A CommonJS configuration file: its block uses `//` markers, and a tool runs it as code. */
export const isCjs = (path: string) => path.endsWith('.cjs')
/**
 * A tool's settings or configuration file: unlike Markdown, it decides what runs here without
 * asking.
 */
export const isSettings = (path: string) => isJson(path) || isToml(path) || isCjs(path)

/**
 * Whether applying the change asks the user first: adding to an existing file, a hand edit, or
 * any new content for a settings file (a server must not change what runs here unseen).
 */
export function needsConfirmation(change: FileChange): boolean {
  if (change.action === ChangeAction.Append || change.edited) return true
  return (
    isSettings(change.path) &&
    (change.action === ChangeAction.Create || change.action === ChangeAction.Update)
  )
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export function locateBlock(path: string, text: string): ManagedBlockLocation | null {
  try {
    const markers = isToml(path) ? HASH_MARKERS : isCjs(path) ? SLASH_MARKERS : MARKDOWN_MARKERS
    return findManagedBlock(text, markers)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new CliError(`${path}: ${reason}. Fix the markers by hand, then pull again.`)
  }
}

/** The file's text with the block appended, after one blank line. */
export function appendBlock(text: string, content: string): string {
  if (text === '') return content
  const separator = text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n'
  return `${text}${separator}${content}`
}

/** The top-level keys of a TOML text: its `key =` lines before the first `[table]`. */
function topLevelKeys(text: string): string[] {
  const keys: string[] = []
  for (const line of text.split('\n')) {
    if (/^\s*\[/.test(line)) break
    const key = /^\s*([\w-]+)\s*=/.exec(line)?.[1]
    if (key) keys.push(key)
  }
  return keys
}

/** A key set twice makes the whole TOML file invalid: refuse rather than break the tool. */
function refuseDuplicateKeys(path: string, block: string, rest: string) {
  const ours = topLevelKeys(block)
  const duplicate = topLevelKeys(rest).find((key) => ours.includes(key))
  if (duplicate) {
    throw new CliError(
      `${path} already sets ${duplicate} outside the managed block: remove that line, then pull again.`,
    )
  }
}

function readSettings(path: string, text: string): JsonObject {
  const value = parseJsonObject(text)
  if (!value) {
    throw new CliError(
      `${path} is not a JSON object (comments are not supported): fix it by hand, then pull again.`,
    )
  }
  return value
}

/** What merging the generation's object into a JSON settings file does (see `json-settings.ts`). */
function planJson(
  base: Pick<FileChange, 'path' | 'target' | 'before' | 'blockHash'>,
  content: string,
  previousContent: string | undefined,
): FileChange {
  const next = parseJsonObject(content)
  if (!next) throw new CliError(`${base.path}: the generation holds no JSON object; pull again.`)
  const previous = previousContent === undefined ? null : parseJsonObject(previousContent)
  const local = base.before === null ? null : readSettings(base.path, base.before)
  const kept = local && previous ? (withoutJson(local, previous) ?? {}) : (local ?? {})
  const merged = mergeJson(kept, next)
  const unchanged = local !== null && sameJson(merged, local)
  const after = unchanged ? base.before : formatJson(merged)
  return {
    ...base,
    content,
    action: unchanged
      ? ChangeAction.Unchanged
      : local === null
        ? ChangeAction.Create
        : previous
          ? ChangeAction.Update
          : ChangeAction.Append,
    edited: !unchanged && local !== null && previous !== null && !containsJson(local, previous),
    after,
    oldBlock: base.before?.trimEnd() ?? null,
    newBlock: after?.trimEnd() ?? null,
  }
}

/** The file's text without its block and the line break after it; `null` if nothing is left. */
export function removeBlock(text: string, location: ManagedBlockLocation): string | null {
  let before = text.slice(0, location.start)
  let after = text.slice(location.end)
  if (after.startsWith('\n')) after = after.slice(1)
  if (after === '' && before.endsWith('\n\n')) before = before.slice(0, -1)
  const rest = before + after
  return rest.trim() === '' ? null : rest
}

/** Works out, without writing anything, what pulling `generation` does to each file. */
export async function planPull(
  root: string,
  generation: Generation,
  manifest: Manifest | null,
): Promise<FileChange[]> {
  const known = new Map(manifest?.files.map((file) => [file.path, file]))
  const seen = new Set<string>()
  const changes: FileChange[] = []

  for (const file of generation.files) {
    if (seen.has(file.path)) throw new CliError(`The generation lists ${file.path} twice.`)
    seen.add(file.path)
    const target = await resolveSafePath(root, file.path)
    const newBlock = file.content.replace(/\n+$/, '')
    const content = `${newBlock}\n`
    const blockHash = hashManagedBlock(newBlock)
    if (blockHash !== file.blockHash) {
      throw new CliError(`${file.path}: the block does not match its hash; pull again.`)
    }
    const before = await readText(target)
    if (isJson(file.path)) {
      changes.push(
        planJson(
          { path: file.path, target, before, blockHash },
          newBlock,
          known.get(file.path)?.content,
        ),
      )
      continue
    }
    const base = { path: file.path, target, before, newBlock, blockHash }

    if (before === null) {
      changes.push({
        ...base,
        action: ChangeAction.Create,
        edited: false,
        after: content,
        oldBlock: null,
      })
      continue
    }
    const location = locateBlock(file.path, before)
    if (isToml(file.path)) {
      const rest = location ? before.slice(0, location.start) + before.slice(location.end) : before
      refuseDuplicateKeys(file.path, newBlock, rest)
    }
    if (!location) {
      changes.push({
        ...base,
        action: ChangeAction.Append,
        edited: false,
        // Top-level TOML keys only count before the first table: the block goes first.
        after: isToml(file.path)
          ? `${content}${before === '' ? '' : '\n'}${before}`
          : appendBlock(before, content),
        oldBlock: null,
      })
      continue
    }
    const after = before.slice(0, location.start) + newBlock + before.slice(location.end)
    if (location.block === newBlock) {
      changes.push({
        ...base,
        action: ChangeAction.Unchanged,
        edited: false,
        after,
        oldBlock: location.block,
      })
      continue
    }
    changes.push({
      ...base,
      action: ChangeAction.Update,
      edited: hashManagedBlock(location.block) !== known.get(file.path)?.blockHash,
      after,
      oldBlock: location.block,
    })
  }

  for (const [path, previous] of known) {
    if (seen.has(path)) continue
    const target = await resolveSafePath(root, path)
    const before = await readText(target)
    if (isJson(path)) {
      const written = parseJsonObject(previous.content ?? '')
      if (before === null || !written) continue
      const local = readSettings(path, before)
      const rest = withoutJson(local, written)
      if (sameJson(rest, local)) continue
      const after = rest === undefined ? null : formatJson(rest)
      changes.push({
        path,
        target,
        action: ChangeAction.Remove,
        edited: !containsJson(local, written),
        before,
        after,
        oldBlock: before.trimEnd(),
        newBlock: after?.trimEnd() ?? null,
        blockHash: null,
      })
      continue
    }
    const location = before === null ? null : locateBlock(path, before)
    if (before === null || !location) continue
    changes.push({
      path,
      target,
      action: ChangeAction.Remove,
      edited: hashManagedBlock(location.block) !== previous.blockHash,
      before,
      after: removeBlock(before, location),
      oldBlock: location.block,
      newBlock: null,
      blockHash: null,
    })
  }

  return changes
}
