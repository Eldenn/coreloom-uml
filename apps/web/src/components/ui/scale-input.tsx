'use client'

// Coreloom UI — ScaleInput. A row of points to answer a survey question: "How likely are you to
// recommend us?" from 0 to 10 (NPS), or "Strongly disagree" to "Strongly agree" (Likert). The value
// is a number, or null before an answer. It is a radio group: arrows move along the scale, and each
// point is read with its words ("0, Not at all likely").
import * as React from 'react'

import { cn } from '@/lib/utils'

function ScaleInput({
  min = 1,
  max = 5,
  value,
  defaultValue = null,
  onValueChange,
  minLabel,
  maxLabel,
  labels,
  name,
  disabled,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  /** First and last points (1 to 5 by default; 0 to 10 for NPS). */
  min?: number
  max?: number
  value?: number | null
  defaultValue?: number | null
  onValueChange?: (value: number) => void
  /** Words under the ends of the scale ("Not likely", "Very likely"). */
  minLabel?: string
  maxLabel?: string
  /** One label per point, shown instead of the numbers (a Likert scale). */
  labels?: string[]
  /** The radios' form name; generated when not given. */
  name?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const autoNameId = React.useId()
  const [inner, setInner] = React.useState<number | null>(defaultValue)
  const current = value !== undefined ? value : inner
  const points = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  const invalid = ariaInvalid === true || ariaInvalid === 'true'
  const worded = labels?.length === points.length

  // The end words join the first and last points' names, so they are heard where they apply.
  const pointName = (n: number, i: number) => {
    if (worded) return labels[i] ?? String(n)
    if (i === 0 && minLabel) return `${String(n)}, ${minLabel}`
    if (i === points.length - 1 && maxLabel) return `${String(n)}, ${maxLabel}`
    return String(n)
  }

  return (
    <div data-slot="scale-input" className={cn('flex flex-col gap-1.5', className)}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        className={cn('grid gap-1.5', worded ? 'sm:auto-cols-fr sm:grid-flow-col' : '')}
        style={
          worded
            ? undefined
            : { gridTemplateColumns: `repeat(${String(points.length)}, minmax(0, 1fr))` }
        }
      >
        {points.map((n, i) => (
          <label
            key={n}
            className={cn(
              'relative flex cursor-pointer items-center justify-center rounded-md border border-border bg-inset px-1 text-center font-sans text-[14px] font-medium text-fg-secondary tabular-nums transition-[background-color,border-color,color] duration-fast ease-out select-none hover:border-border-strong hover:text-foreground has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-[3px] has-focus-visible:ring-ring has-disabled:cursor-not-allowed has-disabled:opacity-55',
              worded ? 'min-h-10 py-2 text-[13px] leading-tight' : 'h-10',
              invalid && 'border-destructive',
            )}
          >
            <input
              type="radio"
              name={name ?? autoNameId}
              value={n}
              checked={current === n}
              disabled={disabled}
              aria-label={pointName(n, i)}
              onChange={() => {
                if (value === undefined) setInner(n)
                onValueChange?.(n)
              }}
              className="absolute inset-0 m-0 cursor-[inherit] appearance-none opacity-0"
            />
            <span aria-hidden>{worded ? labels[i] : n}</span>
          </label>
        ))}
      </div>
      {!worded && (minLabel ?? maxLabel) ? (
        <div aria-hidden className="flex justify-between gap-4 text-[12px] text-muted-foreground">
          <span>{minLabel}</span>
          <span className="text-right">{maxLabel}</span>
        </div>
      ) : null}
    </div>
  )
}

export { ScaleInput }
