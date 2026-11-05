'use client'

// Coreloom UI — CodeViewer. Code to read, with line numbers: a snippet in a doc, a generated file, a
// log, a stack trace. Lines can be highlighted ("3, 7-9"), long lines can wrap, and Copy sits in
// the header. No syntax colouring built in: pass `renderLine` to colour each line with Shiki or
// Prism.
import { WrapTextIcon } from 'lucide-react'
import * as React from 'react'

import { CopyButton } from '@/components/copy-button'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** "1, 3-5" (or [1, 3, 4, 5]) → the set of line numbers it names. */
function parseLineRanges(ranges: string | readonly number[] | undefined): Set<number> {
  if (ranges === undefined) return new Set()
  if (typeof ranges !== 'string') return new Set(ranges)
  const out = new Set<number>()
  for (const part of ranges.split(',')) {
    const match = /^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/.exec(part)
    if (!match) continue
    const from = Number(match[1])
    const end = match.at(2)
    const to = end === undefined ? from : Number(end)
    for (let n = Math.min(from, to); n <= Math.max(from, to); n++) out.add(n)
  }
  return out
}

function CodeViewer({
  code,
  language,
  title,
  lineNumbers = true,
  startLine = 1,
  highlight,
  wrap: wrapProp,
  defaultWrap = false,
  onWrapChange,
  copyable = true,
  renderLine,
  maxHeight,
  className,
  'aria-label': ariaLabel,
}: {
  code: string
  /** Shown in the header when there's no title: "tsx", "python", "bash". */
  language?: string
  /** A file name, shown in the header. */
  title?: React.ReactNode
  lineNumbers?: boolean
  /** The number of the first line, for an excerpt of a longer file. */
  startLine?: number
  /** Lines to highlight, by their number: "3, 7-9" or [3, 7, 8, 9]. */
  highlight?: string | readonly number[]
  /** Long lines wrap instead of scrolling sideways (controlled). */
  wrap?: boolean
  defaultWrap?: boolean
  onWrapChange?: (wrap: boolean) => void
  copyable?: boolean
  /** Draws one line (a highlighter's tokens). Gets the line's text and its number. */
  renderLine?: (line: string, number: number) => React.ReactNode
  /** Beyond this height (a CSS length), the code scrolls. */
  maxHeight?: string
  className?: string
  'aria-label'?: string
}) {
  const t = useCoreloomI18n().messages.display.code
  const [innerWrap, setInnerWrap] = React.useState(defaultWrap)
  const wrap = wrapProp ?? innerWrap
  const marked = React.useMemo(() => parseLineRanges(highlight), [highlight])
  const lines = React.useMemo(
    () => code.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n'),
    [code],
  )
  const width = String(startLine + lines.length - 1).length
  const label = title ?? language

  return (
    <div
      data-slot="code-viewer"
      className={cn('min-w-0 overflow-hidden rounded-lg border border-border bg-inset', className)}
    >
      <div className="flex h-10 items-center gap-1 border-b border-border-subtle pr-1.5 pl-4">
        <span className="mr-auto min-w-0 truncate font-mono text-[12px] text-muted-foreground">
          {label}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              aria-label={t.wrap}
              pressed={wrap}
              onPressedChange={(next) => {
                if (wrapProp === undefined) setInnerWrap(next)
                onWrapChange?.(next)
              }}
            >
              <WrapTextIcon />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>{t.wrap}</TooltipContent>
        </Tooltip>
        {copyable ? <CopyButton value={code} /> : null}
      </div>
      {/* Focusable so the keyboard can scroll it when it overflows. */}
      <pre
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must take focus
        tabIndex={0}
        role="region"
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : t.label)}
        className={cn(
          'm-0 overflow-auto py-3 font-mono text-[13px] leading-[1.7] text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring',
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <code className={cn('grid min-w-max', wrap && 'min-w-0')}>
          {lines.map((line, i) => {
            const number = startLine + i
            const isMarked = marked.has(number)
            return (
              <span
                key={number}
                data-line={number}
                data-highlighted={isMarked || undefined}
                className={cn(
                  'flex border-l-2 border-transparent pr-4',
                  !lineNumbers && 'pl-4',
                  isMarked && 'border-primary bg-primary-subtle',
                )}
              >
                {lineNumbers ? (
                  <span
                    aria-hidden
                    className={cn(
                      'sticky left-0 shrink-0 bg-inset pr-4 pl-3.5 text-right tabular-nums select-none',
                      isMarked
                        ? 'bg-linear-to-r from-primary-subtle to-primary-subtle text-fg-secondary'
                        : 'text-muted-foreground',
                    )}
                    style={{ width: `calc(${String(width)}ch + 1.875rem)` }}
                  >
                    {number}
                  </span>
                ) : null}
                <span
                  className={cn(
                    'min-w-0 flex-1',
                    wrap ? '[overflow-wrap:anywhere] whitespace-pre-wrap' : 'whitespace-pre',
                  )}
                >
                  {isMarked ? <span className="sr-only">{`${t.highlighted}: `}</span> : null}
                  {renderLine ? renderLine(line, number) : line || ' '}
                </span>
              </span>
            )
          })}
        </code>
      </pre>
    </div>
  )
}

export { CodeViewer, parseLineRanges }
