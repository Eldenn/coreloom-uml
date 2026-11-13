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

/** A line that opens a fenced code block: its indent, the fence and what follows it. */
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/
/** A fence after a list or quote marker, or indented further than a fence can be by itself. */
const NESTED_FENCE = /^(?:[\s>]|[-+*]|\d{1,9}[.)])*(?:`{3,}|~{3,})/

const indentOf = (line: string) => line.length - line.trimStart().length

/**
 * The lines inside the fenced code blocks of a text, where a Markdown reader takes `<` as written.
 * A line counts only when no reading of the text could put it outside a code block, so the search
 * stops, and nothing after is protected, at a fence that never closes, at one a list item or a
 * quote may hold, and at an indented one a line with a smaller indent could close with its item.
 */
function fencedLines(lines: readonly string[]): Set<number> {
  const fenced = new Set<number>()
  let index = 0
  while (index < lines.length) {
    const [, indent, fence, info] = FENCE.exec(lines[index] ?? '') ?? []
    if (indent === undefined || fence === undefined) {
      if (NESTED_FENCE.test(lines[index] ?? '')) break
      index += 1
      continue
    }
    // Backticks after the opening ones make it a code span, which is escaped like any text.
    if (fence.startsWith('`') && info?.includes('`')) {
      index += 1
      continue
    }
    const closes = (line: string) => {
      const closing = line.trimStart()
      return (
        indentOf(line) <= 3 &&
        closing.length >= fence.length &&
        closing === (fence[0] ?? '').repeat(closing.length)
      )
    }
    const close = lines.findIndex((line, at) => at > index && closes(line))
    if (close === -1) break
    const leavesItem = (line: string) => line !== '' && indentOf(line) < indent.length
    if (lines.slice(index + 1, close + 1).some(leavesItem)) break
    for (let at = index + 1; at < close; at += 1) fenced.add(at)
    index = close + 1
  }
  return fenced
}

/**
 * Turns the owner's notes into a Markdown body kept as written, except that line endings are
 * normalised, trailing spaces and blank runs are trimmed, markers are removed and raw HTML
 * tags are escaped (no HTML is ever rendered from user input). Inside a fenced code block a tag
 * is already plain text, and is left as written for whoever copies the code.
 */
export function blockMarkdown(text: string): string {
  const lines = stripMarkers(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
  const fenced = fencedLines(lines)
  return lines
    .map((line, index) => (fenced.has(index) ? line : line.replace(/<(?=[a-zA-Z!/?])/g, '\\<')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
