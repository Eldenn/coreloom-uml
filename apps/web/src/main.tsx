import './styles/globals.css'

import { QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AuthProvider } from '@/auth/auth-context'
import type { Crumb } from '@/lib/crumbs'
import { queryClient } from '@/lib/query'
import type { Messages } from '@/messages'

import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
  // `staticData: { crumb }` on a route adds it to the header's breadcrumbs (src/routes/_authed.tsx):
  // a label for the route's own path, or the full trail (built from the route's loader data).
  interface StaticDataRouteOption {
    crumb?: (t: Messages, loaderData: unknown) => string | readonly Crumb[]
    /** The page uses the whole width next to the sidebar (editors), not the centred column. */
    fullWidth?: boolean
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
