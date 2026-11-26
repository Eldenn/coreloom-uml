// Where the weekly search looks for skills, managed by the admin from the Skills screen:
// skills.sh (disabled, never deleted) and the GitHub repositories they trust. A change is only a
// row: the next run (or "Search now") reads it.
import { FolderGit2Icon, GlobeIcon, LibraryIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAppForm } from '@/components/ui/form'
import { Popconfirm } from '@/components/ui/popconfirm'
import { RelativeTime } from '@/components/ui/relative-time'
import { toast } from '@/components/ui/sonner'
import { Switch } from '@/components/ui/switch'
import { getErrorMessage, TuyauError } from '@/lib/client'
import { useT } from '@/lib/locale'
import {
  type SkillSource,
  useAddSkillSource,
  useDeleteSkillSource,
  useSkillSources,
  useUpdateSkillSource,
} from '@/lib/skills'

/** Same rules as the API (`app/skills/validators/skill-sources-input.ts`). */
const OWNER = /^[A-Za-z0-9-]{1,39}$/
const REPO = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/
const FOLDER = /^(?!(?:.*\/)?\.{1,2}(?:\/|$))\/?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\/?$/
const PATH_MAX = 200

/** The admin's button that opens the sources. */
export function SkillSourcesButton() {
  const t = useT().skills.sources
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true)
        }}
      >
        <LibraryIcon /> {t.open}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>{t.description}</DialogDescription>
          </DialogHeader>
          {open && <SkillSources />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function SkillSources() {
  const t = useT().skills.sources
  const sources = useSkillSources()
  return (
    <div className="flex flex-col gap-6">
      {sources.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t.loadFailed}</AlertDescription>
        </Alert>
      )}
      <ul className="m-0 flex list-none flex-col divide-y rounded-md border p-0">
        {sources.data?.map((source) => (
          <SourceRow key={source.id} source={source} />
        ))}
      </ul>
      <AddSourceForm />
    </div>
  )
}

function SourceRow({ source }: { source: SkillSource }) {
  const t = useT().skills.sources
  const update = useUpdateSkillSource()
  const remove = useDeleteSkillSource()
  const github = source.kind === 'github'
  const switchId = `skill-source-${source.id}`
  return (
    <li className="flex items-start gap-3 p-3">
      {github ? (
        <FolderGit2Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : (
        <GlobeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-foreground">{source.label}</span>
          <Badge variant="secondary">{github ? t.trusted : t.registry}</Badge>
        </div>
        <p className="m-0 text-sm text-muted-foreground">
          {t.skills(source.skills)}
          {' · '}
          {source.lastRunAt ? (
            <>
              {t.lastRun} <RelativeTime date={source.lastRunAt} />
            </>
          ) : (
            t.neverRun
          )}
        </p>
        {source.lastError && <p className="m-0 text-sm text-destructive">{source.lastError}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id={switchId}
          aria-label={t.enabled(source.label)}
          checked={source.enabled}
          disabled={update.isPending}
          onCheckedChange={(enabled) => {
            update.mutate(
              { id: source.id, enabled },
              { onError: () => toast.error(t.updateFailed) },
            )
          }}
        />
        {github && (
          <Popconfirm
            title={t.deleteTitle(source.label)}
            description={t.deleteText}
            confirmLabel={t.delete}
            destructive
            onConfirm={() =>
              remove.mutateAsync(source.id).then(
                () => toast.success(t.deleted),
                () => toast.error(t.deleteFailed),
              )
            }
          >
            <Button variant="ghost" size="icon-sm" aria-label={t.deleteTitle(source.label)}>
              <Trash2Icon />
            </Button>
          </Popconfirm>
        )}
      </div>
    </li>
  )
}

function AddSourceForm() {
  const t = useT().skills.sources
  const add = useAddSkillSource()
  const form = useAppForm({
    defaultValues: { owner: '', repo: '', path: '' },
    validators: {
      onSubmit: z.object({
        owner: z.string().trim().regex(OWNER, t.ownerInvalid),
        repo: z.string().trim().regex(REPO, t.repoInvalid),
        path: z
          .string()
          .trim()
          .max(PATH_MAX)
          .refine((path) => path === '' || FOLDER.test(path), t.pathInvalid),
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await add.mutateAsync({
          owner: value.owner.trim(),
          repo: value.repo.trim(),
          path: value.path.trim() || undefined,
        })
        toast.success(t.added)
        formApi.reset()
      } catch (error) {
        toast.error(
          error instanceof TuyauError && error.status === 409
            ? t.exists
            : getErrorMessage(error, t.addFailed),
        )
      }
    },
  })
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-sm font-medium text-foreground">{t.addTitle}</h3>
        <p className="m-0 text-sm text-muted-foreground">{t.addHelp}</p>
      </div>
      <form.AppForm>
        <div className="grid gap-3 sm:grid-cols-3">
          <form.AppField name="owner">
            {(field) => (
              <field.TextField label={t.owner} placeholder="anthropics" autoComplete="off" />
            )}
          </form.AppField>
          <form.AppField name="repo">
            {(field) => <field.TextField label={t.repo} placeholder="skills" autoComplete="off" />}
          </form.AppField>
          <form.AppField name="path">
            {(field) => <field.TextField label={t.path} placeholder="skills" autoComplete="off" />}
          </form.AppField>
        </div>
        <div className="flex justify-end">
          <form.SubmitButton>{t.add}</form.SubmitButton>
        </div>
      </form.AppForm>
    </form>
  )
}
