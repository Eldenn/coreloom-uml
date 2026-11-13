/** The prefix every managed-block marker starts with. No input may contain it. */
export const MARKER_PREFIX = 'coreloom-uml:'

const MARKDOWN_SPECIAL = /[\\`*_[\]<>#|]/g

/** Folds any run of whitespace, line breaks included, into one space. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Cuts text to `max` characters, ending with an ellipsis when it was longer. */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/**
 * Writes half a surrogate pair as a replacement character: no UTF-8 file can hold one, TOML has
 * no escape for it and a YAML reader may refuse the escape or hand the half back.
 */
export function wellFormed(text: string): string {
  // With the `u` flag a surrogate matches only when it stands alone.
  return text.replace(/\p{Surrogate}/gu, '\ufffd')
}

/** Removes managed-block markers, so that no input can open or close a block. */
export function stripMarkers(text: string): string {
  return text.replaceAll(MARKER_PREFIX, 'coreloom-uml ')
}

/**
 * Turns user text (a name, a title, an answer) into inline Markdown: one line, markers removed,
 * and every character that could start emphasis, code, a link, HTML or a table escaped.
 */
export function inlineMarkdown(text: string, max?: number): string {
  const line = oneLine(stripMarkers(text))
  const cut = max === undefined ? line : truncate(line, max)
  return cut.replace(MARKDOWN_SPECIAL, (character) => `\\${character}`)
}

const RAW_TAG = /<(?=[a-zA-Z!/?])/g
const FENCE_OPEN = /^(`{3,}|~{3,})(.*)$/
const FENCE_LIKE = /```|~~~/

/**
 * Turns the owner's notes into a Markdown body kept as written, except that line endings are
 * normalised, trailing spaces and blank runs are trimmed, markers are removed and raw HTML
 * tags are escaped (no HTML is ever rendered from user input). A tag is left as written only
 * inside a closed fenced code block opened at column 0, where a reader shows it as code.
 */
export function blockMarkdown(text: string): string {
  const lines = stripMarkers(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .split('\n')
  const kept = protectedLines(lines)
  return lines
    .map((line, index) => (kept.has(index) ? line : line.replace(RAW_TAG, '\\<')))
    .join('\n')
}

/**
 * The lines inside closed top-level fences. Once any other line looks like a fence (in a list, a
 * quote, indented, unclosed), a later column-0 fence line may close that one rather than open a
 * block, so nothing after it is protected: when in doubt, escape.
 */
function protectedLines(lines: string[]): Set<number> {
  const kept = new Set<number>()
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ''
    const [, fence = '', info = ''] = FENCE_OPEN.exec(line) ?? []
    const character = fence.charAt(0)
    // An info string with a backtick makes a backtick line plain text, not a fence.
    if (!fence || (character === '`' && info.includes('`'))) {
      if (FENCE_LIKE.test(line)) break
      continue
    }
    const close = new RegExp(`^ {0,3}${character}{${fence.length},}$`)
    const end = lines.findIndex((line, at) => at > index && close.test(line))
    if (end === -1) break
    for (let inside = index + 1; inside < end; inside++) kept.add(inside)
    index = end
  }
  return kept
}
