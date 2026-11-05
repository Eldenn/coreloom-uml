import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface MentionOption {
  /** What gets inserted after the trigger ("ada" → "@ada"). No spaces. */
  value: string
  /** Shown in the list ("Ada Lovelace"). */
  label: string
  /** A second line (a role, an email). */
  description?: string
  /** An Avatar or an icon. */
  icon?: React.ReactNode
}

/** The handles a text mentions, among the known ones, each once ("@ada and @alan" → ["ada", "alan"]). */
function mentionsIn(text: string, options: MentionOption[], trigger = '@') {
  const known = new Set(options.map((o) => o.value))
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // A handle is letters, digits, "_", "." and "-"; punctuation after it ("@ada,") isn't part of it.
  const found = [...text.matchAll(new RegExp(`(?:^|\\s)${escaped}([\\p{L}\\p{N}_.-]+)`, 'gu'))]
    .map((m) => m[1].replace(/[.-]+$/, ''))
    .filter((h) => known.has(h))
  return [...new Set(found)]
}

/** The mention being typed at the caret: where its trigger is and the text after it. */
function activeMention(text: string, caret: number, trigger: string) {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf(trigger)
  if (at < 0) return undefined
  const query = before.slice(at + trigger.length)
  // The trigger starts a word, and nothing typed since is a space.
  if (/\s/.test(query) || (at > 0 && !/\s/.test(before.charAt(at - 1)))) return undefined
  return { at, query }
}

function MentionTextarea({
  options,
  value,
  defaultValue = '',
  onValueChange,
  trigger = '@',
  maxSuggestions = 6,
  rows = 4,
  placeholder,
  disabled,
  id,
  name,
  className,
  onBlur,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  /** Who (or what) can be mentioned. Filter them yourself for a server search, then pass them. */
  options: MentionOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (text: string) => void
  /** The character that starts a mention (default "@"; "#" for channels). */
  trigger?: string
  maxSuggestions?: number
  rows?: number
  placeholder?: string
  disabled?: boolean
  id?: string
  name?: string
  className?: string
  onBlur?: () => void
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const t = useCoreloomI18n().messages.inputs.mention
  const [inner, setInner] = React.useState(defaultValue)
  const text = value ?? inner
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const listId = React.useId()
  const hintId = React.useId()
  const [mention, setMention] = React.useState<{ at: number; query: string } | undefined>()
  const [active, setActive] = React.useState(0)

  const q = mention?.query.toLowerCase() ?? ''
  const matches = mention
    ? options
        .filter((o) => o.value.toLowerCase().startsWith(q) || o.label.toLowerCase().includes(q))
        .slice(0, maxSuggestions)
    : []
  const open = mention !== undefined && matches.length > 0

  const set = (next: string) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }
  const track = (el: HTMLTextAreaElement) => {
    const next = activeMention(el.value, el.selectionStart, trigger)
    setMention(next)
    if (next?.query !== mention?.query) setActive(0)
  }
  const insert = (option: MentionOption) => {
    const el = ref.current
    if (!el || !mention) return
    const end = mention.at + trigger.length + mention.query.length
    const after = text.slice(end)
    const piece = `${trigger}${option.value}${after.startsWith(' ') ? '' : ' '}`
    set(text.slice(0, mention.at) + piece + after)
    setMention(undefined)
    const caret = mention.at + piece.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  return (
    <div data-slot="mention-textarea" className={cn('relative flex flex-col gap-1.5', className)}>
      <textarea
        ref={ref}
        id={id}
        name={name}
        value={text}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        // A textarea can't take the combobox role; it points at the list while it is open, and a
        // status line says how many suggestions there are.
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${String(active)}` : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-invalid={ariaInvalid}
        aria-describedby={[hintId, ariaDescribedBy].filter(Boolean).join(' ')}
        className="block w-full resize-y rounded-md border border-input bg-inset px-[13px] py-[11px] font-sans text-[14px] leading-normal text-foreground transition-[border-color,box-shadow] duration-base ease-out outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive-subtle"
        onChange={(e) => {
          set(e.target.value)
          track(e.target)
        }}
        onClick={(e) => {
          track(e.currentTarget)
        }}
        onKeyDown={(e) => {
          if (!open) return
          const option = matches.at(active)
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            const delta = e.key === 'ArrowDown' ? 1 : -1
            setActive((active + delta + matches.length) % matches.length)
          } else if ((e.key === 'Enter' || e.key === 'Tab') && option) {
            e.preventDefault()
            insert(option)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setMention(undefined)
          }
        }}
        onKeyUp={(e) => {
          if (
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowRight' ||
            e.key === 'Home' ||
            e.key === 'End'
          )
            track(e.currentTarget)
        }}
        onBlur={() => {
          setMention(undefined)
          onBlur?.()
        }}
      />
      <span id={hintId} className="sr-only">
        {t.hint(trigger)}
      </span>
      <span role="status" className="sr-only">
        {open ? t.count(matches.length) : ''}
      </span>
      <ul
        id={listId}
        role="listbox"
        aria-label={t.suggestions}
        hidden={!open}
        className="absolute inset-x-0 top-full z-(--z-popover) m-0 mt-1 flex max-h-64 list-none flex-col overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg"
      >
        {matches.map((o, i) => (
          // Options are picked with the keyboard from the textarea (aria-activedescendant) or a click.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- see above
          <li
            key={o.value}
            id={`${listId}-${String(i)}`}
            role="option"
            aria-selected={i === active}
            className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13px] text-foreground aria-selected:bg-accent"
            onMouseDown={(e) => {
              // Keep the focus in the textarea.
              e.preventDefault()
            }}
            onMouseEnter={() => {
              setActive(i)
            }}
            onClick={() => {
              insert(o)
            }}
          >
            {o.icon}
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{o.label}</span>
              <span className="truncate text-[12px] text-muted-foreground">
                {trigger}
                {o.value}
                {o.description ? ` · ${o.description}` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export { type MentionOption, mentionsIn, MentionTextarea }
