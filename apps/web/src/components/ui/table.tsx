'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

function Table({
  className,
  container,
  ...props
}: React.ComponentProps<'table'> & {
  /** Props for the scrolling wrapper (a ref, a fixed height, a label for a scrollable region). */
  container?: React.ComponentProps<'div'>
}) {
  return (
    <div
      data-slot="table-container"
      {...container}
      className={cn(
        'relative w-full overflow-x-auto rounded-md border border-border-subtle',
        container?.className,
      )}
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom font-sans text-[13.5px]', className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        'bg-secondary [&_tr]:border-b [&_tr]:border-border-subtle [&_tr]:hover:bg-transparent',
        className,
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t border-border-subtle bg-secondary font-medium text-foreground [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-border-subtle transition-colors duration-fast hover:bg-accent/60 has-aria-expanded:bg-accent/60 data-[state=selected]:bg-primary-subtle',
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-4 text-left align-middle font-mono text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-fg-secondary uppercase [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'px-4 py-[11px] align-middle whitespace-nowrap text-fg-secondary [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn(
        'border-t border-border-subtle px-4 py-3 text-left text-[13px] text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow }
