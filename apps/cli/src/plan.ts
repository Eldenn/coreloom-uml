import { readFile } from 'node:fs/promises'
import {
  findManagedBlock,
  hashManagedBlock,
  type ManagedBlockLocation,
} from '@coreloom-uml/catalog'
import type { Generation } from './api.ts'
import { CliError } from './errors.ts'
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
}

/** Whether applying the change asks the user first (appending to a file, or a hand edit). */
export function needsConfirmation(change: FileChange): boolean {
  return change.action === ChangeAction.Append || change.edited
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
    return findManagedBlock(text)
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
  const known = new Map(manifest?.files.map((file) => [file.path, file.blockHash]))
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
    if (!location) {
      changes.push({
        ...base,
        action: ChangeAction.Append,
        edited: false,
        after: appendBlock(before, content),
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
      edited: hashManagedBlock(location.block) !== known.get(file.path),
      after,
      oldBlock: location.block,
    })
  }

  for (const [path, previousHash] of known) {
    if (seen.has(path)) continue
    const target = await resolveSafePath(root, path)
    const before = await readText(target)
    const location = before === null ? null : locateBlock(path, before)
    if (before === null || !location) continue
    changes.push({
      path,
      target,
      action: ChangeAction.Remove,
      edited: hashManagedBlock(location.block) !== previousHash,
      before,
      after: removeBlock(before, location),
      oldBlock: location.block,
      newBlock: null,
      blockHash: null,
    })
  }

  return changes
}
