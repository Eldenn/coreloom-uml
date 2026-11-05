import { StarIcon } from 'lucide-react'
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const sizes = { sm: 'size-4', default: 'size-5', lg: 'size-7' } as const

function Rating({
  value,
  defaultValue = 0,
  onValueChange,
  max = 5,
  readOnly = false,
  disabled,
  size = 'default',
  name,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: {
  /** 0 is "no score". Read-only ratings can show halves (3.5). */
  value?: number
  defaultValue?: number
  onValueChange?: (value: number) => void
  max?: number
  readOnly?: boolean
  disabled?: boolean
  size?: keyof typeof sizes
  /** The radios' form name; generated when not given. */
  name?: string
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
}) {
  const t = useCoreloomI18n().messages.inputs.rating
  const [inner, setInner] = React.useState(defaultValue)
  const current = value ?? inner
  const [hover, setHover] = React.useState<number | null>(null)
  const autoNameId = React.useId()
  const stars = Array.from({ length: max }, (_, i) => i + 1)

  if (readOnly) {
    const label = t.value(Math.round(current * 10) / 10, max)
    return (
      <div
        role="img"
        aria-label={ariaLabel ? `${ariaLabel}: ${label}` : label}
        data-slot="rating"
        className={cn('inline-flex items-center gap-0.5', className)}
      >
        {stars.map((n) => {
          // How much of this star is filled: 0, a fraction, or 1.
          const fill = Math.max(0, Math.min(1, current - (n - 1)))
          return (
            <span key={n} className={cn('relative inline-flex', sizes[size])}>
              <StarIcon aria-hidden className="size-full text-border-strong" />
              {fill > 0 && (
                <span
                  className="absolute inset-y-0 left-0 overflow-hidden"
                  style={{ width: `${String(fill * 100)}%` }}
                >
                  <StarIcon aria-hidden className={cn('fill-warning text-warning', sizes[size])} />
                </span>
              )}
            </span>
          )
        })}
      </div>
    )
  }

  const shown = hover ?? current
  const set = (n: number) => {
    if (value === undefined) setInner(n)
    onValueChange?.(n)
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-disabled={disabled ? true : undefined}
      data-slot="rating"
      className={cn(
        'inline-flex items-center gap-0.5 aria-disabled:opacity-55',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        className,
      )}
      onPointerLeave={() => {
        setHover(null)
      }}
    >
      {stars.map((n) => (
        <label
          key={n}
          className="relative inline-flex rounded-sm has-focus-visible:ring-[3px] has-focus-visible:ring-ring"
          onPointerEnter={() => {
            if (!disabled) setHover(n)
          }}
        >
          <input
            type="radio"
            name={name ?? autoNameId}
            value={n}
            checked={current === n}
            disabled={disabled}
            aria-label={`${t.star(n)}, ${t.value(n, max)}`}
            className="peer absolute inset-0 m-0 cursor-[inherit] appearance-none opacity-0"
            onChange={() => {
              set(n)
            }}
            onClick={() => {
              // Clicking the picked star again clears the score (radios can't be unchecked).
              if (current === n) set(0)
            }}
          />
          <StarIcon
            aria-hidden
            className={cn(
              sizes[size],
              'transition-colors duration-fast',
              n <= shown ? 'fill-warning text-warning' : 'text-border-strong',
            )}
          />
        </label>
      ))}
    </div>
  )
}

export { Rating }
