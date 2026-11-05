import { createFileRoute, Navigate } from '@tanstack/react-router'

import { useAuth } from '@/auth/auth-context'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  return <Navigate to={user ? '/architectures' : '/login'} replace />
}
