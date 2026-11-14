// Query and mutation hooks for a project's code maps: the maps, one map's summary, how a diagram
// matches it and the processes no diagram documents (the pattern of src/lib/query.ts).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiBaseUrl, client } from '@/lib/client'
import { projectKeys } from '@/lib/projects'

export type CodeMapSummary = Awaited<
  ReturnType<typeof client.api.projects.codeMaps.index>
>['data'][number]
export type CodeMapDetail = Awaited<ReturnType<typeof client.api.codeMaps.show>>['codeMap']
export type CodeMapContents = NonNullable<CodeMapDetail['summary']>
export type CodeMapLinks = Awaited<ReturnType<typeof client.api.codeMaps.links.show>>
export type DiagramCodeLink = CodeMapLinks['links'][number]
export type DiagramMatch = CodeMapLinks['match']
export type ElementMatch = DiagramMatch['elements'][number]
export type MatchFinding = DiagramMatch['findings'][number]
export type CodeMapProcesses = Awaited<ReturnType<typeof client.api.codeMaps.processes.index>>
export type CodeMapProcess = CodeMapProcesses['processes'][number]

/** Largest file the API takes, as `CODE_MAP_LIMITS.uploadSize` says. */
export const CODE_MAP_MAX_BYTES = 50 * 1024 * 1024

export const codeMapKeys = {
  all: ['code-maps'] as const,
  list: (projectId: number) => ['code-maps', 'list', projectId] as const,
  detail: (id: number) => ['code-maps', 'detail', id] as const,
  links: (id: number, diagramId: number) =>
    ['code-maps', 'detail', id, 'links', diagramId] as const,
  processes: (id: number) => ['code-maps', 'detail', id, 'processes'] as const,
}

/** The project's maps, newest first (the API keeps five). */
export function useCodeMaps(projectId: number) {
  return useQuery({
    queryKey: codeMapKeys.list(projectId),
    queryFn: async () =>
      (await client.api.projects.codeMaps.index({ params: { id: projectId }, query: {} })).data,
  })
}

export function useCodeMap(id: number | undefined) {
  return useQuery({
    queryKey: codeMapKeys.detail(id ?? 0),
    queryFn: async () => (await client.api.codeMaps.show({ params: { id: id ?? 0 } })).codeMap,
    enabled: id !== undefined,
  })
}

type UploadBody = Parameters<typeof client.api.projects.codeMaps.store>[0]['body']

/**
 * The upload's body. The registry types `file` as the server's `MultipartFile` (what Vine hands
 * the controller); the browser sends a `File` in its place, and Tuyau turns a body holding one
 * into multipart form data.
 */
function uploadBody(file: File): UploadBody {
  return { file } as unknown as UploadBody
}

export function useUploadCodeMap(projectId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) =>
      (
        await client.api.projects.codeMaps.store({
          params: { id: projectId },
          body: uploadBody(file),
        })
      ).codeMap,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: codeMapKeys.list(projectId) }),
        queryClient.invalidateQueries({ queryKey: projectKeys.all }),
      ]),
  })
}

export function useDeleteCodeMap(projectId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.api.codeMaps.destroy({ params: { id } }),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: codeMapKeys.detail(id) })
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: codeMapKeys.list(projectId) }),
        queryClient.invalidateQueries({ queryKey: projectKeys.all }),
      ])
    },
  })
}

/** How one diagram of the project matches the map, and the links its owner already reviewed. */
export function useCodeMapLinks(id: number, diagramId: number | undefined) {
  return useQuery({
    queryKey: codeMapKeys.links(id, diagramId ?? 0),
    queryFn: () =>
      client.api.codeMaps.links.show({
        params: { id },
        query: { diagramId: diagramId ?? 0 },
      }),
    enabled: diagramId !== undefined,
  })
}

/**
 * Replaces the diagram's links (the API keeps the whole list, so the caller sends every link it
 * wants kept) and stores the new match. The undocumented processes depend on the links too.
 */
export function useSaveCodeMapLinks(id: number, diagramId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (links: DiagramCodeLink[]) =>
      client.api.codeMaps.links.update({ params: { id }, body: { diagramId, links } }),
    onSuccess: (body) => {
      queryClient.setQueryData(codeMapKeys.links(id, diagramId), body)
      return queryClient.invalidateQueries({ queryKey: codeMapKeys.processes(id) })
    },
  })
}

export function useCodeMapProcesses(id: number) {
  return useQuery({
    queryKey: codeMapKeys.processes(id),
    queryFn: () => client.api.codeMaps.processes.index({ params: { id } }),
  })
}

/** `apps/api/app/orders/service.ts#OrderService` → its path and name; a folder key has no name. */
export function splitCodeKey(key: string): { path: string; name?: string } {
  const hash = key.indexOf('#')
  if (hash === -1) return { path: key }
  return { path: key.slice(0, hash), name: key.slice(hash + 1) }
}

/**
 * Where a code key opens on the repository's site (GitHub, GitLab…), at the map's commit or
 * branch: a folder as a tree, a file as a blob. Null without a repository or a revision.
 */
export function codeHref(
  map: Pick<CodeMapSummary, 'repositoryUrl' | 'commitSha' | 'branch'>,
  key: string,
  line?: number,
): string | null {
  const revision = map.commitSha ?? map.branch
  if (!map.repositoryUrl || !revision) return null
  let base: URL
  try {
    base = new URL(map.repositoryUrl)
  } catch {
    return null
  }
  const { path } = splitCodeKey(key)
  const folder = path.endsWith('/')
  const repo = base.pathname.replace(/\.git$/, '').replace(/\/+$/, '')
  const place = path.replace(/\/+$/, '').split('/').map(encodeURIComponent).join('/')
  base.pathname = `${repo}/${folder ? 'tree' : 'blob'}/${encodeURIComponent(revision)}/${place}`
  base.hash = line === undefined || folder ? '' : `L${String(line)}`
  return base.href
}

/** The CLI command that extracts the repository's map and sends it to this project. */
export function codeMapCommand(projectId: number): string {
  return `npx @coreloom-uml/cli map push --api-url ${apiBaseUrl} --project ${String(projectId)}`
}

/** A GitHub Actions job that sends a new map on every push to the main branch. */
export function codeMapWorkflow(projectId: number): string {
  return [
    'name: Code map',
    'on:',
    '  push:',
    '    branches: [main]',
    'jobs:',
    '  map:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - run: pipx install graphifyy==0.9.108',
    '      - uses: actions/setup-node@v4',
    '        with: { node-version: 24 }',
    `      - run: ${codeMapCommand(projectId)}`,
    '        env:',
    '          CORELOOM_UML_API_KEY: ${{ secrets.CORELOOM_UML_API_KEY }}',
  ].join('\n')
}

export const CODE_VIEWS = ['map', 'diagrams', 'review', 'processes'] as const
export type CodeView = (typeof CODE_VIEWS)[number]

/** Where the tab stands, kept in the page's URL. */
export interface CodeTabState {
  view?: CodeView | undefined
  map?: number | undefined
  diagram?: number | undefined
  /** The conformance review shown (`view=review`); the newest when absent. */
  review?: number | undefined
}
