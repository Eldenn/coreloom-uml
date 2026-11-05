import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, use } from 'react'

import { client, type User } from '@/lib/client'

/** Query key for the current-user (`GET /auth/me`) query. */
export const ME_QUERY_KEY = ['auth', 'me'] as const

interface AuthState {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName?: string) => Promise<void>
  logout: () => Promise<void>
  /**
   * Re-read the current user from the API (invalidates the me-query). Call after
   * a mutation that changes the user server-side (profile edit) or clears the
   * session (account deletion) — a failed `me` resolves to `null`, not an error.
   */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const { data: user = null, isLoading } = useQuery({
    queryKey: ME_QUERY_KEY,
    // A failed `me` means "not signed in" — resolve to null rather than throw.
    queryFn: async (): Promise<User | null> => {
      try {
        const { user } = await client.api.auth.me({})
        return user
      } catch {
        return null
      }
    },
  })

  const loginMutation = useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      client.api.auth.login({ body: vars }),
    onSuccess: ({ user }) => queryClient.setQueryData(ME_QUERY_KEY, user),
  })

  const registerMutation = useMutation({
    mutationFn: (vars: { email: string; password: string; fullName?: string }) =>
      client.api.auth.register({ body: vars }),
    onSuccess: ({ user }) => queryClient.setQueryData(ME_QUERY_KEY, user),
  })

  const logoutMutation = useMutation({
    mutationFn: () => client.api.auth.logout({}),
    onSuccess: () => queryClient.setQueryData(ME_QUERY_KEY, null),
  })

  const value: AuthState = {
    user,
    isLoading,
    login: async (email, password) => {
      await loginMutation.mutateAsync({ email, password })
    },
    register: async (email, password, fullName) => {
      await registerMutation.mutateAsync({ email, password, fullName })
    },
    logout: async () => {
      await logoutMutation.mutateAsync()
    },
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
    },
  }

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
