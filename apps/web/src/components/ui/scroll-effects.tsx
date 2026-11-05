import * as React from 'react'

import { cn } from '@/lib/utils'

function ScrollProgress({ className, ...props }: Omit<React.ComponentProps<'div'>, 'children'>) {
  // Decorative: the scrollbar already says how far down the page you are.
  return (
    <div
      data-slot="scroll-progress"
      aria-hidden
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-(--z-toast) hidden h-0.5 origin-left bg-primary',
        className,
      )}
      {...props}
    />
  )
}

function Parallax({
  distance = 80,
  className,
  style,
  ...props
}: {
  /** Pixels the layer travels up and down while it crosses the screen; negative goes the other way. */
  distance?: number
} & React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="parallax"
      className={cn('will-change-transform', className)}
      style={{ '--parallax-distance': `${distance}px`, ...style } as React.CSSProperties}
      {...props}
    />
  )
}

export { Parallax, ScrollProgress }
