// Query and mutation hooks for an architecture's milestones: named states of all its views, to
// compare with and to go back to. An architecture holds at most fifty, so one page reads them all.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { architectureKeys } from '@/lib/architectures'
import { client } from '@/lib/client'

export type Milestone = Awaited<
  ReturnType<typeof client.api.architectures.milestones.store>
>['milestone']
export type MilestoneDetail = Awaited<
  ReturnType<typeof client.api.architectures.milestones.show>
>['milestone']

/** Same limit as the API (`MILESTONE_NAME_MAX_LENGTH`). */
export const MILESTONE_NAME_MAX_LENGTH = 120

// Under the architectures' key: restoring or deleting the architecture refreshes them too.
const keys = {
  list: (architectureId: number) => ['architectures', 'milestones', architectureId] as const,
  detail: (architectureId: number, milestoneId: number) =>
    ['architectures', 'milestones', architectureId, milestoneId] as const,
}

/** The newest first, without the views they keep. */
export function useMilestones(architectureId: number, enabled: boolean) {
  return useQuery({
    queryKey: keys.list(architectureId),
    queryFn: async () =>
      (
        await client.api.architectures.milestones.index({
          params: { id: architectureId },
          query: { perPage: 100 },
        })
      ).data,
    enabled,
  })
}

/** One milestone with its views; it never changes, so it is read once. */
export function useMilestone(architectureId: number, milestoneId: number | null) {
  return useQuery({
    queryKey: keys.detail(architectureId, milestoneId ?? 0),
    queryFn: async () =>
      (
        await client.api.architectures.milestones.show({
          params: { id: architectureId, milestoneId: milestoneId ?? 0 },
        })
      ).milestone,
    enabled: milestoneId !== null,
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function useCreateMilestone(architectureId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      client.api.architectures.milestones.store({ params: { id: architectureId }, body: { name } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.list(architectureId) }),
  })
}

export function useDeleteMilestone(architectureId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (milestoneId: number) =>
      client.api.architectures.milestones.destroy({ params: { id: architectureId, milestoneId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.list(architectureId) }),
  })
}

/** Puts the views back as the milestone keeps them; the cached architecture takes the answer. */
export function useRestoreMilestone(architectureId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (milestoneId: number) =>
      client.api.architectures.milestones.restore({ params: { id: architectureId, milestoneId } }),
    onSuccess: ({ architecture }) => {
      queryClient.setQueryData(architectureKeys.detail(architectureId), architecture)
    },
  })
}
