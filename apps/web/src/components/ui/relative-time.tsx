import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * DAY],
  ['month', 30 * DAY],
  ['week', 7 * DAY],
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
  ['second', SECOND],
]

const toDate = (date: Date | string | number) => (date instanceof Date ? date : new Date(date))

/**
 * "5 minutes ago", "yesterday", "in 3 weeks": `date` against `now`, in the largest unit that fits.
 * Under 45 seconds it says "now".
 */
function formatRelative(
  date: Date | string | number,
  locale: string,
  now: Date | number = Date.now(),
  style: Intl.RelativeTimeFormatStyle = 'long',
): string {
  const diff = toDate(date).getTime() - (now instanceof Date ? now.getTime() : now)
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style })
  if (Math.abs(diff) < 45 * SECOND) return format.format(0, 'second')
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === 'second') return format.format(Math.round(diff / ms), unit)
  }
  return format.format(0, 'second')
}

/** How long until the wording can change: every 15 s within the minute, every minute within the hour… */
function refreshDelay(diff: number) {
  const abs = Math.abs(diff)
  if (abs < MINUTE) return 15 * SECOND
  if (abs < HOUR) return 30 * SECOND
  if (abs < DAY) return 5 * MINUTE
  return HOUR
}

function RelativeTime({
  date,
  now,
  style = 'long',
  live = true,
  className,
  ...props
}: {
  date: Date | string | number
  /** The moment to count from; the current time by default. Pass it to freeze the wording. */
  now?: Date | number
  /** long: "5 minutes ago"; short: "5 min. ago"; narrow: "5m ago". */
  style?: Intl.RelativeTimeFormatStyle
  /** Keep the wording current as time passes (ignored when `now` is given). */
  live?: boolean
} & Omit<React.ComponentProps<'time'>, 'dateTime' | 'children'>) {
  const { locale } = useCoreloomI18n()
  const [tick, setTick] = React.useState(() => Date.now())
  const at = toDate(date)
  const from = now ?? tick
  const time = at.getTime()

  React.useEffect(() => {
    if (now !== undefined || !live || Number.isNaN(time)) return
    const id = setTimeout(
      () => {
        setTick(Date.now())
      },
      refreshDelay(time - tick),
    )
    return () => {
      clearTimeout(id)
    }
  }, [now, live, time, tick])

  if (Number.isNaN(time)) return null
  const full = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(at)
  return (
    <time
      data-slot="relative-time"
      dateTime={at.toISOString()}
      title={full}
      className={cn('tabular-nums', className)}
      {...props}
    >
      {formatRelative(at, locale, from, style)}
    </time>
  )
}

export { formatRelative, RelativeTime }
