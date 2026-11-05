import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '../auth/require-auth'
import { AppLayout } from '../components/layout/app-layout'

export const Route = createFileRoute('/_authed')({
  component: AuthedLayout,
})

function AuthedLayout() {
  return (
    <RequireAuth>
      <AppLayout />
    </RequireAuth>
  )
}
