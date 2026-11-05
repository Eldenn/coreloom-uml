import * as React from 'react'

import { cn } from '@/lib/utils'

/** Lower case without accents, with where each folded character came from in the original. */
function fold(text: string) {
  let folded = ''
  const origin: number[] = []
  let i = 0
  for (const char of text) {
    const f = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    origin.push(...Array<number>(f.length).fill(i))
    folded += f
    i += char.length
  }
  origin.push(i)
  return { folded, origin }
}

/**
 * Where the terms appear in `text`, as [start, end) ranges in order, overlaps merged. Ignores case
 * and accents. A query string is split on spaces into terms.
 */
function findMatches(text: string, query: string | readonly string[]): [number, number][] {
  const terms = (typeof query === 'string' ? query.split(/\s+/) : query)
    .map((term) => fold(term.trim()).folded)
    .filter(Boolean)
  if (!terms.length || !text) return []
  const { folded, origin } = fold(text)
  const ranges: [number, number][] = []
  for (const term of terms) {
    let at = folded.indexOf(term)
    while (at !== -1) {
      ranges.push([origin[at] ?? 0, origin[at + term.length] ?? text.length])
      at = folded.indexOf(term, at + term.length)
    }
  }
  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const range of ranges) {
    const last = merged.at(-1)
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([range[0], range[1]])
  }
  return merged
}

function Highlight({
  text,
  query,
  className,
  markClassName,
}: {
  text: string
  /** What to mark: a search string (split on spaces) or a list of terms. */
  query: string | readonly string[]
  className?: string
  markClassName?: string
}) {
  const matches = findMatches(text, query)
  if (!matches.length) return <span className={className}>{text}</span>
  const parts: React.ReactNode[] = []
  let from = 0
  for (const [start, end] of matches) {
    if (start > from) parts.push(text.slice(from, start))
    parts.push(
      <mark
        key={start}
        data-slot="highlight-mark"
        className={cn(
          'rounded-[3px] bg-warning/25 [box-decoration-break:clone] px-px font-medium text-foreground',
          markClassName,
        )}
      >
        {text.slice(start, end)}
      </mark>,
    )
    from = end
  }
  if (from < text.length) parts.push(text.slice(from))
  return (
    <span data-slot="highlight" className={className}>
      {parts}
    </span>
  )
}

export { findMatches, Highlight }
