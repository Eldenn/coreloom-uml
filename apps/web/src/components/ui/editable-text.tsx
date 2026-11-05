'use client'

// Coreloom UI — EditableText. Text that turns into a field when clicked: a project name, a page
// title, a cell. Enter or leaving the field saves, Escape puts the old text back, and focus returns
// to the text either way. It inherits the surrounding font, so it works inside a heading.
import { PencilIcon } from 'lucide-react'
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function EditableText({
  value,
  defaultValue = '',
  onValueChange,
  label,
  placeholder,
  required = false,
  maxLength,
  disabled,
  startEditing = false,
  className,
  inputClassName,
}: {
  value?: string
  defaultValue?: string
  /** Called once, when the edit is saved (Enter or leaving the field) with a changed value. */
  onValueChange?: (value: string) => void
  /** What the text is ("project name"): names the button ("Edit project name") and the field. */
  label: string
  /** Shown (muted) when the text is empty; defaults to "Empty". */
  placeholder?: string
  /** An empty edit puts the old text back instead of saving "". */
  required?: boolean
  maxLength?: number
  disabled?: boolean
  /** Opens in edit mode (a freshly created item to name). */
  startEditing?: boolean
  className?: string
  inputClassName?: string
}) {
  const t = useCoreloomI18n().messages.inputs.editable
  const [inner, setInner] = React.useState(defaultValue)
  const current = value ?? inner
  const [editing, setEditing] = React.useState(startEditing)
  const [draft, setDraft] = React.useState(current)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  // Escape and Enter both end the edit; the blur that follows must not save a second time.
  const done = React.useRef(false)

  React.useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const open = () => {
    if (disabled) return
    done.current = false
    setDraft(current)
    setEditing(true)
  }
  const close = (save: boolean) => {
    if (done.current) return
    done.current = true
    const next = draft.trim()
    if (save && next !== current && !(required && next === '')) {
      if (value === undefined) setInner(next)
      onValueChange?.(next)
    }
    setEditing(false)
    requestAnimationFrame(() => buttonRef.current?.focus())
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={maxLength}
        aria-label={label}
        data-slot="editable-text-input"
        className={cn(
          '-mx-1.5 -my-0.5 w-full min-w-0 rounded-sm border border-primary bg-inset px-1.5 py-0.5 text-foreground ring-[3px] ring-ring outline-none [font:inherit]',
          inputClassName,
        )}
        onChange={(e) => {
          setDraft(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            close(true)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            close(false)
          }
        }}
        onBlur={() => {
          close(true)
        }}
      />
    )
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={disabled}
      // The visible text plus what it is, so a screen reader hears "Acme launch, Edit project name".
      aria-label={`${current || (placeholder ?? t.empty)}, ${t.edit(label)}`}
      data-slot="editable-text"
      className={cn(
        'group/editable -mx-1.5 -my-0.5 inline-flex max-w-full min-w-0 cursor-text items-center gap-1.5 rounded-sm border border-transparent px-1.5 py-0.5 text-left text-foreground outline-none [font:inherit] hover:border-border hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent',
        className,
      )}
      onClick={open}
    >
      <span className={cn('truncate', !current && 'text-muted-foreground')}>
        {current || (placeholder ?? t.empty)}
      </span>
      <PencilIcon
        aria-hidden
        className="size-[0.8em] shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/editable:opacity-100 group-focus-visible/editable:opacity-100 group-disabled/editable:hidden"
      />
    </button>
  )
}

export { EditableText }
