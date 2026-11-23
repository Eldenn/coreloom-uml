// Query and mutation hooks for a project's code maps: the maps, one map's summary, how a diagram
// matches it and the processes no diagram documents (the pattern of src/lib/query.ts).
import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { assistantKeys } from '@/lib/assistant'
import { apiBaseUrl, client } from '@/lib/client'
import { useFeature } from '@/lib/feature-flags'
import { githubKeys } from '@/lib/github'
import { MODEL_CALL, type StoredProvider, useStoredProvider } from '@/lib/llm-provider'
import { callBody } from '@/lib/llm-provider-body'
import { projectKeys } from '@/lib/projects'

export type CodeMapSummary = Awaited<
  ReturnType<typeof client.api.projects.codeMaps.index>
>['data'][number]
export type CodeMapStatus = CodeMapSummary['status']
export type CodeMapDetail = Awaited<ReturnType<typeof client.api.codeMaps.show>>['codeMap']
export type CodeMapContents = NonNullable<CodeMapDetail['summary']>
export type CodeMapLinks = Awaited<ReturnType<typeof client.api.codeMaps.links.show>>
export type DiagramCodeLink = CodeMapLinks['links'][number]
export type DiagramMatch = CodeMapLinks['match']
export type ElementMatch = DiagramMatch['elements'][number]
export type MatchFinding = DiagramMatch['findings'][number]
export type CodeMapProcesses = Awaited<ReturnType<typeof client.api.codeMaps.processes.index>>
export type CodeMapProcess = CodeMapProcesses['processes'][number]
export type CodeMapSuggestions = Awaited<ReturnType<typeof client.api.codeMaps.suggestions.index>>
export type CodeMapSuggestion = CodeMapSuggestions['suggestions'][number]
export type SuggestedDiagramKind = CodeMapSuggestion['kind']

/** Largest file the API takes, as `CODE_MAP_LIMITS.uploadSize` says. */
export const CODE_MAP_MAX_BYTES = 50 * 1024 * 1024

export const codeMapKeys = {
  all: ['code-maps'] as const,
  list: (projectId: number) => ['code-maps', 'list', projectId] as const,
  detail: (id: number) => ['code-maps', 'detail', id] as const,
  links: (id: number, diagramId: number) =>
    ['code-maps', 'detail', id, 'links', diagramId] as const,
  processes: (id: number) => ['code-maps', 'detail', id, 'processes'] as const,
  suggestions: (id: number) => ['code-maps', 'detail', id, 'suggestions'] as const,
  /** Every conformance read: they change with the links and with the project's maps. */
  conformance: ['code-maps', 'conformance'] as const,
}

/** How often a map the server is still reading is asked about again. */
const READING_POLL_MS = 3000

/** A GitHub import is read in the background: `pending`, then `running`, then ready or failed. */
export function isReading(status: CodeMapStatus): boolean {
  return status === 'pending' || status === 'running'
}

/** The project's maps, newest first (the API keeps five); polled while one is being read. */
export function useCodeMaps(projectId: number) {
  return useQuery({
    queryKey: codeMapKeys.list(projectId),
    queryFn: async () =>
      (await client.api.projects.codeMaps.index({ params: { id: projectId }, query: {} })).data,
    refetchInterval: (query) =>
      query.state.data?.some((map) => isReading(map.status)) ? READING_POLL_MS : false,
  })
}

/**
 * The ready map the assistant draws from in a project: the one `named` when it is a ready map of
 * that project, else the newest ready one. `id` is null when there is none, when the architecture
 * is outside any project, or while code maps are off.
 */
export function useDrawableCodeMap(
  projectId: number | null,
  named?: number,
): { id: number | null; isNamed: boolean } {
  const enabled = useFeature('code-maps') && projectId !== null
  const maps = useQuery({
    queryKey: codeMapKeys.list(projectId ?? 0),
    queryFn: async () =>
      (await client.api.projects.codeMaps.index({ params: { id: projectId ?? 0 }, query: {} }))
        .data,
    enabled,
  })
  const ready = (enabled ? (maps.data ?? []) : []).filter((map) => map.status === 'ready')
  const found = ready.find((map) => map.id === named)
  return { id: (found ?? ready.at(0))?.id ?? null, isNamed: found !== undefined }
}

export function useCodeMap(id: number | undefined) {
  return useQuery({
    queryKey: codeMapKeys.detail(id ?? 0),
    queryFn: async () => (await client.api.codeMaps.show({ params: { id: id ?? 0 } })).codeMap,
    enabled: id !== undefined,
    refetchInterval: (query) =>
      query.state.data && isReading(query.state.data.status) ? READING_POLL_MS : false,
  })
}

/**
 * Has the server clone a GitHub repository (public, or one the GitHub App reads for the user) and
 * read it: the new map comes back `pending` and the lists poll it until it is ready or failed.
 * `follow` makes the project read it again on each push.
 */
export function useImportGithubCodeMap(projectId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { url: string; branch?: string; follow?: boolean }) =>
      (await client.api.projects.codeMaps.github({ params: { id: projectId }, body })).codeMap,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: codeMapKeys.list(projectId) }),
        queryClient.invalidateQueries({ queryKey: projectKeys.all }),
        queryClient.invalidateQueries({ queryKey: githubKeys.follow(projectId) }),
      ]),
  })
}

/** The rules the API checks a repository with (`github-repository.ts`), for the form. */
export const GITHUB_REPOSITORY_PATTERN =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}?(?:\.git)?\/?$/
export const GIT_BRANCH_PATTERN =
  /^(?![-/.])(?!.*(?:\.\.|\/\/|\/\.))[A-Za-z0-9._/-]{1,200}(?<![/.]|\.lock)$/

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
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: codeMapKeys.processes(id) }),
        queryClient.invalidateQueries({ queryKey: codeMapKeys.conformance }),
      ])
    },
  })
}

export type CodeConformance = Awaited<ReturnType<typeof client.api.projects.codeMaps.conformance>>
export type ConformanceCounts = CodeConformance['counts']

/**
 * `GET /projects/:id/code-maps/conformance`: how the project's diagrams line up with a map (the
 * newest ready one when `mapId` is left out), counted. Deterministic: no model is called.
 */
export function useCodeConformance(projectId: number, mapId?: number, enabled = true) {
  return useQuery({
    queryKey: [...codeMapKeys.conformance, projectId, mapId ?? 'latest'] as const,
    queryFn: () =>
      client.api.projects.codeMaps.conformance({
        params: { id: projectId },
        query: mapId === undefined ? {} : { codeMapId: mapId },
      }),
    enabled,
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

export const CODE_VIEWS = ['map', 'suggestions', 'diagrams', 'review', 'processes'] as const
export type CodeView = (typeof CODE_VIEWS)[number]

/** Where the tab stands, kept in the page's URL. */
export interface CodeTabState {
  view?: CodeView | undefined
  map?: number | undefined
  diagram?: number | undefined
  /** The conformance review shown (`view=review`); the newest when absent. */
  review?: number | undefined
}

/** The diagram kinds a process is drawn as; sequence by default. */
export const PROCESS_DIAGRAM_KINDS = ['sequence', 'activity'] as const
export type ProcessDiagramKind = (typeof PROCESS_DIAGRAM_KINDS)[number]

/**
 * Has the user's own model draw an undocumented process as a new view: the proposal lands in a
 * new conversation of the architecture's assistant, to accept or reject there. One model call,
 * the key sent with it only.
 */
export function useProposeProcess(mapId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      provider,
      ...body
    }: {
      provider: StoredProvider
      entry: string
      architectureId: number
      kind: ProcessDiagramKind
      locale: 'en' | 'fr'
    }) =>
      client.api.codeMaps.processes.propose({
        params: { id: mapId },
        body: { ...callBody(provider), ...body },
        ...MODEL_CALL,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assistantKeys.list }),
  })
}

/** `GET /code-maps/:id/suggestions`: the diagrams the user's model proposed for the map. */
export function useCodeMapSuggestions(mapId: number) {
  return useQuery({
    queryKey: codeMapKeys.suggestions(mapId),
    queryFn: () => client.api.codeMaps.suggestions.index({ params: { id: mapId } }),
  })
}

/** Shared by the automatic run and the button, so that both show the same call in progress. */
const suggestKey = (mapId: number) => ['code-maps', 'suggest', mapId] as const

/** `POST /code-maps/:id/suggestions`: the user's model proposes diagrams for the map. */
export function useSuggestDiagrams(mapId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: suggestKey(mapId),
    mutationFn: ({ provider, locale }: { provider: StoredProvider; locale: 'en' | 'fr' }) =>
      client.api.codeMaps.suggestions.store({
        params: { id: mapId },
        body: { ...callBody(provider), locale },
        ...MODEL_CALL,
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(codeMapKeys.suggestions(mapId), result)
    },
  })
}

/** Whether the map's proposals are being asked for right now, from anywhere on the page. */
export function useSuggesting(mapId: number): boolean {
  return useIsMutating({ mutationKey: suggestKey(mapId) }) > 0
}

/**
 * Why the latest request for the map's proposals failed, the automatic one included; null when it
 * is running or succeeded.
 */
export function useSuggestFailure(mapId: number): Error | null {
  const states = useMutationState({
    filters: { mutationKey: suggestKey(mapId) },
    select: (mutation) => mutation.state,
  })
  const latest = states.at(-1)
  return latest?.status === 'error' ? latest.error : null
}

/** `PATCH /code-map-suggestions/:id`: set a proposal aside, or bring it back. */
export function useUpdateSuggestion(mapId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'open' | 'dismissed' }) =>
      client.api.codeMapSuggestions.update({ params: { id }, body: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: codeMapKeys.suggestions(mapId) }),
  })
}

/** `POST /code-map-suggestions/:id/draft`: the user's model draws the proposal as a new view. */
export function useDraftSuggestion(mapId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      provider,
      ...body
    }: {
      id: number
      provider: StoredProvider
      architectureId: number
      locale: 'en' | 'fr'
    }) =>
      client.api.codeMapSuggestions.draft({
        params: { id },
        body: { ...callBody(provider), ...body },
        ...MODEL_CALL,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: codeMapKeys.suggestions(mapId) }),
        queryClient.invalidateQueries({ queryKey: assistantKeys.list }),
      ])
    },
  })
}

export type DrawnMap = Pick<CodeMapDetail, 'id' | 'projectId' | 'status'>

/** Drawing from a map with the assistant: for a ready map, with the assistant on and a provider set. */
export function useDrawsWithAssistant(map: DrawnMap): boolean {
  const assistant = useFeature('diagram-assistant')
  const provider = useStoredProvider()
  return assistant && provider !== null && map.status === 'ready'
}
