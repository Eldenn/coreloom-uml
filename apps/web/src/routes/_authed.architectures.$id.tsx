// One architecture in the Coreloom diagram workspace: its views on the side, the open one in the
// editor, saved automatically, and the Share dialog for its link and access code.
import {
  parseDiagramText,
  stateToXState,
  type UmlDiagramKind,
  type XStateProblem,
} from '@coreloom-uml/uml'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { DownloadIcon, Share2Icon, SparklesIcon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { StateSimulationButton, StateSimulationPanel } from '@/architectures/state-simulation-panel'
import { AssistantLayout } from '@/assistant/assistant-panel'
import type { DiagramFormat } from '@/components/diagram-editor'
import { DiagramWorkspace } from '@/components/diagram-workspace'
import { ShareDialog } from '@/components/share-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import {
  type ArchitectureDetail,
  architectureKeys,
  architectureQueryOptions,
  DIAGRAM_KINDS,
  type DiagramKind,
  useAddDiagram,
  useArchitecture,
  useDeleteDiagram,
  useReorderDiagrams,
  useSaveDiagram,
  useSharing,
  useSharingActions,
  useUpdateArchitecture,
} from '@/lib/architectures'
import { getErrorMessage } from '@/lib/client'
import { architectureCrumbs } from '@/lib/crumbs'
import { downloadText } from '@/lib/download'
import { useFeature } from '@/lib/feature-flags'
import { useCoreloomI18n } from '@/lib/i18n'
import { useT } from '@/lib/locale'
import { type Project, projectQueryOptions } from '@/lib/projects'
import { useDiagramAutosave } from '@/lib/use-diagram-autosave'

export const Route = createFileRoute('/_authed/architectures/$id')({
  params: {
    parse: ({ id }) => ({ id: z.coerce.number().int().positive().parse(id) }),
    stringify: ({ id }) => ({ id: String(id) }),
  },
  validateSearch: z.object({ diagram: z.number().int().optional().catch(undefined) }),
  // Its project (if any) and title, for the breadcrumbs; the page shows its own error if it can't load.
  loader: async ({ context: { queryClient }, params: { id } }): Promise<CrumbData | null> => {
    try {
      const architecture = await queryClient.query({
        ...architectureQueryOptions(id),
        staleTime: 'static',
      })
      const project =
        architecture.projectId === null
          ? null
          : await queryClient.query({
              ...projectQueryOptions(architecture.projectId),
              staleTime: 'static',
            })
      return { project, id, title: architecture.title }
    } catch {
      return null
    }
  },
  staticData: {
    crumb: (t, data) => {
      const crumb = data as CrumbData | null
      const trail = architectureCrumbs(t, crumb?.project)
      return crumb ? [...trail, { label: crumb.title, href: `/architectures/${crumb.id}` }] : trail
    },
    fullWidth: true,
  },
  component: ArchitecturePage,
})

interface CrumbData {
  project: Project | null
  id: number
  title: string
}

function ArchitecturePage() {
  const t = useT()
  const { id } = Route.useParams()
  const { data: architecture, isPending, isError, refetch } = useArchitecture(id)

  if (isPending) return <Skeleton className="h-[calc(100svh-7.5rem)] w-full" />
  if (isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.editor.loadFailed}</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t.architectures.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )
  return <Workspace architecture={architecture} />
}

/** The window minus AppShell's header and gutters: the editor reaches the bottom. */
const WORKSPACE_HEIGHT = 'calc(100svh - 7.5rem)'

/** The kind given to an imported view whose text can't be read yet. */
const IMPORT_FALLBACK_KIND: DiagramKind = 'class'

function isKind(kind: UmlDiagramKind): kind is DiagramKind {
  return (DIAGRAM_KINDS as readonly string[]).includes(kind)
}

/**
 * What is docked beside the workspace: the assistant, or the simulation of one view with its
 * active states (pointed out on the drawing). One at a time; opening another view closes the
 * simulation.
 */
function useSidePanel(view: { id: number; kind: DiagramKind } | undefined) {
  const [assisting, setAssisting] = React.useState(false)
  const [simulated, setSimulated] = React.useState<number | null>(null)
  const [activeStates, setActiveStates] = React.useState<readonly string[]>([])
  const simulateButton = React.useRef<HTMLButtonElement>(null)
  return {
    assisting,
    simulating: view?.kind === 'state' && simulated === view.id,
    activeStates,
    setActiveStates,
    simulateButton,
    assist: (on: boolean) => {
      setAssisting(on)
      if (on) setSimulated(null)
    },
    simulate: (on: boolean) => {
      setSimulated(on && view ? view.id : null)
      if (on) setAssisting(false)
    },
    /** Closed from the panel: the focus goes back to the toggle. */
    stopSimulating: () => {
      setSimulated(null)
      simulateButton.current?.focus()
    },
  }
}

function Workspace({ architecture }: { architecture: ArchitectureDetail }) {
  const t = useT()
  const kinds = useCoreloomI18n().messages.diagram.kinds
  const { diagram: selected } = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const autosave = useDiagramAutosave(architecture)
  const updateArchitecture = useUpdateArchitecture(architecture.id)
  const add = useAddDiagram(architecture.id)
  const save = useSaveDiagram(architecture.id)
  const remove = useDeleteDiagram(architecture.id)
  const reorder = useReorderDiagrams(architecture.id)
  const [sharing, setSharing] = React.useState(false)
  // Imported files waiting for the views before them to be added.
  const imports = React.useRef<Promise<void>>(Promise.resolve())
  const queryClient = useQueryClient()

  const diagrams = architecture.diagrams
  const active = diagrams.find((d) => d.id === selected) ?? diagrams.at(0)
  const select = (diagramId: number) =>
    void navigate({ search: { diagram: diagramId }, replace: true })
  const byId = (viewId: string) => diagrams.find((d) => String(d.id) === viewId)
  const failed = (error: unknown) => toast.error(getErrorMessage(error, t.editor.failed))
  const open = active && { ...active, ...autosave.draftOf(active) }
  const side = useSidePanel(open)

  return (
    <div className="flex flex-col gap-3">
      <ConflictAlert architectureId={architecture.id} autosave={autosave} />
      {/* The simulation and the assistant share the side of the workspace: one at a time. */}
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 lg:flex-1">
          <AssistantLayout
            open={side.assisting}
            onOpenChange={side.assist}
            architecture={architecture}
            currentDiagramId={active?.id ?? null}
            autosave={autosave}
            height={WORKSPACE_HEIGHT}
          >
            <DiagramWorkspace
              title={architecture.title}
              onTitleChange={(title) => {
                updateArchitecture.mutate(
                  { title },
                  // The breadcrumbs read the title through the route loader.
                  { onSuccess: () => void router.invalidate(), onError: failed },
                )
              }}
              diagrams={diagrams.map((d) => ({
                id: String(d.id),
                title: d.title,
                ...autosave.draftOf(d),
              }))}
              activeId={active ? String(active.id) : ''}
              onActiveChange={(viewId) => {
                select(Number(viewId))
              }}
              onDiagramChange={(viewId, value, result, format) => {
                const diagram = byId(viewId)
                if (diagram) autosave.onDiagramChange(diagram, value, result, format)
              }}
              onAdd={(kind) => {
                if (!isKind(kind)) return
                add.mutate(
                  { title: kinds[kind], kind },
                  {
                    onSuccess: ({ diagram }) => {
                      select(diagram.id)
                    },
                    onError: failed,
                  },
                )
              }}
              onImport={({ title, value, result, format }) => {
                // A file that can't be read yet still opens, as a draft, in the kind the editor falls
                // back to; it is saved once its text reads.
                const kind = result.diagram?.kind ?? IMPORT_FALLBACK_KIND
                if (!isKind(kind)) {
                  toast.error(t.editor.importUnsupported)
                  return
                }
                // Several dropped files arrive in one event: they are added one after the other, in
                // order, each with its own text (mutate's callbacks would only run for the last one).
                imports.current = imports.current.then(() =>
                  add.mutateAsync({ title, kind }).then(
                    ({ diagram }) => {
                      select(diagram.id)
                      autosave.onDiagramChange(diagram, value, result, format)
                    },
                    (error: unknown) => {
                      failed(error)
                    },
                  ),
                )
              }}
              onRename={(viewId, title) => {
                save.mutate({ diagramId: Number(viewId), title }, { onError: failed })
              }}
              onReorder={(ids) => {
                queryClient.setQueryData<ArchitectureDetail>(
                  architectureKeys.detail(architecture.id),
                  (old) =>
                    old && {
                      ...old,
                      diagrams: ids.flatMap((viewId) =>
                        old.diagrams.filter((d) => String(d.id) === viewId),
                      ),
                    },
                )
                reorder.mutate(ids.map(Number), { onError: failed })
              }}
              onDelete={(viewId) => {
                remove.mutate(Number(viewId), {
                  onSuccess: () => {
                    toast.success(t.editor.diagramDeleted)
                    const next = diagrams.find((d) => String(d.id) !== viewId)
                    if (next && String(active?.id) === viewId) select(next.id)
                  },
                  onError: failed,
                })
              }}
              height={WORKSPACE_HEIGHT}
              highlighted={side.activeStates}
              saveState={autosave.state}
              savedAt={autosave.savedAt}
              onRetrySave={autosave.retry}
              actions={
                <WorkspaceActions
                  diagram={open}
                  simulating={side.simulating}
                  onSimulatingChange={side.simulate}
                  simulateButton={side.simulateButton}
                  assisting={side.assisting}
                  onAssistingChange={side.assist}
                  onSharingChange={setSharing}
                />
              }
            />
          </AssistantLayout>
        </div>
        {side.simulating && open && (
          <StateSimulationPanel
            value={open.value}
            format={open.format}
            height={WORKSPACE_HEIGHT}
            onActiveChange={side.setActiveStates}
            onClose={side.stopSimulating}
          />
        )}
      </div>
      <ShareArchitecture architecture={architecture} open={sharing} onOpenChange={setSharing} />
    </div>
  )
}

/** Shown when a save met a newer version from elsewhere: reload it, or overwrite it with ours. */
function ConflictAlert({
  architectureId,
  autosave,
}: {
  architectureId: number
  autosave: ReturnType<typeof useDiagramAutosave>
}) {
  const t = useT()
  const queryClient = useQueryClient()
  if (autosave.conflictId === null) return null
  return (
    <Alert variant="warning">
      <AlertTitle>{t.editor.conflictTitle}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-2">
        {t.editor.conflictDescription}
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const conflictId = autosave.conflictId
            await queryClient.invalidateQueries({
              queryKey: architectureKeys.detail(architectureId),
            })
            if (conflictId !== null) autosave.discard(conflictId)
          }}
        >
          {t.editor.reload}
        </Button>
        <Button size="sm" onClick={autosave.overwrite}>
          {t.editor.overwrite}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/** Saves the open state diagram as an XState v5 machine config, or says why it can't. */
function XStateDownload({ title, value, format }: OpenDiagram) {
  const t = useT()
  const exportDiagram = () => {
    const diagram = parseDiagramText(value, format).diagram
    if (diagram?.kind !== 'state') {
      toast.error(t.editor.xstateUnreadable)
      return
    }
    const { config, problems } = stateToXState(diagram)
    const list = (shown: XStateProblem[]) => (
      <ul className="m-0 list-disc pl-4">
        {[
          ...new Set(shown.map((p) => t.editor.xstateProblems[p.code](p.states?.join(', ') ?? ''))),
        ].map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    )
    if (!config) {
      toast.error(t.editor.xstateRefused, {
        description: list(problems.filter((p) => p.severity === 'error')),
      })
      return
    }
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    downloadText(
      `${slug || 'machine'}.xstate.json`,
      `${JSON.stringify(config, null, 2)}\n`,
      'application/json;charset=utf-8',
    )
    if (problems.length) toast.warning(t.editor.xstateWarnings, { description: list(problems) })
  }
  return (
    <Button size="sm" variant="outline" aria-label={t.editor.xstateLabel} onClick={exportDiagram}>
      <DownloadIcon />
      {t.editor.xstate}
    </Button>
  )
}

/** The open view, with the text being edited. */
interface OpenDiagram {
  kind: DiagramKind
  title: string
  value: string
  format: DiagramFormat
}

/**
 * The workspace toolbar: Simulate and the XState download (state diagrams), the assistant (behind
 * its flag), Share.
 */
function WorkspaceActions({
  diagram,
  simulating,
  onSimulatingChange,
  simulateButton,
  assisting,
  onAssistingChange,
  onSharingChange,
}: {
  diagram: OpenDiagram | undefined
  simulating: boolean
  onSimulatingChange: (open: boolean) => void
  simulateButton: React.Ref<HTMLButtonElement>
  assisting: boolean
  onAssistingChange: (open: boolean) => void
  onSharingChange: (open: boolean) => void
}) {
  const t = useT()
  const assistant = useFeature('diagram-assistant')
  return (
    <>
      {diagram?.kind === 'state' && (
        <>
          <StateSimulationButton
            ref={simulateButton}
            pressed={simulating}
            onPressedChange={onSimulatingChange}
          />
          <XStateDownload {...diagram} />
        </>
      )}
      {assistant && (
        <Button
          size="sm"
          variant="outline"
          aria-pressed={assisting}
          onClick={() => {
            onAssistingChange(!assisting)
          }}
        >
          <SparklesIcon />
          {t.assistant.open}
        </Button>
      )}
      <Button
        size="sm"
        onClick={() => {
          onSharingChange(true)
        }}
      >
        <Share2Icon />
        {t.editor.share}
      </Button>
    </>
  )
}

function ShareArchitecture({
  architecture,
  open,
  onOpenChange,
}: {
  architecture: ArchitectureDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const settings = useSharing(architecture.id, open)
  const actions = useSharingActions(architecture.id)
  const data = settings.data
  return (
    <ShareDialog
      open={open}
      onOpenChange={onOpenChange}
      title={architecture.title}
      visibility={data?.visibility ?? architecture.visibility}
      onVisibilityChange={async (visibility) => {
        await actions.setVisibility.mutateAsync(visibility)
      }}
      link={data?.link ?? undefined}
      code={data?.code ?? undefined}
      onRegenerateLink={async () => {
        await actions.regenerateLink.mutateAsync()
      }}
      onRegenerateCode={async () => {
        await actions.regenerateCode.mutateAsync()
      }}
      pending={settings.isPending}
      error={settings.isError ? t.editor.sharingFailed : undefined}
    />
  )
}
