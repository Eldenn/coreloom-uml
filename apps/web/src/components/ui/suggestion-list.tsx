import { CheckIcon, Loader2Icon, PencilIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface Suggestion {
  id: string
  /** The suggested text: what Accept hands back, and what Edit starts from. */
  text: string
  /** A short line above the text: where it would go, or its kind. */
  label?: React.ReactNode
  /** A line under the text: where it comes from, or why. */
  detail?: React.ReactNode
}

/**
 * What the app does with a suggestion. It may return a promise: a spinner shows until it settles,
 * and a rejected one keeps the suggestion where it was.
 */
type SuggestionHandler<A extends unknown[]> = (...args: A) => unknown

interface SuggestionListProps {
  suggestions: Suggestion[]
  /** Accept, or accept after an edit: `text` is the text to keep (edited or not). */
  onAccept: SuggestionHandler<[suggestion: Suggestion, text: string]>
  onDismiss: SuggestionHandler<[suggestion: Suggestion]>
  /** Shows Edit, which opens the text in a field before accepting it. */
  editable?: boolean
  /** How a suggestion's text is drawn (inline Markdown, a code line). Plain text by default. */
  renderText?: (text: string) => React.ReactNode
  /** Shown when there is nothing left to review. */
  empty?: React.ReactNode
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}

type Action = 'accept' | 'dismiss'

type ItemState = { mode: 'view' } | { mode: 'edit'; draft: string }

/** Runs one action; true when it went through, false when the app's promise was rejected. */
type Run = (action: Action, suggestion: Suggestion, text: string) => Promise<boolean>

function SuggestionItem({
  suggestion,
  editable,
  disabled,
  renderText,
  run,
}: {
  suggestion: Suggestion
  editable: boolean
  disabled: boolean
  renderText: (text: string) => React.ReactNode
  run: Run
}) {
  const t = useCoreloomI18n().messages.suggestionList
  const id = React.useId()
  const [state, setState] = React.useState<ItemState>({ mode: 'view' })
  const [busy, setBusy] = React.useState<Action | null>(null)
  const field = React.useRef<HTMLTextAreaElement>(null)
  const editButton = React.useRef<HTMLButtonElement>(null)
  const draft = state.mode === 'edit' ? state.draft : suggestion.text
  const locked = disabled || busy !== null

  const act = async (action: Action) => {
    setBusy(action)
    const done = await run(action, suggestion, draft.trim())
    setBusy(null)
    // Still here after it went through: the app kept it, so show it as it now stands.
    if (done) setState({ mode: 'view' })
  }
  const startEdit = () => {
    setState({ mode: 'edit', draft: suggestion.text })
    requestAnimationFrame(() => field.current?.focus())
  }
  const cancelEdit = () => {
    setState({ mode: 'view' })
    requestAnimationFrame(() => editButton.current?.focus())
  }

  return (
    <li
      data-slot="suggestion"
      data-id={suggestion.id}
      data-mode={state.mode}
      aria-busy={busy !== null || undefined}
      className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 text-[14px] text-foreground"
    >
      {suggestion.label ? (
        <p className="m-0 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {suggestion.label}
        </p>
      ) : null}
      {state.mode === 'edit' ? (
        <>
          <Textarea
            ref={field}
            value={state.draft}
            disabled={locked}
            aria-label={t.editLabel}
            aria-describedby={`${id}-hint`}
            className="min-h-[64px]"
            onChange={(e) => {
              setState({ mode: 'edit', draft: e.target.value })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                // The field closes, not the dialog or sheet around the list.
                e.stopPropagation()
                cancelEdit()
              } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && draft.trim()) {
                e.preventDefault()
                void act('accept')
              }
            }}
          />
          <p id={`${id}-hint`} className="m-0 text-[12px] text-muted-foreground">
            {t.editHint}
          </p>
        </>
      ) : (
        <div id={`${id}-text`} className="break-words whitespace-pre-wrap">
          {renderText(suggestion.text)}
        </div>
      )}
      {suggestion.detail ? (
        <div className="text-[12px] break-words text-muted-foreground">{suggestion.detail}</div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-action="accept"
          disabled={locked || !draft.trim()}
          aria-describedby={state.mode === 'view' ? `${id}-text` : undefined}
          onClick={() => void act('accept')}
        >
          {busy === 'accept' ? <BusyIcon /> : <CheckIcon aria-hidden />}
          {state.mode === 'edit' ? t.acceptEdited : t.accept}
        </Button>
        {state.mode === 'edit' ? (
          <Button type="button" variant="ghost" size="sm" disabled={locked} onClick={cancelEdit}>
            {t.cancel}
          </Button>
        ) : (
          <>
            {editable && (
              <Button
                ref={editButton}
                type="button"
                variant="ghost"
                size="sm"
                disabled={locked}
                aria-describedby={`${id}-text`}
                onClick={startEdit}
              >
                <PencilIcon aria-hidden />
                {t.edit}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={locked}
              aria-describedby={`${id}-text`}
              onClick={() => void act('dismiss')}
            >
              {busy === 'dismiss' ? <BusyIcon /> : <XIcon aria-hidden />}
              {t.ignore}
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

function BusyIcon() {
  return (
    <Loader2Icon
      aria-hidden
      className="animate-spin motion-reduce:animate-[spin_1.5s_linear_infinite]"
    />
  )
}

/**
 * Where focus goes once a handled suggestion leaves the list: the one that took its place, the
 * last one when it was at the end, or the list itself when none are left.
 */
function useFocusAfterRemoval(suggestions: Suggestion[]) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const handledRef = React.useRef<{ id: string; index: number } | null>(null)
  React.useEffect(() => {
    const gone = handledRef.current
    if (!gone || suggestions.some((s) => s.id === gone.id)) return
    handledRef.current = null
    const rows = rootRef.current?.querySelectorAll<HTMLElement>('[data-slot="suggestion"]') ?? []
    const row = rows[Math.min(gone.index, rows.length - 1)] as HTMLElement | undefined
    const next = row?.querySelector<HTMLElement>('button:not(:disabled)')
    ;(next ?? rootRef.current)?.focus()
  }, [suggestions])
  return { rootRef, handledRef }
}

function SuggestionList({
  suggestions,
  onAccept,
  onDismiss,
  editable = true,
  renderText = (text) => text,
  empty,
  disabled = false,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: SuggestionListProps) {
  const t = useCoreloomI18n().messages.suggestionList
  const [status, setStatus] = React.useState('')
  const { rootRef, handledRef } = useFocusAfterRemoval(suggestions)

  const run: Run = async (action, suggestion, text) => {
    // Set before calling the app, which may drop the suggestion straight away.
    handledRef.current = { id: suggestion.id, index: suggestions.indexOf(suggestion) }
    try {
      await (action === 'accept' ? onAccept(suggestion, text) : onDismiss(suggestion))
    } catch {
      handledRef.current = null
      setStatus(t.failed)
      return false
    }
    const left = suggestions.length - 1
    setStatus(action === 'accept' ? t.accepted(left) : t.ignored(left))
    return true
  }

  return (
    <div
      ref={rootRef}
      data-slot="suggestion-list"
      // Focus lands here when the last suggestion is handled.
      tabIndex={-1}
      className={cn('flex flex-col outline-none', className)}
    >
      {suggestions.length > 0 ? (
        <ul
          aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? t.label)}
          aria-labelledby={ariaLabelledBy}
          className="m-0 flex list-none flex-col gap-2 p-0"
        >
          {suggestions.map((suggestion) => (
            <SuggestionItem
              key={suggestion.id}
              suggestion={suggestion}
              editable={editable}
              disabled={disabled}
              renderText={renderText}
              run={run}
            />
          ))}
        </ul>
      ) : (
        <p className="m-0 rounded-md border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground">
          {empty ?? t.empty}
        </p>
      )}
      <span role="status" className="sr-only">
        {status}
      </span>
    </div>
  )
}

export { type Suggestion, SuggestionList, type SuggestionListProps }
