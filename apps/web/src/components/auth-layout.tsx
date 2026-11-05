import * as React from 'react'

import { cn } from '@/lib/utils'

function AuthLayout({
  brand,
  children,
  footer,
  className,
}: {
  /** Logo and / or wordmark, linked to your home page. */
  brand?: React.ReactNode
  children: React.ReactNode
  /** Terms, privacy, support links. */
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-base px-4 py-10',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(ellipse_at_50%_0,var(--accent-subtle),transparent_70%)]"
      />
      {!!brand && <div className="relative flex items-center justify-center">{brand}</div>}
      <div className="relative w-full max-w-[400px]">{children}</div>
      {!!footer && (
        <div className="relative max-w-[400px] text-center text-[12px] text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-foreground">
          {footer}
        </div>
      )}
    </div>
  )
}

export { AuthLayout }
