// Architectures as cards, with their actions and the create/move dialogs: shared by a project's
// page and the page of all architectures (in a project or not).
import { Link, useNavigate } from '@tanstack/react-router'
import { CopyIcon, FolderInputIcon, NetworkIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { DiagramCard } from '@/components/diagram-card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useAppForm } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import {
  type ArchitectureSummary,
  DIAGRAM_KINDS,
  type DiagramKind,
  type useArchitectures,
  useCreateArchitecture,
  useDeleteArchitecture,
  useDuplicateArchitecture,
  useMoveArchitecture,
} from '@/lib/architectures'
import { getErrorMessage } from '@/lib/client'
import { useCoreloomI18n } from '@/lib/i18n'
import { useT } from '@/lib/locale'
import { type Project, useProjects } from '@/lib/projects'

/** The select's value for "no project" (a select option can't have an empty value). */
const NO_PROJECT = 'none'

const toProjectId = (value: string) => (value === NO_PROJECT ? null : Number(value))

/** "No project" first, then the user's projects. */
function useProjectOptions() {
  const t = useT()
  const projects = useProjects()
  return [
    { value: NO_PROJECT, label: t.architectures.noProject },
    ...(projects.data?.data ?? []).map((p) => ({ value: String(p.id), label: p.name })),
  ]
}

export function ArchitectureList({
  query,
  searching,
  onCreate,
  emptyDescription,
  projects,
}: {
  query: ReturnType<typeof useArchitectures>
  searching: boolean
  onCreate: () => void
  emptyDescription: string
  /** When given, each card says which project holds it. */
  projects?: readonly Project[]
}) {
  const t = useT()
  if (query.isPending)
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
    )
  if (query.isError)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t.architectures.loadFailed}</EmptyTitle>
        </EmptyHeader>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t.architectures.retry}
        </Button>
      </Empty>
    )
  if (query.data.data.length === 0)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <NetworkIcon />
          </EmptyMedia>
          <EmptyTitle>{t.architectures.emptyTitle}</EmptyTitle>
          {!searching && <EmptyDescription>{emptyDescription}</EmptyDescription>}
        </EmptyHeader>
        {!searching && (
          <Button onClick={onCreate}>
            <PlusIcon /> {t.architectures.new}
          </Button>
        )}
      </Empty>
    )
  return (
    <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {query.data.data.map((architecture) => (
        <li key={architecture.id} className="flex flex-col gap-1.5">
          <ArchitectureCard architecture={architecture} />
          {projects && <ProjectLabel projects={projects} projectId={architecture.projectId} />}
        </li>
      ))}
    </ul>
  )
}

function ProjectLabel({
  projects,
  projectId,
}: {
  projects: readonly Project[]
  projectId: number | null
}) {
  const t = useT()
  if (projectId === null)
    return <span className="text-sm text-muted-foreground">{t.architectures.noProject}</span>
  const project = projects.find((p) => p.id === projectId)
  if (!project) return null
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="text-sm text-muted-foreground underline-offset-4 hover:underline"
    >
      {t.architectures.inProject(project.name)}
    </Link>
  )
}

function ArchitectureCard({ architecture }: { architecture: ArchitectureSummary }) {
  const t = useT()
  const navigate = useNavigate()
  const duplicate = useDuplicateArchitecture()
  const remove = useDeleteArchitecture()
  const [confirming, setConfirming] = React.useState(false)
  const [moving, setMoving] = React.useState(false)
  const cover = architecture.cover?.content

  return (
    <>
      <DiagramCard
        className="h-full"
        title={architecture.title}
        href={`/architectures/${architecture.id}`}
        diagram={cover ?? undefined}
        visibility={architecture.visibility}
        updatedAt={new Date(architecture.updatedAt)}
        diagramCount={architecture.diagramCount}
        actions={[
          {
            label: t.architectures.open,
            icon: <NetworkIcon />,
            onSelect: () =>
              void navigate({ to: '/architectures/$id', params: { id: architecture.id } }),
          },
          {
            label: t.architectures.duplicate,
            icon: <CopyIcon />,
            onSelect: () => {
              duplicate.mutate(architecture.id, {
                onSuccess: () => toast.success(t.architectures.duplicated),
              })
            },
          },
          {
            label: t.architectures.move,
            icon: <FolderInputIcon />,
            onSelect: () => {
              setMoving(true)
            },
          },
          {
            label: t.architectures.delete,
            icon: <Trash2Icon />,
            destructive: true,
            onSelect: () => {
              setConfirming(true)
            },
          },
        ]}
      />
      <MoveArchitectureDialog architecture={architecture} open={moving} onOpenChange={setMoving} />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.architectures.deleteTitle(architecture.title)}</AlertDialogTitle>
            <AlertDialogDescription>{t.architectures.deleteText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.architectures.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                await remove.mutateAsync(architecture.id)
                toast.success(t.architectures.deleted)
              }}
            >
              {t.architectures.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function MoveArchitectureDialog({
  architecture,
  open,
  onOpenChange,
}: {
  architecture: ArchitectureSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const current = String(architecture.projectId ?? NO_PROJECT)
  const targets = useProjectOptions().filter((option) => option.value !== current)
  const move = useMoveArchitecture()
  const form = useAppForm({
    defaultValues: { projectId: '' },
    validators: {
      onSubmit: z.object({ projectId: z.string().min(1, t.architectures.moveTargetRequired) }),
    },
    onSubmit: async ({ value }) => {
      try {
        await move.mutateAsync({ id: architecture.id, projectId: toProjectId(value.projectId) })
        form.reset()
        onOpenChange(false)
        toast.success(t.architectures.moved)
      } catch (error) {
        toast.error(getErrorMessage(error, t.editor.failed))
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.architectures.moveTitle(architecture.title)}</DialogTitle>
          <DialogDescription>{t.architectures.moveDescription}</DialogDescription>
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
            <form.AppField name="projectId">
              {(field) => (
                <field.SelectField label={t.architectures.moveTarget} options={targets} />
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
              <form.SubmitButton>{t.architectures.moveSubmit}</form.SubmitButton>
            </DialogFooter>
          </form.AppForm>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Creates an architecture in `projectId` by default, or in no project when it is omitted. */
export function CreateArchitectureDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId?: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const kinds = useCoreloomI18n().messages.diagram.kinds
  const navigate = useNavigate()
  const projectOptions = useProjectOptions()
  const create = useCreateArchitecture()
  const form = useAppForm({
    defaultValues: {
      title: '',
      description: '',
      kind: 'c4' as DiagramKind,
      projectId: String(projectId ?? NO_PROJECT),
    },
    validators: {
      onSubmit: z.object({
        title: z.string().trim().min(1, t.architectures.titleRequired).max(120),
        description: z.string().max(2000),
        kind: z.enum(DIAGRAM_KINDS),
        projectId: z.string(),
      }),
    },
    onSubmit: async ({ value }) => {
      const { architecture } = await create.mutateAsync({
        projectId: toProjectId(value.projectId),
        title: value.title.trim(),
        description: value.description.trim() || null,
        diagram: { kind: value.kind },
      })
      form.reset()
      onOpenChange(false)
      await navigate({ to: '/architectures/$id', params: { id: architecture.id } })
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.architectures.createTitle}</DialogTitle>
          <DialogDescription>{t.architectures.createDescription}</DialogDescription>
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
            <form.AppField name="description">
              {(field) => <field.TextareaField label={t.architectures.descriptionLabel} />}
            </form.AppField>
            <form.AppField name="projectId">
              {(field) => (
                <field.SelectField label={t.architectures.moveTarget} options={projectOptions} />
              )}
            </form.AppField>
            <form.AppField name="kind">
              {(field) => (
                <field.SelectField
                  label={t.architectures.firstDiagram}
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
