import type * as React from 'react'

import type { DiagramMarker } from '@/lib/uml-graph'

/**
 * The marker shapes, drawn with the node on the right (x = width) so one definition serves both
 * ends (`auto-start-reverse` turns it round at the start of a line).
 */
const MARKERS: Record<
  DiagramMarker,
  { w: number; h: number; draw: React.ReactNode; ref?: number }
> = {
  arrow: { w: 12, h: 12, draw: <path d="M1 1 L11 6 L1 11" fill="none" /> },
  arrowFilled: { w: 12, h: 12, draw: <path d="M0 1 L12 6 L0 11 Z" fill="var(--diagram-edge)" /> },
  triangle: { w: 16, h: 16, draw: <path d="M1 1 L15 8 L1 15 Z" fill="var(--color-background)" /> },
  diamond: {
    w: 20,
    h: 12,
    draw: <path d="M1 6 L10 1 L19 6 L10 11 Z" fill="var(--color-background)" />,
  },
  diamondFilled: {
    w: 20,
    h: 12,
    draw: <path d="M1 6 L10 1 L19 6 L10 11 Z" fill="var(--diagram-edge)" />,
  },
  one: { w: 24, h: 16, draw: <path d="M14 2 V14 M18 2 V14" fill="none" /> },
  zeroOrOne: {
    w: 24,
    h: 16,
    draw: (
      <>
        <path d="M18 2 V14" fill="none" />
        <circle cx="9" cy="8" r="4" fill="var(--color-background)" />
      </>
    ),
  },
  oneOrMore: {
    w: 24,
    h: 16,
    draw: <path d="M12 8 L24 1 M12 8 L24 8 M12 8 L24 15 M8 2 V14" fill="none" />,
  },
  zeroOrMore: {
    w: 24,
    h: 16,
    draw: (
      <>
        <path d="M12 8 L24 1 M12 8 L24 8 M12 8 L24 15" fill="none" />
        <circle cx="6" cy="8" r="4" fill="var(--color-background)" />
      </>
    ),
  },
  // A socket round the lollipop the line ends at: its ball is 20 wide, its middle 10 past the end.
  socket: { w: 24, h: 30, ref: 10, draw: <path d="M20 1 A14 14 0 0 0 20 29" fill="none" /> },
  // A ball in a socket just before the box: the line's start needs what the box offers.
  assembly: {
    w: 28,
    h: 24,
    draw: (
      <>
        <path d="M17 2 A10 10 0 0 0 17 22" fill="none" />
        <circle cx="17" cy="12" r="6" fill="var(--color-background)" />
      </>
    ),
  },
}

/** The marker definitions every line points at, under one id prefix per diagram. */
function DiagramMarkers({ prefix }: { prefix: string }) {
  return (
    <svg aria-hidden className="absolute size-0">
      <defs>
        {Object.entries(MARKERS).map(([name, m]) => (
          <marker
            key={name}
            id={`${prefix}-${name}`}
            viewBox={`0 0 ${String(m.w)} ${String(m.h)}`}
            refX={m.ref ?? m.w}
            refY={m.h / 2}
            markerWidth={m.w}
            markerHeight={m.h}
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
            stroke="var(--diagram-edge)"
            strokeWidth={1.25}
          >
            {m.draw}
          </marker>
        ))}
      </defs>
    </svg>
  )
}

export { DiagramMarkers }
