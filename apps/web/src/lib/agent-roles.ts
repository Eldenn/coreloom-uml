// Query and mutation hooks for the roles of an agent configuration (behind the `agent-roles`
// flag). The ready-made roles come from the API (`GET /role-presets`), never from the catalog
// package, so the screen always offers the server's version of them.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { type AgentConfig, agentConfigKeys, type AgentGeneration } from '@/lib/agent-configs'
import type { Right } from '@/lib/agent-role-fields'
import { client, getErrorMessage } from '@/lib/client'

export type AgentRole = AgentConfig['roles'][number]
export type RolePreset = Awaited<ReturnType<typeof client.api.rolePresets.index>>['presets'][number]
export type GenerationRole = AgentGeneration['roles'][number]
export type RightStatus = GenerationRole['matrix'][Right]

/** The API's message, followed by the reasons a role was refused (422) when it lists them. */
export function roleErrorMessage(error: unknown, fallback: string): string {
  const message = getErrorMessage(error, fallback)
  const body =
    error && typeof error === 'object' && 'response' in error
      ? (error.response as { error?: { problems?: unknown } } | undefined)
      : undefined
  const problems = body?.error?.problems
  return Array.isArray(problems) && problems.length > 0
    ? `${message}: ${problems.filter((p) => typeof p === 'string').join(' ; ')}`
    : message
}

export type RoleSuggestion = Awaited<
  ReturnType<typeof client.api.agentConfigs.roles.suggestions>
>['suggestions'][number]

/** The ready-made roles sharing tags with the rules the configuration holds. */
export function useRoleSuggestions(configId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['agent-configs', configId, 'role-suggestions'],
    queryFn: async () =>
      (await client.api.agentConfigs.roles.suggestions({ params: { id: String(configId) } }))
        .suggestions,
    enabled,
  })
}

export function useRolePresets(enabled: boolean) {
  return useQuery({
    queryKey: ['role-presets'],
    queryFn: async () => (await client.api.rolePresets.index({})).presets,
    enabled,
    staleTime: Infinity,
  })
}

export interface RoleFields {
  slug: string
  name: string
  description: string
  mission: string
  rights: Right[]
  scope: string[]
  forbidden: string[]
  done: { commands: string[]; text: string | null }
  escalation: string | null
}

/** Writes answer with the role and the impact: the configuration is read again. */
function useRefreshConfig(configId: number) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: agentConfigKeys.detail(configId) })
}

/** A role written by the owner, or a copy of a preset (`{ preset }`). 409 on a taken slug. */
export function useCreateRole(configId: number) {
  const refresh = useRefreshConfig(configId)
  return useMutation({
    mutationFn: (body: RoleFields | { preset: string }) =>
      client.api.agentConfigs.roles.store({ params: { id: configId }, body }),
    onSuccess: refresh,
  })
}

export function useUpdateRole(configId: number) {
  const refresh = useRefreshConfig(configId)
  return useMutation({
    mutationFn: ({ roleId, ...body }: Partial<RoleFields> & { roleId: number }) =>
      client.api.agentConfigs.roles.update({ params: { id: configId, roleId }, body }),
    onSuccess: refresh,
  })
}

export function useDeleteRole(configId: number) {
  const refresh = useRefreshConfig(configId)
  return useMutation({
    mutationFn: (roleId: number) =>
      client.api.agentConfigs.roles.destroy({ params: { id: configId, roleId } }),
    onSuccess: refresh,
  })
}
