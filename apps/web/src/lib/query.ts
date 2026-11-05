import { QueryClient } from '@tanstack/react-query'

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
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5_000 },
  },
})
