'use client'

// Coreloom UI — ActionBar. A bar that appears when people select rows or items, with how many are
// selected and what can be done to all of them at once: archive, move, export, delete. It floats
// at the bottom of the screen by default, says the count out loud when it changes, and Escape (or
// the close button) clears the selection.
//
//   <ActionBar count={selected.length} onClear={() => setSelected([])}>
//     <Button size="sm" variant="secondary"><ArchiveIcon /> Archive</Button>
//     <Button size="sm" variant="destructive"><TrashIcon /> Delete</Button>
//   </ActionBar>
import { XIcon } from 'lucide-react'
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function ActionBar({
  count,
  label,
  open,
  onClear,
  position = 'fixed',
  className,
  children,
  ...props
}: {
  /** How many items are selected. The bar shows when it is above 0 (or when `open` is true). */
  count: number
  /** Replaces "3 selected", e.g. "3 of 120 invoices selected". */
  label?: React.ReactNode
  /** Forces the bar open or closed; by default it shows while `count` is above 0. */
  open?: boolean
  /** Clears the selection: the close button and Escape call it. No close button without it. */
  onClear?: () => void
  /** fixed: floats at the bottom of the screen; sticky: at the bottom of a scrolling area; static: in the flow. */
  position?: 'fixed' | 'sticky' | 'static'
  /** The actions: small Buttons, a DropdownMenu… */
  children?: React.ReactNode
} & Omit<React.ComponentProps<'div'>, 'children'>) {
  const { messages, formatNumber } = useCoreloomI18n()
  const t = messages.utility.actionBar
  const shown = open ?? count > 0
  const text = label ?? t.selected(formatNumber(count), count)
  return (
    <>
      {/* Says the new count when it changes, even while the bar is hidden (so "0 selected" too). */}
      <span aria-live="polite" className="sr-only">
        {shown ? text : ''}
      </span>
      {shown ? (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape inside the bar clears the selection; the close button does the same
        <div
          role="group"
          aria-label={t.label}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && onClear) {
              e.preventDefault()
              onClear()
            }
          }}
          data-slot="action-bar"
          data-position={position}
          className={cn(
            'flex w-max max-w-[calc(100vw-2rem)] items-center gap-1 rounded-lg border border-border bg-popover py-1.5 pr-1.5 pl-3.5 font-sans text-[13.5px] text-foreground shadow-lg',
            'animate-in duration-base fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none',
            position === 'fixed' && 'fixed bottom-6 left-1/2 z-(--z-sticky) -translate-x-1/2',
            position === 'sticky' && 'sticky bottom-4 z-(--z-sticky) mx-auto',
            className,
          )}
          {...props}
        >
          <span data-slot="action-bar-count" className="mr-2 font-medium whitespace-nowrap">
            {text}
          </span>
          <span aria-hidden className="mr-1 h-5 w-px bg-border" />
          <div className="flex min-w-0 flex-wrap items-center gap-1">{children}</div>
          {onClear ? (
            <button
              type="button"
              aria-label={t.clear}
              title={t.clear}
              className="ml-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-fg-secondary outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring [&_svg]:size-4"
              onClick={onClear}
            >
              <XIcon />
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

export { ActionBar }
