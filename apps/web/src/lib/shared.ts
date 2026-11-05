// The visitor's side of a share link: read the shared architecture, or unlock it with its code.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { client, TuyauError } from '@/lib/client'

export type SharedArchitecture = Awaited<
  ReturnType<typeof client.api.shared.unlock>
>['architecture']

/** What opening a link gave: the architecture, a code to ask for, or nothing to show. */
export type SharedResult =
  | {
      status: 'open'
      architecture: SharedArchitecture
      architectureId: number | null
    }
  | { status: 'locked'; title: string }
  | { status: 'unavailable' }

const sharedKey = (token: string) => ['shared', token] as const

function errorBody(error: unknown) {
  return error instanceof TuyauError
    ? (error.response as { title?: string; attemptsLeft?: number; retryAfterSeconds?: number })
    : undefined
}

export function useSharedArchitecture(token: string) {
  return useQuery({
    queryKey: sharedKey(token),
    queryFn: async (): Promise<SharedResult> => {
      try {
        const data = await client.api.shared.show({ params: { token } })
        return {
          status: 'open',
          architecture: data.architecture,
          architectureId: data.architectureId,
        }
      } catch (error) {
        if (error instanceof TuyauError && error.status === 401)
          return { status: 'locked', title: errorBody(error)?.title ?? '' }
        if (error instanceof TuyauError && error.status === 404) return { status: 'unavailable' }
        throw error
      }
    },
    retry: false,
  })
}

/** Why a code was refused: how many tries are left, or until when the link is locked. */
export interface UnlockRefusal {
  attemptsLeft?: number
  lockedUntil?: Date
}

export function unlockRefusal(error: unknown): UnlockRefusal {
  const body = errorBody(error)
  if (error instanceof TuyauError && error.status === 429)
    return { lockedUntil: new Date(Date.now() + (body?.retryAfterSeconds ?? 60) * 1000) }
  return { attemptsLeft: body?.attemptsLeft }
}

export function useUnlockShared(token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => client.api.shared.unlock({ params: { token }, body: { code } }),
    onSuccess: ({ architecture }) => {
      const opened: SharedResult = { status: 'open', architecture, architectureId: null }
      queryClient.setQueryData(sharedKey(token), opened)
    },
  })
}
