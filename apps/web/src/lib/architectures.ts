// Query and mutation hooks for architectures and their diagrams (the pattern of src/lib/query.ts).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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
  'class',
  'sequence',
  'state',
  'er',
  'usecase',
  'activity',
] as const satisfies readonly DiagramKind[]

export const architectureKeys = {
  all: ['architectures'] as const,
  list: (search: string) => ['architectures', 'list', search] as const,
  detail: (id: number) => ['architectures', 'detail', id] as const,
}

export function useArchitectures(search: string) {
  return useQuery({
    queryKey: architectureKeys.list(search),
    queryFn: () =>
      client.api.architectures.index({
        query: { perPage: 100, ...(search ? { search } : {}) },
      }),
  })
}

export function useArchitecture(id: number) {
  return useQuery({
    queryKey: architectureKeys.detail(id),
    queryFn: async () => (await client.api.architectures.show({ params: { id } })).architecture,
  })
}

export function useCreateArchitecture() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      title: string
      description?: string | null
      diagram?: { kind: DiagramKind }
    }) => client.api.architectures.store({ body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: architectureKeys.all }),
  })
}

export function useDuplicateArchitecture() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.api.architectures.duplicate({ params: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: architectureKeys.all }),
  })
}

export function useDeleteArchitecture() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.api.architectures.destroy({ params: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: architectureKeys.all }),
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
