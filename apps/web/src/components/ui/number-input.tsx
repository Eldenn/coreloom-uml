'use client'

// Coreloom UI — NumberInput. A number typed the way the reader writes it ("1 234,5" in French,
// "1,234.5" in English), with − / + buttons and the keyboard of a spin button: arrows step,
// Page Up / Page Down take big steps, Home / End jump to the bounds. The value is a number, or null
// when empty. Units, percents and other displays come from `formatOptions` (Intl.NumberFormat).
// For amounts of money, use MoneyInput.
import { ChevronDownIcon, ChevronUpIcon, MinusIcon, PlusIcon } from 'lucide-react'
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type NumberFormatOptions = Omit<Intl.NumberFormatOptions, 'style' | 'currency'> & {
  style?: 'decimal' | 'percent' | 'unit'
}

/** The locale's decimal and grouping characters. */
function separators(locale: string) {
  const parts = new Intl.NumberFormat(locale).formatToParts(-12345.6)
  return {
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
  }
}

/**
 * Reads "1 234,5", "1,234.5", "1234.5", "-12", "45 %" or "12 kg" in the given locale; null when it
 * isn't a number. Units and symbols around the digits are ignored. With `percent`, "45 %" is 0.45.
 */
function parseNumber(text: string, locale = 'en', { percent = false } = {}): number | null {
  const { decimal, group } = separators(locale)
  let s = text.trim().replace(/[\s\u00a0\u202f]/g, '')
  // A minus sign may be the typographic one (U+2212), as some locales format it.
  s = s.replace(/−/g, '-')
  if (group.trim()) s = s.split(group).join('')
  if (decimal !== '.') s = s.replace(decimal, '.')
  // Drop a unit or symbol around the number ("kg", "%", "km/h"), but not letters inside it.
  s = s.replace(/^[^\d.-]+/, '').replace(/[^\d.]+$/, '')
  if (!s || !/^-?\d*\.?\d*$/.test(s) || s === '-' || s === '.' || s === '-.') return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return percent ? n / 100 : n
}

/** Decimals in a step: 0.25 → 2, 1 → 0, 1e-3 → 3. */
function decimalsOf(n: number) {
  if (!Number.isFinite(n)) return 0
  const [mantissa = '', exponent] = n.toString().split('e-')
  const fraction = mantissa.split('.')[1]?.length ?? 0
  return fraction + (exponent ? Number(exponent) : 0)
}

/** Adds `delta` steps to `value`, without floating-point noise (0.1 + 0.2 stays 0.3), clamped. */
function stepNumber(
  value: number | null,
  delta: number,
  { step = 1, min, max }: { step?: number; min?: number; max?: number } = {},
): number {
  const base = value ?? (delta > 0 ? (min ?? 0) - step : (max ?? 0) + step)
  const digits = Math.max(decimalsOf(step), decimalsOf(base))
  const next = Number((base + delta * step).toFixed(Math.min(digits, 20)))
  return clamp(next, min, max)
}

function clamp(n: number, min?: number, max?: number) {
  if (min !== undefined && n < min) return min
  if (max !== undefined && n > max) return max
  return n
}

function NumberInput({
  value,
  defaultValue = null,
  onValueChange,
  min,
  max,
  step = 1,
  largeStep,
  formatOptions,
  locale,
  stepper = 'end',
  placeholder,
  disabled,
  readOnly,
  className,
  id,
  name,
  onBlur,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: {
  value?: number | null
  defaultValue?: number | null
  onValueChange?: (value: number | null) => void
  /** Clamped on blur and when stepping. */
  min?: number
  max?: number
  /** What the arrows and buttons add (default 1). Its decimals set the precision of stepping. */
  step?: number
  /** What Page Up / Page Down add (default 10 × step). */
  largeStep?: number
  /** How the number is shown: `{ style: "percent" }`, `{ style: "unit", unit: "kilogram" }`,
   *  `{ maximumFractionDigits: 2 }`… With percent, the value is a fraction (0.45 shows "45 %"). */
  formatOptions?: NumberFormatOptions
  /** Number format; defaults to the i18n locale. */
  locale?: string
  /** Where the − / + buttons go: stacked at the end (default), on both sides, or none. */
  stepper?: 'end' | 'sides' | 'none'
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  className?: string
  id?: string
  name?: string
  onBlur?: () => void
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
}) {
  const i18n = useCoreloomI18n()
  const t = i18n.messages.inputs
  locale ??= i18n.locale
  const percent = formatOptions?.style === 'percent'
  const format = React.useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 20, ...formatOptions }),
    [locale, formatOptions],
  )
  const fractionLimit = format.resolvedOptions().maximumFractionDigits ?? 20
  const [inner, setInner] = React.useState<number | null>(defaultValue)
  const current = value !== undefined ? value : inner
  const display = (n: number | null) => (n === null ? '' : format.format(n))
  const [text, setText] = React.useState(() => display(current))
  // The latest text, for steps repeated by a held button (they run between renders).
  const draft = React.useRef(text)
  const setDraft = (next: string) => {
    draft.current = next
    setText(next)
  }
  const [focused, setFocused] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const fallbackId = React.useId()
  const inputId = id ?? fallbackId

  // Follow outside changes (a reset, a new locale) while the field isn't being typed in.
  React.useEffect(() => {
    if (!focused) setDraft(display(current))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- display() is recreated each render; format covers it.
  }, [current, format])

  const commit = (n: number | null) => {
    if (value === undefined) setInner(n)
    onValueChange?.(n)
  }
  const stepBy = (delta: number, size = step) => {
    if (disabled || readOnly) return
    const n = stepNumber(parseNumber(draft.current, locale, { percent }) ?? current, delta, {
      step: size,
      min,
      max,
    })
    commit(n)
    setDraft(display(n))
  }
  // Holding a button repeats the step: a pause, then about 15 steps a second.
  const repeat = React.useRef<{ timer?: ReturnType<typeof setTimeout>; stepped: boolean }>({
    stepped: false,
  })
  const stopRepeat = () => {
    clearTimeout(repeat.current.timer)
  }
  React.useEffect(() => stopRepeat, [])
  const atMin = current !== null && min !== undefined && current <= min
  const atMax = current !== null && max !== undefined && current >= max

  const button = (direction: 1 | -1, side: 'start' | 'end' | 'stack') => {
    const Icon =
      side === 'stack'
        ? direction > 0
          ? ChevronUpIcon
          : ChevronDownIcon
        : direction > 0
          ? PlusIcon
          : MinusIcon
    return (
      <button
        type="button"
        // The field's arrow keys do the same; one tab stop for the whole control (spin button pattern).
        tabIndex={-1}
        aria-label={direction > 0 ? t.increase : t.decrease}
        aria-controls={inputId}
        disabled={disabled === true || readOnly === true || (direction > 0 ? atMax : atMin)}
        data-slot={direction > 0 ? 'number-input-increment' : 'number-input-decrement'}
        onPointerDown={(e) => {
          // Keep focus (and the caret) in the field.
          e.preventDefault()
          inputRef.current?.focus()
          if (e.button !== 0) return
          stepBy(direction)
          repeat.current.stepped = true
          const again = (delay: number) => {
            repeat.current.timer = setTimeout(() => {
              stepBy(direction)
              again(65)
            }, delay)
          }
          again(400)
        }}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
        onPointerCancel={stopRepeat}
        onClick={() => {
          // A pointer press already stepped; a click without one (a screen reader's) steps here.
          if (repeat.current.stepped) repeat.current.stepped = false
          else stepBy(direction)
        }}
        className={cn(
          'flex shrink-0 cursor-pointer items-center justify-center text-muted-foreground outline-none hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:text-faint-foreground disabled:hover:bg-transparent [&_svg]:pointer-events-none',
          side === 'stack' ? 'h-1/2 w-7 [&_svg]:size-3.5' : 'h-full w-10 [&_svg]:size-4',
          side === 'start' && 'border-r border-border-subtle',
          side === 'end' && 'border-l border-border-subtle',
          side === 'stack' && direction > 0 && 'border-b border-border-subtle',
        )}
      >
        <Icon />
      </button>
    )
  }

  return (
    <div
      data-slot="number-input"
      data-disabled={disabled ? true : undefined}
      className={cn(
        'flex h-[42px] w-full items-stretch overflow-hidden rounded-md border border-input bg-inset font-sans text-[14px] transition-[border-color,box-shadow] duration-base ease-out focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-[3px] has-[[aria-invalid=true]]:ring-destructive-subtle data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55',
        className,
      )}
    >
      {stepper === 'sides' && button(-1, 'start')}
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="text"
        role="spinbutton"
        inputMode={step % 1 === 0 && !percent && (min ?? -1) >= 0 ? 'numeric' : 'decimal'}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-valuenow={current ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={current === null ? undefined : display(current)}
        className={cn(
          'h-full min-w-0 flex-1 bg-transparent px-[13px] font-mono text-foreground tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed',
          stepper === 'sides' ? 'text-center' : 'text-right',
        )}
        onFocus={() => {
          setFocused(true)
        }}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          const n = parseNumber(next, locale, { percent })
          if (n !== null || next.trim() === '') commit(n)
        }}
        onKeyDown={(e) => {
          const big = largeStep ?? step * 10
          const moves: Partial<Record<string, () => void>> = {
            ArrowUp: () => {
              stepBy(1, e.shiftKey ? big : step)
            },
            ArrowDown: () => {
              stepBy(-1, e.shiftKey ? big : step)
            },
            PageUp: () => {
              stepBy(1, big)
            },
            PageDown: () => {
              stepBy(-1, big)
            },
          }
          if (min !== undefined)
            moves.Home = () => {
              commit(min)
              setDraft(display(min))
            }
          if (max !== undefined)
            moves.End = () => {
              commit(max)
              setDraft(display(max))
            }
          const move = moves[e.key]
          if (move && !readOnly) {
            e.preventDefault()
            move()
          }
        }}
        onBlur={() => {
          setFocused(false)
          let n = parseNumber(text, locale, { percent })
          if (n !== null) {
            // Round to what the display can show, so the value never holds digits nobody sees.
            const digits = Math.min(fractionLimit + (percent ? 2 : 0), 20)
            n = clamp(Number(n.toFixed(digits)), min, max)
          }
          commit(n)
          setDraft(display(n))
          onBlur?.()
        }}
      />
      {stepper === 'sides' && button(1, 'end')}
      {stepper === 'end' && (
        <div className="flex w-7 shrink-0 flex-col border-l border-border-subtle">
          {button(1, 'stack')}
          {button(-1, 'stack')}
        </div>
      )}
    </div>
  )
}

export { type NumberFormatOptions, NumberInput, parseNumber, stepNumber }
