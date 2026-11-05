import { PlusIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface KeyValuePair {
  key: string
  value: string
}

/** Reads "KEY=value" or "Key: value" lines (a .env file, copied headers); undefined when the text has none. */
function parseKeyValueLines(text: string): KeyValuePair[] | undefined {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '' && !l.trim().startsWith('#'))
  if (lines.length < 2 && !/[=:]/.test(text)) return undefined
  const pairs = lines.map((line) => {
    const m = /^\s*(?:export\s+)?([^=:]+?)\s*[=:]\s?(.*)$/.exec(line)
    if (!m) return undefined
    return { key: m[1], value: m[2].replace(/^(["'])(.*)\1$/, '$2') }
  })
  return pairs.every((p) => p !== undefined) ? pairs : undefined
}

const fieldClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-inset px-2.5 font-mono text-[13px] text-foreground transition-[border-color,box-shadow] duration-base ease-out outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive-subtle'

function KeyValueEditor({
  value,
  defaultValue = [{ key: '', value: '' }],
  onValueChange,
  keyLabel,
  valueLabel,
  keyPlaceholder,
  valuePlaceholder,
  addLabel,
  maxRows,
  sensitive = false,
  disabled,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: {
  value?: KeyValuePair[]
  defaultValue?: KeyValuePair[]
  onValueChange?: (pairs: KeyValuePair[]) => void
  /** Column titles; default to the i18n "Key" and "Value". */
  keyLabel?: string
  valueLabel?: string
  keyPlaceholder?: string
  valuePlaceholder?: string
  /** The add button's text; defaults to the i18n "Add row". */
  addLabel?: string
  /** No add button past this many rows. */
  maxRows?: number
  /** Values are secrets (API keys): shown as dots, not spell-checked or saved by the browser. */
  sensitive?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
}) {
  const t = useCoreloomI18n().messages.inputs.keyValue
  const [inner, setInner] = React.useState(defaultValue)
  const rows = value ?? inner
  const listRef = React.useRef<HTMLDivElement>(null)
  const errorId = React.useId()
  const kLabel = keyLabel ?? t.key
  const vLabel = valueLabel ?? t.value

  const set = (next: KeyValuePair[]) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }
  const focusRow = (index: number, column: 'key' | 'value' | 'add' = 'key') => {
    requestAnimationFrame(() => {
      const root = listRef.current
      const target =
        column === 'add'
          ? root?.querySelector<HTMLElement>('[data-slot=key-value-add]')
          : root?.querySelector<HTMLElement>(
              `[data-row="${String(index)}"] [data-column="${column}"]`,
            )
      target?.focus()
    })
  }

  // Keys used more than once (ignoring case and spaces), so each copy is flagged.
  const counts = new Map<string, number>()
  for (const r of rows) {
    const k = r.key.trim().toLowerCase()
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const isDuplicate = (key: string) => (counts.get(key.trim().toLowerCase()) ?? 0) > 1
  const hasDuplicates = rows.some((r) => isDuplicate(r.key))
  const canAdd = maxRows === undefined || rows.length < maxRows

  return (
    <div
      ref={listRef}
      role="group"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={
        [ariaDescribedBy, hasDuplicates ? errorId : undefined].filter(Boolean).join(' ') ||
        undefined
      }
      data-slot="key-value-editor"
      className={cn('flex flex-col gap-2', className)}
    >
      <div
        aria-hidden
        className="grid grid-cols-[1fr_1fr_2.25rem] gap-2 font-mono text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase"
      >
        <span>{kLabel}</span>
        <span>{vLabel}</span>
      </div>
      {rows.map((row, index) => {
        const duplicate = isDuplicate(row.key)
        return (
          <div
            // Rows have no ids of their own; the index is their identity while editing.
            // eslint-disable-next-line @eslint-react/no-array-index-key -- see above
            key={index}
            data-row={index}
            className="grid grid-cols-[1fr_1fr_2.25rem] items-center gap-2"
          >
            <input
              type="text"
              data-column="key"
              value={row.key}
              placeholder={keyPlaceholder}
              disabled={disabled}
              spellCheck={false}
              autoComplete="off"
              aria-label={t.cell(kLabel, index + 1)}
              aria-invalid={duplicate || undefined}
              className={fieldClass}
              onChange={(e) => {
                set(rows.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)))
              }}
              onPaste={(e) => {
                const pairs = parseKeyValueLines(e.clipboardData.getData('text'))
                if (!pairs?.length) return
                e.preventDefault()
                const next = [...rows.slice(0, index), ...pairs, ...rows.slice(index + 1)]
                set(maxRows === undefined ? next : next.slice(0, maxRows))
                focusRow(Math.min(index + pairs.length - 1, (maxRows ?? Infinity) - 1), 'value')
              }}
            />
            <input
              type={sensitive ? 'password' : 'text'}
              data-column="value"
              value={row.value}
              placeholder={valuePlaceholder}
              disabled={disabled}
              spellCheck={false}
              autoComplete={sensitive ? 'new-password' : 'off'}
              aria-label={t.cell(vLabel, index + 1)}
              className={fieldClass}
              onChange={(e) => {
                set(rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))
              }}
              onKeyDown={(e) => {
                // Enter in the last value adds a row, as in a spreadsheet.
                if (e.key === 'Enter' && index === rows.length - 1 && canAdd) {
                  e.preventDefault()
                  set([...rows, { key: '', value: '' }])
                  focusRow(rows.length)
                }
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={t.remove(index + 1)}
              className="size-9 text-muted-foreground hover:text-destructive"
              onClick={() => {
                const next = rows.filter((_, i) => i !== index)
                set(next.length ? next : [{ key: '', value: '' }])
                // Focus the row that took its place, or the add button after the last one
                // (removing a row always leaves room to add one).
                if (index < next.length || next.length === 0)
                  focusRow(index < next.length ? index : 0)
                else focusRow(0, 'add')
              }}
            >
              <Trash2Icon />
            </Button>
          </div>
        )
      })}
      {hasDuplicates && (
        <p id={errorId} className="m-0 text-[11px] text-destructive">
          {t.duplicate}
        </p>
      )}
      {canAdd && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          data-slot="key-value-add"
          className="self-start"
          onClick={() => {
            set([...rows, { key: '', value: '' }])
            focusRow(rows.length)
          }}
        >
          <PlusIcon />
          {addLabel ?? t.add}
        </Button>
      )}
    </div>
  )
}

export { KeyValueEditor, type KeyValuePair, parseKeyValueLines }
