'use client'

// Coreloom UI — LogViewer. A long log to read and search: a build, a deploy, a server's output. Lines
// keep their ANSI colours, and only the visible ones are in the page (TanStack Virtual), so tens of
// thousands of lines stay smooth. Search filters the lines and marks the words; the level buttons
// show or hide errors, warnings, info and debug; Follow keeps the newest line in view while the log
// grows.
//
//   <LogViewer text={buildOutput} />                  // raw text: levels and times are detected
//   <LogViewer entries={[{ time, level: 'error', source: 'api', message }]} />
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDownToLineIcon, CheckIcon, CopyIcon, WrapTextIcon } from 'lucide-react'
import * as React from 'react'

import { AnsiText, stripAnsi } from '@/components/ui/ansi-output'
import { Button } from '@/components/ui/button'
import { Highlight } from '@/components/ui/highlight'
import { SearchInput } from '@/components/ui/input-group'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  /** A stable key, when lines can be inserted or removed (not only added at the end). */
  id?: React.Key
  time?: Date | string | number
  level?: LogLevel
  /** Where it comes from: a service, a job, a file. */
  source?: string
  /** The line (ANSI colours allowed). */
  message: string
}

const LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug']

const LEVEL_WORDS: [RegExp, LogLevel][] = [
  [/\b(?:ERROR|ERR|FATAL|CRITICAL|PANIC)\b|^error\b|\berror:/, 'error'],
  [/\b(?:WARN|WARNING)\b|^warn(?:ing)?\b|\bwarn(?:ing)?:/, 'warn'],
  [/\b(?:DEBUG|TRACE|VERBOSE)\b/, 'debug'],
  [/\bINFO\b/, 'info'],
]

const TIMESTAMP =
  /^\[?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\]?\s+/

/** The level a line names ("ERROR", "warn:"), or undefined. */
function detectLevel(line: string): LogLevel | undefined {
  for (const [pattern, level] of LEVEL_WORDS) if (pattern.test(line)) return level
  return undefined
}

/**
 * Raw text → entries: one per line, with a leading ISO timestamp taken out as `time` and the level
 * read from words like ERROR, WARN or DEBUG. Blank lines at the end are dropped.
 */
function parseLogText(text: string): LogEntry[] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
  if (lines.length === 1 && lines[0] === '') return []
  return lines.map((line) => {
    const plain = stripAnsi(line)
    const match = TIMESTAMP.exec(plain)
    const entry: LogEntry = { message: line, level: detectLevel(plain) }
    if (match?.[1]) {
      const time = new Date(match[1].replace(' ', 'T').replace(',', '.'))
      if (!Number.isNaN(time.getTime())) {
        entry.time = time
        // The timestamp is the first thing on the line; drop it from the message (colours and all).
        const at = line.indexOf(match[1])
        if (at !== -1) entry.message = line.slice(at + match[1].length).replace(/^\]?\s+/, '')
      }
    }
    return entry
  })
}

/** Entries whose level is shown and whose text contains every word of the query (any case). */
function filterLogEntries(
  entries: readonly LogEntry[],
  { query = '', levels }: { query?: string; levels?: ReadonlySet<LogLevel> },
): { entry: LogEntry; index: number }[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const out: { entry: LogEntry; index: number }[] = []
  entries.forEach((entry, index) => {
    if (levels && !levels.has(entry.level ?? 'info')) return
    if (words.length) {
      const text = `${entry.source ?? ''} ${stripAnsi(entry.message)}`.toLowerCase()
      if (!words.every((w) => text.includes(w))) return
    }
    out.push({ entry, index })
  })
  return out
}

const levelTags: Record<LogLevel, string> = {
  error: 'text-destructive',
  warn: 'text-warning',
  info: 'text-primary-text',
  debug: 'text-muted-foreground',
}
const levelDots: Record<LogLevel, string> = {
  error: 'bg-destructive',
  warn: 'bg-warning',
  info: 'bg-primary',
  debug: 'bg-border-strong',
}
const levelRows: Partial<Record<LogLevel, string>> = {
  error: 'bg-destructive-subtle/60',
  warn: 'bg-warning-subtle/50',
}
// The line number sticks over the row when it scrolls sideways, so it needs an opaque background:
// the surface, with the row's tint drawn on top.
const levelNumbers: Partial<Record<LogLevel, string>> = {
  error: 'bg-linear-to-r from-destructive-subtle/60 to-destructive-subtle/60',
  warn: 'bg-linear-to-r from-warning-subtle/50 to-warning-subtle/50',
}

function IconToggle({
  label,
  pressed,
  onPressedChange,
  children,
}: {
  label: string
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle size="sm" aria-label={label} pressed={pressed} onPressedChange={onPressedChange}>
          {children}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function LogViewer({
  entries: entriesProp,
  text,
  height = 360,
  defaultLevels = LEVELS,
  defaultQuery = '',
  defaultWrap = false,
  follow: followProp = true,
  lineNumbers = true,
  timeZone,
  toolbar = true,
  actions,
  empty,
  className,
  'aria-label': ariaLabel,
}: {
  entries?: readonly LogEntry[]
  /** Raw text, parsed with `parseLogText` (ignored when `entries` is given). */
  text?: string
  /** Height of the scrolling lines: 360, "50vh", "100%"… */
  height?: number | string
  /** Levels shown at first. Lines without a level count as info. */
  defaultLevels?: readonly LogLevel[]
  defaultQuery?: string
  defaultWrap?: boolean
  /** Starts following the end of the log. Scrolling up stops following; the button resumes it. */
  follow?: boolean
  lineNumbers?: boolean
  /** Time zone of the timestamps ("UTC"); the reader's by default. */
  timeZone?: string
  /** The bar with search, levels, Wrap, Follow and Copy. */
  toolbar?: boolean
  /** More controls at the end of the toolbar. */
  actions?: React.ReactNode
  /** Shown when there are no lines at all. */
  empty?: React.ReactNode
  className?: string
  'aria-label'?: string
}) {
  const { messages, locale } = useCoreloomI18n()
  const t = messages.logViewer
  const entries = React.useMemo(() => entriesProp ?? parseLogText(text ?? ''), [entriesProp, text])
  const [query, setQuery] = React.useState(defaultQuery)
  const [levels, setLevels] = React.useState<ReadonlySet<LogLevel>>(() => new Set(defaultLevels))
  const [wrap, setWrap] = React.useState(defaultWrap)
  const [follow, setFollow] = React.useState(followProp)
  const [copied, setCopied] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const deferredQuery = React.useDeferredValue(query)

  const counts = React.useMemo(() => {
    const c: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, debug: 0 }
    for (const entry of entries) c[entry.level ?? 'info']++
    return c
  }, [entries])
  const visible = React.useMemo(
    () => filterLogEntries(entries, { query: deferredQuery, levels }),
    [entries, deferredQuery, levels],
  )
  const timeFormat = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
        hourCycle: 'h23',
        timeZone,
      }),
    [locale, timeZone],
  )
  const numberWidth = String(entries.length).length

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual's API; this component isn't memoized by the compiler, as the rule warns.
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 21,
    overscan: 20,
    getItemKey: (i) => {
      const row = visible.at(i)
      return row ? (row.entry.id ?? row.index) : i
    },
  })

  React.useEffect(() => {
    if (follow && visible.length) virtualizer.scrollToIndex(visible.length - 1, { align: 'end' })
  }, [follow, visible.length, virtualizer])

  React.useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => {
      setCopied(false)
    }, 1400)
    return () => {
      clearTimeout(id)
    }
  }, [copied])

  const filtered = deferredQuery.trim() !== '' || levels.size < LEVELS.length
  const presentLevels = LEVELS.filter((level) => counts[level] > 0)
  const formatTime = (time: LogEntry['time']) => {
    if (time === undefined) return ''
    const date = time instanceof Date ? time : new Date(time)
    return Number.isNaN(date.getTime()) ? String(time) : timeFormat.format(date)
  }

  return (
    <div
      data-slot="log-viewer"
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-inset',
        className,
      )}
    >
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border-subtle px-2 py-1.5">
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder={t.search}
            aria-label={t.search}
            className="h-8 w-full min-w-0 bg-background sm:w-56"
          />
          {presentLevels.length > 1 ? (
            <div role="group" aria-label={t.levels} className="flex flex-wrap items-center gap-0.5">
              {presentLevels.map((level) => (
                <Toggle
                  key={level}
                  size="sm"
                  pressed={levels.has(level)}
                  onPressedChange={(on) => {
                    setLevels((current) => {
                      const next = new Set(current)
                      if (on) next.add(level)
                      else next.delete(level)
                      return next
                    })
                  }}
                  className="gap-1.5 px-2 text-[12px]"
                >
                  <span
                    aria-hidden
                    className={cn('size-2 shrink-0 rounded-full', levelDots[level])}
                  />
                  {t.levelFilters[level]}
                  <span className="text-fg-secondary tabular-nums">
                    {counts[level].toLocaleString(locale)}
                  </span>
                </Toggle>
              ))}
            </div>
          ) : null}
          <span className="ml-auto" />
          {actions}
          <IconToggle label={t.wrap} pressed={wrap} onPressedChange={setWrap}>
            <WrapTextIcon />
          </IconToggle>
          <IconToggle label={t.follow} pressed={follow} onPressedChange={setFollow}>
            <ArrowDownToLineIcon />
          </IconToggle>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={copied ? t.copied : filtered ? t.copyShown : t.copy}
                onClick={() => {
                  const lines = visible.map(({ entry }) =>
                    [
                      formatTime(entry.time),
                      entry.level?.toUpperCase(),
                      entry.source,
                      stripAnsi(entry.message),
                    ]
                      .filter(Boolean)
                      .join(' '),
                  )
                  void navigator.clipboard.writeText(lines.join('\n')).then(() => {
                    setCopied(true)
                  })
                }}
              >
                {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{filtered ? t.copyShown : t.copy}</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be keyboard-reachable; axe requires it.
        tabIndex={0}
        role="region"
        aria-label={ariaLabel ?? t.label}
        onScroll={(e) => {
          const el = e.currentTarget
          const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 4
          // Scrolling up to read stops following; reaching the end again resumes it.
          if (atEnd !== follow && el.scrollHeight > el.clientHeight) setFollow(atEnd)
        }}
        style={{ height }}
        className="relative overflow-auto overscroll-contain py-1 font-mono text-[12px] leading-[1.75] text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring"
      >
        {visible.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center font-sans text-[13px] text-muted-foreground">
            {entries.length === 0 ? (empty ?? t.empty) : t.noMatch}
          </div>
        ) : (
          // eslint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops the list role from a list styled list-none; this puts it back.
          <ul
            role="list"
            className={cn('relative m-0 list-none p-0', !wrap && 'min-w-max')}
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((v) => {
              const row = visible.at(v.index)
              if (!row) return null
              const { entry, index } = row
              const level = entry.level
              return (
                <li
                  key={v.key}
                  data-index={v.index}
                  data-level={level}
                  ref={virtualizer.measureElement}
                  aria-setsize={visible.length}
                  aria-posinset={v.index + 1}
                  className={cn(
                    'absolute inset-x-0 top-0 flex gap-3 pr-3',
                    !lineNumbers && 'pl-3',
                    level ? levelRows[level] : undefined,
                  )}
                  style={{ transform: `translateY(${String(v.start)}px)` }}
                >
                  {lineNumbers ? (
                    <span
                      aria-hidden
                      className={cn(
                        'sticky left-0 shrink-0 bg-inset pl-3 text-right text-muted-foreground tabular-nums select-none',
                        level ? levelNumbers[level] : undefined,
                      )}
                      style={{ width: `calc(${String(numberWidth)}ch + 0.75rem)` }}
                    >
                      {index + 1}
                    </span>
                  ) : null}
                  {entry.time !== undefined ? (
                    <span
                      className={cn(
                        'shrink-0 tabular-nums',
                        // On a tinted row, muted grey loses its contrast.
                        level && levelRows[level] ? 'text-fg-secondary' : 'text-muted-foreground',
                      )}
                    >
                      {formatTime(entry.time)}
                    </span>
                  ) : null}
                  {level ? (
                    <span className={cn('w-[3ch] shrink-0 font-semibold', levelTags[level])}>
                      <span aria-hidden>{t.tags[level]}</span>
                      <span className="sr-only">{t.levelNames[level]}</span>
                    </span>
                  ) : null}
                  {entry.source ? (
                    <span className="shrink-0 text-fg-secondary">{entry.source}</span>
                  ) : null}
                  <span
                    className={cn(
                      'min-w-0 flex-1',
                      wrap ? '[overflow-wrap:anywhere] whitespace-pre-wrap' : 'whitespace-pre',
                    )}
                  >
                    {deferredQuery.trim() ? (
                      <Highlight text={stripAnsi(entry.message)} query={deferredQuery} />
                    ) : (
                      <AnsiText text={entry.message} />
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <span role="status" className="sr-only">
        {filtered ? t.shown(visible.length, entries.length) : ''}
      </span>
    </div>
  )
}

export { detectLevel, filterLogEntries, type LogEntry, type LogLevel, LogViewer, parseLogText }
