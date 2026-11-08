// Query and mutation hooks for a project's agent conventions (the pattern of src/lib/query.ts).
// The questionnaires come from the API (`GET /questionnaires`), never from the catalog package,
// so the screen always shows the server's version of them.
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'

import { client, TuyauError } from '@/lib/client'
import { projectKeys } from '@/lib/projects'

type ConfigBody = Awaited<ReturnType<typeof client.api.projects.agentConfig.show>>

export type AgentConfig = ConfigBody['config']
export type AgentImpact = ConfigBody['impact']
export type AgentAnswer = AgentConfig['answers'][number]
export type AgentRule = AgentConfig['rules'][number]
export type Questionnaire = Awaited<
  ReturnType<typeof client.api.questionnaires.show>
>['questionnaire']
export type QuestionnaireSummary = Awaited<
  ReturnType<typeof client.api.questionnaires.index>
>['questionnaires'][number]
export type Question = Questionnaire['questions'][number]
export type Localized = Question['label']
export type AnswerValue = AgentAnswer['value']
export type AgentGeneration = Awaited<
  ReturnType<typeof client.api.projects.agentConfig.generations.show>
>['generation']
export type AgentFile = AgentGeneration['files'][number]
export type AgentSkill = AgentGeneration['skills']['compatible'][number]
export type Target = AgentConfig['targets'][number]

/** Every target the API accepts, in the order the screen lists them. */
export const TARGETS = [
  'claude-code',
  'cursor',
  'github-copilot',
  'gemini-cli',
  'codex',
  'generic',
] as const satisfies readonly Target[]

/** Longest "more details", free text and notes, as the API checks them. */
export const ANSWER_TEXT_MAX_LENGTH = 500
export const ANSWER_DETAILS_MAX_LENGTH = 2000
export const NOTES_MAX_LENGTH = 10_000
export const RULE_TEXT_MAX_LENGTH = 300
export const RULES_MAX = 50

export const agentConfigKeys = {
  all: ['agent-configs'] as const,
  questionnaires: ['questionnaires'] as const,
  questionnaire: (id: string) => ['questionnaires', id] as const,
  detail: (projectId: number) => ['agent-configs', projectId] as const,
  generations: (projectId: number) => ['agent-configs', projectId, 'generations'] as const,
  generation: (projectId: number, id: number) =>
    ['agent-configs', projectId, 'generations', id] as const,
}

export function useQuestionnaires() {
  return useQuery({
    queryKey: agentConfigKeys.questionnaires,
    queryFn: async () => (await client.api.questionnaires.index({})).questionnaires,
    staleTime: Infinity,
  })
}

/** The full questionnaires a configuration uses, in its order. */
export function useConfigQuestionnaires(ids: readonly string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: agentConfigKeys.questionnaire(id),
      queryFn: async () =>
        (await client.api.questionnaires.show({ params: { questionnaireId: id } })).questionnaire,
      staleTime: Infinity,
    })),
    combine: (results) => ({
      data: results.every((result) => result.isSuccess)
        ? results.map((result) => result.data)
        : undefined,
      isPending: results.some((result) => result.isPending),
      isError: results.some((result) => result.isError),
      refetch: () => Promise.all(results.map((result) => result.refetch())),
    }),
  })
}

/** The project's configuration; `null` when it has none yet (the API answers 404). */
export function useAgentConfig(projectId: number) {
  return useQuery({
    queryKey: agentConfigKeys.detail(projectId),
    queryFn: async (): Promise<ConfigBody | null> => {
      try {
        return await client.api.projects.agentConfig.show({ params: { id: projectId } })
      } catch (error) {
        if (error instanceof TuyauError && error.status === 404) return null
        throw error
      }
    },
  })
}

/** Writes that answer with the whole configuration replace the cached one. */
function useSetConfig(projectId: number) {
  const queryClient = useQueryClient()
  return (body: ConfigBody) => {
    queryClient.setQueryData(agentConfigKeys.detail(projectId), body)
  }
}

/** Writes that answer with the impact only refetch the configuration. */
function useRefreshConfig(projectId: number) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: agentConfigKeys.detail(projectId) })
}

interface ConfigFields {
  questionnaires: string[]
  targets: Target[]
  notes?: string | null
}

/** Creates the configuration, or replaces its questionnaires, targets and notes. */
export function useSaveAgentConfig(projectId: number) {
  const queryClient = useQueryClient()
  const setConfig = useSetConfig(projectId)
  return useMutation({
    mutationFn: (body: ConfigFields) =>
      client.api.projects.agentConfig.update({ params: { id: projectId }, body }),
    onSuccess: (body) => {
      setConfig(body)
      // The project's card counts its configuration.
      return queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

/** Its answers, rules and generations go with it. */
export function useDeleteAgentConfig(projectId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => client.api.projects.agentConfig.destroy({ params: { id: projectId } }),
    onSuccess: async () => {
      queryClient.setQueryData(agentConfigKeys.detail(projectId), null)
      queryClient.removeQueries({ queryKey: agentConfigKeys.generations(projectId) })
      await queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

export interface AnswerChange {
  questionnaireId: string
  questionId: string
  /** `null` removes the answer. */
  value: AnswerValue | null
  details?: string | null
}

export function useSaveAnswers(projectId: number) {
  const setConfig = useSetConfig(projectId)
  return useMutation({
    mutationFn: (answers: AnswerChange[]) =>
      client.api.projects.agentConfig.answers.update({
        params: { id: projectId },
        body: { answers },
      }),
    onSuccess: setConfig,
  })
}

export function useCreateRule(projectId: number) {
  const refresh = useRefreshConfig(projectId)
  return useMutation({
    mutationFn: (body: { section: string; text: string }) =>
      client.api.projects.agentConfig.rules.store({ params: { id: projectId }, body }),
    onSuccess: refresh,
  })
}

export function useUpdateRule(projectId: number) {
  const refresh = useRefreshConfig(projectId)
  return useMutation({
    mutationFn: ({
      ruleId,
      ...body
    }: {
      ruleId: number
      section?: string
      text?: string
      position?: number
    }) => client.api.projects.agentConfig.rules.update({ params: { id: projectId, ruleId }, body }),
    onSuccess: refresh,
  })
}

export function useDeleteRule(projectId: number) {
  const refresh = useRefreshConfig(projectId)
  return useMutation({
    mutationFn: (ruleId: number) =>
      client.api.projects.agentConfig.rules.destroy({ params: { id: projectId, ruleId } }),
    onSuccess: refresh,
  })
}

export function useGenerate(projectId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      (await client.api.projects.agentConfig.generations.store({ params: { id: projectId } }))
        .generation,
    onSuccess: async (generation) => {
      queryClient.setQueryData(agentConfigKeys.generation(projectId, generation.id), generation)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: agentConfigKeys.detail(projectId), exact: true }),
        queryClient.invalidateQueries({ queryKey: agentConfigKeys.generations(projectId) }),
      ])
    },
  })
}

/** Newest first, without the files. */
export function useGenerations(projectId: number) {
  return useQuery({
    queryKey: [...agentConfigKeys.generations(projectId), 'list'],
    queryFn: () =>
      client.api.projects.agentConfig.generations.index({
        params: { id: projectId },
        query: { perPage: 50 },
      }),
  })
}

/** A generation never changes once made. */
export function useGeneration(projectId: number, id: number | null) {
  return useQuery({
    queryKey: agentConfigKeys.generation(projectId, id ?? 0),
    queryFn: async () =>
      (
        await client.api.projects.agentConfig.generations.show({
          params: { id: projectId, generationId: id ?? 0 },
        })
      ).generation,
    enabled: id !== null,
    staleTime: Infinity,
  })
}

/** `questionnaireId/questionId`: how answers, drafts and the impact name a question. */
export function answerKey(questionnaireId: string, questionId: string) {
  return `${questionnaireId}/${questionId}`
}

/** Whether a draft value is a complete answer to its question (the API checks it again). */
export function isAnswered(question: Question, value: AnswerValue | null | undefined): boolean {
  if (value === null || value === undefined) return false
  switch (question.type) {
    case 'scale':
      return typeof value === 'number'
    case 'multi':
      return Array.isArray(value) && value.length > 0
    default:
      return typeof value === 'string' && value.trim() !== ''
  }
}
