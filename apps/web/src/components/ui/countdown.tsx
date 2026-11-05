import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface DurationParts {
  days: number
  hours: number
  minutes: number
  seconds: number
}

/** A number of milliseconds as days, hours, minutes and whole seconds (rounded up, never below 0). */
function splitDuration(ms: number): DurationParts {
  let s = Math.max(0, Math.ceil(ms / 1000))
  const days = Math.floor(s / 86400)
  s -= days * 86400
  const hours = Math.floor(s / 3600)
  s -= hours * 3600
  const minutes = Math.floor(s / 60)
  return { days, hours, minutes, seconds: s - minutes * 60 }
}

const toTime = (value: Date | number) => (value instanceof Date ? value.getTime() : value)
const pad = (n: number) => String(n).padStart(2, '0')

function Countdown({
  to,
  now: nowProp,
  variant = 'clock',
  days: showDays = 'auto',
  onComplete,
  completed,
  className,
  ...props
}: {
  /** The moment it counts down to. */
  to: Date | number
  /** A fixed "now": the countdown then stays still (tests, previews, server rendering). */
  now?: Date | number
  /** clock: 1:02:14:07; boxes: each unit in a box, named; text: "2 h 14 min". */
  variant?: 'clock' | 'boxes' | 'text'
  /** Shows days: always, never (hours go above 24), or auto (only when there's at least one). */
  days?: 'auto' | 'always' | 'never'
  /** Called once when it reaches zero. */
  onComplete?: () => void
  /** Shown instead at zero, such as "Live now". */
  completed?: React.ReactNode
} & Omit<React.ComponentProps<'span'>, 'children'>) {
  const t = useCoreloomI18n().messages.utility.countdown
  const target = toTime(to)
  const fixed = nowProp === undefined ? undefined : toTime(nowProp)
  const [tick, setTick] = React.useState(() => fixed ?? Date.now())
  const now = fixed ?? tick
  const left = Math.max(0, target - now)
  const done = left === 0
  const onCompleteRef = React.useRef(onComplete)
  React.useEffect(() => {
    onCompleteRef.current = onComplete
  })

  React.useEffect(() => {
    if (fixed !== undefined) return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const current = Date.now()
      setTick(current)
      const remaining = target - current
      if (remaining <= 0) return
      // Wake up just after the next whole second of the remaining time.
      timer = setTimeout(schedule, (remaining % 1000 || 1000) + 10)
    }
    schedule()
    return () => {
      clearTimeout(timer)
    }
  }, [target, fixed])

  const completedRef = React.useRef(false)
  React.useEffect(() => {
    if (done && !completedRef.current) {
      completedRef.current = true
      onCompleteRef.current?.()
    }
    if (!done) completedRef.current = false
  }, [done])

  const parts = splitDuration(left)
  const withDays = showDays === 'always' || (showDays === 'auto' && parts.days > 0)
  const hours = withDays ? parts.hours : parts.hours + parts.days * 24
  const spoken = t.spoken({ ...parts, days: withDays ? parts.days : 0, hours })

  if (done && completed !== undefined) {
    return (
      <span data-slot="countdown" data-state="done" className={className} {...props}>
        {completed}
      </span>
    )
  }

  const units: { key: keyof DurationParts; value: number }[] = [
    ...(withDays ? [{ key: 'days' as const, value: parts.days }] : []),
    { key: 'hours', value: hours },
    { key: 'minutes', value: parts.minutes },
    { key: 'seconds', value: parts.seconds },
  ]

  let visual: React.ReactNode
  if (variant === 'boxes') {
    visual = (
      <span className="inline-flex items-start gap-2">
        {units.map((u) => (
          <span
            key={u.key}
            className="flex min-w-14 flex-col items-center gap-1 rounded-md border border-border bg-surface px-2 py-2"
          >
            <span className="font-mono text-[22px] leading-none font-semibold text-foreground tabular-nums">
              {pad(u.value)}
            </span>
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground uppercase">
              {t.units[u.key]}
            </span>
          </span>
        ))}
      </span>
    )
  } else if (variant === 'text') {
    const firstNonZero = units.findIndex((u) => u.value > 0)
    const shown = units
      .slice(Math.max(0, firstNonZero))
      // Two units are enough to read: "2 d 4 h", "14 min 7 s".
      .slice(0, 2)
    visual = (
      <span className="tabular-nums">
        {(firstNonZero === -1 ? [{ key: 'seconds' as const, value: 0 }] : shown)
          .map((u) => t.short[u.key](u.value))
          .join(' ')}
      </span>
    )
  } else {
    visual = (
      <span className="font-mono tabular-nums">
        {units.map((u, i) => (i === 0 ? String(u.value) : pad(u.value))).join(':')}
      </span>
    )
  }

  return (
    <span
      data-slot="countdown"
      data-variant={variant}
      data-state={done ? 'done' : 'running'}
      role="timer"
      aria-live="off"
      className={cn('inline-flex text-foreground', className)}
      {...props}
    >
      <span aria-hidden>{visual}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  )
}

export { Countdown, type DurationParts, splitDuration }
