import type { UmlSpec } from '@coreloom-uml/uml'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CopyIcon, NetworkIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { PageHeader } from '@/components/app-shell'
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
} from '@/lib/architectures'
import { useCoreloomI18n } from '@/lib/i18n'
import { useT } from '@/lib/locale'

export const Route = createFileRoute('/_authed/architectures/')({
  // `?new=true` opens the "New architecture" dialog (the ⌘K action links here).
  validateSearch: z.object({ new: z.boolean().optional().catch(undefined) }),
  staticData: { crumb: (t) => t.nav.architectures },
  component: ArchitecturesPage,
})

function ArchitecturesPage() {
  const t = useT()
  const navigate = useNavigate({ from: Route.fullPath })
  const { new: creating = false } = Route.useSearch()
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
  const architectures = useArchitectures(query)
  const setCreating = (open: boolean) =>
    void navigate({ search: open ? { new: true } : {}, replace: true })

  return (
    <>
      <PageHeader
        title={t.architectures.title}
        description={t.architectures.description}
        actions={
          <Button
            onClick={() => {
              setCreating(true)
            }}
          >
            <PlusIcon /> {t.architectures.new}
          </Button>
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
        onCreate={() => {
          setCreating(true)
        }}
      />
      <CreateArchitectureDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}

function ArchitectureList({
  query,
  onCreate,
}: {
  query: ReturnType<typeof useArchitectures>
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
          <EmptyDescription>{t.architectures.emptyDescription}</EmptyDescription>
        </EmptyHeader>
        <Button onClick={onCreate}>
          <PlusIcon /> {t.architectures.new}
        </Button>
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
  const cover = architecture.cover?.content as UmlSpec | null | undefined

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
            label: t.architectures.delete,
            icon: <Trash2Icon />,
            destructive: true,
            onSelect: () => {
              setConfirming(true)
            },
          },
        ]}
      />
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

function CreateArchitectureDialog({
  open,
  onOpenChange,
}: {
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
