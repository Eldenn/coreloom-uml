import { XMLParser } from 'fast-xml-parser'
import { WATCH_LIMITS } from '#app/watch/constants/watch'

/** One item of a feed, as read: nothing is checked yet but its link's form. */
export type FeedItem = {
  title: string
  url: string
  publishedAt: Date | null
  excerpt: string
}

export type ParsedFeed = { title: string | null; items: FeedItem[] }

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
  isArray: (name) => name === 'item' || name === 'entry' || name === 'link',
})

type Node = Record<string, unknown>

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return text(value[0])
  if (value && typeof value === 'object') return text((value as Node)['#text'])
  return ''
}

/** RSS's `<link>` is its text; Atom's is the `href` of the alternate one (or the first). */
function link(value: unknown): string {
  const links = Array.isArray(value) ? value : [value]
  const atom = links.filter((entry): entry is Node => !!entry && typeof entry === 'object')
  const alternate =
    atom.find((entry) => entry['@_href'] && (entry['@_rel'] ?? 'alternate') === 'alternate') ??
    atom.find((entry) => entry['@_href'])
  if (alternate) return text(alternate['@_href'])
  return text(links.find((entry) => typeof entry === 'string') ?? '')
}

function date(...values: unknown[]): Date | null {
  for (const value of values) {
    const parsed = Date.parse(text(value))
    if (!Number.isNaN(parsed)) return new Date(parsed)
  }
  return null
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
}

/**
 * A description (often escaped HTML) as plain text: tags dropped, the common entities decoded,
 * spaces folded, cut to `max`. One pass over the text, no expression that can rescan.
 */
export function plainText(html: string, max: number): string {
  let out = ''
  let inTag = false
  for (const char of html) {
    if (inTag) {
      if (char === '>') {
        inTag = false
        out += ' '
      }
    } else if (char === '<') {
      inTag = true
    } else {
      out += char
    }
    if (out.length > max * 4) break
  }
  const decoded = out.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, (entity, body) => {
    const name = String(body).toLowerCase()
    if (name.startsWith('#x')) return codePoint(Number.parseInt(name.slice(2), 16), entity)
    if (name.startsWith('#')) return codePoint(Number.parseInt(name.slice(1), 10), entity)
    return NAMED_ENTITIES[name] ?? entity
  })
  const folded = decoded.replace(/\s+/g, ' ').trim()
  return folded.length > max ? `${folded.slice(0, max - 1).trimEnd()}…` : folded
}

function codePoint(value: number, fallback: string): string {
  return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : fallback
}

const TRACKING = /^(utm_|mc_|fbclid$|gclid$|ref$)/i

/**
 * An article's link as kept: `http(s)` only, no credentials, no fragment, no tracking parameter.
 * Null when it is none of that or too long.
 */
export function normalizeUrl(raw: string, base?: string): URL | null {
  let url: URL
  try {
    url = new URL(raw.trim(), base)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password) return null
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING.test(key)) url.searchParams.delete(key)
  }
  return url.href.length <= WATCH_LIMITS.urlMaxLength ? url : null
}

/**
 * Reads an RSS 2.0, RSS 1.0 or Atom feed. A document that declares entities is refused (nothing
 * a feed needs, and the way to make a parser expand a small file into a huge one). Throws when the
 * text is no feed.
 */
export function parseFeed(xml: string, feedUrl: string): ParsedFeed {
  if (/<!ENTITY/i.test(xml)) throw new Error('The feed declares entities')
  const root = parser.parse(xml) as Node
  const rss = root.rss as Node | undefined
  const channel = (rss?.channel ?? root.RDF) as Node | undefined
  const atom = root.feed as Node | undefined
  const entries = (channel?.item ?? (root.RDF as Node | undefined)?.item ?? atom?.entry) as
    | Node[]
    | undefined
  const titleNode = channel
    ? (channel.title ?? (channel.channel as Node | undefined)?.title)
    : atom?.title
  if (!channel && !atom) throw new Error('Not an RSS or Atom feed')

  const items: FeedItem[] = []
  for (const entry of entries ?? []) {
    const url = normalizeUrl(link(entry.link) || text(entry.guid), feedUrl)
    const title = plainText(text(entry.title), WATCH_LIMITS.titleMaxLength)
    if (!url || !title) continue
    items.push({
      title,
      url: url.href,
      publishedAt: date(entry.pubDate, entry.published, entry.date, entry.updated),
      excerpt: plainText(
        text(entry.description ?? entry.summary ?? entry.content ?? entry.encoded),
        WATCH_LIMITS.excerptMaxLength,
      ),
    })
  }
  const title = plainText(text(titleNode), WATCH_LIMITS.sourceTitleMaxLength)
  return { title: title || null, items }
}
