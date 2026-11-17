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

/** A tag start with the backslashes before it, which could otherwise cancel its escape. */
const RAW_TAG = /(\\*)<(?=[a-zA-Z!/?])/g
const FENCE_OPEN = /^(`{3,}|~{3,})(.*)$/
const FENCE_LIKE = /```|~~~/

/**
 * Turns the owner's notes into a Markdown body kept as written, except that line endings are
 * normalised, trailing spaces and blank runs are trimmed, markers are removed and raw HTML
 * tags are escaped (no HTML is ever rendered from user input). A tag is left as written only
 * where a reader shows it as code, and where a backslash would show too: inside a closed fenced
 * code block opened at column 0, or inside a code span that opens and closes on one line.
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
  const { kept, fences } = protectedLines(lines)
  let spansTrusted = true
  return lines
    .map((line, index) => {
      if (kept.has(index)) return line
      // The fence lines of a protected block are not prose: their backticks pair with nothing.
      if (fences.has(index)) return escapeTags(line)
      const spans = spansTrusted ? codeSpans(line) : undefined
      if (!spans) {
        spansTrusted = false
        return escapeTags(line)
      }
      let out = ''
      let from = 0
      for (const [start, end] of spans) {
        out += escapeTags(line.slice(from, start)) + line.slice(start, end)
        from = end
      }
      return out + escapeTags(line.slice(from))
    })
    .join('\n')
}

function escapeTags(text: string): string {
  return text.replace(RAW_TAG, (_, backslashes: string) => `${backslashes.repeat(2)}\\<`)
}

const BACKTICK_RUN = /(\\*)(`+)/g

type BacktickRun = { start: number; length: number; escaped: boolean }

/**
 * The code spans of one line, as `[start, end)` ranges, found the way a CommonMark reader pairs
 * backtick runs: a run opens a span closed by the next run of the same length, and a backslash
 * outside a span makes the backtick after it plain text. Returns `undefined` when a run stays
 * unpaired, since a reader may then pair it with a run on a later line of the paragraph: neither
 * this line's spans nor any later line's can be trusted. A line holding `|` gets no span, because
 * a table row splits its cells on it before reading code spans, which pairs its runs differently.
 */
function codeSpans(line: string): Array<[number, number]> | undefined {
  const runs: BacktickRun[] = []
  for (const match of line.matchAll(BACKTICK_RUN)) {
    const [, backslashes = '', ticks = ''] = match
    // Inside a span a backslash is plain text, so a run is kept whole for closing a span.
    runs.push({
      start: match.index + backslashes.length,
      length: ticks.length,
      escaped: backslashes.length % 2 === 1,
    })
  }
  const spans: Array<[number, number]> = []
  let index = 0
  while (index < runs.length) {
    const run = runs[index] as BacktickRun
    // An escaped backtick is plain text; the rest of its run may still open a span.
    const start = run.escaped ? run.start + 1 : run.start
    const length = run.escaped ? run.length - 1 : run.length
    if (length === 0) {
      index++
      continue
    }
    const close = runs.findIndex((other, at) => at > index && other.length === length)
    if (close === -1) return undefined
    const closing = runs[close] as BacktickRun
    const end = closing.start + closing.length
    spans.push([start, end])
    index = close + 1
  }
  return line.includes('|') ? [] : spans
}

/**
 * The lines inside closed top-level fences, and the fence lines that open and close them. Once
 * any other line holds ``` or ~~~ (a fence in a list, a quote, indented or unclosed, or just
 * inline in prose), a later column-0 fence line may close that one rather than open a block, so
 * nothing after it is protected: when in doubt, escape.
 */
function protectedLines(lines: string[]): { kept: Set<number>; fences: Set<number> } {
  const kept = new Set<number>()
  const fences = new Set<number>()
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
    fences.add(index).add(end)
    index = end
  }
  return { kept, fences }
}
