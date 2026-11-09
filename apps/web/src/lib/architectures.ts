// Query and mutation hooks for architectures and their diagrams (the pattern of src/lib/query.ts).
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { client } from '@/lib/client'

export type ArchitectureSummary = Awaited<
  ReturnType<typeof client.api.architectures.index>
>['data'][number]
export type ArchitectureDetail = Awaited<
  ReturnType<typeof client.api.architectures.show>
>['architecture']
export type Diagram = ArchitectureDetail['diagrams'][number]
export type DiagramKind = Diagram['kind']
export type Visibility = ArchitectureDetail['visibility']

/** The diagram kinds offered when creating one, architecture views first. */
export const DIAGRAM_KINDS = [
  'c4',
  'deployment',
  'component',
  'package',
  'class',
  'sequence',
  'state',
  'er',
  'usecase',
  'activity',
] as const satisfies readonly DiagramKind[]

export const architectureKeys = {
  all: ['architectures'] as const,
  list: (projectId: number | undefined, search: string) =>
    ['architectures', 'list', projectId, search] as const,
  detail: (id: number) => ['architectures', 'detail', id] as const,
}

/** Projects show how many architectures they hold: a change to the set refreshes them too. */
const PROJECTS_KEY = ['projects'] as const

/** The architectures of one project, or all of them (in a project or not) without `projectId`. */
export function useArchitectures(projectId: number | undefined, search: string) {
  return useQuery({
    queryKey: architectureKeys.list(projectId, search),
    queryFn: () =>
      client.api.architectures.index({
        query: {
          perPage: 100,
          ...(projectId ? { projectId } : {}),
          ...(search ? { search } : {}),
        },
      }),
  })
}

/** One architecture with its diagrams; the editor's route loader reads it too, for the breadcrumbs. */
export const architectureQueryOptions = (id: number) =>
  queryOptions({
    queryKey: architectureKeys.detail(id),
    queryFn: async () => (await client.api.architectures.show({ params: { id } })).architecture,
  })

export function useArchitecture(id: number) {
  return useQuery(architectureQueryOptions(id))
}

function useInvalidateArchitectureSets() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: architectureKeys.all }),
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY }),
    ])
}

export function useCreateArchitecture() {
  const invalidate = useInvalidateArchitectureSets()
  return useMutation({
    mutationFn: (body: {
      projectId: number | null
      title: string
      description?: string | null
      diagram?: { kind: DiagramKind }
    }) => client.api.architectures.store({ body }),
    onSuccess: invalidate,
  })
}

export function useDuplicateArchitecture() {
  const invalidate = useInvalidateArchitectureSets()
  return useMutation({
    mutationFn: (id: number) => client.api.architectures.duplicate({ params: { id } }),
    onSuccess: invalidate,
  })
}

/** Moves an architecture to another of the user's projects, or out of its project (null). */
export function useMoveArchitecture() {
  const invalidate = useInvalidateArchitectureSets()
  return useMutation({
    mutationFn: ({ id, projectId }: { id: number; projectId: number | null }) =>
      client.api.architectures.update({ params: { id }, body: { projectId } }),
    onSuccess: invalidate,
  })
}

export function useDeleteArchitecture() {
  const invalidate = useInvalidateArchitectureSets()
  return useMutation({
    mutationFn: (id: number) => client.api.architectures.destroy({ params: { id } }),
    onSuccess: invalidate,
  })
}

export function useAddDiagram(architectureId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { title: string; kind: DiagramKind }) =>
      client.api.architectures.diagrams.store({ params: { id: architectureId }, body }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: architectureKeys.detail(architectureId) }),
  })
}

interface DiagramPatch {
  title?: string
  format?: Diagram['format']
  content?: NonNullable<Diagram['content']>
  version?: number
  force?: boolean
}

/** Saves a diagram; the cached architecture takes the saved diagram (and its new version). */
export function useSaveDiagram(architectureId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ diagramId, ...body }: DiagramPatch & { diagramId: number }) =>
      client.api.architectures.diagrams.update({
        params: { id: architectureId, diagramId },
        body,
      }),
    onSuccess: ({ diagram }) => {
      queryClient.setQueryData<ArchitectureDetail>(
        architectureKeys.detail(architectureId),
        (old) =>
          old && {
            ...old,
            diagrams: old.diagrams.map((d) => (d.id === diagram.id ? diagram : d)),
          },
      )
    },
  })
}

export function useDeleteDiagram(architectureId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (diagramId: number) =>
      client.api.architectures.diagrams.destroy({ params: { id: architectureId, diagramId } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: architectureKeys.detail(architectureId) }),
  })
}

export function useUpdateArchitecture(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { title?: string; description?: string | null }) =>
      client.api.architectures.update({ params: { id }, body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: architectureKeys.all }),
  })
}

export function useReorderDiagrams(architectureId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: number[]) =>
      client.api.architectures.diagrams.reorder({ params: { id: architectureId }, body: { ids } }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: architectureKeys.detail(architectureId) }),
  })
}

export const sharingKeys = {
  detail: (id: number) => ['architectures', 'sharing', id] as const,
}

/** The owner's sharing settings: visibility, link and, while protected, the access code. */
export function useSharing(id: number, enabled: boolean) {
  return useQuery({
    queryKey: sharingKeys.detail(id),
    queryFn: async () => (await client.api.architectures.sharing.show({ params: { id } })).sharing,
    enabled,
  })
}

/** Changes the visibility or regenerates the link or the code; the settings take the answer. */
export function useSharingActions(id: number) {
  const queryClient = useQueryClient()
  const onSuccess = async ({ sharing }: { sharing: SharingSettings }) => {
    queryClient.setQueryData(sharingKeys.detail(id), sharing)
    await queryClient.invalidateQueries({ queryKey: architectureKeys.all })
  }
  return {
    setVisibility: useMutation({
      mutationFn: (visibility: Visibility) =>
        client.api.architectures.sharing.update({ params: { id }, body: { visibility } }),
      onSuccess,
    }),
    regenerateLink: useMutation({
      mutationFn: () => client.api.architectures.sharing.regenerateLink({ params: { id } }),
      onSuccess,
    }),
    regenerateCode: useMutation({
      mutationFn: () => client.api.architectures.sharing.regenerateCode({ params: { id } }),
      onSuccess,
    }),
  }
}

export type SharingSettings = Awaited<
  ReturnType<typeof client.api.architectures.sharing.show>
>['sharing']
