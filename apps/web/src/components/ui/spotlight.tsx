import * as React from 'react'

import { cn } from '@/lib/utils'

function Spotlight({
  size = 360,
  className,
  children,
  onPointerMove,
  ...props
}: {
  /** Diameter of the light, in pixels. */
  size?: number
} & React.ComponentProps<'div'>) {
  const light = React.useRef<HTMLSpanElement>(null)
  return (
    <div
      data-slot="spotlight"
      className={cn('group/spotlight relative isolate overflow-hidden', className)}
      onPointerMove={(event) => {
        onPointerMove?.(event)
        // Written to the light's style, not to state: the card doesn't re-render on every move.
        const rect = event.currentTarget.getBoundingClientRect()
        light.current?.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`)
        light.current?.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`)
      }}
      {...props}
    >
      <span
        ref={light}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-slow group-hover/spotlight:opacity-100"
        style={{
          background: `radial-gradient(${size}px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), color-mix(in oklab, var(--color-primary) 16%, transparent), transparent 70%)`,
        }}
      />
      {children}
    </div>
  )
}

function BorderGlow({
  duration = 6,
  width = 1,
  className,
  style,
  children,
  ...props
}: {
  /** Seconds for the light to go round once. */
  duration?: number
  /** Border width in pixels. */
  width?: number
} & React.ComponentProps<'div'>) {
  // The light is a turning conic gradient behind the content; the content's own background
  // covers all of it but a `width`-pixel ring.
  return (
    <div
      data-slot="border-glow"
      className={cn('relative isolate overflow-hidden rounded-xl bg-border', className)}
      style={
        {
          padding: width,
          '--border-glow-duration': `${duration}s`,
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 animate-border-glow motion-reduce:animate-none"
        style={{
          background:
            'conic-gradient(from var(--border-glow-angle), transparent 0deg, transparent 250deg, var(--color-primary) 320deg, var(--color-chart-2) 345deg, transparent 360deg)',
        }}
      />
      <div className="relative h-full rounded-[inherit] bg-card text-card-foreground">
        {children}
      </div>
    </div>
  )
}

export { BorderGlow, Spotlight }
