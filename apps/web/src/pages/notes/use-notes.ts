import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { client } from '../../lib/client'

/**
 * Data hooks for the `notes` domain — the reference for wiring a resource to the
 * API. Every read is a `useQuery` over the Tuyau `client`; every mutation is a
 * `useMutation` that invalidates `NOTES_QUERY_KEY` on success so the list
 * refetches. Copy this module's shape for new resources.
 */
export const NOTES_QUERY_KEY = ['notes'] as const

/** A single note as returned by the API (inferred from the Tuyau client). */
export type Note = Awaited<ReturnType<typeof client.api.notes.show>>['note']

export function useNotesList(page: number, perPage: number) {
  return useQuery({
    queryKey: [...NOTES_QUERY_KEY, 'list', { page, perPage }],
    queryFn: () => client.api.notes.index({ query: { page, perPage } }),
  })
}

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: [...NOTES_QUERY_KEY, 'detail', id],
    queryFn: () => {
      if (id == null) throw new Error('unreachable: query disabled while id is undefined')
      return client.api.notes.show({ params: { id } })
    },
    enabled: Boolean(id),
  })
}

export function useCreateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { title: string; body: string }) => client.api.notes.store({ body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTES_QUERY_KEY }),
  })
}

export function useUpdateNote(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { title?: string; body?: string }) =>
      client.api.notes.update({ params: { id }, body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTES_QUERY_KEY }),
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => client.api.notes.destroy({ params: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTES_QUERY_KEY }),
  })
}
