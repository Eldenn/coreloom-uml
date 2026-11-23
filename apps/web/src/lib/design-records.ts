// Query and mutation hooks for a project's requirements and decisions (behind `design-records`):
// what its architecture has to hold, and the decisions taken to hold it. A project holds at most
// a hundred of each, so one page reads them all.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'

import { client } from '@/lib/client'
import { MODEL_CALL, type StoredProvider } from '@/lib/llm-provider'
import { callBody } from '@/lib/llm-provider-body'
import { projectKeys } from '@/lib/projects'

export type Requirement = Awaited<
  ReturnType<typeof client.api.projects.requirements.store>
>['requirement']
export type Decision = Awaited<ReturnType<typeof client.api.projects.decisions.store>>['decision']
type RequirementBody = Parameters<typeof client.api.projects.requirements.store>[0]['body']
type DecisionBody = Parameters<typeof client.api.projects.decisions.store>[0]['body']

export const REQUIREMENT_CATEGORIES = [
  'performance',
  'availability',
  'security',
  'cost',
  'evolvability',
  'constraint',
] as const satisfies readonly Requirement['category'][]
export const REQUIREMENT_PRIORITIES = [
  'must',
  'should',
] as const satisfies readonly Requirement['priority'][]
export const DECISION_STATUSES = [
  'proposed',
  'accepted',
  'superseded',
] as const satisfies readonly Decision['status'][]

/** Same limits as the API (`requirement.ts` and `decision.ts` constants). */
export const DESIGN_LIMITS = {
  statement: 500,
  measure: 300,
  title: 160,
  text: 4000,
  optionName: 120,
  optionText: 1000,
  options: 5,
} as const

const keys = {
  requirements: (projectId: number) => ['requirements', projectId] as const,
  decisions: (projectId: number) => ['decisions', projectId] as const,
}

export function useRequirements(projectId: number) {
  return useQuery({
    queryKey: keys.requirements(projectId),
    queryFn: async () =>
      (
        await client.api.projects.requirements.index({
          params: { id: projectId },
          query: { perPage: 100 },
        })
      ).data,
  })
}

export function useDecisions(projectId: number) {
  return useQuery({
    queryKey: keys.decisions(projectId),
    queryFn: async () =>
      (
        await client.api.projects.decisions.index({
          params: { id: projectId },
          query: { perPage: 100 },
        })
      ).data,
  })
}

type DesignReview = Awaited<ReturnType<typeof client.api.projects.designReview.show>>
export type DesignFinding = DesignReview['findings'][number]
export type DesignModelFinding = DesignReview['modelFindings'][number]

const reviewKey = (projectId: number) => [...keys.decisions(projectId), 'review'] as const

/**
 * What the records say against themselves, and what the owner's model found in the views; read
 * again with the decisions after any write.
 */
export function useDesignReview(projectId: number) {
  return useQuery({
    queryKey: reviewKey(projectId),
    queryFn: () => client.api.projects.designReview.show({ params: { id: projectId } }),
  })
}

/**
 * Reviews architectures with the owner's model, one call after the other; a failure stops the
 * run, so a wrong key is not repeated for each. `current` is the architecture being read.
 */
export function useModelDesignReview(projectId: number) {
  const queryClient = useQueryClient()
  const [current, setCurrent] = React.useState<number | null>(null)
  const mutation = useMutation({
    mutationFn: async ({
      provider,
      architectureIds,
      locale,
    }: {
      provider: StoredProvider
      architectureIds: readonly number[]
      locale: 'en' | 'fr'
    }) => {
      for (const id of architectureIds) {
        setCurrent(id)
        await client.api.architectures.designReview.store({
          params: { id },
          body: { ...callBody(provider), locale },
          ...MODEL_CALL,
        })
      }
    },
    onSettled: () => {
      setCurrent(null)
      return queryClient.invalidateQueries({ queryKey: reviewKey(projectId) })
    },
  })
  return { ...mutation, current }
}

/** Marks a finding of the model done, dismissed or open again. */
export function useResolveDesignFinding(projectId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      resolution,
    }: {
      id: number
      resolution: DesignModelFinding['resolution']
    }) => client.api.designFindings.update({ params: { id }, body: { resolution } }),
    onSuccess: ({ finding }) => {
      queryClient.setQueryData<DesignReview>(
        reviewKey(projectId),
        (old) =>
          old && {
            ...old,
            modelFindings: old.modelFindings.map((item) =>
              item.id === finding.id ? finding : item,
            ),
          },
      )
    },
  })
}

/** After a write: the list, the project's counts and, for a requirement, the decisions' links. */
function useRefresh(projectId: number) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.requirements(projectId) }),
      queryClient.invalidateQueries({ queryKey: keys.decisions(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
    ])
}

/** Creates a requirement, or changes the one with `id`. */
export function useSaveRequirement(projectId: number) {
  const onSuccess = useRefresh(projectId)
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: RequirementBody }) =>
      id === undefined
        ? client.api.projects.requirements.store({ params: { id: projectId }, body })
        : client.api.requirements.update({ params: { id }, body }),
    onSuccess,
  })
}

export function useDeleteRequirement(projectId: number) {
  const onSuccess = useRefresh(projectId)
  return useMutation({
    mutationFn: (id: number) => client.api.requirements.destroy({ params: { id } }),
    onSuccess,
  })
}

/** Creates a decision, or changes the one with `id`. */
export function useSaveDecision(projectId: number) {
  const onSuccess = useRefresh(projectId)
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: DecisionBody }) =>
      id === undefined
        ? client.api.projects.decisions.store({ params: { id: projectId }, body })
        : client.api.decisions.update({ params: { id }, body }),
    onSuccess,
  })
}

/** Whether a decision is a coding agent's proposal still waiting for the owner's review. */
export const awaitsReview = (decision: Decision) =>
  decision.origin === 'agent' && decision.status === 'proposed'

/** Keeps a coding agent's proposal: it becomes the owner's and counts from then on. */
export function useKeepDecision(projectId: number) {
  const onSuccess = useRefresh(projectId)
  return useMutation({
    mutationFn: (id: number) =>
      client.api.decisions.update({ params: { id }, body: { origin: 'owner' } }),
    onSuccess,
  })
}

export function useDeleteDecision(projectId: number) {
  const onSuccess = useRefresh(projectId)
  return useMutation({
    mutationFn: (id: number) => client.api.decisions.destroy({ params: { id } }),
    onSuccess,
  })
}
