// Query and mutation hooks for agent conventions, in a project or on their own (the pattern of
// src/lib/query.ts).
// The ready-made rules come from the API (`GET /rule-packs`), never from the catalog package, so
// the screen always shows the server's version of them.
import {
  queryOptions,
  useIsMutating,
  useMutation,
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
export type AgentRule = AgentConfig['rules'][number]
/** A ready-made rule a configuration holds: its group's slot, its id, its typed text if any. */
export type HeldRule = AgentConfig['readyRules'][number]
export type RulePack = Awaited<ReturnType<typeof client.api.rulePacks.index>>['packs'][number]
export type RuleGroup = RulePack['groups'][number]
export type ReadyRule = RuleGroup['rules'][number]
export type Localized = RulePack['title']
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

/** Longest notes, name and rule, as the API checks them. */
export const NOTES_MAX_LENGTH = 10_000
export const NAME_MAX_LENGTH = 120
export const RULE_TEXT_MAX_LENGTH = 300
export const RULES_MAX = 50

export const agentConfigKeys = {
  all: ['agent-configs'] as const,
  lists: ['agent-configs', 'list'] as const,
  list: (projectId: number | undefined, search: string) =>
    ['agent-configs', 'list', projectId, search] as const,
  rulePacks: ['rule-packs'] as const,
  readyRules: (id: number) => ['agent-configs', 'ready-rules', id] as const,
  detail: (id: number) => ['agent-configs', 'detail', id] as const,
  generations: (id: number) => ['agent-configs', 'detail', id, 'generations'] as const,
  generation: (id: number, generationId: number) =>
    ['agent-configs', 'detail', id, 'generations', generationId] as const,
}

/** The whole catalog of ready-made rules: it only changes with a deployment. */
export function useRulePacks() {
  return useQuery({
    queryKey: agentConfigKeys.rulePacks,
    queryFn: async () => (await client.api.rulePacks.index({})).packs,
    staleTime: Infinity,
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

/** One configuration with everything it holds; its page's loader reads it for the breadcrumbs. */
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

type MergeBody = Awaited<ReturnType<typeof client.api.agentConfigs.merges.store>>
/** What the picked configurations cannot hold together, each with the sources to choose from. */
export type MergeConflicts = Extract<MergeBody, { conflicts: unknown }>['conflicts']

/**
 * Makes a new configuration from several, which stay as they are. While a conflict has no choice
 * the API creates nothing and answers `conflicts`, to send again with `choices`.
 */
export function useMergeAgentConfigs() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateSets()
  return useMutation({
    mutationFn: (body: {
      name: string
      sourceIds: number[]
      choices?: {
        readyRules: { slot: string; sourceId: number }[]
        roles: { slug: string; sourceId: number }[]
      }
    }) => client.api.agentConfigs.merges.store({ body }),
    onSuccess: (body) => {
      if (!('config' in body)) return
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

/** Its rules and generations go with it. The page showing it moves on by itself. */
export function useDeleteAgentConfig(id: number) {
  const invalidate = useInvalidateSets()
  return useMutation({
    mutationFn: () => client.api.agentConfigs.destroy({ params: { id } }),
    onSuccess: invalidate,
  })
}

export interface ReadyRulesChange {
  slot: string
  /** Every rule held in that group afterwards; none removes them. */
  rules: { rule: string; value?: string | null }[]
}

/**
 * Replaces the ready-made rules held in one group. The change shows at once and is undone if the
 * API refuses it (422 with a message). Saves of one configuration run one after the other, so two
 * quick changes to the same group reach the API in order.
 */
export function useSaveReadyRules(configId: number) {
  const queryClient = useQueryClient()
  const key = agentConfigKeys.detail(configId)
  const mutationKey = agentConfigKeys.readyRules(configId)
  const replaceSlot = (slot: string, rules: HeldRule[]) => {
    queryClient.setQueryData<ConfigBody>(key, (body) =>
      body
        ? {
            ...body,
            config: {
              ...body.config,
              readyRules: [
                ...body.config.readyRules.filter((held) => held.slot !== slot),
                ...rules,
              ],
            },
          }
        : body,
    )
  }
  return useMutation({
    mutationKey,
    scope: { id: mutationKey.join('/') },
    mutationFn: ({ slot, rules }: ReadyRulesChange) =>
      client.api.agentConfigs.readyRules.update({
        params: { id: configId, slot },
        body: { rules },
      }),
    onMutate: async ({ slot, rules }) => {
      await queryClient.cancelQueries({ queryKey: key, exact: true })
      const previous =
        queryClient
          .getQueryData<ConfigBody>(key)
          ?.config.readyRules.filter((r) => r.slot === slot) ?? []
      replaceSlot(
        slot,
        rules.map(({ rule, value }) => ({ slot, rule, value: value ?? null })),
      )
      return { previous }
    },
    onError: (_error, { slot }, context) => {
      // A later save of the same group may already show; only the last one puts the old rules back.
      if (context && queryClient.isMutating({ mutationKey }) === 1)
        replaceSlot(slot, context.previous)
    },
    onSuccess: (body) => {
      if (queryClient.isMutating({ mutationKey }) === 1) queryClient.setQueryData(key, body)
    },
  })
}

/** How many saves of ready-made rules are running or waiting for this configuration. */
export function useSavingReadyRules(configId: number) {
  return useIsMutating({ mutationKey: agentConfigKeys.readyRules(configId) })
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
