import { XIcon } from 'lucide-react'
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function TagsInput({
  value,
  defaultValue = [],
  onValueChange,
  placeholder,
  maxTags,
  allowDuplicates = false,
  transform = (tag) => tag.trim(),
  disabled,
  className,
  id,
  onBlur,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedby,
}: {
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (tags: string[]) => void
  placeholder?: string
  maxTags?: number
  allowDuplicates?: boolean
  /** Cleans each tag before it's added (default: trim). Return "" to drop it. */
  transform?: (tag: string) => string
  disabled?: boolean
  className?: string
  /** Lands on the text input, so a FieldLabel's htmlFor points at it. */
  id?: string
  onBlur?: () => void
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-label'?: string
  'aria-describedby'?: string
}) {
  const t = useCoreloomI18n().messages.tags
  const [inner, setInner] = React.useState<string[]>(defaultValue)
  const tags = value ?? inner
  const [draft, setDraft] = React.useState('')
  const [announcement, setAnnouncement] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const full = maxTags !== undefined && tags.length >= maxTags

  const commit = (next: string[]) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }

  const add = (raw: string[]) => {
    const next = [...tags]
    const added: string[] = []
    for (const r of raw) {
      const tag = transform(r)
      if (!tag || (maxTags !== undefined && next.length >= maxTags)) continue
      if (!allowDuplicates && next.some((x) => x.toLowerCase() === tag.toLowerCase())) continue
      next.push(tag)
      added.push(tag)
    }
    if (added.length) {
      commit(next)
      setAnnouncement(added.map(t.added).join('. '))
    }
  }

  const remove = (index: number) => {
    const tag = tags[index]
    commit(tags.filter((_, i) => i !== index))
    setAnnouncement(t.removed(tag))
    inputRef.current?.focus()
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- a click on the empty space focuses the input, a mouse convenience; keyboard users tab to the input.
    <div
      data-slot="tags-input"
      aria-disabled={disabled ? true : undefined}
      className={cn(
        'flex min-h-[42px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-md border border-input bg-inset px-[7px] py-[6px] font-sans text-[14px] transition-[border-color,box-shadow] duration-base ease-out focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-55',
        ariaInvalid &&
          ariaInvalid !== 'false' &&
          'border-destructive ring-[3px] ring-destructive-subtle focus-within:border-destructive focus-within:ring-destructive/70',
        className,
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) inputRef.current?.focus()
      }}
    >
      <ul className="contents">
        {tags.map((tag, i) => (
          <li
            // eslint-disable-next-line @eslint-react/no-array-index-key -- tags have no id and may repeat (allowDuplicates); the index tells them apart.
            key={`${tag}-${i}`}
            data-slot="tags-input-tag"
            className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-secondary pr-0.5 pl-2 text-[13px] font-medium text-foreground"
          >
            {tag}
            <button
              type="button"
              disabled={disabled}
              aria-label={t.remove(tag)}
              onClick={() => {
                remove(i)
              }}
              className="inline-flex size-6 cursor-pointer items-center justify-center rounded-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none [&_svg]:size-3.5"
            >
              <XIcon />
            </button>
          </li>
        ))}
      </ul>
      <input
        ref={inputRef}
        id={id}
        value={draft}
        disabled={!!disabled || full}
        placeholder={tags.length ? undefined : (placeholder ?? t.placeholder)}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedby}
        enterKeyHint="enter"
        className="h-7 min-w-24 flex-1 bg-transparent px-1.5 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        onChange={(e) => {
          const v = e.target.value
          if (v.includes(',')) {
            const parts = v.split(',')
            add(parts.slice(0, -1))
            setDraft(parts[parts.length - 1])
          } else setDraft(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (!draft.trim()) return
            e.preventDefault()
            add([draft])
            setDraft('')
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            e.preventDefault()
            remove(tags.length - 1)
          }
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text')
          if (!/[,\n]/.test(text)) return
          e.preventDefault()
          add(text.split(/[,\n]/))
        }}
        onBlur={() => {
          if (draft.trim()) {
            add([draft])
            setDraft('')
          }
          onBlur?.()
        }}
      />
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  )
}

export { TagsInput }
