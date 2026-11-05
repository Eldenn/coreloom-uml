import { Slot } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

function Card({
  className,
  accent = false,
  ...props
}: React.ComponentProps<'div'> & {
  /** Featured treatment: cyan glow instead of the border, faint top-light. */
  accent?: boolean
}) {
  return (
    <div
      data-slot="card"
      data-accent={accent || undefined}
      className={cn(
        'flex flex-col gap-3.5 rounded-lg border border-border bg-card px-5 py-[18px] text-card-foreground shadow-md transition-[border-color,box-shadow] duration-base ease-out',
        accent &&
          'border-transparent bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_6%,transparent),var(--surface-2))] shadow-glow',
        className,
      )}
      {...props}
    />
  )
}

/** 34px tinted tile holding one icon, above the title. */
function CardIcon({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-icon"
      className={cn(
        "flex size-[34px] items-center justify-center rounded-[9px] bg-primary-subtle text-primary [&_svg:not([class*='size-'])]:size-[18px]",
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 has-data-[slot=card-action]:grid-cols-[1fr_auto]',
        className,
      )}
      {...props}
    />
  )
}

/** The card's title. A <div> by default; with `asChild`, your heading (<CardTitle asChild><h2>…</h2></CardTitle>)
 *  takes the style, so the page's outline stays right. */
function CardTitle({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<'div'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'div'
  return (
    <Comp
      data-slot="card-title"
      className={cn(
        'font-display text-[17px] leading-tight font-semibold tracking-[-0.01em] text-foreground',
        className,
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-[13px] leading-[1.55] text-muted-foreground', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('text-[14px] text-fg-secondary', className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center gap-[7px] font-mono text-[11px] text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardIcon,
  CardTitle,
}
