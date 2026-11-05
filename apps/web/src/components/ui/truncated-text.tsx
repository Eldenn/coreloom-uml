'use client'

// Coreloom UI — TruncatedText. A long text cut after a few lines, with "Show more" to read the
// rest: a product description, a review, a commit message, a ticket's body. The button only
// appears when the text is actually cut, and it follows the width as the layout changes.
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function TruncatedText({
  lines = 3,
  expanded: expandedProp,
  defaultExpanded = false,
  onExpandedChange,
  className,
  children,
}: {
  /** Lines shown while folded. Default 3. */
  lines?: number
  expanded?: boolean
  defaultExpanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  className?: string
  children: React.ReactNode
}) {
  const t = useCoreloomI18n().messages.display.truncate
  const [inner, setInner] = React.useState(defaultExpanded)
  const expanded = expandedProp ?? inner
  const [overflows, setOverflows] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const id = React.useId()

  // Measure while folded: is there more text than the lines show?
  React.useEffect(() => {
    const el = ref.current
    if (!el || expanded) return
    const measure = () => {
      setOverflows(el.scrollHeight - el.clientHeight > 1)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [expanded, lines, children])

  const toggle = () => {
    if (expandedProp === undefined) setInner(!expanded)
    onExpandedChange?.(!expanded)
  }

  return (
    <div data-slot="truncated-text" className={cn('flex flex-col items-start gap-1', className)}>
      <div
        ref={ref}
        id={id}
        className="w-full [overflow-wrap:anywhere]"
        style={
          expanded
            ? undefined
            : {
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: lines,
                overflow: 'hidden',
              }
        }
      >
        {children}
      </div>
      {overflows || expanded ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          className="cursor-pointer rounded-sm text-[13px] font-medium text-primary-text outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
          onClick={toggle}
        >
          {expanded ? t.less : t.more}
        </button>
      ) : null}
    </div>
  )
}

export { TruncatedText }
