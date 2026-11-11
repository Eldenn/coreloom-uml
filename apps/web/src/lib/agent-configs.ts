// Query and mutation hooks for agent conventions, in a project or on their own (the pattern of
// src/lib/query.ts).
// The questionnaires come from the API (`GET /questionnaires`), never from the catalog package,
// so the screen always shows the server's version of them.
import {
  queryOptions,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { client } from '@/lib/client'
import { projectKeys } from '@/lib/projects'

type ConfigBody = Awaited<ReturnType<typeof client.api.agentConfigs.show>>

export type AgentConfig = ConfigBody['config']
export type AgentConfigSummary = Awaited<
  ReturnType<typeof client.api.agentConfigs.index>
>['data'][number]
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
  ReturnType<typeof client.api.agentConfigs.generations.show>
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
export const NAME_MAX_LENGTH = 120
export const RULE_TEXT_MAX_LENGTH = 300
export const RULES_MAX = 50

export const agentConfigKeys = {
  all: ['agent-configs'] as const,
  lists: ['agent-configs', 'list'] as const,
  list: (projectId: number | undefined, search: string) =>
    ['agent-configs', 'list', projectId, search] as const,
  questionnaires: ['questionnaires'] as const,
  questionnaire: (id: string) => ['questionnaires', id] as const,
  detail: (id: number) => ['agent-configs', 'detail', id] as const,
  generations: (id: number) => ['agent-configs', 'detail', id, 'generations'] as const,
  generation: (id: number, generationId: number) =>
    ['agent-configs', 'detail', id, 'generations', generationId] as const,
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

/** The configurations of one project (at most one), or all of them without `projectId`. */
export function useAgentConfigs({
  projectId,
  search = '',
}: {
  projectId?: number
  search?: string
}) {
  return useQuery({
    queryKey: agentConfigKeys.list(projectId, search),
    queryFn: () =>
      client.api.agentConfigs.index({
        query: {
          perPage: 100,
          ...(projectId ? { projectId } : {}),
          ...(search ? { search } : {}),
        },
      }),
  })
}

/** One configuration with its answers and rules; its page's loader reads it for the breadcrumbs. */
export const agentConfigQueryOptions = (id: number) =>
  queryOptions({
    queryKey: agentConfigKeys.detail(id),
    queryFn: () => client.api.agentConfigs.show({ params: { id } }),
  })

export function useAgentConfig(id: number) {
  return useQuery(agentConfigQueryOptions(id))
}

function useInvalidateSets() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: agentConfigKeys.lists }),
      queryClient.invalidateQueries({ queryKey: projectKeys.all }),
    ])
}

/** Writes that answer with the whole configuration replace the cached one. */
function useSetConfig(id: number) {
  const queryClient = useQueryClient()
  return (body: ConfigBody) => {
    queryClient.setQueryData(agentConfigKeys.detail(id), body)
  }
}

/** Writes that answer with the impact only refetch the configuration. */
function useRefreshConfig(id: number) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: agentConfigKeys.detail(id) })
}

interface ConfigFields {
  name: string
  /** `null` outside any project. */
  projectId: number | null
  questionnaires: string[]
  targets: Target[]
  notes?: string | null
}

/** 409 when the project already holds a configuration. */
export function useCreateAgentConfig() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateSets()
  return useMutation({
    mutationFn: (body: ConfigFields) => client.api.agentConfigs.store({ body }),
    onSuccess: (body) => {
      queryClient.setQueryData(agentConfigKeys.detail(body.config.id), body)
      return invalidate()
    },
  })
}

/** Renames it, moves it (`projectId`, `null` out of its project) or changes its source. */
export function useUpdateAgentConfig(id: number) {
  const setConfig = useSetConfig(id)
  const invalidate = useInvalidateSets()
  return useMutation({
    mutationFn: (body: Partial<ConfigFields>) =>
      client.api.agentConfigs.update({ params: { id }, body }),
    onSuccess: (body) => {
      setConfig(body)
      return invalidate()
    },
  })
}

/** Its answers, rules and generations go with it. The page showing it moves on by itself. */
export function useDeleteAgentConfig(id: number) {
  const invalidate = useInvalidateSets()
  return useMutation({
    mutationFn: () => client.api.agentConfigs.destroy({ params: { id } }),
    onSuccess: invalidate,
  })
}

export interface AnswerChange {
  questionnaireId: string
  questionId: string
  /** `null` removes the answer. */
  value: AnswerValue | null
  details?: string | null
}

export function useSaveAnswers(configId: number) {
  const setConfig = useSetConfig(configId)
  return useMutation({
    mutationFn: (answers: AnswerChange[]) =>
      client.api.agentConfigs.answers.update({
        params: { id: configId },
        body: { answers },
      }),
    onSuccess: setConfig,
  })
}

export function useCreateRule(configId: number) {
  const refresh = useRefreshConfig(configId)
  return useMutation({
    mutationFn: (body: { section: string; text: string; source?: AgentRule['source'] }) =>
      client.api.agentConfigs.rules.store({ params: { id: configId }, body }),
    onSuccess: refresh,
  })
}

export function useUpdateRule(configId: number) {
  const refresh = useRefreshConfig(configId)
  return useMutation({
    mutationFn: ({
      ruleId,
      ...body
    }: {
      ruleId: number
      section?: string
      text?: string
      position?: number
    }) => client.api.agentConfigs.rules.update({ params: { id: configId, ruleId }, body }),
    onSuccess: refresh,
  })
}

export function useDeleteRule(configId: number) {
  const refresh = useRefreshConfig(configId)
  return useMutation({
    mutationFn: (ruleId: number) =>
      client.api.agentConfigs.rules.destroy({ params: { id: configId, ruleId } }),
    onSuccess: refresh,
  })
}

export function useGenerate(configId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      (await client.api.agentConfigs.generations.store({ params: { id: configId } })).generation,
    onSuccess: async (generation) => {
      queryClient.setQueryData(agentConfigKeys.generation(configId, generation.id), generation)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: agentConfigKeys.detail(configId), exact: true }),
        queryClient.invalidateQueries({ queryKey: agentConfigKeys.generations(configId) }),
      ])
    },
  })
}

/** Newest first, without the files. */
export function useGenerations(configId: number) {
  return useQuery({
    queryKey: [...agentConfigKeys.generations(configId), 'list'],
    queryFn: () =>
      client.api.agentConfigs.generations.index({
        params: { id: configId },
        query: { perPage: 50 },
      }),
  })
}

/** A generation never changes once made. */
export function useGeneration(configId: number, id: number | null) {
  return useQuery({
    queryKey: agentConfigKeys.generation(configId, id ?? 0),
    queryFn: async () =>
      (
        await client.api.agentConfigs.generations.show({
          params: { id: configId, generationId: id ?? 0 },
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
