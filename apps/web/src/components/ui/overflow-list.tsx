import { Popover as PopoverPrimitive } from 'radix-ui'
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * How many items fit in `available` pixels when each takes `widths[i]`, with `gap` between them
 * and room kept for an overflow indicator `indicator` wide whenever some are left out.
 */
function fitCount(widths: readonly number[], available: number, gap: number, indicator: number) {
  const total = widths.reduce((sum, w, i) => sum + w + (i ? gap : 0), 0)
  if (total <= available) return widths.length
  let used = indicator
  let k = 0
  for (const width of widths) {
    if (used + width + gap > available) break
    used += width + gap
    k++
  }
  return k
}

function OverflowList<T>({
  items,
  renderItem,
  renderOverflow,
  max,
  gap = 6,
  className,
  listClassName,
  'aria-label': ariaLabel,
}: {
  items: readonly T[]
  /** Renders one item; give it a `key`. Keep items the same width wherever they're drawn. */
  renderItem: (item: T, index: number) => React.ReactNode
  /** Replaces the default "+N" button; receives the hidden items. */
  renderOverflow?: (hidden: readonly T[]) => React.ReactNode
  /** Shows at most this many, even when more would fit. */
  max?: number
  /** Space between items, in pixels. 6 by default. */
  gap?: number
  className?: string
  /** Classes for the hidden items' list in the popover. */
  listClassName?: string
  'aria-label'?: string
}) {
  const { messages, formatNumber } = useCoreloomI18n()
  const t = messages.utility.overflow
  const rootRef = React.useRef<HTMLDivElement>(null)
  const measureRef = React.useRef<HTMLDivElement>(null)
  const [count, setCount] = React.useState(items.length)

  React.useLayoutEffect(() => {
    const root = rootRef.current
    const measure = measureRef.current
    if (!root || !measure) return
    const update = () => {
      const children = Array.from(measure.children) as HTMLElement[]
      const indicator = children.pop()?.offsetWidth ?? 0
      const widths = children.map((c) => c.offsetWidth)
      setCount(fitCount(widths, root.clientWidth, gap, indicator))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(root)
    observer.observe(measure)
    return () => {
      observer.disconnect()
    }
  }, [items, gap])

  const shown = Math.min(count, max ?? Infinity)
  const hidden = items.slice(shown)
  const more = `+${formatNumber(hidden.length)}`

  return (
    <div
      ref={rootRef}
      data-slot="overflow-list"
      role="group"
      aria-label={ariaLabel}
      className={cn('relative flex min-w-0 items-center overflow-hidden', className)}
      style={{ gap }}
    >
      {items.slice(0, shown).map((item, i) => renderItem(item, i))}
      {hidden.length ? (
        renderOverflow ? (
          renderOverflow(hidden)
        ) : (
          <PopoverPrimitive.Root>
            <PopoverPrimitive.Trigger
              data-slot="overflow-list-more"
              aria-label={t.more(formatNumber(hidden.length), hidden.length)}
              className="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-pill border border-border bg-secondary px-2 font-mono text-[11px] font-medium text-fg-secondary outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              {more}
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
              <PopoverPrimitive.Content
                data-slot="overflow-list-popover"
                align="start"
                sideOffset={6}
                collisionPadding={8}
                className="z-(--z-popover) max-h-72 max-w-80 overflow-auto rounded-md border border-border bg-popover p-2.5 font-sans shadow-lg outline-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0"
              >
                <div className={cn('flex flex-wrap gap-1.5', listClassName)}>
                  {hidden.map((item, i) => renderItem(item, shown + i))}
                </div>
              </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
          </PopoverPrimitive.Root>
        )
      ) : null}
      {/* Every item drawn once, out of sight, to measure them. */}
      <div
        ref={measureRef}
        aria-hidden
        inert
        className="pointer-events-none invisible absolute top-0 left-0 flex w-max items-center"
        style={{ gap }}
      >
        {items.map((item, i) => renderItem(item, i))}
        <span className="inline-flex h-6 items-center rounded-pill border px-2 font-mono text-[11px] font-medium">
          +{formatNumber(Math.max(items.length, 9))}
        </span>
      </div>
    </div>
  )
}

export { fitCount, OverflowList }
