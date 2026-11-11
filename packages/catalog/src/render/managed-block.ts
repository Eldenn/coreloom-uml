import { sha256Hex } from './sha256.ts'

/**
 * The managed block: the only part of a repository file that Coreloom UML writes. The CLI
 * replaces what lies between these markers and leaves the rest of the file alone.
 */
export const MANAGED_BLOCK_BEGIN =
  '<!-- coreloom-uml:begin · managed block, edits inside it are replaced on the next pull -->'
export const MANAGED_BLOCK_END = '<!-- coreloom-uml:end -->'

/**
 * The markers of one comment syntax. `beginPrefix` is what a begin marker is recognised by,
 * whatever explanation follows it.
 */
export type BlockMarkers = { begin: string; beginPrefix: string; end: string }

export const MARKDOWN_MARKERS: BlockMarkers = {
  begin: MANAGED_BLOCK_BEGIN,
  beginPrefix: '<!-- coreloom-uml:begin',
  end: MANAGED_BLOCK_END,
}

/** For files whose comments start with `#` (TOML). */
export const HASH_MARKERS: BlockMarkers = {
  begin: '# coreloom-uml:begin · managed block, edits inside it are replaced on the next pull',
  beginPrefix: '# coreloom-uml:begin',
  end: '# coreloom-uml:end',
}

/** Wraps a body in the markers. The block has no trailing newline. */
export function wrapManagedBlock(body: string, markers = MARKDOWN_MARKERS): string {
  return `${markers.begin}\n${body.trim()}\n${markers.end}`
}

/** `sha256:<hex>` of a block, markers included, trailing line breaks excluded. */
export function hashManagedBlock(block: string): string {
  return `sha256:${sha256Hex(block.replace(/\n+$/, ''))}`
}

export type ManagedBlockLocation = {
  /** The block, from the start of the begin marker to the end of the end marker. */
  block: string
  start: number
  end: number
}

/**
 * Finds the managed block in a file's text. Returns `null` when there is none, and throws when
 * the markers are unbalanced (a begin without an end, or more than one block), since rewriting
 * such a file could lose the owner's text.
 */
export function findManagedBlock(
  text: string,
  markers = MARKDOWN_MARKERS,
): ManagedBlockLocation | null {
  const start = text.indexOf(markers.beginPrefix)
  const endMarker = text.indexOf(markers.end)
  if (start === -1 && endMarker === -1) return null
  if (start === -1 || endMarker === -1 || endMarker < start) {
    throw new Error('Unbalanced coreloom-uml markers')
  }
  const end = endMarker + markers.end.length
  if (
    text.indexOf(markers.beginPrefix, start + 1) !== -1 ||
    text.indexOf(markers.end, end) !== -1
  ) {
    throw new Error('More than one coreloom-uml managed block')
  }
  return { block: text.slice(start, end), start, end }
}
