import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react'
import * as React from 'react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface MultiSelectOption {
  value: string
  label: string
  icon?: React.ReactNode
  /** Extra words the search should match. */
  keywords?: string[]
  disabled?: boolean
}

function MultiSelect({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  maxShown = 3,
  maxSelected,
  disabled,
  className,
  id,
  onBlur,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: {
  options: MultiSelectOption[]
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: React.ReactNode
  /** Chips shown in the trigger before "+n". */
  maxShown?: number
  /** Stop adding once this many are picked (the rest of the list is disabled). */
  maxSelected?: number
  disabled?: boolean
  className?: string
  id?: string
  onBlur?: () => void
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-label'?: string
  'aria-describedby'?: string
}) {
  const { messages, formatNumber } = useCoreloomI18n()
  const t = messages.multiSelect
  placeholder ??= t.placeholder
  searchPlaceholder ??= t.search
  emptyText ??= t.empty
  const [open, setOpen] = React.useState(false)
  const [inner, setInner] = React.useState<string[]>(defaultValue ?? [])
  const current = value ?? inner
  const selected = options.filter((o) => current.includes(o.value))
  const full = maxSelected !== undefined && current.length >= maxSelected

  const commit = (next: string[]) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }
  const toggle = (v: string) => {
    commit(current.includes(v) ? current.filter((x) => x !== v) : [...current, v])
  }
  const selectable = options.filter((o) => !o.disabled)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onBlur?.()
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          // eslint-disable-next-line jsx-a11y/role-has-required-aria-props -- PopoverTrigger adds aria-controls.
          role="combobox"
          id={id}
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          disabled={disabled}
          data-slot="multi-select-trigger"
          data-placeholder={selected.length ? undefined : ''}
          className={cn(
            'flex min-h-[42px] w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-inset py-1.5 pr-[13px] pl-2 text-left font-sans text-[14px] text-foreground transition-[border-color,box-shadow] duration-base ease-out outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-expanded:border-primary aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive-subtle data-[placeholder]:pl-[13px] data-[placeholder]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0',
            className,
          )}
        >
          <span className="flex min-w-0 flex-wrap items-center gap-1">
            {selected.length === 0
              ? placeholder
              : selected.slice(0, maxShown).map((o) => (
                  <span
                    key={o.value}
                    data-slot="multi-select-chip"
                    className="inline-flex h-6 max-w-40 items-center gap-1 rounded-sm bg-secondary px-2 text-[13px] text-secondary-foreground [&_svg]:size-3.5"
                  >
                    {o.icon}
                    <span className="truncate">{o.label}</span>
                  </span>
                ))}
            {selected.length > maxShown && (
              <span className="inline-flex h-6 items-center rounded-sm px-1.5 font-mono text-[12px] text-muted-foreground">
                {t.more(formatNumber(selected.length - maxShown))}
              </span>
            )}
          </span>
          <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-60 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList aria-multiselectable="true">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = current.includes(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[option.label, ...(option.keywords ?? [])]}
                    disabled={!!option.disabled || (full && !isSelected)}
                    aria-selected={isSelected}
                    data-checked={isSelected || undefined}
                    onSelect={() => {
                      toggle(option.value)
                    }}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border-strong',
                        isSelected && 'border-primary bg-primary text-primary-foreground',
                      )}
                    >
                      {isSelected && <CheckIcon className="size-3 text-primary-foreground" />}
                    </span>
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
          {/* Outside the listbox: only options belong inside it. */}
          <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5 text-[12px] text-muted-foreground">
            <span role="status" aria-live="polite" className="font-mono">
              {t.selected(formatNumber(current.length), current.length)}
              {maxSelected !== undefined && full && (
                <span className="ml-1.5">{t.max(formatNumber(maxSelected))}</span>
              )}
            </span>
            <span className="flex gap-1">
              {maxSelected === undefined && current.length < selectable.length && (
                <button
                  type="button"
                  className="cursor-pointer rounded-sm px-1.5 py-1 text-primary-text outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
                  onClick={() => {
                    commit(selectable.map((o) => o.value))
                  }}
                >
                  {t.selectAll}
                </button>
              )}
              {current.length > 0 && (
                <button
                  type="button"
                  className="cursor-pointer rounded-sm px-1.5 py-1 text-primary-text outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
                  onClick={() => {
                    commit([])
                  }}
                >
                  {t.clear}
                </button>
              )}
            </span>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { MultiSelect, type MultiSelectOption }
