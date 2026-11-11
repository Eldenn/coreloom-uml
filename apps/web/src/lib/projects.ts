// Query and mutation hooks for projects (the pattern of src/lib/query.ts). A project holds the
// account's design work; its architectures are listed with `useArchitectures({ projectId })`.
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { architectureKeys } from '@/lib/architectures'
import { client } from '@/lib/client'
import { useT } from '@/lib/locale'

export type Project = Awaited<ReturnType<typeof client.api.projects.show>>['project']

export const projectKeys = {
  all: ['projects'] as const,
  list: (search: string) => ['projects', 'list', search] as const,
  detail: (id: number) => ['projects', 'detail', id] as const,
}

/** One project; route loaders read it too, for the breadcrumbs. */
export const projectQueryOptions = (id: number) =>
  queryOptions({
    queryKey: projectKeys.detail(id),
    queryFn: async () => (await client.api.projects.show({ params: { id } })).project,
  })

export function useProjects(search = '') {
  return useQuery({
    queryKey: projectKeys.list(search),
    queryFn: () =>
      client.api.projects.index({ query: { perPage: 100, ...(search ? { search } : {}) } }),
  })
}

export function useProject(id: number) {
  return useQuery(projectQueryOptions(id))
}

interface ProjectFields {
  name: string
  description?: string | null
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ProjectFields) => client.api.projects.store({ body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  })
}

export function useUpdateProject(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<ProjectFields>) =>
      client.api.projects.update({ params: { id }, body }),
    onSuccess: ({ project }) => {
      queryClient.setQueryData(projectKeys.detail(id), project)
      return queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

/** Its architectures go with it. */
export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.api.projects.destroy({ params: { id } }),
    onSuccess: async (_, id) => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(id) })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectKeys.all }),
        queryClient.invalidateQueries({ queryKey: architectureKeys.all }),
      ])
    },
  })
}

/** The select's value for "no project" (a select option can't have an empty value). */
export const NO_PROJECT = 'none'

export const toProjectId = (value: string) => (value === NO_PROJECT ? null : Number(value))

/** "No project" first, then the user's projects. */
export function useProjectOptions() {
  const t = useT()
  const projects = useProjects()
  return [
    { value: NO_PROJECT, label: t.architectures.noProject },
    ...(projects.data?.data ?? []).map((p) => ({ value: String(p.id), label: p.name })),
  ]
}
