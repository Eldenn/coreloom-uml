// One project: its architectures as cards, and the project's own actions (rename, delete).
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import {
  CopyIcon,
  FolderInputIcon,
  NetworkIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { PageHeader } from '@/components/app-shell'
import { DiagramCard } from '@/components/diagram-card'
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
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import {
  type ArchitectureSummary,
  DIAGRAM_KINDS,
  type DiagramKind,
  useArchitectures,
  useCreateArchitecture,
  useDeleteArchitecture,
  useDuplicateArchitecture,
  useMoveArchitecture,
} from '@/lib/architectures'
import { getErrorMessage } from '@/lib/client'
import { projectCrumbs } from '@/lib/crumbs'
import { useCoreloomI18n } from '@/lib/i18n'
import { useT } from '@/lib/locale'
import { type Project, projectQueryOptions, useProject, useProjects } from '@/lib/projects'
import { DeleteProjectDialog, EditProjectDialog } from '@/projects/project-dialogs'

export const Route = createFileRoute('/_authed/projects/$projectId')({
  params: {
    parse: ({ projectId }) => ({ projectId: z.coerce.number().int().positive().parse(projectId) }),
    stringify: ({ projectId }) => ({ projectId: String(projectId) }),
  },
  // `?new=true` opens the "New architecture" dialog.
  validateSearch: z.object({ new: z.boolean().optional().catch(undefined) }),
  // The project's name, for the breadcrumbs; the page shows its own error if it can't load.
  loader: ({ context: { queryClient }, params: { projectId } }) =>
    queryClient.query({ ...projectQueryOptions(projectId), staleTime: 'static' }).catch(() => null),
  staticData: { crumb: (t, project) => projectCrumbs(t, project as Project | null) },
  component: ProjectPage,
})

function ProjectPage() {
  const t = useT()
  const { projectId } = Route.useParams()
  const project = useProject(projectId)

  if (project.isPending) return <Skeleton className="h-36 w-full" />
  if (project.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.projects.notFound}</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void project.refetch()}>
            {t.projects.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )
  return <ProjectView project={project.data} />
}

function ProjectView({ project }: { project: Project }) {
  const t = useT()
  const router = useRouter()
  const navigate = useNavigate({ from: Route.fullPath })
  const { new: creating = false } = Route.useSearch()
  const [editing, setEditing] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [query, setQuery] = React.useState('')
  React.useEffect(() => {
    const id = setTimeout(() => {
      setQuery(search.trim())
    }, 250)
    return () => {
      clearTimeout(id)
    }
  }, [search])
  const architectures = useArchitectures(project.id, query)
  const setCreating = (open: boolean) =>
    void navigate({ search: open ? { new: true } : {}, replace: true })

  return (
    <>
      <PageHeader
        title={project.name}
        description={project.description ?? t.architectures.description}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(true)
              }}
            >
              <PencilIcon /> {t.projects.rename}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDeleting(true)
              }}
            >
              <Trash2Icon /> {t.projects.delete}
            </Button>
            <Button
              onClick={() => {
                setCreating(true)
              }}
            >
              <PlusIcon /> {t.architectures.new}
            </Button>
          </>
        }
      />
      <Input
        type="search"
        className="sm:w-72"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
        }}
        placeholder={t.architectures.search}
        aria-label={t.architectures.search}
      />
      <ArchitectureList
        query={architectures}
        searching={query !== ''}
        onCreate={() => {
          setCreating(true)
        }}
      />
      <CreateArchitectureDialog project={project} open={creating} onOpenChange={setCreating} />
      <EditProjectDialog
        project={project}
        open={editing}
        onOpenChange={setEditing}
        // The breadcrumbs read the name through the route loader.
        onSaved={() => void router.invalidate()}
      />
      <DeleteProjectDialog
        project={project}
        open={deleting}
        onOpenChange={setDeleting}
        onDeleted={() => void navigate({ to: '/projects', replace: true })}
      />
    </>
  )
}

function ArchitectureList({
  query,
  searching,
  onCreate,
}: {
  query: ReturnType<typeof useArchitectures>
  searching: boolean
  onCreate: () => void
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
          {!searching && <EmptyDescription>{t.architectures.emptyDescription}</EmptyDescription>}
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
        <li key={architecture.id}>
          <ArchitectureCard architecture={architecture} />
        </li>
      ))}
    </ul>
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
  const projects = useProjects()
  const move = useMoveArchitecture()
  const targets = (projects.data?.data ?? []).filter((p) => p.id !== architecture.projectId)
  const form = useAppForm({
    defaultValues: { projectId: '' },
    validators: {
      onSubmit: z.object({ projectId: z.string().min(1, t.architectures.moveTargetRequired) }),
    },
    onSubmit: async ({ value }) => {
      try {
        await move.mutateAsync({ id: architecture.id, projectId: Number(value.projectId) })
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
                <field.SelectField
                  label={t.architectures.moveTarget}
                  options={targets.map((p) => ({ value: String(p.id), label: p.name }))}
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
              <form.SubmitButton>{t.architectures.moveSubmit}</form.SubmitButton>
            </DialogFooter>
          </form.AppForm>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CreateArchitectureDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const kinds = useCoreloomI18n().messages.diagram.kinds
  const navigate = useNavigate()
  const create = useCreateArchitecture()
  const form = useAppForm({
    defaultValues: { title: '', description: '', kind: 'c4' as DiagramKind },
    validators: {
      onSubmit: z.object({
        title: z.string().trim().min(1, t.architectures.titleRequired).max(120),
        description: z.string().max(2000),
        kind: z.enum(DIAGRAM_KINDS),
      }),
    },
    onSubmit: async ({ value }) => {
      const { architecture } = await create.mutateAsync({
        projectId: project.id,
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
