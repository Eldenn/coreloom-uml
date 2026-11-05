import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type NumberFormat = 'decimal' | 'integer' | 'percent' | 'currency' | 'compact' | 'bytes' | 'unit'

interface FormatOptions {
  /** decimal (default), integer, percent (0.12 → 12%), currency, compact (1.2K), bytes (3.4 MB), unit. */
  format?: NumberFormat
  /** ISO 4217 code for `currency`: "EUR", "USD"… */
  currency?: string
  /** A unit Intl knows for `unit`: "kilometer", "hour", "celsius"… */
  unit?: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  /** "exceptZero" writes +12% and −3%, for changes. */
  signDisplay?: Intl.NumberFormatOptions['signDisplay']
  /** bytes only: 1000 (kB, MB, as disks and networks count) or 1024 (as memory counts). 1000 by default. */
  base?: 1000 | 1024
}

const byteUnits = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte'] as const

/** `value` written for `locale` in the given format. */
function formatValue(value: number, locale: string, options: FormatOptions = {}): string {
  const { format = 'decimal', currency, unit, signDisplay, base = 1000 } = options
  // Only the digits given, so they don't replace each format's defaults with undefined.
  const digits: Intl.NumberFormatOptions = {}
  if (options.minimumFractionDigits !== undefined)
    digits.minimumFractionDigits = options.minimumFractionDigits
  if (options.maximumFractionDigits !== undefined)
    digits.maximumFractionDigits = options.maximumFractionDigits
  switch (format) {
    case 'integer':
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0, signDisplay }).format(value)
    case 'percent':
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: 1,
        ...digits,
        signDisplay,
      }).format(value)
    case 'currency':
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency ?? 'USD',
        ...digits,
        signDisplay,
      }).format(value)
    case 'compact':
      return new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
        ...digits,
        signDisplay,
      }).format(value)
    case 'bytes': {
      let i = 0
      let n = Math.abs(value)
      while (n >= base && i < byteUnits.length - 1) {
        n /= base
        i++
      }
      return new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: byteUnits[i],
        unitDisplay: 'narrow',
        maximumFractionDigits: i === 0 ? 0 : 1,
        ...digits,
        signDisplay,
      })
        .format(Math.sign(value) * n)
        .replace(/(\d)([^\d\s.,])/u, '$1 $2')
    }
    case 'unit':
      return new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: unit ?? 'percent',
        ...digits,
        signDisplay,
      }).format(value)
    default:
      return new Intl.NumberFormat(locale, {
        maximumFractionDigits: 2,
        ...digits,
        signDisplay,
      }).format(value)
  }
}

function FormatNumber({
  value,
  className,
  ...options
}: FormatOptions & {
  value: number
  className?: string
}) {
  const { locale } = useCoreloomI18n()
  const text = formatValue(value, locale, options)
  // A compact number keeps its full value in a tooltip: "1.2K" → "1,234".
  const full =
    options.format === 'compact' ? formatValue(value, locale, { format: 'decimal' }) : undefined
  return (
    <data
      data-slot="format-number"
      value={value}
      title={full}
      className={cn('tabular-nums', className)}
    >
      {text}
    </data>
  )
}

const easeOut = (x: number) => 1 - (1 - x) ** 3

function AnimatedNumber({
  value,
  from = 0,
  duration = 900,
  className,
  ...options
}: FormatOptions & {
  value: number
  /** Where the first count starts. Later changes count from the previous value. */
  from?: number
  /** In milliseconds. */
  duration?: number
  className?: string
}) {
  const { locale } = useCoreloomI18n()
  const [shown, setShown] = React.useState(from)
  const shownRef = React.useRef(from)

  React.useEffect(() => {
    const start = shownRef.current
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || duration <= 0 || start === value) {
      shownRef.current = value
      setShown(value)
      return
    }
    let frame = 0
    let t0: number | undefined
    const step = (now: number) => {
      t0 ??= now
      const p = Math.min(1, (now - t0) / duration)
      const next = start + (value - start) * easeOut(p)
      shownRef.current = next
      setShown(next)
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [value, duration])

  // Whole numbers stay whole while counting.
  const isWhole = Number.isInteger(value) && options.format !== 'percent'
  const display = isWhole && shown !== value ? Math.round(shown) : shown
  return (
    <data
      data-slot="animated-number"
      value={value}
      // Busy while counting, so tests and screenshots wait for the final value.
      aria-busy={shown !== value || undefined}
      className={cn('tabular-nums', className)}
    >
      <span aria-hidden>{formatValue(display, locale, options)}</span>
      <span className="sr-only">{formatValue(value, locale, options)}</span>
    </data>
  )
}

export { AnimatedNumber, FormatNumber, type FormatOptions, formatValue, type NumberFormat }
