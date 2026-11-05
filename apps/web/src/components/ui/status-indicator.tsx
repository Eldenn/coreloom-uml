import * as React from 'react'

import { cn } from '@/lib/utils'

type StatusTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

const dots: Record<StatusTone, string> = {
  neutral: 'bg-border-strong',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
}

const pills: Record<StatusTone, string> = {
  neutral: 'border-border bg-secondary',
  primary: 'border-transparent bg-primary-subtle',
  success: 'border-transparent bg-success-subtle',
  warning: 'border-transparent bg-warning-subtle',
  danger: 'border-transparent bg-destructive-subtle',
  info: 'border-transparent bg-info-subtle',
}

function StatusDot({
  tone = 'neutral',
  pulse = false,
  className,
  ...props
}: { tone?: StatusTone; pulse?: boolean } & React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden
      data-slot="status-dot"
      className={cn('relative inline-flex size-2 shrink-0', className)}
      {...props}
    >
      {pulse ? (
        <span
          className={cn(
            'absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden',
            dots[tone],
          )}
        />
      ) : null}
      <span className={cn('relative inline-flex size-2 rounded-full', dots[tone])} />
    </span>
  )
}

function StatusIndicator({
  tone = 'neutral',
  pulse = false,
  variant = 'plain',
  className,
  children,
  ...props
}: {
  tone?: StatusTone
  /** A ring that pulses: something live or in progress. */
  pulse?: boolean
  /** plain: dot and text; pill: inside a tinted pill, to stand out in a table or a header. */
  variant?: 'plain' | 'pill'
  /** The status, in words. */
  children: React.ReactNode
} & React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="status-indicator"
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-2 text-[13px] whitespace-nowrap text-foreground',
        variant === 'pill' && 'h-6 rounded-full border px-2.5 text-[12.5px]',
        variant === 'pill' && pills[tone],
        className,
      )}
      {...props}
    >
      <StatusDot tone={tone} pulse={pulse} />
      {children}
    </span>
  )
}

export { StatusDot, StatusIndicator, type StatusTone }
