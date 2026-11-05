'use client'

// Coreloom UI — UnitInput. A number with its unit picked beside it: "12 px", "80 kg", "500 GB".
// The value is `{ value, unit }`. Changing the unit keeps the number unless you pass `convert`
// (px ↔ rem, kg ↔ lb), which turns the number into the new unit. The unit menu is a native select,
// so it works with every keyboard and screen reader and opens the system picker on phones.
import { ChevronDownIcon } from 'lucide-react'
import * as React from 'react'

import { type NumberFormatOptions, NumberInput } from '@/components/ui/number-input'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface UnitOption {
  value: string
  /** Shown in the menu ("px", "kg"); defaults to the value. */
  label?: string
}

interface UnitValue {
  value: number | null
  unit: string
}

function UnitInput({
  units,
  value,
  defaultValue,
  onValueChange,
  convert,
  min,
  max,
  step,
  formatOptions,
  stepper = 'none',
  placeholder,
  disabled,
  id,
  name,
  className,
  onBlur,
  unitLabel,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  units: UnitOption[]
  value?: UnitValue
  defaultValue?: UnitValue
  onValueChange?: (value: UnitValue) => void
  /** Turns a number from one unit to another when the unit changes; without it the number stays. */
  convert?: (value: number, from: string, to: string) => number
  min?: number
  max?: number
  step?: number
  formatOptions?: NumberFormatOptions
  /** The number field's − / + buttons (default none). */
  stepper?: 'end' | 'sides' | 'none'
  placeholder?: string
  disabled?: boolean
  /** Goes on the number field, so a FieldLabel's htmlFor names it. */
  id?: string
  name?: string
  className?: string
  onBlur?: () => void
  /** Accessible name of the unit menu; defaults to the i18n text ("Unit"). */
  unitLabel?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const t = useCoreloomI18n().messages.inputs
  const [inner, setInner] = React.useState<UnitValue>(
    defaultValue ?? { value: null, unit: units.at(0)?.value ?? '' },
  )
  const current = value ?? inner
  const set = (next: UnitValue) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }
  return (
    <div
      data-slot="unit-input"
      className={cn(
        'flex w-full items-stretch [&>[data-slot=number-input]]:rounded-r-none [&>[data-slot=number-input]]:border-r-0',
        className,
      )}
    >
      <NumberInput
        id={id}
        name={name}
        value={current.value}
        onValueChange={(n) => {
          set({ ...current, value: n })
        }}
        onBlur={onBlur}
        min={min}
        max={max}
        step={step}
        formatOptions={formatOptions}
        stepper={stepper}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className="min-w-0 flex-1"
      />
      <div className="relative flex shrink-0">
        <select
          value={current.unit}
          disabled={disabled}
          aria-label={unitLabel ?? t.unit}
          data-slot="unit-input-unit"
          onChange={(e) => {
            const unit = e.target.value
            const n =
              current.value !== null && convert
                ? convert(current.value, current.unit, unit)
                : current.value
            set({ value: n, unit })
          }}
          onBlur={onBlur}
          className="h-[42px] cursor-pointer appearance-none rounded-r-md border border-input bg-secondary pr-8 pl-3 font-sans text-[13px] font-medium text-foreground transition-[border-color,box-shadow] duration-base ease-out outline-none hover:bg-accent focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55"
        >
          {units.map((u) => (
            <option key={u.value} value={u.value} className="bg-popover text-popover-foreground">
              {u.label ?? u.value}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </div>
  )
}

export { UnitInput, type UnitOption, type UnitValue }
