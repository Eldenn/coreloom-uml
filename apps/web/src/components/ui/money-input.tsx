import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** The locale's decimal and grouping characters, and where the currency symbol goes. */
function moneyFormat(locale: string, currency: string) {
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(
    -12345.6,
  )
  const symbolIndex = parts.findIndex((p) => p.type === 'currency')
  const numberIndex = parts.findIndex((p) => p.type === 'integer')
  const fraction =
    new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  return {
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
    symbol: parts[symbolIndex]?.value ?? currency,
    symbolFirst: symbolIndex < numberIndex,
    fraction,
  }
}

/** Reads "1 234,5", "1,234.50", "1234.5" or "-12" in the given locale; null when it isn't a number. */
function parseMoney(text: string, locale: string, currency = 'EUR'): number | null {
  const { decimal, group } = moneyFormat(locale, currency)
  let s = text.trim().replace(/[\s\u00a0\u202f]/g, '')
  if (!s) return null
  if (group.trim()) s = s.split(group).join('')
  // Accept "." as the decimal point too when the locale uses ",", unless it was a group separator.
  if (decimal !== '.') s = s.replace(decimal, '.')
  if (!/^-?\d*\.?\d*$/.test(s) || s === '-' || s === '.') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function MoneyInput({
  value,
  defaultValue = null,
  onValueChange,
  currency = 'EUR',
  locale,
  min,
  max,
  allowNegative = false,
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
  value?: number | null
  defaultValue?: number | null
  onValueChange?: (value: number | null) => void
  /** ISO 4217 code: "EUR", "USD", "JPY" (no decimals)… */
  currency?: string
  /** Number format; defaults to the i18n locale. */
  locale?: string
  /** Clamped on blur. */
  min?: number
  max?: number
  allowNegative?: boolean
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  name?: string
  onBlur?: () => void
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-label'?: string
  'aria-describedby'?: string
}) {
  const i18n = useCoreloomI18n()
  locale ??= i18n.locale
  const fmt = React.useMemo(() => moneyFormat(locale, currency), [locale, currency])
  const [inner, setInner] = React.useState<number | null>(defaultValue)
  const current = value !== undefined ? value : inner
  const display = (n: number | null) =>
    n === null
      ? ''
      : new Intl.NumberFormat(locale, {
          minimumFractionDigits: fmt.fraction,
          maximumFractionDigits: fmt.fraction,
        }).format(n)
  const [text, setText] = React.useState(() => display(current))
  const [focused, setFocused] = React.useState(false)
  const currencyId = React.useId()

  // Follow outside changes (a reset, a new locale) while the field isn't being typed in.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the draft text from the value while the field isn't focused.
    if (!focused) setText(display(current))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- display() is rebuilt each render from the locale and currency listed here.
  }, [current, locale, currency])

  const commit = (n: number | null) => {
    if (value === undefined) setInner(n)
    onValueChange?.(n)
  }

  return (
    <div
      data-slot="money-input"
      data-disabled={disabled ? true : undefined}
      className={cn(
        'flex h-[42px] w-full items-center gap-2 rounded-md border border-input bg-inset px-[13px] font-sans text-[14px] transition-[border-color,box-shadow] duration-base ease-out focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-[3px] has-[[aria-invalid=true]]:ring-destructive-subtle data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55',
        className,
      )}
    >
      {fmt.symbolFirst && (
        <span aria-hidden className="text-muted-foreground">
          {fmt.symbol}
        </span>
      )}
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        placeholder={placeholder ?? display(0)}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        // The symbol is decorative; the currency code is read out as part of the description.
        aria-describedby={[currencyId, ariaDescribedBy].filter(Boolean).join(' ')}
        data-currency={currency}
        className="h-full min-w-0 flex-1 bg-transparent text-right font-mono text-foreground tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        onFocus={() => {
          setFocused(true)
        }}
        onChange={(e) => {
          const next = allowNegative ? e.target.value : e.target.value.replace(/-/g, '')
          setText(next)
          const n = parseMoney(next, locale, currency)
          if (n !== null || next.trim() === '') commit(n)
        }}
        onBlur={() => {
          setFocused(false)
          let n = parseMoney(text, locale, currency)
          if (n !== null) {
            const factor = 10 ** fmt.fraction
            n = Math.round(n * factor) / factor
            if (min !== undefined) n = Math.max(min, n)
            if (max !== undefined) n = Math.min(max, n)
          }
          commit(n)
          setText(display(n))
          onBlur?.()
        }}
      />
      {!fmt.symbolFirst && (
        <span aria-hidden className="text-muted-foreground">
          {fmt.symbol}
        </span>
      )}
      <span id={currencyId} className="sr-only">
        {new Intl.DisplayNames(locale, { type: 'currency' }).of(currency) ?? currency}
      </span>
    </div>
  )
}

export { MoneyInput, parseMoney }
