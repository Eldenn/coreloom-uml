import * as React from 'react'

import { Combobox } from '@/components/ui/combobox'
import { useCoreloomI18n } from '@/lib/i18n'

// Used when the browser can't list its zones (older engines).
const FALLBACK = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Africa/Cairo',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
]

function allTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return FALLBACK
  }
}

/** The zone's offset from UTC on `date`, in minutes (Paris in summer: 120). */
function timeZoneOffset(timeZone: string, date = new Date()): number {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name)
  if (!match) return 0
  const minutes = Number(match[2]) * 60 + Number(match.at(3) ?? 0)
  return match[1] === '-' ? -minutes : minutes
}

/** "UTC+02:00", "UTC−05:00", "UTC". */
function formatOffset(minutes: number) {
  if (minutes === 0) return 'UTC'
  const abs = Math.abs(minutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `UTC${minutes < 0 ? '−' : '+'}${hh}:${mm}`
}

/** "Europe/Paris" → "Paris"; "America/Argentina/Buenos_Aires" → "Buenos Aires". */
const cityOf = (zone: string) => (zone.split('/').at(-1) ?? zone).replaceAll('_', ' ')

function TimezoneSelect({
  value,
  defaultValue,
  onValueChange,
  timeZones,
  date,
  placeholder,
  clearable,
  disabled,
  id,
  className,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: {
  /** An IANA name ("Europe/Paris"). */
  value?: string
  defaultValue?: string
  onValueChange?: (zone: string) => void
  /** The zones offered; every zone the browser knows by default. */
  timeZones?: string[]
  /** The day the offsets are worked out for (daylight saving); today by default. */
  date?: Date
  placeholder?: string
  clearable?: boolean
  disabled?: boolean
  id?: string
  className?: string
  'aria-label'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const t = useCoreloomI18n().messages.inputs.timezone
  const local = React.useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const time = date?.getTime()
  const options = React.useMemo(() => {
    const on = time === undefined ? new Date() : new Date(time)
    return (timeZones ?? allTimeZones())
      .map((zone) => {
        const offset = timeZoneOffset(zone, on)
        const formatted = formatOffset(offset)
        const hours = offset / 60
        return {
          zone,
          offset,
          label: `(${formatted}) ${cityOf(zone)}${zone === local ? ` · ${t.local}` : ''}`,
          keywords: [
            zone,
            zone.replaceAll('_', ' '),
            formatted,
            `${hours < 0 ? '-' : '+'}${String(Math.abs(hours))}`,
          ],
        }
      })
      .sort((a, b) => a.offset - b.offset || a.label.localeCompare(b.label))
      .map(({ zone, label, keywords }) => ({ value: zone, label, keywords }))
  }, [timeZones, time, local, t.local])

  return (
    <Combobox
      id={id}
      options={options}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      placeholder={placeholder ?? t.placeholder}
      searchPlaceholder={t.search}
      emptyText={t.empty}
      clearable={clearable}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
    />
  )
}

export { formatOffset, timeZoneOffset, TimezoneSelect }
