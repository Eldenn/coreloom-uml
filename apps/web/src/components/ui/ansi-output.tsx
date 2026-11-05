'use client'

// Coreloom UI — AnsiOutput. Text from a program, with its ANSI colours and styles: a build log, a
// CLI's output, a test report. It reads SGR colours (16, 256 and true colour), bold, dim, italic,
// underline, inverse and strike, OSC 8 hyperlinks, and the cursor moves that progress bars use
// (carriage return, erase line, cursor up), so `pnpm install`'s output looks as it does in a
// terminal. The 16 base colours follow the theme's tokens.
//
// The parser is pure and incremental: `writeAnsi(screen, chunk)` takes chunks as they stream in,
// even when an escape sequence is cut in two.
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** A palette index (0–255) or a CSS colour from a true-colour sequence (`rgb(…)`). */
type AnsiColor = number | string

interface AnsiStyle {
  fg?: AnsiColor
  bg?: AnsiColor
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
  hidden?: boolean
  strike?: boolean
}

/** A run of text in one style. `href` comes from an OSC 8 hyperlink (http, https or mailto only). */
interface AnsiSpan {
  text: string
  style: AnsiStyle
  href?: string
}

type AnsiLine = readonly AnsiSpan[]

/** Everything written so far, and where the next character goes. */
interface AnsiScreen {
  /** Never empty: the last line is the one being written. */
  lines: readonly AnsiLine[]
  row: number
  col: number
  style: AnsiStyle
  href?: string
  /** The start of an escape sequence cut off at the end of the last chunk. */
  pending: string
  /** Lines dropped from the top by `maxLines`, so `dropped + index` is a stable key. */
  dropped: number
}

interface Cell {
  ch: string
  style: AnsiStyle
  href?: string
}

const EMPTY_STYLE: AnsiStyle = {}
const ESC = '\x1b'

function createAnsiScreen(): AnsiScreen {
  return { lines: [[]], row: 0, col: 0, style: EMPTY_STYLE, pending: '', dropped: 0 }
}

function sameStyle(a: AnsiStyle, b: AnsiStyle) {
  if (a === b) return true
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    !a.bold === !b.bold &&
    !a.dim === !b.dim &&
    !a.italic === !b.italic &&
    !a.underline === !b.underline &&
    !a.inverse === !b.inverse &&
    !a.hidden === !b.hidden &&
    !a.strike === !b.strike
  )
}

function toCells(line: AnsiLine): Cell[] {
  const cells: Cell[] = []
  for (const span of line) {
    for (const ch of span.text) cells.push({ ch, style: span.style, href: span.href })
  }
  return cells
}

function toSpans(cells: readonly Cell[]): AnsiLine {
  const spans: AnsiSpan[] = []
  for (const cell of cells) {
    const last = spans.at(-1)
    if (last && last.href === cell.href && sameStyle(last.style, cell.style)) last.text += cell.ch
    else spans.push({ text: cell.ch, style: cell.style, href: cell.href })
  }
  return spans
}

/** Only links people can safely follow become links; anything else stays text. */
function safeHref(url: string): string | undefined {
  return /^(https?:\/\/|mailto:)/i.test(url.trim()) ? url.trim() : undefined
}

/** SGR codes that set or clear one attribute. */
const SGR_FLAGS: Readonly<Record<number, Partial<AnsiStyle>>> = {
  1: { bold: true },
  2: { dim: true },
  3: { italic: true },
  4: { underline: true },
  7: { inverse: true },
  8: { hidden: true },
  9: { strike: true },
  21: { bold: false, dim: false },
  22: { bold: false, dim: false },
  23: { italic: false },
  24: { underline: false },
  27: { inverse: false },
  28: { hidden: false },
  29: { strike: false },
}

/** A 16-colour SGR code as the colour it sets (39 and 49 reset it), or null when it isn't one. */
function basicColor(code: number): { key: 'fg' | 'bg'; value: number | undefined } | null {
  if (code >= 30 && code <= 37) return { key: 'fg', value: code - 30 }
  if (code >= 40 && code <= 47) return { key: 'bg', value: code - 40 }
  if (code >= 90 && code <= 97) return { key: 'fg', value: code - 90 + 8 }
  if (code >= 100 && code <= 107) return { key: 'bg', value: code - 100 + 8 }
  if (code === 39) return { key: 'fg', value: undefined }
  if (code === 49) return { key: 'bg', value: undefined }
  return null
}

/**
 * 38 / 48 followed by `5;n` (256 colours) or `2;r;g;b` (true colour), read from `codes` at `i`.
 * Returns the colour (undefined when out of range) and how many codes it used after `i`.
 */
function extendedColor(codes: readonly number[], i: number) {
  const mode = codes.at(i + 1)
  if (mode === 5) {
    const n = codes.at(i + 2)
    return { value: n !== undefined && n >= 0 && n <= 255 ? n : undefined, used: 2 }
  }
  if (mode === 2) {
    const [r, g, b] = [codes.at(i + 2), codes.at(i + 3), codes.at(i + 4)].map((v) =>
      Math.max(0, Math.min(255, v ?? 0)),
    )
    return { value: `rgb(${String(r)} ${String(g)} ${String(b)})`, used: 4 }
  }
  return { value: undefined, used: 1 }
}

// Setting a colour to undefined removes it, so a reset style compares equal to a fresh one.
function setColor(style: AnsiStyle, key: 'fg' | 'bg', value: AnsiStyle['fg']) {
  if (value !== undefined) style[key] = value
  else if (key === 'fg') delete style.fg
  else delete style.bg
}

function applySgr(style: AnsiStyle, params: string): AnsiStyle {
  // 38:2::r:g:b (colon form) reads like 38;2;r;g;b once the empty colour-space id is dropped.
  const codes = (params === '' ? '0' : params.replace(/:(?=:)/g, ''))
    .split(/[;:]/)
    .map((p) => (p === '' ? 0 : Number(p)))
  let next: AnsiStyle = { ...style }
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i] ?? 0
    const color = basicColor(code)
    if (code === 0) next = {}
    else if (code in SGR_FLAGS) Object.assign(next, SGR_FLAGS[code])
    else if (color) {
      setColor(next, color.key, color.value)
    } else if (code === 38 || code === 48) {
      const { value, used } = extendedColor(codes, i)
      if (value !== undefined) next[code === 38 ? 'fg' : 'bg'] = value
      i += used
    }
  }
  // Keep the shared empty object when nothing is set, so plain text merges into one span.
  return Object.values(next).some((v) => v !== undefined && v !== false) ? next : EMPTY_STYLE
}

/** Longest escape sequence kept waiting for its end before it's dropped (hostile or broken input). */
const MAX_PENDING = 4096

/** The screen while `writeAnsi` writes: the line under the cursor is edited as cells. */
interface Writer {
  lines: AnsiLine[]
  row: number
  col: number
  style: AnsiStyle
  href: string | undefined
  /** The line being edited, as cells; written back to `lines` when the cursor leaves it. */
  cells: Cell[] | null
}

function editLine(w: Writer) {
  return (w.cells ??= toCells(w.lines[w.row] ?? []))
}

function flushLine(w: Writer) {
  if (w.cells) w.lines[w.row] = toSpans(w.cells)
  w.cells = null
}

function moveToRow(w: Writer, row: number) {
  flushLine(w)
  w.row = Math.max(0, row)
  while (w.lines.length <= w.row) w.lines.push([])
}

/** CSI K: erase to the end of the line (0), to its start (1), or all of it (2). */
function eraseInLine(w: Writer, params: string) {
  const line = editLine(w)
  const mode = params === '' ? 0 : Number(params)
  if (mode === 0) line.length = Math.min(line.length, w.col)
  else if (mode === 1)
    for (let c = 0; c <= w.col && c < line.length; c++) line[c] = { ch: ' ', style: w.style }
  else line.length = 0
}

/** CSI J: erase below the cursor (0) or the whole screen (2, 3). */
function eraseInDisplay(w: Writer, params: string) {
  const mode = params === '' ? 0 : Number(params)
  if (mode === 2 || mode === 3) {
    w.cells = null
    w.lines.length = 0
    w.lines.push([])
    w.row = 0
    w.col = 0
  } else if (mode === 0) {
    const line = editLine(w)
    line.length = Math.min(line.length, w.col)
    flushLine(w)
    w.lines.length = w.row + 1
  }
}

/** One CSI sequence: style, erasing and cursor moves. Private modes (`?…`) draw nothing. */
function applyCsi(w: Writer, final: string, params: string) {
  if (params.startsWith('?')) return
  const n = Math.max(1, Number.parseInt(params, 10) || 1)
  switch (final) {
    case 'm':
      w.style = applySgr(w.style, params)
      return
    case 'K':
      eraseInLine(w, params)
      return
    case 'J':
      eraseInDisplay(w, params)
      return
    case 'A':
      moveToRow(w, w.row - n)
      return
    case 'B':
      moveToRow(w, w.row + n)
      return
    case 'C':
      w.col += n
      return
    case 'D':
      w.col = Math.max(0, w.col - n)
      return
    case 'G':
      w.col = n - 1
      return
    case 'E':
    case 'F':
      moveToRow(w, final === 'E' ? w.row + n : w.row - n)
      w.col = 0
  }
}

/** The CSI sequence at `i`: where it ends, or -1 when its final byte hasn't arrived yet. */
function readCsi(w: Writer, data: string, i: number) {
  // CSI: parameters, then one final byte in @–~.
  let end = i + 2
  while (end < data.length && !/[@-~]/.test(data[end] ?? '')) end++
  if (end >= data.length) return -1
  applyCsi(w, data[end] ?? '', data.slice(i + 2, end))
  return end + 1
}

/** The OSC sequence at `i` (up to BEL or ESC \): hyperlinks (8) are kept, titles ignored. */
function readOsc(w: Writer, data: string, i: number) {
  const bel = data.indexOf('\x07', i + 2)
  const st = data.indexOf(`${ESC}\\`, i + 2)
  if (bel === -1 && st === -1) return -1
  const atBel = bel !== -1 && (st === -1 || bel < st)
  const end = atBel ? bel : st
  const body = data.slice(i + 2, end)
  if (body.startsWith('8;')) {
    const url = body.slice(body.indexOf(';', 2) + 1)
    w.href = url ? safeHref(url) : undefined
  }
  return end + (atBel ? 1 : 2)
}

/** The escape sequence at `i`: the index after it, or -1 when it isn't complete yet. */
function readEscape(w: Writer, data: string, i: number) {
  const kind = data.at(i + 1)
  if (kind === undefined) return -1
  if (kind === '[') return readCsi(w, data, i)
  if (kind === ']') return readOsc(w, data, i)
  // Two- and three-byte escapes (charset selection, keypad modes…): skip them.
  return i + (kind === '(' || kind === ')' ? 3 : 2)
}

/** A control character; other ones (bell…) draw nothing. */
function writeControl(w: Writer, ch: string) {
  if (ch === '\n') {
    moveToRow(w, w.row + 1)
    w.col = 0
  } else if (ch === '\r') w.col = 0
  else if (ch === '\b') w.col = Math.max(0, w.col - 1)
  else if (ch === '\t') {
    const line = editLine(w)
    const stop = (Math.floor(w.col / 8) + 1) * 8
    while (w.col < stop) {
      line[w.col] ??= { ch: ' ', style: w.style }
      w.col++
    }
  }
}

const isPrintable = (ch: string) => ch >= ' ' && ch !== '\x7f'

/** The run of printable characters at `i`, written at the cursor; returns the index after it. */
function writeText(w: Writer, data: string, i: number) {
  let end = i + 1
  while (end < data.length && isPrintable(data[end] ?? '')) end++
  const line = editLine(w)
  for (const glyph of data.slice(i, end)) {
    while (line.length < w.col) line.push({ ch: ' ', style: EMPTY_STYLE })
    line[w.col] = { ch: glyph, style: w.style, href: w.href }
    w.col++
  }
  return end
}

/** Drops the oldest lines beyond `maxLines`; returns how many went. */
function trimLines(w: Writer, maxLines: number | undefined) {
  if (maxLines === undefined || w.lines.length <= maxLines) return 0
  const extra = w.lines.length - maxLines
  w.lines.splice(0, extra)
  w.row = Math.max(0, w.row - extra)
  return extra
}

/**
 * Writes a chunk of program output onto the screen and returns the new screen; the old one is not
 * changed, and lines that didn't change keep their identity (cheap to re-render). A line feed also
 * returns to the start of the line, as terminals do with output from a program.
 */
function writeAnsi(
  screen: AnsiScreen,
  chunk: string,
  { maxLines }: { maxLines?: number } = {},
): AnsiScreen {
  const data = screen.pending + chunk
  if (!data) return screen
  const { row, col, style, href } = screen
  const w: Writer = { lines: screen.lines.slice(), row, col, style, href, cells: null }
  let pending = ''
  let i = 0
  while (i < data.length) {
    const ch = data[i] ?? ''
    if (ch === ESC) {
      const next = readEscape(w, data, i)
      if (next === -1) {
        pending = data.slice(i)
        break
      }
      i = next
    } else if (isPrintable(ch)) i = writeText(w, data, i)
    else {
      writeControl(w, ch)
      i++
    }
  }
  flushLine(w)
  if (pending.length > MAX_PENDING) pending = ''
  const dropped = screen.dropped + trimLines(w, maxLines)
  return { lines: w.lines, row: w.row, col: w.col, style: w.style, href: w.href, pending, dropped }
}

/** ANSI text → its lines of styled spans (a whole text at once). */
function parseAnsi(text: string): AnsiLine[] {
  const lines = writeAnsi(createAnsiScreen(), text).lines.slice()
  // A trailing newline doesn't make an extra empty line.
  if (lines.length > 1 && lines.at(-1)?.length === 0 && text.endsWith('\n')) lines.pop()
  return lines
}

function lineText(line: AnsiLine) {
  return line.map((span) => span.text).join('')
}

/** The text a terminal would show, without escape sequences. */
function stripAnsi(text: string): string {
  return parseAnsi(text).map(lineText).join('\n')
}

// The 16 base colours, from the theme's tokens, mixed with the foreground as the code editor's
// syntax colours are, so they keep their contrast on the inset surface in both themes.
const mix = (token: string, amount: number) =>
  `color-mix(in oklab, var(--color-${token}) ${String(amount)}%, var(--color-foreground))`
const BASE_COLORS: readonly string[] = [
  'var(--color-muted-foreground)', // black
  mix('destructive', 82), // red
  mix('success', 78), // green
  mix('warning', 78), // yellow
  mix('chart-4', 72), // blue
  mix('chart-5', 72), // magenta
  'var(--color-primary-text)', // cyan
  'var(--color-fg-secondary)', // white
  'var(--color-muted-foreground)', // bright black (grey)
  mix('destructive', 68),
  mix('success', 64),
  mix('warning', 64),
  mix('chart-4', 58),
  mix('chart-5', 58),
  mix('primary-text', 80),
  'var(--color-foreground)', // bright white
]
const BASE_BACKGROUNDS: readonly string[] = [
  'color-mix(in oklab, var(--color-foreground) 14%, transparent)',
  'var(--color-destructive-subtle)',
  'var(--color-success-subtle)',
  'var(--color-warning-subtle)',
  'color-mix(in oklab, var(--color-chart-4) 20%, transparent)',
  'color-mix(in oklab, var(--color-chart-5) 20%, transparent)',
  'var(--color-primary-subtle)',
  'color-mix(in oklab, var(--color-foreground) 22%, transparent)',
]

/** xterm's 256-colour palette: 16 base colours, a 6×6×6 cube, then 24 greys. */
function paletteColor(n: number, background: boolean): string {
  if (n < 16) return background ? (BASE_BACKGROUNDS[n % 8] ?? '') : (BASE_COLORS[n] ?? '')
  if (n < 232) {
    const level = (v: number) => (v === 0 ? 0 : 55 + v * 40)
    const i = n - 16
    return `rgb(${String(level(Math.floor(i / 36)))} ${String(level(Math.floor(i / 6) % 6))} ${String(level(i % 6))})`
  }
  const grey = 8 + (n - 232) * 10
  return `rgb(${String(grey)} ${String(grey)} ${String(grey)})`
}

function resolveColor(color: AnsiColor | undefined, background: boolean) {
  if (color === undefined) return undefined
  return typeof color === 'number' ? paletteColor(color, background) : color
}

/** The inline style for a span: colours from the palette, the rest as font properties. */
function ansiStyle(style: AnsiStyle): React.CSSProperties | undefined {
  if (style === EMPTY_STYLE) return undefined
  let color = resolveColor(style.fg, false)
  let background = resolveColor(style.bg, true)
  if (style.inverse) {
    // Inverse swaps the colours; the defaults are the text and the surface.
    const fg = color ?? 'var(--color-foreground)'
    color =
      typeof style.bg === 'number' && style.bg < 16
        ? paletteColor(style.bg, false)
        : (background ?? 'var(--color-inset)')
    background = fg
  }
  const decorations = [style.underline && 'underline', style.strike && 'line-through'].filter(
    Boolean,
  )
  return {
    color,
    backgroundColor: background,
    fontWeight: style.bold ? 600 : undefined,
    opacity: style.dim ? 0.7 : undefined,
    fontStyle: style.italic ? 'italic' : undefined,
    textDecorationLine: decorations.length ? decorations.join(' ') : undefined,
    visibility: style.hidden ? 'hidden' : undefined,
  }
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/g

/** Plain text with its http(s) URLs as links (trailing punctuation stays text). */
function linkify(text: string, linkClassName: string): React.ReactNode {
  if (!text.includes('http')) return text
  const out: React.ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(/[.,;:!?)\]}]+$/, '')
    const start = match.index
    if (start > last) out.push(text.slice(last, start))
    out.push(
      <a key={start} href={url} target="_blank" rel="noreferrer noopener" className={linkClassName}>
        {url}
      </a>,
    )
    last = start + url.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const LINK_CLASS =
  'underline decoration-1 underline-offset-2 outline-none hover:text-primary-text focus-visible:rounded-xs focus-visible:ring-[3px] focus-visible:ring-ring'

/** One line of spans, inline. A memo: unchanged lines don't re-render while output streams. */
const AnsiLineView = React.memo(function AnsiLineView({
  line,
  links = true,
}: {
  line: AnsiLine
  /** Turn http(s) URLs in the text into links. */
  links?: boolean
}) {
  return (
    <>
      {line.map((span, i) => {
        const css = ansiStyle(span.style)
        if (span.href)
          return (
            <a
              // eslint-disable-next-line @eslint-react/no-array-index-key -- lines and spans have no identity of their own: their position is it
              key={i}
              href={span.href}
              target="_blank"
              rel="noreferrer noopener"
              style={css}
              className={LINK_CLASS}
            >
              {span.text}
            </a>
          )
        const content = links ? linkify(span.text, LINK_CLASS) : span.text
        return css ? (
          // eslint-disable-next-line @eslint-react/no-array-index-key -- lines and spans have no identity of their own: their position is it
          <span key={i} style={css}>
            {content}
          </span>
        ) : (
          // eslint-disable-next-line @eslint-react/no-array-index-key -- lines and spans have no identity of their own: their position is it
          <React.Fragment key={i}>{content}</React.Fragment>
        )
      })}
    </>
  )
})

/** A short ANSI string inline: a status line, a log message. */
function AnsiText({ text, links = true }: { text: string; links?: boolean }) {
  const lines = React.useMemo(() => parseAnsi(text), [text])
  return (
    <>
      {lines.map((line, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- lines and spans have no identity of their own: their position is it
        <React.Fragment key={i}>
          {i > 0 ? '\n' : null}
          <AnsiLineView line={line} links={links} />
        </React.Fragment>
      ))}
    </>
  )
}

function AnsiOutput({
  text,
  wrap = true,
  follow = true,
  links = true,
  maxHeight,
  className,
  'aria-label': ariaLabel,
}: {
  /** The program's output, escape sequences and all. It can grow while it streams. */
  text: string
  /** Long lines wrap; off, they scroll sideways. */
  wrap?: boolean
  /** Stays scrolled to the end as the text grows, unless the reader scrolled up. */
  follow?: boolean
  /** Turn http(s) URLs into links (OSC 8 hyperlinks are links either way). */
  links?: boolean
  /** Beyond this height (a CSS length), the output scrolls. */
  maxHeight?: string
  className?: string
  'aria-label'?: string
}) {
  const t = useCoreloomI18n().messages.terminal
  const lines = React.useMemo(() => parseAnsi(text), [text])
  const ref = React.useRef<HTMLPreElement>(null)
  const atEnd = React.useRef(true)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (el && follow && atEnd.current) el.scrollTop = el.scrollHeight
  }, [lines, follow])

  return (
    <pre
      ref={ref}
      data-slot="ansi-output"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must take focus
      tabIndex={0}
      role="region"
      aria-label={ariaLabel ?? t.output}
      onScroll={(e) => {
        const el = e.currentTarget
        atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8
      }}
      style={maxHeight ? { maxHeight } : undefined}
      className={cn(
        'm-0 overflow-auto rounded-lg border border-border bg-inset px-3.5 py-3 font-mono text-[12.5px] leading-[1.6] text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
        wrap ? '[overflow-wrap:anywhere] whitespace-pre-wrap' : 'whitespace-pre',
        className,
      )}
    >
      {lines.map((line, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- lines and spans have no identity of their own: their position is it
        <div key={i} className="min-h-[1.6em]">
          <AnsiLineView line={line} links={links} />
        </div>
      ))}
    </pre>
  )
}

export {
  type AnsiColor,
  type AnsiLine,
  AnsiLineView,
  AnsiOutput,
  type AnsiScreen,
  type AnsiSpan,
  type AnsiStyle,
  ansiStyle,
  AnsiText,
  createAnsiScreen,
  lineText,
  parseAnsi,
  stripAnsi,
  writeAnsi,
}
