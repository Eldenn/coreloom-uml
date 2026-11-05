import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function TypingIndicator({
  name,
  label,
  bubble = true,
  className,
  ...props
}: {
  /** Who is typing, said by screen readers ("Lena is typing"). */
  name?: string
  /** Replaces the whole sentence for screen readers. */
  label?: string
  /** Draws the dots in a chat bubble; false for the dots alone. */
  bubble?: boolean
} & Omit<React.ComponentProps<'span'>, 'children'>) {
  const t = useCoreloomI18n().messages.motion
  return (
    <span
      data-slot="typing-indicator"
      role="status"
      className={cn(
        'inline-flex items-center gap-1',
        bubble && 'h-8 rounded-2xl rounded-bl-sm border border-border-subtle bg-secondary px-3',
        className,
      )}
      {...props}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="size-1.5 animate-typing rounded-full bg-muted-foreground motion-reduce:animate-none"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
      <span className="sr-only">{label ?? t.typing(name)}</span>
    </span>
  )
}

export { TypingIndicator }
