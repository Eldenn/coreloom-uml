'use client'

// Coreloom UI — AppHeader (app-shell block). Sticky bar above the page: sidebar toggle,
// breadcrumb, then your actions (search, notifications, theme) on the right.
import * as React from 'react'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { AppLink } from '@/lib/link'

interface Crumb {
  label: string
  href?: string
}

function AppHeader({
  breadcrumbs = [],
  actions,
}: {
  breadcrumbs?: Crumb[]
  actions?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-(--z-dropdown) flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle bg-background/85 px-4 backdrop-blur-md">
      <SidebarTrigger className="-ml-1" />
      {breadcrumbs.length > 0 && (
        <>
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <Breadcrumb className="hidden min-w-0 sm:block">
            <BreadcrumbList>
              {breadcrumbs.map((crumb, i) => (
                // eslint-disable-next-line @eslint-react/no-array-index-key -- breadcrumbs are positional; the label tells same-index crumbs apart
                <React.Fragment key={`${crumb.label}-${i}`}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {i === breadcrumbs.length - 1 || !crumb.href ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <AppLink href={crumb.href}>{crumb.label}</AppLink>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </>
      )}
      {!!actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
    </header>
  )
}

export { AppHeader, type Crumb }
