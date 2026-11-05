// One architecture: a tab per diagram, each edited with the Coreloom DiagramEditor and saved
// automatically. Interim screen: sharing, the save-status block and the workspace layout come
// from coreloom-ui once its next blocks are published.
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeftIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { PageHeader } from '@/components/app-shell'
import {
  canWrite,
  DIAGRAM_TEMPLATES,
  DiagramEditor,
  type DiagramFormat,
  writeDiagram,
} from '@/components/diagram-editor'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAppForm } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type Diagram,
  DIAGRAM_KINDS,
  type DiagramKind,
  useAddDiagram,
  useArchitecture,
  useDeleteDiagram,
  useSaveDiagram,
} from '@/lib/architectures'
import { TuyauError } from '@/lib/client'
import { useCoreloomI18n } from '@/lib/i18n'
import { useT } from '@/lib/locale'
import type { UmlParseResult, UmlSpec } from '@/lib/uml'
import { isPlantUml } from '@/lib/uml-plantuml'

/** Quiet time after the last change before a diagram is saved. */
const AUTOSAVE_DELAY_MS = 1200

export const Route = createFileRoute('/_authed/architectures/$id')({
  params: {
    parse: ({ id }) => ({ id: z.coerce.number().int().positive().parse(id) }),
    stringify: ({ id }) => ({ id: String(id) }),
  },
  validateSearch: z.object({ diagram: z.number().int().optional().catch(undefined) }),
  staticData: { crumb: (t) => t.nav.architectures },
  component: ArchitecturePage,
})

function ArchitecturePage() {
  const t = useT()
  const { id } = Route.useParams()
  const { diagram: selected } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: architecture, isPending, isError, refetch } = useArchitecture(id)
  const [adding, setAdding] = React.useState(false)
  // Bumped to throw away local edits and show the server's copy again (after a conflict).
  const [generation, setGeneration] = React.useState(0)

  if (isPending) return <Skeleton className="h-[560px] w-full" />
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

  const diagrams = architecture.diagrams
  const active = diagrams.find((d) => d.id === selected) ?? diagrams.at(0)
  const select = (diagramId: number) =>
    void navigate({ search: { diagram: diagramId }, replace: true })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={architecture.title}
        description={architecture.description ?? undefined}
        actions={
          <Button variant="ghost" asChild>
            <Link to="/architectures">
              <ArrowLeftIcon />
              {t.nav.architectures}
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={active ? String(active.id) : undefined}
          onValueChange={(value) => {
            select(Number(value))
          }}
        >
          <TabsList aria-label={t.editor.diagrams}>
            {diagrams.map((d) => (
              <TabsTrigger key={d.id} value={String(d.id)}>
                {d.title}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setAdding(true)
          }}
        >
          <PlusIcon />
          {t.editor.addDiagram}
        </Button>
      </div>
      {active && (
        <DiagramPane
          key={`${active.id}:${generation}`}
          architectureId={architecture.id}
          diagram={active}
          canDelete={diagrams.length > 1}
          onReload={async () => {
            await refetch()
            setGeneration((g) => g + 1)
          }}
          onDeleted={() => {
            const next = diagrams.find((d) => d.id !== active.id)
            if (next) select(next.id)
          }}
        />
      )}
      <AddDiagramDialog
        architectureId={architecture.id}
        open={adding}
        onOpenChange={setAdding}
        onAdded={select}
      />
    </div>
  )
}

/** The text a diagram opens with: its saved content, or the template for its kind. */
function initialText(diagram: Diagram): { text: string; format: DiagramFormat } {
  if (diagram.content) {
    const spec = diagram.content as unknown as UmlSpec
    const format: DiagramFormat = canWrite(spec.kind, diagram.format) ? diagram.format : 'json'
    return { text: writeDiagram(spec, format), format }
  }
  const template = DIAGRAM_TEMPLATES.find((tpl) => tpl.kind === diagram.kind)?.text ?? ''
  return { text: template, format: isPlantUml(template) ? 'plantuml' : 'mermaid' }
}

type SaveState = 'saved' | 'unsaved' | 'saving' | 'conflict' | 'failed'

function DiagramPane({
  architectureId,
  diagram,
  canDelete,
  onReload,
  onDeleted,
}: {
  architectureId: number
  diagram: Diagram
  canDelete: boolean
  onReload: () => Promise<void>
  onDeleted: () => void
}) {
  const t = useT()
  const [initial] = React.useState(() => initialText(diagram))
  const [text, setText] = React.useState(initial.text)
  const [format, setFormat] = React.useState(initial.format)
  const [state, setState] = React.useState<SaveState>('saved')
  const version = React.useRef(diagram.version)
  const saved = React.useRef(diagram.content ? JSON.stringify(diagram.content) : null)
  const pending = React.useRef<UmlSpec | null>(null)
  const save = useSaveDiagram(architectureId)
  const remove = useDeleteDiagram(architectureId)

  const flush = React.useCallback(
    async (force = false) => {
      const content = pending.current
      if (!content) return
      const json = JSON.stringify(content)
      setState('saving')
      try {
        const { diagram: stored } = await save.mutateAsync({
          diagramId: diagram.id,
          content: content as unknown as NonNullable<Diagram['content']>,
          version: version.current,
          force,
        })
        version.current = stored.version
        saved.current = json
        if (pending.current === content) {
          pending.current = null
          setState('saved')
        } else {
          setState('unsaved')
        }
      } catch (error) {
        setState(error instanceof TuyauError && error.status === 409 ? 'conflict' : 'failed')
      }
    },
    [diagram.id, save],
  )

  React.useEffect(() => {
    if (state !== 'unsaved') return
    const timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [state, text, flush])

  const onDiagramChange = React.useCallback((result: UmlParseResult) => {
    if (!result.diagram || result.problems.some((p) => p.severity === 'error')) return
    if (JSON.stringify(result.diagram) === saved.current) return
    pending.current = result.diagram
    setState((s) => (s === 'conflict' ? s : 'unsaved'))
  }, [])

  return (
    <div className="flex flex-col gap-3">
      {state === 'conflict' && (
        <Alert variant="warning">
          <AlertTitle>{t.editor.conflictTitle}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {t.editor.conflictDescription}
            <Button size="sm" variant="outline" onClick={() => void onReload()}>
              {t.editor.reload}
            </Button>
            <Button size="sm" onClick={() => void flush(true)}>
              {t.editor.overwrite}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <DiagramEditor
        value={text}
        onChange={setText}
        format={format}
        onFormatChange={(next) => {
          setFormat(next)
          save.mutate({ diagramId: diagram.id, format: next })
        }}
        onDiagramChange={onDiagramChange}
        fileName={diagram.title}
        height="calc(100vh - 320px)"
        actions={
          <div className="flex items-center gap-2">
            <SaveBadge state={state} onRetry={() => void flush()} />
            {canDelete && (
              <DeleteDiagramButton
                title={diagram.title}
                onConfirm={async () => {
                  await remove.mutateAsync(diagram.id)
                  toast.success(t.editor.diagramDeleted)
                  onDeleted()
                }}
              />
            )}
          </div>
        }
      />
    </div>
  )
}

const SAVE_BADGE_VARIANT = {
  saved: 'success',
  unsaved: 'secondary',
  saving: 'secondary',
  conflict: 'warning',
} as const

function SaveBadge({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const t = useT()
  if (state === 'failed')
    return (
      <Button size="sm" variant="ghost" onClick={onRetry}>
        <Badge variant="destructive">{t.editor.saveFailed}</Badge>
      </Button>
    )
  return (
    <Badge variant={SAVE_BADGE_VARIANT[state]} aria-live="polite">
      {t.editor.status[state]}
    </Badge>
  )
}

function DeleteDiagramButton({ title, onConfirm }: { title: string; onConfirm: () => unknown }) {
  const t = useT()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={t.editor.deleteDiagram}>
          <Trash2Icon />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.editor.deleteTitle(title)}</AlertDialogTitle>
          <AlertDialogDescription>{t.editor.deleteDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.architectures.cancel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void onConfirm()}>
            {t.architectures.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function AddDiagramDialog({
  architectureId,
  open,
  onOpenChange,
  onAdded,
}: {
  architectureId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (diagramId: number) => void
}) {
  const t = useT()
  const kinds = useCoreloomI18n().messages.diagram.kinds
  const add = useAddDiagram(architectureId)
  const form = useAppForm({
    defaultValues: { title: '', kind: 'class' as DiagramKind },
    validators: {
      onSubmit: z.object({
        title: z.string().trim().min(1, t.architectures.titleRequired).max(120),
        kind: z.enum(DIAGRAM_KINDS),
      }),
    },
    onSubmit: async ({ value }) => {
      const { diagram } = await add.mutateAsync({
        title: value.title.trim(),
        kind: value.kind,
      })
      form.reset()
      onOpenChange(false)
      onAdded(diagram.id)
    },
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.editor.addDiagram}</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.AppForm>
            <form.AppField name="title">
              {(field) => <field.TextField label={t.architectures.titleLabel} autoComplete="off" />}
            </form.AppField>
            <form.AppField name="kind">
              {(field) => (
                <field.SelectField
                  label={t.editor.kind}
                  options={DIAGRAM_KINDS.map((kind) => ({ value: kind, label: kinds[kind] }))}
                />
              )}
            </form.AppField>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false)
                }}
              >
                {t.architectures.cancel}
              </Button>
              <form.SubmitButton>{t.architectures.create}</form.SubmitButton>
            </DialogFooter>
          </form.AppForm>
        </form>
      </DialogContent>
    </Dialog>
  )
}
