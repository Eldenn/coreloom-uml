'use client'

// Coreloom UI — Combobox. A searchable Select, composed from Popover + Command (Radix + cmdk),
// following shadcn's combobox pattern. Single value; for several, compose the same parts.
// With `clearable`, a × button next to the chevron empties it (to ""). With `onCreate`, a search
// that matches no option offers "Create “…”" (tags, categories, a new contact).
import { CheckIcon, ChevronsUpDownIcon, PlusIcon, XIcon } from 'lucide-react'
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

interface ComboboxOption {
  value: string
  label: string
  /** Shown before the label (a Lucide icon, an Avatar…). */
  icon?: React.ReactNode
  /** Extra words the search should match. */
  keywords?: string[]
  disabled?: boolean
}

function Combobox({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled,
  className,
  contentClassName,
  id,
  clearable = false,
  onCreate,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
}: {
  options: ComboboxOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: React.ReactNode
  disabled?: boolean
  className?: string
  contentClassName?: string
  id?: string
  /** Shows a clear button once something is picked; clearing sends "". With it, `className`
   *  goes on a wrapper around the trigger and the button. */
  clearable?: boolean
  /** Offers to create the searched text when no option matches it. Add the option to `options`
   *  and return its value (or nothing: the text itself becomes the value). */
  onCreate?: (label: string) => string | undefined
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-label'?: string
}) {
  const t = useCoreloomI18n().messages
  placeholder ??= t.combobox.placeholder
  searchPlaceholder ??= t.combobox.search
  emptyText ??= t.combobox.empty
  const [open, setOpen] = React.useState(false)
  const [inner, setInner] = React.useState(defaultValue ?? '')
  const current = value ?? inner
  const selected = options.find((o) => o.value === current)
  const [search, setSearch] = React.useState('')
  const query = search.trim()
  const canCreate =
    onCreate !== undefined &&
    query !== '' &&
    !options.some((o) => o.label.toLowerCase() === query.toLowerCase())

  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const pick = (next: string) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
    setOpen(false)
  }

  const popover = (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          // eslint-disable-next-line jsx-a11y/role-has-required-aria-props -- aria-controls is added by PopoverTrigger.
          role="combobox"
          id={id}
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          disabled={disabled}
          data-slot="combobox-trigger"
          data-placeholder={current ? undefined : ''}
          className={cn(
            "flex h-[42px] w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-inset px-[13px] font-sans text-[14px] whitespace-nowrap text-foreground transition-[border-color,box-shadow] duration-base ease-out outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-expanded:border-primary aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive-subtle aria-invalid:focus-visible:ring-destructive/70 data-[placeholder]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
            !clearable && className,
          )}
        >
          <span
            className={cn(
              'flex min-w-0 items-center gap-2 truncate',
              clearable && selected && 'mr-7',
            )}
          >
            {selected?.icon}
            {selected ? selected.label : current || placeholder}
          </span>
          <ChevronsUpDownIcon className="text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn('w-(--radix-popover-trigger-width) min-w-56 p-0', contentClassName)}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            {!canCreate && <CommandEmpty>{emptyText}</CommandEmpty>}
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label, ...(option.keywords ?? [])]}
                  disabled={option.disabled}
                  onSelect={() => {
                    pick(option.value)
                  }}
                >
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                  <CheckIcon
                    className={cn(
                      'ml-auto text-primary',
                      option.value === current ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
            {/* Outside the group: cmdk hides a group whose items all filter out. */}
            {canCreate && (
              <CommandItem
                forceMount
                value={`create:${query}`}
                onSelect={() => {
                  const created = onCreate(query)
                  pick(typeof created === 'string' ? created : query)
                  setSearch('')
                }}
              >
                <PlusIcon className="text-muted-foreground" />
                <span className="truncate">{t.inputs.create(query)}</span>
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
  if (!clearable) return popover
  return (
    <div data-slot="combobox" className={cn('relative w-full', className)}>
      {popover}
      {selected && !disabled && (
        <button
          type="button"
          aria-label={`${t.inputs.clear} ${selected.label}`}
          data-slot="combobox-clear"
          className="absolute top-1/2 right-9 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring [&_svg]:size-3.5"
          onClick={() => {
            pick('')
            // The button goes away with the value; keep focus on the field.
            triggerRef.current?.focus()
          }}
        >
          <XIcon />
        </button>
      )}
    </div>
  )
}

export { Combobox, type ComboboxOption }
