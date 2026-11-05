'use client'

// Coreloom UI — StatusButton. A button that shows what its action is doing: a spinner while it
// runs, a check that draws itself when it worked, a short shake when it failed, then back to its
// label. The new state is announced to screen readers. The consumer owns the state.
//
//   <StatusButton status={status} onClick={save}>Save</StatusButton>
import { XIcon } from 'lucide-react'
import * as React from 'react'

import { DrawIcon } from '@/components/ui/animated-icon'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type ActionStatus = 'idle' | 'loading' | 'success' | 'error'

function StatusButton({
  status = 'idle',
  loadingLabel,
  successLabel,
  errorLabel,
  className,
  children,
  disabled,
  onClick,
  ...props
}: {
  /** idle: the label; loading: a spinner, the button is busy; success: a drawn check; error: a shake. */
  status?: ActionStatus
  /** Shown and announced while loading (default "Working…"). */
  loadingLabel?: React.ReactNode
  /** Shown and announced on success (default "Done"). */
  successLabel?: React.ReactNode
  /** Announced on error (default "Something went wrong"); the button keeps its label. */
  errorLabel?: React.ReactNode
} & React.ComponentProps<typeof Button>) {
  const t = useCoreloomI18n().messages.motion.status
  const announce =
    status === 'loading'
      ? (loadingLabel ?? t.loading)
      : status === 'success'
        ? (successLabel ?? t.success)
        : status === 'error'
          ? (errorLabel ?? t.error)
          : null
  // The live region sits next to the button, not inside it, so it never joins the button's name.
  return (
    <>
      <Button
        data-slot="status-button"
        data-status={status}
        aria-busy={status === 'loading' || undefined}
        // Stays focusable while busy (a disabled button would drop focus to <body>); clicks are ignored.
        aria-disabled={status === 'loading' || undefined}
        disabled={disabled}
        className={cn(
          'relative',
          status === 'error' && 'animate-shake motion-reduce:animate-none',
          status === 'loading' && 'cursor-progress',
          className,
        )}
        onClick={(event) => {
          if (status === 'loading') {
            event.preventDefault()
            return
          }
          onClick?.(event)
        }}
        {...props}
      >
        {status === 'loading' ? (
          <>
            <Spinner className="text-current" role={undefined} aria-label={undefined} aria-hidden />
            {loadingLabel ?? children}
          </>
        ) : status === 'success' ? (
          <span className="inline-flex animate-pop-in items-center gap-2">
            <DrawIcon icon="check" className="size-4" />
            {successLabel ?? t.success}
          </span>
        ) : status === 'error' ? (
          <>
            <XIcon aria-hidden />
            {children}
          </>
        ) : (
          children
        )}
      </Button>
      <span className="sr-only" role="status">
        {announce}
      </span>
    </>
  )
}

export { type ActionStatus, StatusButton }
