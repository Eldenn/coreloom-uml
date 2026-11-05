import * as React from 'react'

import { type NumberFormatOptions, NumberInput } from '@/components/ui/number-input'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

function SliderInput({
  value,
  defaultValue,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  formatOptions,
  disabled,
  id,
  className,
  inputClassName,
  onBlur,
  label,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  value?: number
  defaultValue?: number
  onValueChange?: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** How the number field shows the value (units, percent). */
  formatOptions?: NumberFormatOptions
  disabled?: boolean
  /** Goes on the number field, so a FieldLabel's htmlFor names it. */
  id?: string
  className?: string
  /** Width of the number field (default w-28). */
  inputClassName?: string
  onBlur?: () => void
  /** What the value is ("Volume"): names the slider, and the number field when no `id` links a
   *  FieldLabel to it. Use the same words as the visible label. */
  label: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const [inner, setInner] = React.useState(defaultValue ?? min)
  const current = value ?? inner
  const set = (n: number) => {
    if (value === undefined) setInner(n)
    onValueChange?.(n)
  }

  return (
    <div data-slot="slider-input" className={cn('flex w-full items-center gap-4', className)}>
      <Slider
        value={[current]}
        onValueChange={(values) => {
          const n = values.at(0)
          if (n !== undefined) set(n)
        }}
        onValueCommit={onBlur}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={label}
        className="flex-1"
      />
      <NumberInput
        id={id}
        value={current}
        onValueChange={(n) => {
          // An emptied field keeps the slider where it was; blur puts the number back.
          if (n !== null) set(Math.min(max, Math.max(min, n)))
        }}
        onBlur={onBlur}
        min={min}
        max={max}
        step={step}
        formatOptions={formatOptions}
        disabled={disabled}
        aria-label={id ? undefined : label}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className={cn('w-28 shrink-0', inputClassName)}
      />
    </div>
  )
}

export { SliderInput }
