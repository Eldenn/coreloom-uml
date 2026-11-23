'use client'

// Coreloom UI — MaskedInput. A field that groups what people type the way the number is printed:
// "FR76 3000 6000 0112 3456 7890 189", "4970 1012 3456 7890", "123 456 789 00012". People type or
// paste with or without spaces; the value sent is the raw characters ("FR7630006000…"). Presets
// check the number too (IBAN mod 97, Luhn for cards, SIREN and SIRET). A mask is a pattern where
// 9 is a digit, a a letter, * a letter or digit, and anything else is printed as is.
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** A pattern ("9999 9999") or a function of the raw value returning one (for variable lengths). */
type Mask = string | ((raw: string) => string)

const SLOTS: Partial<Record<string, RegExp>> = { '9': /\d/, a: /[A-Za-z]/, '*': /[A-Za-z\d]/ }

/**
 * Fits typed text into a mask. Characters that don't fit their slot are dropped, letters are
 * upper-cased, and separators appear only between characters (never trailing).
 */
function applyMask(text: string, mask: Mask): { formatted: string; raw: string } {
  const chars = Array.from(text.toUpperCase()).filter((c) => /[A-Z\d]/.test(c))
  const pattern = typeof mask === 'function' ? mask(chars.join('')) : mask
  let formatted = ''
  let raw = ''
  let pending = ''
  let i = 0
  for (const slot of pattern) {
    if (i >= chars.length) break
    const test = SLOTS[slot]
    if (!test) {
      pending += slot
      continue
    }
    // Skip what can't go in this slot (a letter where a digit is expected).
    while (i < chars.length && !test.test(chars.at(i) ?? '')) i++
    const c = chars.at(i)
    if (c === undefined) break
    formatted += pending + c
    raw += c
    pending = ''
    i++
  }
  return { formatted, raw }
}

/** How many slots a mask has for this raw value: the length of a complete value. */
function maskLength(mask: Mask, raw = '') {
  const pattern = typeof mask === 'function' ? mask(raw) : mask
  return Array.from(pattern).filter((c) => c in SLOTS).length
}

/** Luhn checksum (cards, SIREN, SIRET). */
function isValidLuhn(digits: string) {
  if (!/^\d+$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

/** IBAN length per country (ISO 13616); unknown countries only get the mod-97 check. */
const IBAN_LENGTHS: Partial<Record<string, number>> = {
  AD: 24,
  AT: 20,
  BE: 16,
  BG: 22,
  CH: 21,
  CY: 28,
  CZ: 24,
  DE: 22,
  DK: 18,
  EE: 20,
  ES: 24,
  FI: 18,
  FR: 27,
  GB: 22,
  GR: 27,
  HR: 21,
  HU: 28,
  IE: 22,
  IS: 26,
  IT: 27,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  MC: 27,
  MT: 31,
  NL: 18,
  NO: 15,
  PL: 28,
  PT: 25,
  RO: 24,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
}

/** An IBAN's country length and mod-97 check ("FR7630006000011234567890189"). */
function isValidIban(raw: string) {
  const s = raw.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z\d]{10,30}$/.test(s)) return false
  const length = IBAN_LENGTHS[s.slice(0, 2)]
  if (length !== undefined && s.length !== length) return false
  const moved = s.slice(4) + s.slice(0, 4)
  let rest = 0
  for (const c of moved) {
    const n = /\d/.test(c) ? c : String(c.charCodeAt(0) - 55)
    for (const d of n) rest = (rest * 10 + Number(d)) % 97
  }
  return rest === 1
}

interface MaskPreset {
  mask: Mask
  validate?: (raw: string) => boolean
  inputMode: 'numeric' | 'text'
  autoComplete?: string
  placeholder?: string
}

const maskPresets = {
  /** Groups of four, as long as the country's IBAN (34 at most). */
  iban: {
    mask: (raw: string) => {
      const length = IBAN_LENGTHS[raw.slice(0, 2)] ?? 34
      return `aa99${'*'.repeat(length - 4)}`.replace(/(.{4})(?=.)/g, '$1 ')
    },
    validate: isValidIban,
    inputMode: 'text',
    autoComplete: 'off',
    placeholder: 'FR76 3000 6000 0112 3456 7890 189',
  },
  card: {
    mask: '9999 9999 9999 9999',
    validate: isValidLuhn,
    inputMode: 'numeric',
    autoComplete: 'cc-number',
    placeholder: '1234 5678 9012 3456',
  },
  siren: {
    mask: '999 999 999',
    validate: isValidLuhn,
    inputMode: 'numeric',
    placeholder: '123 456 789',
  },
  siret: {
    mask: '999 999 999 99999',
    validate: isValidLuhn,
    inputMode: 'numeric',
    placeholder: '123 456 789 00012',
  },
} satisfies Record<string, MaskPreset>

/** Where the caret goes after formatting: after the same number of typed characters. */
function caretAfter(formatted: string, count: number) {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    if (/[A-Za-z\d]/.test(formatted[i] ?? '')) seen++
    if (seen === count) return i + 1
  }
  return formatted.length
}

function MaskedInput({
  preset,
  mask,
  validate,
  value,
  defaultValue = '',
  onValueChange,
  invalidMessage,
  className,
  placeholder,
  inputMode,
  autoComplete,
  onBlur,
  onChange,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  ...props
}: Omit<
  React.ComponentProps<'input'>,
  'value' | 'defaultValue' | 'type' | 'onBlur' | 'aria-invalid'
> & {
  /** A ready-made mask and check: "iban", "card", "siren", "siret". */
  preset?: keyof typeof maskPresets
  /** Your own mask (overrides the preset's). */
  mask?: Mask
  /** Checks a complete value; a failed check marks the field invalid on blur. */
  validate?: (raw: string) => boolean
  /** The raw characters, without separators. */
  value?: string
  defaultValue?: string
  /** Raw value, the printed form, and whether every slot is filled and the check passes. */
  onValueChange?: (raw: string, details: { formatted: string; complete: boolean }) => void
  /** Shown under the field when the check fails; defaults to the i18n text. */
  invalidMessage?: string
  onBlur?: () => void
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const t = useCoreloomI18n().messages.inputs.masked
  const p: MaskPreset | undefined = preset ? maskPresets[preset] : undefined
  const theMask: Mask = mask ?? p?.mask ?? ''
  const check = validate ?? p?.validate
  const [inner, setInner] = React.useState(defaultValue)
  const raw = value ?? inner
  const { formatted } = applyMask(raw, theMask)
  const [failed, setFailed] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const caret = React.useRef<number | null>(null)
  const hintId = React.useId()

  React.useLayoutEffect(() => {
    if (caret.current === null || document.activeElement !== inputRef.current) return
    inputRef.current?.setSelectionRange(caret.current, caret.current)
    caret.current = null
  })

  const isComplete = (r: string) => r.length === maskLength(theMask, r) && (check ? check(r) : true)

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <input
        ref={inputRef}
        type="text"
        value={formatted}
        placeholder={placeholder ?? p?.placeholder}
        inputMode={inputMode ?? p?.inputMode}
        autoComplete={autoComplete ?? p?.autoComplete}
        spellCheck={false}
        aria-invalid={failed || ariaInvalid}
        aria-describedby={
          [failed ? hintId : undefined, ariaDescribedBy].filter(Boolean).join(' ') || undefined
        }
        data-slot="masked-input"
        className="h-[42px] w-full min-w-0 rounded-md border border-input bg-inset px-[13px] font-mono text-[14px] text-foreground tabular-nums transition-[border-color,box-shadow] duration-base ease-out outline-none selection:bg-primary-subtle placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive-subtle aria-invalid:focus-visible:ring-destructive/70"
        onChange={(e) => {
          onChange?.(e)
          const typed = e.target.value
          const before = typed
            .slice(0, e.target.selectionStart ?? typed.length)
            .replace(/[^A-Za-z\d]/g, '').length
          const next = applyMask(typed, theMask)
          caret.current = caretAfter(next.formatted, before)
          if (value === undefined) setInner(next.raw)
          if (failed && isComplete(next.raw)) setFailed(false)
          onValueChange?.(next.raw, { formatted: next.formatted, complete: isComplete(next.raw) })
        }}
        onBlur={() => {
          // Only a value someone finished typing is checked; an empty one is the form's business.
          setFailed(raw !== '' && !isComplete(raw))
          onBlur?.()
        }}
        {...props}
      />
      {failed && (
        <p id={hintId} data-slot="masked-input-hint" className="m-0 text-[11px] text-destructive">
          {invalidMessage ?? t.invalid}
        </p>
      )}
    </div>
  )
}

export {
  applyMask,
  isValidIban,
  isValidLuhn,
  type Mask,
  MaskedInput,
  maskLength,
  type MaskPreset,
  maskPresets,
}
