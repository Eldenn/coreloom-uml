import { AlertCircleIcon, CheckIcon, CircleDotIcon, Loader2Icon, RotateCwIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/relative-time'
import { type Messages, useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error'

interface SaveStatusProps {
  state: SaveState
  /** When the last save finished; shown as "2 minutes ago" next to Saved. */
  savedAt?: Date
  /** Shows Retry next to "Couldn't save". */
  onRetry?: () => void
  className?: string
}

type SaveText = Messages['saveStatus']

/** What screen readers hear for a state; null while saving, which isn't announced. */
function announcement(state: SaveState, t: SaveText): string | null {
  switch (state) {
    case 'saved':
      return t.saved
    case 'unsaved':
      return t.unsaved
    case 'error':
      return t.error
    case 'saving':
      return null
  }
}

/** The last thing worth announcing: it stays the same while a save runs. */
function useAnnouncement(state: SaveState, t: SaveText) {
  const now = announcement(state, t)
  const [kept, setKept] = React.useState(now ?? '')
  if (now !== null && now !== kept) setKept(now)
  return now ?? kept
}

function StateLine({ state, t }: { state: SaveState; t: SaveText }) {
  switch (state) {
    case 'saved':
      return (
        <>
          <CheckIcon aria-hidden className="text-success" />
          <span>{t.saved}</span>
        </>
      )
    case 'saving':
      return (
        <>
          <Loader2Icon
            aria-hidden
            className="animate-spin motion-reduce:animate-[spin_1.5s_linear_infinite]"
          />
          <span>{t.saving}</span>
        </>
      )
    case 'unsaved':
      return (
        <>
          <CircleDotIcon aria-hidden className="text-warning" />
          <span>{t.unsaved}</span>
        </>
      )
    case 'error':
      return (
        <>
          <AlertCircleIcon aria-hidden />
          <span>{t.error}</span>
        </>
      )
  }
}

function SaveStatus({ state, savedAt, onRetry, className }: SaveStatusProps) {
  const t = useCoreloomI18n().messages.saveStatus
  const said = useAnnouncement(state, t)
  const root = React.useRef<HTMLDivElement>(null)
  return (
    <div
      ref={root}
      data-slot="save-status"
      data-state={state}
      // Retry goes away once the save starts: focus lands here instead of on the page.
      tabIndex={-1}
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground outline-none [&_svg]:size-3.5 [&_svg]:shrink-0',
        state === 'error' && 'text-destructive',
        className,
      )}
    >
      {/* The visible words change with every state; the status below only when it settles. */}
      <span aria-hidden className="inline-flex min-w-0 items-center gap-1.5">
        <StateLine state={state} t={t} />
      </span>
      <span role="status" className="sr-only">
        {said}
      </span>
      {state === 'saved' && savedAt && (
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
          <span aria-hidden>·</span>
          <RelativeTime date={savedAt} />
        </span>
      )}
      {state === 'error' && onRetry && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[12.5px]"
          onClick={() => {
            onRetry()
            root.current?.focus()
          }}
        >
          <RotateCwIcon aria-hidden />
          {t.retry}
        </Button>
      )}
    </div>
  )
}

export { type SaveState, SaveStatus, type SaveStatusProps }
