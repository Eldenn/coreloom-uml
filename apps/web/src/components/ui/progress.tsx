'use client'

import { Progress as ProgressPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        'relative h-1.5 w-full overflow-hidden rounded-pill bg-accent ring-1 ring-border ring-inset',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 rounded-pill bg-primary transition-transform duration-slow ease-out"
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- `||` also turns NaN into 0, as upstream shadcn does.
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
