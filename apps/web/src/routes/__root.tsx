import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  Outlet,
  useRouter,
} from '@tanstack/react-router'
import * as React from 'react'

import { Brand } from '@/components/brand'
import { NotFoundPage, ServerErrorPage } from '@/components/error-page'
import { RouterLink } from '@/components/router-link'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CoreloomLinkProvider } from '@/lib/link'
import { LocaleProvider } from '@/lib/locale'

/** Available to every route's `beforeLoad` / `loader` (set in `main.tsx`). */
export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
  notFoundComponent: NotFound,
  errorComponent: RootError,
})

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <CoreloomLinkProvider component={RouterLink}>
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </CoreloomLinkProvider>
    </LocaleProvider>
  )
}

function Root() {
  return (
    <Providers>
      <Outlet />
    </Providers>
  )
}

function NotFound() {
  return <NotFoundPage brand={<Brand />} homeHref="/" />
}

function RootError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  React.useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <Providers>
      <ServerErrorPage
        brand={<Brand />}
        homeHref="/"
        onRetry={() => {
          reset()
          void router.invalidate()
        }}
      />
    </Providers>
  )
}
