'use client'

// Coreloom UI — AnimatedBackground. A quiet moving backdrop for a hero or a sign-in page: a grid
// or dots drifting slowly, or an aurora of the accent colours. It fills its parent (give the
// parent `relative`), sits behind the content, fades out at the edges, and stands still for
// people who ask for reduced motion.
//
//   <section className="relative"><AnimatedBackground variant="grid" />…</section>
import * as React from 'react'

import { cn } from '@/lib/utils'

const patterns = {
  grid: {
    backgroundImage:
      'linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
  },
  dots: {
    backgroundImage: 'radial-gradient(var(--color-border-strong) 1px, transparent 1.5px)',
  },
  aurora: {
    backgroundImage:
      'radial-gradient(40% 60% at 20% 30%, color-mix(in oklab, var(--color-primary) 28%, transparent), transparent 70%), radial-gradient(45% 55% at 80% 40%, color-mix(in oklab, var(--color-chart-2) 24%, transparent), transparent 70%), radial-gradient(50% 50% at 50% 90%, color-mix(in oklab, var(--color-chart-4) 20%, transparent), transparent 70%)',
    backgroundSize: '200% 200%, 200% 200%, 200% 200%',
    filter: 'blur(24px)',
  },
} as const

function AnimatedBackground({
  variant = 'grid',
  size = 32,
  duration,
  animate = true,
  fade = true,
  className,
  style,
  ...props
}: {
  /** grid, dots or aurora. */
  variant?: keyof typeof patterns
  /** Grid or dot spacing, in pixels. */
  size?: number
  /** Seconds for one loop (default 24). */
  duration?: number
  /** Moves; false keeps it still. */
  animate?: boolean
  /** Fades the pattern out toward the edges. */
  fade?: boolean
} & Omit<React.ComponentProps<'div'>, 'children'>) {
  const vars: Record<string, string | undefined> = {
    '--bg-size': `${size}px`,
    '--bg-duration': duration ? `${duration}s` : undefined,
  }
  const layer: React.CSSProperties = {
    ...patterns[variant],
    ...(variant === 'aurora' ? null : { backgroundSize: `${size}px ${size}px` }),
    ...vars,
  }
  return (
    <div
      data-slot="animated-background"
      data-variant={variant}
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 -z-10 overflow-hidden',
        fade && '[mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_75%)]',
        className,
      )}
      style={style}
      {...props}
    >
      <div
        className={cn(
          'absolute inset-0 motion-reduce:animate-none',
          animate && (variant === 'aurora' ? 'animate-aurora' : 'animate-bg-pan'),
        )}
        style={layer}
      />
    </div>
  )
}

export { AnimatedBackground }
