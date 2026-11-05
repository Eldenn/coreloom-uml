'use client'

// Coreloom UI — TiltCard. A card that tilts a few degrees toward the pointer, with an optional
// glare, for a product shot, a plan or a feature on a marketing page. It settles back when the
// pointer leaves. Touch and keyboard users see a still card; so do people who ask for reduced
// motion. Decoration only.
//
//   <TiltCard className="rounded-xl border bg-card p-6">…</TiltCard>
import * as React from 'react'

import { useReducedMotion } from '@/components/ui/reveal'
import { cn } from '@/lib/utils'

function TiltCard({
  max = 8,
  glare = true,
  className,
  style,
  children,
  onPointerMove,
  onPointerLeave,
  ...props
}: {
  /** Largest tilt, in degrees. */
  max?: number
  /** A soft light that follows the tilt. */
  glare?: boolean
} & React.ComponentProps<'div'>) {
  const ref = React.useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const set = (rx: number, ry: number, gx: number, gy: number) => {
    const node = ref.current
    if (!node) return
    // Written to the style, not to state: the card doesn't re-render on every move.
    node.style.setProperty('--tilt-x', `${rx}deg`)
    node.style.setProperty('--tilt-y', `${ry}deg`)
    node.style.setProperty('--glare-x', `${gx}%`)
    node.style.setProperty('--glare-y', `${gy}%`)
  }
  return (
    <div
      ref={ref}
      data-slot="tilt-card"
      className={cn(
        'group/tilt relative isolate [transform:perspective(800px)_rotateX(var(--tilt-x,0deg))_rotateY(var(--tilt-y,0deg))] overflow-hidden transition-transform duration-slow ease-out hover:duration-fast motion-reduce:transform-none',
        className,
      )}
      style={style}
      onPointerMove={(event) => {
        onPointerMove?.(event)
        if (reduced || event.pointerType !== 'mouse') return
        const rect = event.currentTarget.getBoundingClientRect()
        const px = (event.clientX - rect.left) / rect.width
        const py = (event.clientY - rect.top) / rect.height
        set((0.5 - py) * 2 * max, (px - 0.5) * 2 * max, px * 100, py * 100)
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event)
        set(0, 0, 50, 50)
      }}
      {...props}
    >
      {children}
      {glare && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-slow group-hover/tilt:opacity-100 motion-reduce:hidden"
          style={{
            background:
              'radial-gradient(circle at var(--glare-x, 50%) var(--glare-y, 50%), color-mix(in oklab, white 14%, transparent), transparent 60%)',
          }}
        />
      )}
    </div>
  )
}

export { TiltCard }
