// Conformance reviews: diagrams of a project checked against a code map by the user's own model.
// Starting one calls no model; this browser then asks for each diagram in turn, with the provider
// it keeps (`callBody`), and the findings come back stored. The key is sent with each call only.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'

import { client } from '@/lib/client'
import { MODEL_CALL, providerCallFailure, type StoredProvider } from '@/lib/llm-provider'
import { callBody } from '@/lib/llm-provider-body'

export type CodeReview = Awaited<ReturnType<typeof client.api.codeReviews.show>>['review']
export type CodeReviewDetail = Awaited<ReturnType<typeof client.api.codeReviews.show>>
export type CodeReviewFinding = CodeReviewDetail['findings'][number]
export type CodeReviewDiagram = CodeReview['diagrams'][number]
export type ConformanceStatus = CodeReviewFinding['status']
export type FindingResolution = CodeReviewFinding['resolution']

/** The diagram kinds a code map has a counterpart for (`REVIEWABLE_DIAGRAM_KINDS` in the API). */
export const REVIEWABLE_KINDS: readonly string[] = [
  'package',
  'component',
  'class',
  'sequence',
  'c4',
]

export const codeReviewKeys = {
  list: (projectId: number) => ['code-reviews', 'list', projectId] as const,
  detail: (id: number) => ['code-reviews', 'detail', id] as const,
}

/** The project's reviews, newest first (the API keeps ten). */
export function useCodeReviews(projectId: number) {
  return useQuery({
    queryKey: codeReviewKeys.list(projectId),
    queryFn: async () =>
      (await client.api.projects.codeReviews.index({ params: { id: projectId }, query: {} })).data,
  })
}

export function useCodeReview(id: number | undefined) {
  return useQuery({
    queryKey: codeReviewKeys.detail(id ?? 0),
    queryFn: () => client.api.codeReviews.show({ params: { id: id ?? 0 } }),
    enabled: id !== undefined,
  })
}

export function useStartCodeReview(projectId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { codeMapId: number; diagramIds: number[]; locale: 'en' | 'fr' }) =>
      client.api.codeReviews.store({ body }),
    onSuccess: (detail) => {
      queryClient.setQueryData(codeReviewKeys.detail(detail.review.id), detail)
      return queryClient.invalidateQueries({ queryKey: codeReviewKeys.list(projectId) })
    },
  })
}

export function useDeleteCodeReview(projectId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.api.codeReviews.destroy({ params: { id } }),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: codeReviewKeys.detail(id) })
      return queryClient.invalidateQueries({ queryKey: codeReviewKeys.list(projectId) })
    },
  })
}

/** Marks a finding done, dismissed or open again, and keeps the review's copy in step. */
export function useResolveFinding(projectId: number, reviewId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolution }: { id: number; resolution: FindingResolution }) =>
      client.api.codeReviewFindings.update({ params: { id }, body: { resolution } }),
    onSuccess: ({ finding }) => {
      queryClient.setQueryData<CodeReviewDetail>(codeReviewKeys.detail(reviewId), (old) => {
        if (!old) return old
        const findings = old.findings.map((item) => (item.id === finding.id ? finding : item))
        return {
          review: {
            ...old.review,
            openCount: findings.filter((item) => item.resolution === 'open').length,
          },
          findings,
        }
      })
      return queryClient.invalidateQueries({ queryKey: codeReviewKeys.list(projectId) })
    },
  })
}

/** What happened to the diagram being reviewed, as the screen tells it. */
export type RunFailure = ReturnType<typeof providerCallFailure>

/**
 * Reviews the pending (and failed) diagrams of a review, one call after the other, until all are
 * done or `stop()` is called. Each answer replaces the review in the query cache. A failure stops
 * the run, so a rate limit or a wrong key is not repeated for every diagram.
 */
export type ReviewRunner = ReturnType<typeof useReviewRunner>

export function useReviewRunner(projectId: number, review: CodeReview | undefined) {
  const queryClient = useQueryClient()
  const [current, setCurrent] = React.useState<number | null>(null)
  const [failure, setFailure] = React.useState<RunFailure | null>(null)
  const stopped = React.useRef(false)
  /** Read through a call, so a stop asked during an await is seen. */
  const isStopped = () => stopped.current

  const run = async (provider: StoredProvider, only?: number) => {
    if (!review || current !== null) return
    stopped.current = false
    setFailure(null)
    const queue = review.diagrams
      .filter((entry) => (only === undefined ? entry.status !== 'done' : entry.diagramId === only))
      .map((entry) => entry.diagramId)
    for (const diagramId of queue) {
      if (isStopped()) break
      setCurrent(diagramId)
      try {
        const detail = await client.api.codeReviews.diagrams.store({
          params: { id: review.id, diagramId },
          body: callBody(provider),
          ...MODEL_CALL,
        })
        queryClient.setQueryData<CodeReviewDetail>(codeReviewKeys.detail(review.id), (old) => ({
          review: detail.review,
          findings: [
            ...(old?.findings ?? []).filter((item) => item.diagramId !== diagramId),
            ...detail.findings,
          ],
        }))
      } catch (error) {
        setFailure(providerCallFailure(error))
        await queryClient.invalidateQueries({ queryKey: codeReviewKeys.detail(review.id) })
        break
      }
    }
    setCurrent(null)
    await queryClient.invalidateQueries({ queryKey: codeReviewKeys.list(projectId) })
  }

  return {
    run,
    current,
    running: current !== null,
    failure,
    stop: () => {
      stopped.current = true
    },
  }
}
