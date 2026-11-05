'use client'

// Coreloom UI — error pages (error-pages block). A centered page with a big status code, a title,
// one sentence and a way out. NotFoundPage, ServerErrorPage and MaintenancePage fill in the words
// (from i18n); ErrorPage is the bare layout for anything else (403, 410…).
// In Next.js: render NotFoundPage from app/not-found.tsx and ServerErrorPage from app/error.tsx.
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { useCoreloomI18n } from '@/lib/i18n'
import { AppLink } from '@/lib/link'
import { cn } from '@/lib/utils'

function ErrorPage({
  code,
  title,
  description,
  actions,
  brand,
  footer,
  className,
}: {
  /** "404", "500"… Shown large; leave out for pages without one. */
  code?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Buttons or links: the way out. */
  actions?: React.ReactNode
  brand?: React.ReactNode
  /** Small print: a reference id, a status page link. */
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <main
      data-slot="error-page"
      className={cn(
        'relative flex min-h-svh flex-col items-center justify-center gap-8 overflow-hidden bg-base px-6 py-16 text-center',
        'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-80 before:bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--accent)_8%,transparent),transparent_70%)]',
        className,
      )}
    >
      {!!brand && <div className="relative">{brand}</div>}
      <div className="relative flex max-w-md flex-col items-center gap-3">
        {!!code && (
          <p
            aria-hidden
            className="m-0 font-mono text-[64px] leading-none font-semibold tracking-[-0.04em] text-primary-text sm:text-[88px]"
          >
            {code}
          </p>
        )}
        <h1 className="m-0 font-display text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground sm:text-[30px]">
          {title}
        </h1>
        {!!description && (
          <p className="m-0 text-[15px] leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {!!actions && (
        <div className="relative flex flex-wrap items-center justify-center gap-2.5">{actions}</div>
      )}
      {!!footer && (
        <div className="relative font-mono text-[12px] text-muted-foreground">{footer}</div>
      )}
    </main>
  )
}

type PageProps = Omit<React.ComponentProps<typeof ErrorPage>, 'title' | 'code'> & {
  title?: React.ReactNode
}

/** 404. `homeHref` adds "Go home"; "Go back" uses the browser history. */
function NotFoundPage({
  homeHref = '/',
  title,
  description,
  actions,
  ...props
}: PageProps & { homeHref?: string }) {
  const t = useCoreloomI18n().messages.errors
  return (
    <ErrorPage
      code="404"
      title={title ?? t.notFoundTitle}
      description={description ?? t.notFoundText}
      actions={
        actions ?? (
          <>
            <Button asChild>
              <AppLink href={homeHref}>{t.home}</AppLink>
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                window.history.back()
              }}
            >
              {t.back}
            </Button>
          </>
        )
      }
      {...props}
    />
  )
}

/** 500. `onRetry` adds "Try again" (Next.js error.tsx: pass `reset`); `reference` shows an error id. */
function ServerErrorPage({
  onRetry,
  reference,
  homeHref = '/',
  statusHref,
  title,
  description,
  actions,
  footer,
  ...props
}: PageProps & {
  onRetry?: () => void
  reference?: string
  homeHref?: string
  statusHref?: string
}) {
  const t = useCoreloomI18n().messages.errors
  return (
    <ErrorPage
      code="500"
      title={title ?? t.serverTitle}
      description={description ?? t.serverText}
      actions={
        actions ?? (
          <>
            {onRetry && <Button onClick={onRetry}>{t.retry}</Button>}
            <Button asChild variant={onRetry ? 'secondary' : 'default'}>
              <AppLink href={homeHref}>{t.home}</AppLink>
            </Button>
          </>
        )
      }
      footer={
        footer ??
        ((!!reference || !!statusHref) && (
          <span className="flex flex-wrap items-center justify-center gap-3">
            {reference && <span>{t.reference(reference)}</span>}
            {statusHref && (
              <AppLink
                href={statusHref}
                className="text-primary-text underline-offset-4 hover:underline"
              >
                {t.status}
              </AppLink>
            )}
          </span>
        ))
      }
      {...props}
    />
  )
}

/** Planned downtime. `until` shows "Back by 14:30" in the user's locale and time zone. */
function MaintenancePage({
  until,
  statusHref,
  title,
  description,
  footer,
  ...props
}: PageProps & { until?: Date; statusHref?: string }) {
  const { messages, locale } = useCoreloomI18n()
  const t = messages.errors
  const time = until
    ? new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(until)
    : undefined
  return (
    <ErrorPage
      title={title ?? t.maintenanceTitle}
      description={
        description ?? (
          <>
            {t.maintenanceText} {time && t.backBy(time)}
          </>
        )
      }
      footer={
        footer ??
        (statusHref && (
          <AppLink
            href={statusHref}
            className="text-primary-text underline-offset-4 hover:underline"
          >
            {t.status}
          </AppLink>
        ))
      }
      {...props}
    />
  )
}

export { ErrorPage, MaintenancePage, NotFoundPage, ServerErrorPage }
