import * as React from 'react'

import { cn } from '@/lib/utils'

interface SegmentedOption {
  value: string
  label: React.ReactNode
  /** Shown before the label; with `iconOnly`, the label becomes the accessible name. */
  icon?: React.ReactNode
  disabled?: boolean
}

function SegmentedControl({
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  size = 'default',
  iconOnly = false,
  fullWidth = false,
  disabled,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: {
  options: SegmentedOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** The radios' form name; generated when not given. */
  name?: string
  size?: 'sm' | 'default'
  /** Shows only the icons; each label stays as the option's accessible name and tooltip. */
  iconOnly?: boolean
  /** Stretches to the container, the options sharing the width. */
  fullWidth?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
}) {
  const autoNameId = React.useId()
  const [inner, setInner] = React.useState(defaultValue ?? options.at(0)?.value ?? '')
  const current = value ?? inner
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      data-slot="segmented-control"
      data-size={size}
      className={cn(
        'inline-flex items-stretch gap-0.5 rounded-md border border-border bg-muted p-0.5',
        size === 'sm' ? 'h-8' : 'h-[42px]',
        fullWidth ? 'flex w-full' : 'w-fit',
        disabled && 'opacity-55',
        className,
      )}
    >
      {options.map((o) => {
        const labelText = typeof o.label === 'string' ? o.label : undefined
        return (
          <label
            key={o.value}
            title={iconOnly ? labelText : undefined}
            className={cn(
              'relative flex cursor-pointer items-center justify-center gap-1.5 rounded-sm px-3 font-sans font-medium whitespace-nowrap text-muted-foreground transition-[background-color,color,box-shadow] duration-fast ease-out select-none hover:text-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-[3px] has-focus-visible:ring-ring has-disabled:cursor-not-allowed has-disabled:text-faint-foreground has-disabled:hover:text-faint-foreground [&_svg]:size-4 [&_svg]:shrink-0',
              size === 'sm' ? 'text-[12px]' : 'text-[13px]',
              iconOnly && 'px-2.5',
              fullWidth && 'flex-1',
            )}
          >
            <input
              type="radio"
              name={name ?? autoNameId}
              value={o.value}
              checked={current === o.value}
              disabled={(disabled ?? false) || (o.disabled ?? false)}
              aria-label={iconOnly ? labelText : undefined}
              onChange={() => {
                if (value === undefined) setInner(o.value)
                onValueChange?.(o.value)
              }}
              className="absolute inset-0 m-0 cursor-[inherit] appearance-none opacity-0"
            />
            {o.icon ? <span aria-hidden>{o.icon}</span> : null}
            {iconOnly ? null : o.label}
          </label>
        )
      })}
    </div>
  )
}

export { SegmentedControl, type SegmentedOption }
