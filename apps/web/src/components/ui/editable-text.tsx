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
  const [kept, setKept] = React.useState(false)
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
    setKept(false)
    setDraft(current)
    setEditing(true)
  }
  // `refocus`: Enter and Escape hand the focus back to the text. Leaving the field (Tab, a click
  // elsewhere) saves too, but the focus stays where the person put it.
  const close = (save: boolean, refocus: boolean) => {
    if (done.current) return
    done.current = true
    const next = draft.trim()
    const emptied = save && required && next === '' && current !== ''
    if (save && next !== current && !emptied) {
      if (value === undefined) setInner(next)
      onValueChange?.(next)
    }
    setKept(emptied)
    setEditing(false)
    if (refocus) requestAnimationFrame(() => buttonRef.current?.focus())
  }

  // Says that an emptied required text was put back. It sits at the same place in both modes, so
  // the region is already there when its words change. Not role="status": pages that hold one
  // status of their own keep a single one.
  const status = required ? (
    <span aria-live="polite" className="sr-only">
      {kept ? t.kept : ''}
    </span>
  ) : null

  if (editing) {
    return (
      <>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          maxLength={maxLength}
          aria-label={label}
          aria-required={required || undefined}
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
              close(true, true)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              close(false, true)
            }
          }}
          onBlur={() => {
            close(true, false)
          }}
        />
        {status}
      </>
    )
  }

  return (
    <>
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
      {status}
    </>
  )
}

export { EditableText }
