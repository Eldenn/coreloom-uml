import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

import { ME_QUERY_KEY } from '@/auth/auth-context'
import { TuyauError } from '@/lib/client'

/** The API answered 401: the session is gone (expired, signed out elsewhere). */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof TuyauError && error.status === 401
}

/**
 * Shared QueryClient, mounted once in `main.tsx`.
 *
 * Canonical data-hook pattern — copy this for list/detail pages:
 *   useQuery({ queryKey: ['widgets', id], queryFn: () => client.api.widgets.show({ params: { id } }) })
 *   useMutation({ mutationFn: (body) => client.api.widgets.store({ body }),
 *     onSuccess: () => queryClient.invalidateQueries({ queryKey: ['widgets'] }) })
 * Always call the Tuyau `client` through a query/mutation hook — never from useEffect or raw fetch.
 * `src/auth/auth-context.tsx` is the live reference (useQuery for GET /auth/me, useMutation for login/register/logout).
 */
export const queryClient: QueryClient = new QueryClient({
  // A 401 anywhere means the visitor is signed out: forget the current user, and the
  // signed-in layout (src/routes/_authed.tsx) sends them to /login.
  queryCache: new QueryCache({ onError: forgetUserOnUnauthorized }),
  mutationCache: new MutationCache({ onError: forgetUserOnUnauthorized }),
  defaultOptions: {
    // A 401 will not get better on a retry.
    queries: {
      retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 1,
      staleTime: 5_000,
    },
  },
})

function forgetUserOnUnauthorized(error: unknown) {
  if (isUnauthorized(error)) queryClient.setQueryData(ME_QUERY_KEY, null)
}
