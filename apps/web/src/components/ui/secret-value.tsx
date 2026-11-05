'use client'

// Coreloom UI — SecretValue. A value that should not sit on screen in clear: an API key, a token,
// a webhook secret, a recovery code. It shows dots (and, if you want, the first and last few
// characters so people can tell keys apart), an eye button to show it, and Copy, which copies the
// real value without showing it.
//
//   <SecretValue value={key.secret} visibleStart={3} visibleEnd={4} onReveal={logAccess} />
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import * as React from 'react'

import { CopyButton } from '@/components/copy-button'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** "cl_live_abc…" → "cl_•••••••c9f2" with 3 characters kept at the start and 4 at the end. */
function maskSecret(value: string, visibleStart = 0, visibleEnd = 0, dots = 12) {
  const chars = Array.from(value)
  const start = Math.max(0, visibleStart)
  const end = Math.max(0, visibleEnd)
  if (start + end >= chars.length) return '•'.repeat(Math.min(dots, Math.max(chars.length, 1)))
  return chars.slice(0, start).join('') + '•'.repeat(dots) + (end ? chars.slice(-end).join('') : '')
}

function SecretValue({
  value,
  revealed: revealedProp,
  defaultRevealed = false,
  onRevealedChange,
  onReveal,
  visibleStart = 0,
  visibleEnd = 4,
  copy = true,
  label,
  className,
  ...props
}: {
  value: string
  revealed?: boolean
  defaultRevealed?: boolean
  onRevealedChange?: (revealed: boolean) => void
  /** Called each time someone shows the value, for an audit log. */
  onReveal?: () => void
  /** Characters kept in clear at the start (a prefix such as "cl_"). 0 by default. */
  visibleStart?: number
  /** Characters kept in clear at the end, to tell keys apart. 4 by default. */
  visibleEnd?: number
  /** Shows the Copy button. */
  copy?: boolean
  /** What the value is ("API key"), used in the buttons' names. */
  label?: string
} & Omit<React.ComponentProps<'div'>, 'children'>) {
  const t = useCoreloomI18n().messages.utility.secret
  const [uncontrolled, setUncontrolled] = React.useState(defaultRevealed)
  const revealed = revealedProp ?? uncontrolled
  const toggle = () => {
    const next = !revealed
    if (revealedProp === undefined) setUncontrolled(next)
    onRevealedChange?.(next)
    if (next) onReveal?.()
  }
  const name = label ?? t.secret
  return (
    <div
      data-slot="secret-value"
      data-revealed={revealed || undefined}
      className={cn(
        'inline-flex h-9 max-w-full min-w-0 items-center gap-1 rounded-md border border-border bg-inset py-1 pr-1 pl-3 font-sans',
        className,
      )}
      {...props}
    >
      <code
        className={cn(
          'min-w-0 flex-1 truncate font-mono text-[13px] text-foreground',
          !revealed && 'tracking-[0.08em]',
        )}
      >
        {revealed ? (
          value
        ) : (
          <>
            <span aria-hidden>{maskSecret(value, visibleStart, visibleEnd)}</span>
            <span className="sr-only">{t.hidden}</span>
          </>
        )}
      </code>
      <button
        type="button"
        aria-pressed={revealed}
        aria-label={t.show(name)}
        title={revealed ? t.hide(name) : t.show(name)}
        className="flex size-[27px] shrink-0 cursor-pointer items-center justify-center rounded-sm text-fg-secondary outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring [&_svg]:size-4"
        onClick={toggle}
      >
        {revealed ? <EyeOffIcon /> : <EyeIcon />}
      </button>
      {copy ? <CopyButton value={value} label={t.copy(name)} /> : null}
    </div>
  )
}

export { maskSecret, SecretValue }
