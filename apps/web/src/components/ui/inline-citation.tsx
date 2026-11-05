import { ExternalLinkIcon, FileTextIcon, GlobeIcon } from 'lucide-react'
import * as React from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { AiSourceDocumentPart, AiSourceUrlPart } from '@/lib/ai'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** A source a citation points at: the AI SDK's `source-url` and `source-document` parts. */
type CitationSource = AiSourceUrlPart | AiSourceDocumentPart

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** The source's address if it's safe to link to (http, https or mailto); undefined for anything else (javascript:, data:…). */
function safeSourceUrl(url: string | undefined) {
  if (!url) return undefined
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(url.trim()).protocol)
      ? url.trim()
      : undefined
  } catch {
    return undefined
  }
}

/** The source's name: its title, else the site (web page) or the file name. */
function sourceTitle(source: CitationSource) {
  return source.type === 'source-url'
    ? (source.title ?? hostOf(source.url))
    : // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty title or file name falls through to the next one.
      source.title || source.filename || source.sourceId
}

/** Where the source comes from: the site for a web page, the file name (or type) for a document. */
function sourceOrigin(source: CitationSource) {
  return source.type === 'source-url' ? hostOf(source.url) : (source.filename ?? source.mediaType)
}

/**
 * Splits text on citation markers: "Fixed in v0.8 [1][2]." → ["Fixed in v0.8 ", 1, 2, "."]. Only numbers
 * from 1 to `count` become citations; "[0]", "[7]" with 3 sources, and a half-written "[1" stay text. A
 * marker right after a letter, digit or backslash isn't one: `items[1]`, `x[2]`, `\[1]`. `before` is the
 * character in front of `text`, when the text is a piece of something longer.
 */
function splitCitations(text: string, count: number, before = ''): (string | number)[] {
  const out: (string | number)[] = []
  let last = 0
  for (const match of text.matchAll(/\[(\d{1,3})\]/g)) {
    const n = Number(match[1])
    const previous = match.index > 0 ? text[match.index - 1] : before
    if (n < 1 || n > count || /[\w\\]/.test(previous)) continue
    if (match.index > last) out.push(text.slice(last, match.index))
    out.push(n)
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const OPEN_DELAY = 250
const CLOSE_DELAY = 200

function InlineCitation({
  index,
  source,
  className,
}: {
  /** The number shown, from 1: the source's place in the message. */
  index: number
  /** The AI SDK source part it points at. */
  source: CitationSource
  className?: string
}) {
  const t = useCoreloomI18n().messages.ai.chat
  // eslint-disable-next-line @eslint-react/use-state -- setOpen below wraps this setter and keeps openRef in step.
  const [open, setOpenState] = React.useState(false)
  // The handlers read the latest value, not the one from their render: timers and keys can outrun React.
  const openRef = React.useRef(false)
  const setOpen = (next: boolean) => {
    openRef.current = next
    setOpenState(next)
  }
  // "peek": opened by hovering or tabbing onto it, focus stays put. "pinned": clicked or tapped, stays until dismissed.
  const mode = React.useRef<'peek' | 'pinned'>('peek')
  const byKeyboard = React.useRef(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const contentRef = React.useRef<HTMLDivElement>(null)
  // Focus goes back to the citation only when it was in the card (Escape); a peek closing never moves it.
  const returnFocus = React.useRef(false)
  // Enter on the citation moves focus into the card, to its link. Radix does it when the card mounts,
  // but the card may be reopened while still fading out (tab away and back fast), which doesn't mount
  // it again, and a card just mounted isn't placed yet: Radix then finds the link hidden and focuses
  // the card itself (and the portal only renders it a frame later). So it's done here, for a few
  // frames, until the link has it.
  const focusCard = React.useRef(false)
  const [focusRequest, setFocusRequest] = React.useState(0)
  React.useEffect(() => {
    if (!open || !focusCard.current) return
    let frame = 0
    let tries = 0
    const moveIn = () => {
      const card = contentRef.current
      const target = card?.querySelector<HTMLElement>('a[href]') ?? card
      if (!openRef.current || !focusCard.current) return
      const at = document.activeElement
      // Focus is already where it should be, or the user moved it on inside the card.
      if (card && (at === target || (at !== card && card.contains(at)))) {
        focusCard.current = false
        return
      }
      target?.focus()
      if (++tries > 10) focusCard.current = false
      else frame = requestAnimationFrame(moveIn)
    }
    moveIn()
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [open, focusRequest])
  React.useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [],
  )

  const close = () => {
    clearTimeout(timer.current)
    returnFocus.current = !!contentRef.current?.contains(document.activeElement)
    mode.current = 'peek'
    focusCard.current = false
    setOpen(false)
  }

  const peek = (delay: number) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (openRef.current) return
      mode.current = 'peek'
      setOpen(true)
    }, delay)
  }
  const leave = () => {
    clearTimeout(timer.current)
    if (mode.current === 'pinned') return
    timer.current = setTimeout(close, CLOSE_DELAY)
  }
  const stay = () => {
    clearTimeout(timer.current)
  }

  const title = sourceTitle(source)
  const origin = sourceOrigin(source)
  const href = source.type === 'source-url' ? safeSourceUrl(source.url) : undefined
  const label = t.citation(index, title)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close()
          return
        }
        clearTimeout(timer.current)
        setOpen(true)
      }}
    >
      <PopoverTrigger
        data-slot="inline-citation"
        aria-label={label}
        onPointerEnter={(e) => e.pointerType !== 'touch' && peek(OPEN_DELAY)}
        onPointerLeave={(e) => e.pointerType !== 'touch' && leave()}
        // Tabbing onto it peeks; a mouse click focuses it too, but the click decides then.
        onFocus={(e) => {
          // …except when focus comes back from the card on Escape: that closes it, it doesn't peek again.
          if (returnFocus.current) returnFocus.current = false
          else if (e.currentTarget.matches(':focus-visible')) peek(0)
        }}
        onBlur={(e) => {
          if (contentRef.current?.contains(e.relatedTarget)) return
          if (mode.current === 'peek') leave()
        }}
        onClick={(e) => {
          // Clicking, tapping or pressing Enter pins the card; on a peeking card it keeps it open.
          e.preventDefault()
          clearTimeout(timer.current)
          byKeyboard.current = e.detail === 0
          if (openRef.current && mode.current === 'pinned') {
            close()
            return
          }
          mode.current = 'pinned'
          focusCard.current = byKeyboard.current
          if (byKeyboard.current) setFocusRequest((n) => n + 1)
          if (!openRef.current) setOpen(true)
        }}
        className={cn(
          'mx-[0.15em] inline-flex h-[1.45em] min-w-[1.45em] cursor-pointer items-center justify-center rounded-full border border-border bg-card px-[0.35em] align-[0.3em] font-mono text-[11px] leading-none font-semibold text-fg-secondary outline-none',
          'transition-colors duration-fast hover:border-border-strong hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring data-[state=open]:border-primary data-[state=open]:bg-primary-subtle data-[state=open]:text-primary-text',
          className,
        )}
      >
        {index}
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        side="top"
        aria-label={label}
        data-slot="inline-citation-card"
        className="flex w-72 max-w-[calc(100vw-32px)] flex-col gap-2 p-3.5"
        onPointerEnter={(e) => e.pointerType !== 'touch' && stay()}
        onPointerLeave={(e) => e.pointerType !== 'touch' && leave()}
        onBlur={(e) => {
          const to = e.relatedTarget as Node | null
          if (
            mode.current === 'peek' &&
            !contentRef.current?.contains(to) &&
            !e.currentTarget.contains(to)
          )
            leave()
        }}
        // A peek leaves focus where it is; Enter on the citation moves it into the card (to the link).
        onOpenAutoFocus={(e) => {
          if (!(mode.current === 'pinned' && byKeyboard.current)) e.preventDefault()
        }}
        onCloseAutoFocus={(e) => {
          if (!returnFocus.current) e.preventDefault()
        }}
      >
        <p className="m-0 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {t.sourceNumber(index)}
        </p>
        <p className="m-0 text-[13.5px] leading-[1.45] font-medium break-words text-foreground">
          {title}
        </p>
        {origin && (
          <p className="m-0 flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
            {source.type === 'source-url' ? (
              <GlobeIcon className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <FileTextIcon className="size-3.5 shrink-0" aria-hidden />
            )}
            <span className="truncate">{origin}</span>
          </p>
        )}
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 self-start rounded-sm text-[13px] text-primary-text underline underline-offset-4 outline-none hover:no-underline focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            {t.openSource}
            <ExternalLinkIcon className="size-3.5" aria-hidden />
          </a>
        )}
      </PopoverContent>
    </Popover>
  )
}

export { type CitationSource, InlineCitation, safeSourceUrl, sourceTitle, splitCitations }
