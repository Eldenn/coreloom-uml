import type { ResearchPage } from '@coreloom-uml/llm'
import { RESEARCH_PAGE_LINKS_MAX } from '#app/research/constants/research'

/**
 * Turns what a sandbox fetched into what a model reads. Pure string work on text that comes from
 * anywhere on the web: nothing is executed or fetched here, and every pass walks the text once
 * (`indexOf` from a moving position, never an expression that can rescan it).
 */

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:'])
/** Blocks whose content is not the page's text. */
const DROPPED_BLOCKS = ['script', 'style', 'noscript', 'svg', 'template'] as const
/** Tags that sit inside a sentence: removing them must not split a word from its punctuation. */
const INLINE_TAGS: ReadonlySet<string> = new Set([
  'a',
  'abbr',
  'b',
  'code',
  'em',
  'i',
  'kbd',
  'mark',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'u',
])
const ENTITIES: Readonly<Record<string, string>> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
  // Last: `&amp;lt;` is the text `&lt;`, not `<`.
  '&amp;': '&',
}

/** An absolute `http` or `https` URL: the only kind a research reads or lists. */
export function isWebUrl(value: string): boolean {
  if (!URL.canParse(value)) return false
  return WEB_PROTOCOLS.has(new URL(value).protocol)
}

function decode(text: string): string {
  let decoded = text
  for (const [entity, char] of Object.entries(ENTITIES)) decoded = decoded.replaceAll(entity, char)
  return decoded
}

/** One space between words, one line break between blocks. */
function tidy(text: string): string {
  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n[ \n]*/g, '\n')
    .trim()
}

/** Same length as the text, so a position found in one is a position in the other. */
function asciiLower(text: string): string {
  return text.replace(/[A-Z]+/g, (upper) => upper.toLowerCase())
}

/** What ends a tag's name: `<script>` and `<script src>` are scripts, `<scripture>` is not. */
const NAME_END: ReadonlySet<string> = new Set([' ', '\t', '\n', '\r', '\f', '>', '/'])

/**
 * Removes every `open … close` span; one left open takes the rest of the text with it. With
 * `tag`, `open` is a tag's name and only counts when the name ends there.
 */
function dropSpans(
  html: string,
  lower: string,
  open: string,
  close: string,
  tag = false,
): [string, string] {
  let kept = ''
  let keptLower = ''
  let position = 0
  let from = 0
  while (position < html.length) {
    const start = lower.indexOf(open, from)
    if (start === -1) break
    if (tag && !NAME_END.has(lower.charAt(start + open.length))) {
      from = start + open.length
      continue
    }
    kept += html.slice(position, start)
    keptLower += lower.slice(position, start)
    const end = lower.indexOf(close, start + open.length)
    if (end === -1) return [kept, keptLower]
    position = end + close.length
    from = position
  }
  return [kept + html.slice(position), keptLower + lower.slice(position)]
}

function hrefOf(tag: string): string | null {
  const match = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag)
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null
}

/** The page behind this HTML: its title, its text and the web pages it links to. */
export function pageFromHtml(html: string, baseUrl: string): ResearchPage {
  // A Markdown or text file is already what the model reads.
  if (!/<(?:!doctype|html|head|body)[\s>]/i.test(html)) {
    return { title: null, text: html, links: [] }
  }

  let lower = asciiLower(html)
  let source = html
  // Blocks first: a script may write `<!--` without ever closing it.
  for (const block of DROPPED_BLOCKS) {
    ;[source, lower] = dropSpans(source, lower, `<${block}`, `</${block}>`, true)
  }
  ;[source, lower] = dropSpans(source, lower, '<!--', '-->')

  const titleStart = lower.indexOf('<title')
  const titleOpen = titleStart === -1 ? -1 : lower.indexOf('>', titleStart)
  const titleEnd = titleOpen === -1 ? -1 : lower.indexOf('</title', titleOpen)
  const title = titleEnd === -1 ? '' : tidy(decode(source.slice(titleOpen + 1, titleEnd)))
  if (titleEnd !== -1) {
    source = source.slice(0, titleStart) + source.slice(titleEnd)
    lower = lower.slice(0, titleStart) + lower.slice(titleEnd)
  }

  const links: string[] = []
  const seen = new Set<string>()
  let text = ''
  let position = 0
  while (position < source.length) {
    const start = source.indexOf('<', position)
    if (start === -1) {
      text += source.slice(position)
      break
    }
    text += source.slice(position, start)
    const end = source.indexOf('>', start)
    // A tag left open takes the rest with it.
    if (end === -1) break
    const tag = source.slice(start, end + 1)
    const name = /^<\/?([a-z][a-z0-9]*)/.exec(lower.slice(start, start + 20))?.[1] ?? ''
    text += INLINE_TAGS.has(name) ? '' : '\n'
    if (name === 'a' && links.length < RESEARCH_PAGE_LINKS_MAX) {
      const href = hrefOf(tag)
      const url =
        href && URL.canParse(decode(href), baseUrl) ? new URL(decode(href), baseUrl) : null
      if (url && WEB_PROTOCOLS.has(url.protocol) && !seen.has(url.href)) {
        seen.add(url.href)
        links.push(url.href)
      }
    }
    position = end + 1
  }

  return { title: title || null, text: tidy(decode(text)), links }
}
