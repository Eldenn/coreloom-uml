// Query and mutation hooks for the instance's web search service, as the admin manages it in the
// settings: saved once the service accepted its key, shown by its hint, removed. The API never
// answers the key.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { client, TuyauError } from '@/lib/client'

export type WebSearchSetting = Awaited<ReturnType<typeof client.api.admin.webSearch.show>>
export type WebSearchKind = 'linkup'
/** Why the service refused a key (`422 { error: { reason } }`), never its own message. */
export type WebSearchRefusal = 'unauthorized' | 'quota' | 'timeout' | 'unavailable'

export const webSearchKey = ['admin', 'web-search'] as const

export function useWebSearchSetting() {
  return useQuery({
    queryKey: webSearchKey,
    queryFn: () => client.api.admin.webSearch.show({}),
  })
}

export function useSaveWebSearch() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (body: { kind: WebSearchKind; apiKey: string }) =>
      client.api.admin.webSearch.update({ body }),
    onSuccess: (setting) => {
      queryClient.setQueryData(webSearchKey, setting)
      // Saved: the key is not kept in the mutation's variables while the section stays open.
      mutation.reset()
    },
  })
  return mutation
}

export function useDeleteWebSearch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => client.api.admin.webSearch.destroy({}),
    onSuccess: () => queryClient.setQueryData(webSearchKey, { service: null }),
  })
}

/** The service's refusal of a key, when that is why the save failed. */
export function webSearchRefusal(error: unknown): WebSearchRefusal | null {
  if (!(error instanceof TuyauError)) return null
  const body = error.response as { error?: { reason?: WebSearchRefusal } } | undefined
  return body?.error?.reason ?? null
}
