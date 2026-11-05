'use client'

// Coreloom UI — SettingsLayout (settings block). Page title, a section nav (a column on desktop,
// a scrolling row on phones) and the active section's content.
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { type IconLike, renderIcon } from '@/lib/icon'
import { AppLink } from '@/lib/link'
import { cn } from '@/lib/utils'

interface SettingsNavItem {
  id: string
  label: string
  icon?: IconLike
  href?: string
}

function SettingsLayout({
  title,
  description,
  nav,
  active,
  onNavigate,
  children,
  className,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  nav: SettingsNavItem[]
  /** id of the current section. */
  active: string
  /** Called with the item's id when it has no href (client-side tabs). */
  onNavigate?: (id: string) => void
  children: React.ReactNode
  className?: string
}) {
  const t = useCoreloomI18n().messages
  title ??= t.settings.title
  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div>
        <h1 className="m-0 font-display text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        {!!description && (
          <p className="mt-1 mb-0 text-[14px] text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <nav
          aria-label="Settings sections"
          className="-mx-1 shrink-0 overflow-x-auto md:mx-0 md:w-52 md:overflow-visible"
        >
          <ul className="m-0 flex list-none gap-1 p-1 md:sticky md:top-20 md:flex-col md:p-0">
            {nav.map((item) => {
              const isActive = item.id === active
              const cls = cn(
                'flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-[14px] whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0',
                isActive
                  ? 'bg-primary-subtle font-medium text-primary-text'
                  : 'text-fg-secondary hover:bg-accent hover:text-foreground',
              )
              const content = (
                <>
                  {renderIcon(item.icon)}
                  {item.label}
                </>
              )
              return (
                <li key={item.id}>
                  {item.href ? (
                    <AppLink
                      href={item.href}
                      className={cls}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {content}
                    </AppLink>
                  ) : (
                    <button
                      type="button"
                      className={cls}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => onNavigate?.(item.id)}
                    >
                      {content}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
      </div>
    </div>
  )
}

export { SettingsLayout, type SettingsNavItem }
