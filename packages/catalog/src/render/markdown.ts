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

/**
 * Turns the owner's notes into a Markdown body kept as written, except that line endings are
 * normalised, trailing spaces and blank runs are trimmed, markers are removed and raw HTML
 * tags are escaped (no HTML is ever rendered from user input).
 */
export function blockMarkdown(text: string): string {
  return stripMarkers(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd().replace(/<(?=[a-zA-Z!/?])/g, '\\<'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
