import { CheckIcon, ChevronDownIcon } from 'lucide-react'
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

interface PhoneCountry {
  /** ISO 3166-1 alpha-2. */
  code: string
  /** Calling code without "+". */
  dial: string
  /** National number length, without the trunk prefix: [min, max]. */
  length: [number, number]
  /** Digit groups for display ("06 12 34 56 78" → [2, 2, 2, 2, 2] with the 0). */
  groups?: number[]
  /** Dialled before national numbers at home and dropped abroad ("0" in France). */
  trunk?: string
}

const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: 'FR', dial: '33', length: [9, 9], groups: [1, 2, 2, 2, 2], trunk: '0' },
  { code: 'BE', dial: '32', length: [8, 9], groups: [3, 2, 2, 2], trunk: '0' },
  { code: 'CH', dial: '41', length: [9, 9], groups: [2, 3, 2, 2], trunk: '0' },
  { code: 'LU', dial: '352', length: [6, 9], groups: [3, 3, 3] },
  { code: 'MC', dial: '377', length: [8, 9], groups: [2, 2, 2, 2] },
  { code: 'DE', dial: '49', length: [6, 11], groups: [4, 7], trunk: '0' },
  { code: 'ES', dial: '34', length: [9, 9], groups: [3, 3, 3] },
  { code: 'IT', dial: '39', length: [6, 11], groups: [3, 3, 4] },
  { code: 'PT', dial: '351', length: [9, 9], groups: [3, 3, 3] },
  { code: 'NL', dial: '31', length: [9, 9], groups: [1, 8], trunk: '0' },
  { code: 'GB', dial: '44', length: [9, 10], groups: [4, 6], trunk: '0' },
  { code: 'IE', dial: '353', length: [7, 9], groups: [2, 3, 4], trunk: '0' },
  { code: 'AT', dial: '43', length: [4, 13], groups: [3, 7], trunk: '0' },
  { code: 'SE', dial: '46', length: [7, 9], groups: [2, 3, 2, 2], trunk: '0' },
  { code: 'NO', dial: '47', length: [8, 8], groups: [3, 2, 3] },
  { code: 'DK', dial: '45', length: [8, 8], groups: [2, 2, 2, 2] },
  { code: 'FI', dial: '358', length: [5, 12], groups: [2, 3, 4], trunk: '0' },
  { code: 'PL', dial: '48', length: [9, 9], groups: [3, 3, 3] },
  { code: 'GR', dial: '30', length: [10, 10], groups: [3, 3, 4] },
  { code: 'US', dial: '1', length: [10, 10], groups: [3, 3, 4] },
  { code: 'CA', dial: '1', length: [10, 10], groups: [3, 3, 4] },
  { code: 'MX', dial: '52', length: [10, 10], groups: [2, 4, 4] },
  { code: 'BR', dial: '55', length: [10, 11], groups: [2, 5, 4] },
  { code: 'AR', dial: '54', length: [10, 11], groups: [2, 4, 4] },
  { code: 'MA', dial: '212', length: [9, 9], groups: [1, 2, 2, 2, 2], trunk: '0' },
  { code: 'DZ', dial: '213', length: [8, 9], groups: [1, 2, 2, 2, 2], trunk: '0' },
  { code: 'TN', dial: '216', length: [8, 8], groups: [2, 3, 3] },
  { code: 'SN', dial: '221', length: [9, 9], groups: [2, 3, 2, 2] },
  { code: 'CI', dial: '225', length: [10, 10], groups: [2, 2, 2, 2, 2] },
  { code: 'CM', dial: '237', length: [9, 9], groups: [1, 2, 2, 2, 2] },
  { code: 'ZA', dial: '27', length: [9, 9], groups: [2, 3, 4], trunk: '0' },
  { code: 'IN', dial: '91', length: [10, 10], groups: [5, 5], trunk: '0' },
  { code: 'CN', dial: '86', length: [11, 11], groups: [3, 4, 4], trunk: '0' },
  { code: 'JP', dial: '81', length: [9, 10], groups: [2, 4, 4], trunk: '0' },
  { code: 'KR', dial: '82', length: [9, 10], groups: [2, 4, 4], trunk: '0' },
  { code: 'SG', dial: '65', length: [8, 8], groups: [4, 4] },
  { code: 'AU', dial: '61', length: [9, 9], groups: [1, 4, 4], trunk: '0' },
  { code: 'NZ', dial: '64', length: [8, 10], groups: [2, 3, 4], trunk: '0' },
  { code: 'AE', dial: '971', length: [8, 9], groups: [2, 3, 4], trunk: '0' },
  { code: 'IL', dial: '972', length: [8, 9], groups: [2, 3, 4], trunk: '0' },
]

const digits = (s: string) => s.replace(/\D/g, '')

/** Splits "+33612345678" into its country and national number. `prefer` breaks ties (+1 → US / CA). */
function parsePhone(value: string, prefer?: string): { country?: PhoneCountry; national: string } {
  if (!value.startsWith('+')) return { national: digits(value) }
  const all = digits(value)
  const matches = PHONE_COUNTRIES.filter((c) => all.startsWith(c.dial)).sort(
    (a, b) => b.dial.length - a.dial.length,
  )
  // undefined when no known country code matches.
  const first = matches.at(0)
  const country = matches.find((c) => c.code === prefer && c.dial === first?.dial) ?? first
  return { country, national: country ? all.slice(country.dial.length) : all }
}

/** true when an E.164 value has a known country and a national number of a valid length. */
function isValidPhone(value: string) {
  const { country, national } = parsePhone(value)
  return !!country && national.length >= country.length[0] && national.length <= country.length[1]
}

/** "612345678" in France → "06 12 34 56 78". */
function formatNational(national: string, country: PhoneCountry) {
  const withTrunk = country.trunk && national ? country.trunk + national : national
  const groups = country.groups ?? [3, 3, 3, 3, 3]
  // Groups describe the number with its trunk prefix, as people write it at home.
  const sizes = country.trunk ? [groups[0] + 1, ...groups.slice(1)] : groups
  const out: string[] = []
  let i = 0
  for (const size of sizes) {
    if (i >= withTrunk.length) break
    out.push(withTrunk.slice(i, i + size))
    i += size
  }
  if (i < withTrunk.length) out.push(withTrunk.slice(i))
  return out.join(' ')
}

function PhoneInput({
  value,
  defaultValue = '',
  onValueChange,
  defaultCountry = 'FR',
  countries = PHONE_COUNTRIES,
  placeholder,
  disabled,
  className,
  id,
  name,
  onBlur,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: {
  /** E.164 ("+33612345678"), or "". */
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** ISO code used until the value or the user picks another. */
  defaultCountry?: string
  countries?: PhoneCountry[]
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Goes on the number input, so a FieldLabel points at it. */
  id?: string
  name?: string
  onBlur?: () => void
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-label'?: string
  'aria-describedby'?: string
}) {
  const i18n = useCoreloomI18n()
  const t = i18n.messages.phone
  const regionNames = React.useMemo(
    () => new Intl.DisplayNames(i18n.locale, { type: 'region' }),
    [i18n.locale],
  )
  const [inner, setInner] = React.useState(defaultValue)
  const current = value ?? inner
  const [picked, setPicked] = React.useState(
    () => parsePhone(current, defaultCountry).country?.code ?? defaultCountry,
  )
  const parsed = parsePhone(current, picked)
  const country = countries.find((c) => c.code === (parsed.country?.code ?? picked)) ?? countries[0]
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState(() =>
    parsed.national ? formatNational(parsed.national, country) : '',
  )
  const [focused, setFocused] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the draft text from the value while the field isn't focused.
    if (!focused) setText(parsed.national ? formatNational(parsed.national, country) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parsed and country derive from current and country.code.
  }, [current, country.code])

  const commit = (next: string) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }
  const toE164 = (national: string, c: PhoneCountry) => {
    let n = digits(national)
    if (c.trunk && n.startsWith(c.trunk)) n = n.slice(c.trunk.length)
    return n ? `+${c.dial}${n}` : ''
  }

  const sorted = React.useMemo(
    () =>
      [...countries].sort((a, b) =>
        (regionNames.of(a.code) ?? a.code).localeCompare(
          regionNames.of(b.code) ?? b.code,
          i18n.locale,
        ),
      ),
    [countries, regionNames, i18n.locale],
  )

  return (
    <div
      data-slot="phone-input"
      data-disabled={disabled ? true : undefined}
      className={cn(
        'flex h-[42px] w-full items-stretch rounded-md border border-input bg-inset font-sans text-[14px] transition-[border-color,box-shadow] duration-base ease-out focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-[3px] has-[[aria-invalid=true]]:ring-destructive-subtle data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55',
        className,
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`${t.country}: ${regionNames.of(country.code) ?? country.code} (+${country.dial})`}
            data-slot="phone-input-country"
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-l-md border-r border-input pr-2 pl-[13px] font-mono text-[13px] text-foreground outline-none focus-visible:bg-accent disabled:cursor-not-allowed"
          >
            <span>{country.code}</span>
            <span className="text-muted-foreground">+{country.dial}</span>
            <ChevronDownIcon className="size-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandInput placeholder={t.searchCountry} />
            <CommandList>
              <CommandEmpty>{i18n.messages.combobox.empty}</CommandEmpty>
              <CommandGroup>
                {sorted.map((c) => {
                  const label = regionNames.of(c.code) ?? c.code
                  return (
                    <CommandItem
                      key={c.code}
                      value={c.code}
                      keywords={[label, `+${c.dial}`, c.dial]}
                      onSelect={() => {
                        setPicked(c.code)
                        setOpen(false)
                        commit(toE164(text, c))
                        requestAnimationFrame(() => inputRef.current?.focus())
                      }}
                    >
                      <span className="w-7 font-mono text-[12px] text-muted-foreground">
                        {c.code}
                      </span>
                      <span className="truncate">{label}</span>
                      <span className="ml-auto font-mono text-[12px] text-muted-foreground">
                        +{c.dial}
                      </span>
                      <CheckIcon
                        className={cn(
                          'text-primary',
                          c.code === country.code ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={text}
        placeholder={
          placeholder ?? formatNational('612345678901234'.slice(0, country.length[0]), country)
        }
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        className="h-full min-w-0 flex-1 bg-transparent px-[13px] font-mono text-foreground tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        onFocus={() => {
          setFocused(true)
        }}
        onChange={(e) => {
          const raw = e.target.value
          // A pasted international number ("+44 20 7946 0958") picks its country.
          if (raw.trim().startsWith('+') || raw.trim().startsWith('00')) {
            const international = raw.trim().startsWith('00') ? `+${digits(raw).slice(2)}` : raw
            const found = parsePhone(international, picked)
            if (found.country) {
              setPicked(found.country.code)
              setText(formatNational(found.national, found.country))
              commit(`+${found.country.dial}${found.national}`)
              return
            }
          }
          setText(raw.replace(/[^\d\s().-]/g, ''))
          commit(toE164(raw, country))
        }}
        onBlur={() => {
          setFocused(false)
          const n = parsePhone(current, country.code).national
          setText(n ? formatNational(n, country) : '')
          onBlur?.()
        }}
      />
    </div>
  )
}

export { isValidPhone, parsePhone, PHONE_COUNTRIES, type PhoneCountry, PhoneInput }
