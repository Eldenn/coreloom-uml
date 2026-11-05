'use client'

// Coreloom UI — ColorPicker. A colour as "#rrggbb": picked from swatches, typed as a hex code, or
// chosen in the system's own colour dialog. For labels, tags, calendars and brand settings. The
// swatches are the app's data (a label palette), not theme tokens: pass your own.
import { CheckIcon } from 'lucide-react'
import * as React from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface ColorSwatch {
  /** "#rrggbb". */
  value: string
  /** The colour's name, read to screen readers ("Ocean"). */
  label: string
}

// A default label palette: twelve hues, mid-light so white and black text both stay legible on
// most of them. Apps usually pass their own.
const defaultSwatches: ColorSwatch[] = [
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#84cc16', label: 'Lime' },
  { value: '#22c55e', label: 'Green' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#6366f1', label: 'Indigo' },
  { value: '#a855f7', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
]

/** "#ABC", "abc", "#aabbcc" → "#aabbcc"; undefined when it isn't a hex colour. */
function normalizeHex(text: string): string | undefined {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(text.trim())
  if (!m?.[1]) return undefined
  const hex = m[1].toLowerCase()
  return `#${hex.length === 3 ? Array.from(hex, (c) => c + c).join('') : hex}`
}

function ColorPicker({
  value,
  defaultValue = '#3b82f6',
  onValueChange,
  swatches = defaultSwatches,
  allowCustom = true,
  disabled,
  id,
  className,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  /** "#rrggbb". */
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  swatches?: ColorSwatch[]
  /** Also offer a hex field and the system colour dialog (default true). Off: swatches only. */
  allowCustom?: boolean
  disabled?: boolean
  /** Goes on the trigger, so a FieldLabel names it. */
  id?: string
  className?: string
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const t = useCoreloomI18n().messages.inputs.color
  const [inner, setInner] = React.useState(defaultValue)
  const current = normalizeHex(value ?? inner) ?? '#000000'
  const [open, setOpen] = React.useState(false)
  const [hexText, setHexText] = React.useState(current.slice(1))
  const [hexInvalid, setHexInvalid] = React.useState(false)
  const radioNameId = React.useId()
  const hexId = React.useId()
  const valueId = React.useId()
  const named = swatches.find((s) => s.value.toLowerCase() === current)

  const set = (next: string) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setHexText(current.slice(1))
          setHexInvalid(false)
        }
      }}
    >
      <PopoverTrigger asChild>
        {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- the trigger stands in for the field's control; aria-invalid drives its error styling. */}
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          // A label names the button; the colour itself is read as its description.
          aria-describedby={[valueId, ariaDescribedBy].filter(Boolean).join(' ')}
          aria-invalid={ariaInvalid}
          data-slot="color-picker-trigger"
          className={cn(
            'flex h-[42px] w-full cursor-pointer items-center gap-2.5 rounded-md border border-input bg-inset px-[13px] text-left font-sans text-[14px] text-foreground transition-[border-color,box-shadow] duration-base ease-out outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-expanded:border-primary aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive-subtle',
            className,
          )}
        >
          <span
            aria-hidden
            className="size-5 shrink-0 rounded-sm border border-border-strong"
            style={{ backgroundColor: current }}
          />
          <span
            id={valueId}
            className="ml-auto font-mono text-[13px] text-muted-foreground uppercase"
          >
            {named ? `${named.label}, ${current}` : current}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-64 flex-col gap-3 p-3">
        <div
          role="radiogroup"
          aria-label={t.swatches}
          data-slot="color-picker-swatches"
          className="grid grid-cols-6 gap-1.5"
        >
          {swatches.map((s) => {
            const checked = s.value.toLowerCase() === current
            return (
              <label
                key={s.value}
                title={s.label}
                className="relative flex aspect-square cursor-pointer items-center justify-center rounded-sm border border-border-strong has-focus-visible:ring-[3px] has-focus-visible:ring-ring"
                style={{ backgroundColor: s.value }}
              >
                <input
                  type="radio"
                  name={radioNameId}
                  value={s.value}
                  checked={checked}
                  aria-label={s.label}
                  className="absolute inset-0 m-0 cursor-pointer appearance-none opacity-0"
                  onChange={() => {
                    set(s.value.toLowerCase())
                    setHexText(s.value.slice(1))
                  }}
                />
                {checked && (
                  // A dark tick on a light ring reads on any swatch colour.
                  <span className="flex size-5 items-center justify-center rounded-full bg-background/85 text-foreground">
                    <CheckIcon aria-hidden className="size-3.5" />
                  </span>
                )}
              </label>
            )
          })}
        </div>
        {allowCustom && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <label htmlFor={hexId} className="sr-only">
                {t.hex}
              </label>
              <div className="flex h-9 min-w-0 flex-1 items-center rounded-md border border-input bg-inset font-mono text-[13px] focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring has-[[aria-invalid=true]]:border-destructive">
                <span aria-hidden className="pl-2.5 text-muted-foreground">
                  #
                </span>
                <input
                  id={hexId}
                  value={hexText}
                  maxLength={7}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={hexInvalid}
                  aria-describedby={hexInvalid ? `${hexId}-error` : undefined}
                  className="h-full min-w-0 flex-1 bg-transparent px-1 text-foreground uppercase outline-none"
                  onChange={(e) => {
                    setHexText(e.target.value.replace(/^#/, ''))
                    const hex = normalizeHex(e.target.value)
                    if (hex && e.target.value.replace(/^#/, '').length === 6) {
                      setHexInvalid(false)
                      set(hex)
                    }
                  }}
                  onBlur={() => {
                    const hex = normalizeHex(hexText)
                    setHexInvalid(!hex)
                    if (hex) {
                      set(hex)
                      setHexText(hex.slice(1))
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.currentTarget.blur()
                    }
                  }}
                />
              </div>
              {/* The system colour dialog, for any colour. */}
              <label className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-secondary has-focus-visible:ring-[3px] has-focus-visible:ring-ring">
                <span
                  aria-hidden
                  className="size-5 rounded-full border border-border-strong bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]"
                />
                <input
                  type="color"
                  value={current}
                  aria-label={t.custom}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  onChange={(e) => {
                    set(e.target.value.toLowerCase())
                    setHexText(e.target.value.slice(1))
                    setHexInvalid(false)
                  }}
                />
              </label>
            </div>
            {hexInvalid && (
              <p id={`${hexId}-error`} className="m-0 text-[11px] text-destructive">
                {t.invalid}
              </p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export { ColorPicker, type ColorSwatch, defaultSwatches, normalizeHex }
