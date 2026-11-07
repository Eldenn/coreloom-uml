// The project forms and confirmations shared by the projects list and a project's page.
import { useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

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
import { useAppForm } from '@/components/ui/form'
import { toast } from '@/components/ui/sonner'
import { getErrorMessage } from '@/lib/client'
import { useT } from '@/lib/locale'
import { type Project, useCreateProject, useDeleteProject, useUpdateProject } from '@/lib/projects'

/** Same limits as the API (`app/projects/constants/limits.ts`). */
const NAME_MAX_LENGTH = 120
const DESCRIPTION_MAX_LENGTH = 2000

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function ProjectForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  defaultValues: { name: string; description: string }
  submitLabel: string
  onSubmit: (value: { name: string; description: string | null }) => Promise<void>
  onCancel: () => void
}) {
  const t = useT()
  const form = useAppForm({
    defaultValues,
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(1, t.projects.nameRequired).max(NAME_MAX_LENGTH),
        description: z.string().max(DESCRIPTION_MAX_LENGTH),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await onSubmit({ name: value.name.trim(), description: value.description.trim() || null })
      } catch (error) {
        toast.error(getErrorMessage(error, t.editor.failed))
      }
    },
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppForm>
        <form.AppField name="name">
          {(field) => <field.TextField label={t.projects.nameLabel} autoComplete="off" />}
        </form.AppField>
        <form.AppField name="description">
          {(field) => <field.TextareaField label={t.projects.descriptionLabel} />}
        </form.AppField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t.projects.cancel}
          </Button>
          <form.SubmitButton>{submitLabel}</form.SubmitButton>
        </DialogFooter>
      </form.AppForm>
    </form>
  )
}

/** Creates a project, then opens it. */
export function CreateProjectDialog({ open, onOpenChange }: DialogProps) {
  const t = useT()
  const navigate = useNavigate()
  const create = useCreateProject()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.projects.createTitle}</DialogTitle>
          <DialogDescription>{t.projects.createDescription}</DialogDescription>
        </DialogHeader>
        {open && (
          <ProjectForm
            defaultValues={{ name: '', description: '' }}
            submitLabel={t.projects.create}
            onCancel={() => {
              onOpenChange(false)
            }}
            onSubmit={async (body) => {
              const { project } = await create.mutateAsync(body)
              onOpenChange(false)
              await navigate({ to: '/projects/$projectId', params: { projectId: project.id } })
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Renames a project and changes its description. */
export function EditProjectDialog({
  project,
  open,
  onOpenChange,
  onSaved,
}: DialogProps & { project: Project; onSaved?: () => void }) {
  const t = useT()
  const update = useUpdateProject(project.id)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.projects.editTitle}</DialogTitle>
        </DialogHeader>
        {open && (
          <ProjectForm
            defaultValues={{ name: project.name, description: project.description ?? '' }}
            submitLabel={t.projects.save}
            onCancel={() => {
              onOpenChange(false)
            }}
            onSubmit={async (body) => {
              await update.mutateAsync(body)
              onOpenChange(false)
              toast.success(t.projects.renamed)
              onSaved?.()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Deletes a project and, with it, its architectures. */
export function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
  onDeleted,
}: DialogProps & { project: Project; onDeleted?: () => void }) {
  const t = useT()
  const remove = useDeleteProject()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.projects.deleteTitle(project.name)}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.projects.deleteText(project.architectureCount)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.projects.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              try {
                await remove.mutateAsync(project.id)
                toast.success(t.projects.deleted)
                onDeleted?.()
              } catch (error) {
                toast.error(getErrorMessage(error, t.editor.failed))
              }
            }}
          >
            {t.projects.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
