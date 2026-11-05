import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-pill border border-transparent px-2.5 py-1 font-mono text-[11px] leading-[1.2] font-medium tracking-[0.02em] whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary-subtle text-primary-text [a&]:hover:bg-primary-subtle/80',
        secondary: 'border-border bg-secondary text-fg-secondary [a&]:hover:bg-accent',
        success: 'bg-success-subtle text-success',
        warning: 'bg-warning-subtle text-warning',
        destructive: 'bg-destructive-subtle text-destructive',
        outline: 'border-border text-foreground [a&]:hover:bg-accent',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  },
)

/** Leading status dot, colored by the badge's text color. */
function BadgeDot({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="badge-dot"
      aria-hidden
      className={cn('size-1.5 shrink-0 rounded-full bg-current', className)}
      {...props}
    />
  )
}

function Badge({
  className,
  variant = 'secondary',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, BadgeDot, badgeVariants }
