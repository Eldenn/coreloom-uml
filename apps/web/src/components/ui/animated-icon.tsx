'use client'

// Coreloom UI — Animated icons. Small icons that move to confirm something:
// - DrawIcon: a check, a cross, an arrow or a circled check that draws itself, for a step done,
//   a saved form, a payment that went through.
// - MorphIcon: one icon turning into another (copy → copied, play → pause), with a quick turn.
// - MenuToggleIcon: the three-line menu icon that folds into a cross when the menu is open.
// They are decorative by default; give `label` to DrawIcon when it is the only sign of the
// state. For people who ask for reduced motion they simply appear.
//
//   <DrawIcon icon="check" className="text-success" />
//   <MorphIcon active={copied} from={<CopyIcon />} to={<CheckIcon />} />
import * as React from 'react'

import { cn } from '@/lib/utils'

const paths = {
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  cross: ['M6 6l12 12', 'M18 6L6 18'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  'circle-check': ['M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18', 'M8 12.5l3 3 5-6'],
} as const

type DrawIconName = keyof typeof paths

function DrawIcon({
  icon = 'check',
  duration = 420,
  delay = 0,
  label,
  className,
  style,
  ...props
}: {
  /** check, cross, arrow or circle-check. */
  icon?: DrawIconName
  /** Milliseconds to draw one stroke; the strokes of an icon follow one another. */
  duration?: number
  /** Milliseconds before it starts. */
  delay?: number
  /** Names it for screen readers ("Saved"); left out, it is decorative. */
  label?: string
} & Omit<React.ComponentProps<'svg'>, 'children'>) {
  return (
    <svg
      data-slot="draw-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('size-5', className)}
      style={{ '--draw-duration': `${duration}ms`, ...style } as React.CSSProperties}
      {...props}
    >
      {paths[icon].map((d, i) => (
        <path
          key={d}
          d={d}
          pathLength={1}
          strokeDasharray="1"
          className="animate-draw"
          style={{ animationDelay: `${delay + i * duration * 0.8}ms` }}
        />
      ))}
    </svg>
  )
}

function MorphIcon({
  active,
  from,
  to,
  className,
  ...props
}: {
  /** Shows `to` when true, `from` when false. */
  active: boolean
  /** The icon at rest. */
  from: React.ReactNode
  /** The icon once active. */
  to: React.ReactNode
} & Omit<React.ComponentProps<'span'>, 'children'>) {
  const layer =
    'col-start-1 row-start-1 transition-[opacity,scale,rotate] duration-base ease-out motion-reduce:transition-none'
  return (
    <span
      data-slot="morph-icon"
      data-state={active ? 'active' : 'inactive'}
      aria-hidden
      className={cn('inline-grid place-items-center', className)}
      {...props}
    >
      <span className={cn(layer, active && 'scale-50 -rotate-90 opacity-0')}>{from}</span>
      <span className={cn(layer, !active && 'scale-50 rotate-90 opacity-0')}>{to}</span>
    </span>
  )
}

function MenuToggleIcon({
  open,
  className,
  ...props
}: {
  /** The menu is open: the lines fold into a cross. */
  open: boolean
} & Omit<React.ComponentProps<'span'>, 'children'>) {
  const line =
    'absolute left-0 h-[1.5px] w-full rounded-full bg-current transition-[translate,rotate,opacity] duration-slow ease-out motion-reduce:transition-none'
  return (
    <span
      data-slot="menu-toggle-icon"
      data-state={open ? 'open' : 'closed'}
      aria-hidden
      className={cn('relative inline-block size-4', className)}
      {...props}
    >
      <span className={cn(line, 'top-[3px]', open && 'translate-y-[4.25px] rotate-45')} />
      <span className={cn(line, 'top-[7.25px]', open && 'opacity-0')} />
      <span className={cn(line, 'top-[11.5px]', open && '-translate-y-[4.25px] -rotate-45')} />
    </span>
  )
}

export { DrawIcon, type DrawIconName, MenuToggleIcon, MorphIcon }
