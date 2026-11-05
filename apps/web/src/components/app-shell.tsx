import * as React from 'react'

import { AppHeader, type Crumb } from '@/components/app-header'
import { AppSidebar } from '@/components/app-sidebar'
import { CommandMenu, type CommandMenuGroup } from '@/components/command-menu'
import { ThemeMenu } from '@/components/theme-toggle'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useCoreloomI18n } from '@/lib/i18n'

function AppShell({
  children,
  breadcrumbs,
  commands,
  onAskAi,
  headerActions,
  defaultSidebarOpen = true,
  ...sidebar
}: React.ComponentProps<typeof AppSidebar> & {
  children: React.ReactNode
  breadcrumbs?: Crumb[]
  /** ⌘K palette content. Leave out to hide the search. */
  commands?: CommandMenuGroup[]
  /** Adds "Ask AI: “…”" to the ⌘K palette; called with what was typed. */
  onAskAi?: (query: string) => void
  /** Extra header buttons, placed before the theme toggle (notifications, help…). */
  headerActions?: React.ReactNode
  defaultSidebarOpen?: boolean
}) {
  const t = useCoreloomI18n().messages
  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <AppSidebar {...sidebar} />
      <SidebarInset>
        <AppHeader
          breadcrumbs={breadcrumbs}
          actions={
            <>
              {commands && (
                <CommandMenu groups={commands} triggerLabel={t.appShell.search} onAskAi={onAskAi} />
              )}
              {headerActions}
              <ThemeMenu />
            </>
          }
        />
        <div className="mx-auto flex w-full max-w-(--container-app) flex-1 flex-col gap-6 px-4 py-8 md:px-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

/** Page title row: title, description and actions, as the first child of AppShell. */
function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="m-0 font-display text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        {!!description && (
          <p className="mt-1 mb-0 text-[14px] text-muted-foreground">{description}</p>
        )}
      </div>
      {!!actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export { AppShell, PageHeader }
