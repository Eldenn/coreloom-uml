'use client'

// Coreloom UI — Diagram fields. The small form parts of the diagram editor's panels: a text field
// that applies when it loses focus (or on Enter), a choice that applies at once, and the drafts a
// panel keeps until a field applies.
import * as React from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/** Edits not yet applied, by field; what isn't here shows the diagram's value. */
function useDrafts<T extends object>(key: string) {
  const [drafts, setDrafts] = React.useState<Partial<T>>({})
  const [owner, setOwner] = React.useState(key)
  if (owner !== key) {
    // Another element: drop the drafts of the previous one.
    setOwner(key)
    setDrafts({})
  }
  const set = <K extends keyof T>(k: K, value: T[K]) => {
    setDrafts((d) => ({ ...d, [k]: value }))
  }
  const take = () => {
    const out = drafts
    setDrafts({})
    return out
  }
  return { drafts, set, take }
}

/** The field that names what's selected: one line, or a box for a note's text. */
type NameField = HTMLInputElement | HTMLTextAreaElement

/** Hands the field to `ref`, whichever element it is. */
function fieldRef(ref: React.Ref<NameField> | undefined) {
  return (el: NameField | null) => {
    if (typeof ref === 'function') return ref(el)
    if (ref) ref.current = el
  }
}

function TextField({
  label,
  value,
  hint,
  multiline = false,
  mono = false,
  disabled,
  onChange,
  onCommit,
  inputRef,
}: {
  label: string
  value: string
  hint?: string
  multiline?: boolean
  /** Code-like text (one entity attribute per line): a monospaced font. */
  mono?: boolean
  disabled: boolean
  onChange: (value: string) => void
  onCommit: () => void
  inputRef?: React.Ref<NameField> | undefined
}) {
  const id = React.useId()
  const described = hint ? { 'aria-describedby': `${id}-hint` } : {}
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          id={id}
          ref={fieldRef(inputRef)}
          value={value}
          readOnly={disabled}
          rows={3}
          spellCheck={false}
          className={cn('min-h-16 text-[13px]', mono && 'font-mono text-[12px]')}
          onChange={(e) => {
            onChange(e.target.value)
          }}
          onBlur={onCommit}
          {...described}
        />
      ) : (
        <Input
          id={id}
          ref={fieldRef(inputRef)}
          value={value}
          readOnly={disabled}
          className="h-8 text-[13px]"
          onChange={(e) => {
            onChange(e.target.value)
          }}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit()
          }}
          {...described}
        />
      )}
      {hint && (
        <p id={`${id}-hint`} className="text-[12px] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

function Choice<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  disabled: boolean
  onChange: (value: T) => void
}) {
  const id = React.useId()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        size="sm"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = options.find((o) => o.value === e.target.value)
          if (next) onChange(next.value)
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}

export { Choice, type NameField, TextField, useDrafts }
