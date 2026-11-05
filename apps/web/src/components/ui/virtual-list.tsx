import { useVirtualizer } from '@tanstack/react-virtual'
import * as React from 'react'

import { Spinner } from '@/components/ui/spinner'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function VirtualList<T>({
  items,
  renderItem,
  getKey,
  height,
  estimateSize = 48,
  overscan = 8,
  gap = 0,
  onEndReached,
  hasMore = false,
  loadingMore = false,
  endThreshold = 5,
  empty,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: {
  items: readonly T[]
  renderItem: (item: T, index: number) => React.ReactNode
  /** A stable key per item, so measured heights follow items when the list changes. */
  getKey: (item: T, index: number) => React.Key
  /** Height of the scrolling box: 480, "60vh"… */
  height: number | string
  /** Estimated item height in px before it is measured. */
  estimateSize?: number
  /** Items rendered beyond each edge. */
  overscan?: number
  /** Space between items in px. */
  gap?: number
  /** Called once the reader is within `endThreshold` items of the end, while `hasMore` and not `loadingMore`. */
  onEndReached?: () => void
  hasMore?: boolean
  loadingMore?: boolean
  endThreshold?: number
  /** Shown when `items` is empty and nothing is loading. */
  empty?: React.ReactNode
  className?: string
  /** Name the list: the scrolling box is a keyboard-reachable region. */
  'aria-label'?: string
  'aria-labelledby'?: string
}) {
  const t = useCoreloomI18n().messages.virtualList
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const showFooter = !!onEndReached && (hasMore || loadingMore || items.length > 0)
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual's API; this component isn't memoized by the compiler, as the rule warns.
  const virtualizer = useVirtualizer({
    count: items.length + (showFooter ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
    gap,
    getItemKey: (index) => (index < items.length ? getKey(items[index], index) : '__footer'),
  })
  const virtualItems = virtualizer.getVirtualItems()
  const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? -1

  React.useEffect(() => {
    if (!onEndReached || !hasMore || loadingMore) return
    if (lastIndex >= items.length - 1 - endThreshold) onEndReached()
  }, [lastIndex, items.length, hasMore, loadingMore, endThreshold, onEndReached])

  return (
    <div
      ref={scrollRef}
      data-slot="virtual-list"
      // A scrolling box must be reachable with the keyboard to scroll it.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be keyboard-reachable; axe requires it.
      tabIndex={0}
      role="region"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-busy={loadingMore || undefined}
      style={{ height }}
      className={cn(
        'relative overflow-y-auto overscroll-contain rounded-md border border-border-subtle outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
        className,
      )}
    >
      {items.length === 0 && !loadingMore && !hasMore ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-[13.5px] text-muted-foreground">
          {empty}
        </div>
      ) : (
        // eslint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops the list role from a list styled list-none; this puts it back.
        <ul
          role="list"
          className="relative m-0 list-none p-0"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualItems.map((v) =>
            v.index < items.length ? (
              <li
                key={v.key}
                data-index={v.index}
                ref={virtualizer.measureElement}
                // Screen readers announce "12 of 3,000"; -1 while more can load ("of an unknown number").
                aria-setsize={hasMore ? -1 : items.length}
                aria-posinset={v.index + 1}
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${v.start}px)` }}
              >
                {renderItem(items[v.index], v.index)}
              </li>
            ) : (
              <li
                key={v.key}
                data-index={v.index}
                ref={virtualizer.measureElement}
                aria-hidden
                className="absolute inset-x-0 top-0 flex items-center justify-center gap-2 py-4 text-[12.5px] text-muted-foreground"
                style={{ transform: `translateY(${v.start}px)` }}
              >
                {loadingMore || hasMore ? (
                  <>
                    <Spinner className="size-3.5" />
                    {t.loadingMore}
                  </>
                ) : (
                  t.end
                )}
              </li>
            ),
          )}
        </ul>
      )}
      <span role="status" className="sr-only">
        {loadingMore ? t.loadingMore : ''}
      </span>
    </div>
  )
}

export { VirtualList }
