import { BracesIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * Offset of the first character that breaks the JSON, found by a small scanner that follows the
 * grammar (engines word their errors differently, and some give no position at all).
 */
class JsonStop extends Error {
  constructor(readonly at: number) {
    super('JSON stops here')
  }
}

function jsonErrorOffset(text: string): number {
  let i = 0
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text.charAt(i))) i++
  }
  const fail = (): never => {
    throw new JsonStop(i)
  }
  const literal = (word: string) => {
    if (text.startsWith(word, i)) i += word.length
    else fail()
  }
  const string = () => {
    i++ // opening quote
    while (i < text.length) {
      const c = text.charAt(i)
      if (c === '"') {
        i++
        return
      }
      if (c < ' ') fail()
      if (c === '\\') {
        const e = text.charAt(i + 1)
        if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
            i += 2
            fail()
          }
          i += 6
        } else if ('"\\/bfnrt'.includes(e) && e !== '') i += 2
        else {
          i++
          fail()
        }
      } else i++
    }
    fail()
  }
  const number = () => {
    const match = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i))
    if (!match?.[0]) fail()
    i += match?.[0].length ?? 0
  }
  const value = (): void => {
    ws()
    const c = text.charAt(i)
    if (c === '{') {
      i++
      ws()
      if (text.charAt(i) === '}') {
        i++
        return
      }
      for (;;) {
        ws()
        if (text.charAt(i) !== '"') fail()
        string()
        ws()
        if (text.charAt(i) !== ':') fail()
        i++
        value()
        ws()
        if (text.charAt(i) === ',') i++
        else if (text.charAt(i) === '}') {
          i++
          return
        } else fail()
      }
    }
    if (c === '[') {
      i++
      ws()
      if (text.charAt(i) === ']') {
        i++
        return
      }
      for (;;) {
        value()
        ws()
        if (text.charAt(i) === ',') i++
        else if (text.charAt(i) === ']') {
          i++
          return
        } else fail()
      }
    }
    if (c === '"') string()
    else if (c === 't') literal('true')
    else if (c === 'f') literal('false')
    else if (c === 'n') literal('null')
    else number()
  }
  try {
    value()
    ws()
    if (i < text.length) fail()
  } catch (stop) {
    return stop instanceof JsonStop ? stop.at : i
  }
  return i
}

/** Where the JSON breaks, as line and column (1-based). */
function jsonErrorAt(text: string): { line: number; column: number } {
  const lines = text.slice(0, jsonErrorOffset(text)).split('\n')
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 }
}

/** Parses JSON: `{ ok: true, value }`, or `{ ok: false, at }` with where it broke. */
function parseJson(
  text: string,
): { ok: true; value: unknown } | { ok: false; at: { line: number; column: number } } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, at: jsonErrorAt(text) }
  }
}

function JsonInput({
  value,
  defaultValue = '',
  onValueChange,
  rows = 8,
  indent = 2,
  formatOnBlur = false,
  placeholder,
  disabled,
  readOnly,
  id,
  name,
  className,
  onBlur,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  value?: string
  defaultValue?: string
  /** The text, and the parsed value when it is valid JSON (undefined otherwise). */
  onValueChange?: (text: string, parsed: unknown) => void
  rows?: number
  /** Spaces per level when formatting (default 2). */
  indent?: number
  /** Re-indents valid JSON when the field is left. */
  formatOnBlur?: boolean
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  id?: string
  name?: string
  className?: string
  onBlur?: () => void
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const t = useCoreloomI18n().messages.inputs.json
  const [inner, setInner] = React.useState(defaultValue)
  const text = value ?? inner
  const [error, setError] = React.useState<string | null>(null)
  const errorId = React.useId()

  const set = (next: string) => {
    if (value === undefined) setInner(next)
    const parsed = next.trim() ? parseJson(next) : undefined
    onValueChange?.(next, parsed?.ok ? parsed.value : undefined)
  }
  const check = (source: string) => {
    if (!source.trim()) {
      setError(null)
      return undefined
    }
    const parsed = parseJson(source)
    setError(parsed.ok ? null : t.invalidAt(parsed.at.line, parsed.at.column))
    return parsed
  }
  const format = () => {
    const parsed = check(text)
    if (parsed?.ok) set(JSON.stringify(parsed.value, null, indent))
  }

  return (
    <div data-slot="json-input" className={cn('flex flex-col gap-1.5', className)}>
      <div className="relative">
        <textarea
          id={id}
          name={name}
          value={text}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-invalid={error !== null || ariaInvalid}
          aria-describedby={
            [error ? errorId : undefined, ariaDescribedBy].filter(Boolean).join(' ') || undefined
          }
          className="block w-full resize-y rounded-md border border-input bg-inset px-[13px] py-[11px] pr-24 font-mono text-[13px] leading-relaxed [tab-size:2] text-foreground transition-[border-color,box-shadow] duration-base ease-out outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive-subtle"
          onChange={(e) => {
            set(e.target.value)
            if (error) check(e.target.value)
          }}
          onKeyDown={(e) => {
            // Tab indents inside the field; Escape then Tab leaves it (the browser default after Esc).
            if (e.key !== 'Tab' || e.shiftKey || readOnly) return
            const el = e.currentTarget
            if (el.dataset.escaped === 'true') return
            e.preventDefault()
            const { selectionStart: start, selectionEnd: end } = el
            const spaces = ' '.repeat(indent)
            set(text.slice(0, start) + spaces + text.slice(end))
            requestAnimationFrame(() => {
              el.setSelectionRange(start + indent, start + indent)
            })
          }}
          onKeyUp={(e) => {
            e.currentTarget.dataset.escaped = e.key === 'Escape' ? 'true' : 'false'
          }}
          onBlur={() => {
            const parsed = check(text)
            if (formatOnBlur && parsed?.ok) set(JSON.stringify(parsed.value, null, indent))
            onBlur?.()
          }}
        />
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="absolute top-2 right-2"
            onClick={format}
          >
            <BracesIcon />
            {t.format}
          </Button>
        )}
      </div>
      <p className="m-0 text-[11px] text-muted-foreground">{t.tabHint}</p>
      {error && (
        <p id={errorId} data-slot="json-input-error" className="m-0 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export { JsonInput, parseJson }
