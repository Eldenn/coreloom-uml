import * as React from 'react'

import { cn } from '@/lib/utils'

const tones = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
} as const

function PingDot({
  tone = 'primary',
  active = true,
  label,
  className,
  ...props
}: {
  /** primary (default), success, warning or destructive. */
  tone?: keyof typeof tones
  /** Pulses; false leaves a still dot. */
  active?: boolean
  /** Said by screen readers ("New", "Live"); left out, the dot is decorative. */
  label?: string
} & Omit<React.ComponentProps<'span'>, 'children'>) {
  return (
    <span
      data-slot="ping-dot"
      data-state={active ? 'active' : 'idle'}
      className={cn('relative inline-flex size-2.5 shrink-0', className)}
      {...props}
    >
      {active && (
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 animate-ping rounded-full opacity-70 motion-reduce:hidden',
            tones[tone],
          )}
        />
      )}
      <span
        aria-hidden
        className={cn('relative inline-flex size-full rounded-full', tones[tone])}
      />
      {label && <span className="sr-only">{label}</span>}
    </span>
  )
}

function Ping({
  tone,
  active,
  label,
  position = 'top-right',
  className,
  children,
  ...props
}: {
  tone?: keyof typeof tones
  active?: boolean
  label?: string
  /** The corner the dot sits in. */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
} & React.ComponentProps<'span'>) {
  const corner = {
    'top-right': '-top-0.5 -right-0.5',
    'top-left': '-top-0.5 -left-0.5',
    'bottom-right': '-right-0.5 -bottom-0.5',
    'bottom-left': '-bottom-0.5 -left-0.5',
  }[position]
  return (
    <span data-slot="ping" className={cn('relative inline-flex', className)} {...props}>
      {children}
      <PingDot
        tone={tone}
        active={active}
        label={label}
        className={cn('pointer-events-none absolute', corner)}
      />
    </span>
  )
}

export { Ping, PingDot }
