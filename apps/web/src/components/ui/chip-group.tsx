'use client'

// Coreloom UI — ChipGroup. Pills that toggle on and off: filters above a list ("Open · Mine ·
// This week"), interests on a profile, the sizes in stock. With `type="multiple"` (default) each
// chip is a checkbox and the value is an array; with `type="single"` they are radios and the value
// a string. A ticked chip shows a check, so the state never rests on colour alone.
import { CheckIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

interface ChipOption {
  value: string
  label: React.ReactNode
  /** Shown before the label when the chip isn't ticked. */
  icon?: React.ReactNode
  /** A number after the label (results for that filter). */
  count?: number
  disabled?: boolean
}

type ChipGroupProps = {
  options: ChipOption[]
  /** The inputs' form name; generated when not given. */
  name?: string
  size?: 'sm' | 'default'
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
} & (
  | {
      type?: 'multiple'
      value?: string[]
      defaultValue?: string[]
      onValueChange?: (value: string[]) => void
    }
  | {
      type: 'single'
      value?: string
      defaultValue?: string
      onValueChange?: (value: string) => void
    }
)

function ChipGroup(props: ChipGroupProps) {
  const {
    options,
    name,
    size = 'default',
    disabled,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
  } = props
  const single = props.type === 'single'
  const autoNameId = React.useId()
  const [inner, setInner] = React.useState<string[]>(() => {
    if (props.type === 'single') return props.defaultValue ? [props.defaultValue] : []
    return props.defaultValue ?? []
  })
  const picked: string[] =
    props.value === undefined ? inner : Array.isArray(props.value) ? props.value : [props.value]

  const toggle = (value: string, on: boolean) => {
    if (props.type === 'single') {
      if (props.value === undefined) setInner([value])
      props.onValueChange?.(value)
      return
    }
    const next = on
      ? [...picked.filter((v) => v !== value), value]
      : picked.filter((v) => v !== value)
    // Keep the options' order, whatever the order of clicks.
    const ordered = options.map((o) => o.value).filter((v) => next.includes(v))
    if (props.value === undefined) setInner(ordered)
    props.onValueChange?.(ordered)
  }

  return (
    <div
      role={single ? 'radiogroup' : 'group'}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      data-slot="chip-group"
      className={cn('flex flex-wrap gap-2', className)}
    >
      {options.map((o) => {
        const checked = picked.includes(o.value)
        return (
          <label
            key={o.value}
            className={cn(
              'relative inline-flex cursor-pointer items-center gap-1.5 rounded-pill border border-border bg-transparent font-sans font-medium whitespace-nowrap text-fg-secondary transition-[background-color,border-color,color] duration-fast ease-out select-none hover:bg-accent hover:text-foreground has-checked:border-primary has-checked:bg-primary-subtle has-checked:text-primary-text has-focus-visible:ring-[3px] has-focus-visible:ring-ring has-disabled:cursor-not-allowed has-disabled:opacity-55 has-disabled:hover:bg-transparent [&_svg]:size-3.5 [&_svg]:shrink-0',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
            )}
          >
            <input
              type={single ? 'radio' : 'checkbox'}
              name={name ?? autoNameId}
              value={o.value}
              checked={checked}
              disabled={(disabled ?? false) || (o.disabled ?? false)}
              onChange={(e) => {
                toggle(o.value, e.target.checked)
              }}
              className="absolute inset-0 m-0 cursor-[inherit] appearance-none opacity-0"
            />
            {checked ? (
              <CheckIcon aria-hidden />
            ) : o.icon ? (
              <span aria-hidden>{o.icon}</span>
            ) : null}
            {o.label}
            {o.count === undefined ? null : (
              <span className="font-mono text-[11px] tabular-nums">{o.count}</span>
            )}
          </label>
        )
      })}
    </div>
  )
}

export { ChipGroup, type ChipOption }
