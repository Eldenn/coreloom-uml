'use client'

// Coreloom UI — Scroll effects, driven by the scroll itself with CSS scroll-driven animations
// (no scroll listener, no script per frame):
// - ScrollProgress: a thin bar at the top of the page that fills as you read, for long articles
//   and docs.
// - Parallax: a layer that moves a little slower or faster than the page as it crosses the
//   screen, for hero images and decorative shapes.
// Where the browser has no scroll-driven animations the bar is hidden and the layers stay put;
// for people who ask for reduced motion the layers stay put too.
//
//   <ScrollProgress />
//   <Parallax distance={60}><img src={hero} alt="" /></Parallax>
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
