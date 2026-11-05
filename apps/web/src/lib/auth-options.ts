import { useQuery } from '@tanstack/react-query'

import { client } from '@/lib/client'

/** What the sign-in screens may offer: the sign-up link only when sign-up is open (RM-06). */
export function useAuthOptions() {
  return useQuery({
    queryKey: ['auth', 'options'],
    queryFn: () => client.api.auth.options({}),
    staleTime: Infinity,
  })
}
