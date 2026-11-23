// An architecture's history: its milestones (named states of all its views), each to compare with
// the current state or with another milestone, to restore or to delete.
import { ArrowLeftIcon, HistoryIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { Alert, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { DiffViewer } from '@/components/ui/diff-viewer'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { useAppForm } from '@/components/ui/form'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Popconfirm } from '@/components/ui/popconfirm'
import { RelativeTime } from '@/components/ui/relative-time'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import type { ArchitectureDetail } from '@/lib/architectures'
import type { AutosaveControl } from '@/lib/assistant-changes'
import { getErrorMessage } from '@/lib/client'
import { diffText } from '@/lib/diff-text'
import { useT } from '@/lib/locale'
import { pairViews } from '@/lib/milestone-views'
import {
  type Milestone,
  MILESTONE_NAME_MAX_LENGTH,
  type MilestoneDetail,
  useCreateMilestone,
  useDeleteMilestone,
  useMilestone,
  useMilestones,
  useRestoreMilestone,
} from '@/lib/milestones'

interface Props {
  architecture: ArchitectureDetail
  autosave: AutosaveControl
}

/** The workspace's History button, with the dialog it opens. */
export function HistoryButton(props: Props) {
  const t = useT().milestones
  const [open, setOpen] = React.useState(false)
  const [compared, setCompared] = React.useState<Milestone | null>(null)
  const milestones = useMilestones(props.architecture.id, open)
  const onOpenChange = (next: boolean) => {
    if (!next) setCompared(null)
    setOpen(next)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <HistoryIcon />
          {t.open}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{compared ? compared.name : t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        {compared ? (
          <Comparison
            architecture={props.architecture}
            milestone={compared}
            others={(milestones.data ?? []).filter((m) => m.id !== compared.id)}
            onBack={() => {
              setCompared(null)
            }}
          />
        ) : (
          <>
            <KeepForm {...props} />
            <MilestoneList
              {...props}
              milestones={milestones}
              onCompare={setCompared}
              onRestored={() => {
                onOpenChange(false)
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Keeps the current state under a name, once what was typed in every view is saved. */
function KeepForm({ architecture, autosave }: Props) {
  const t = useT().milestones
  const create = useCreateMilestone(architecture.id)
  const form = useAppForm({
    defaultValues: { name: '' },
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(1, t.nameRequired).max(MILESTONE_NAME_MAX_LENGTH),
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        // A milestone keeps what is saved: text still on its way, or that does not read, is not.
        for (const diagram of architecture.diagrams) {
          if ((await autosave.flushDiagram(diagram.id)) !== 'saved') {
            toast.error(t.unsaved)
            return
          }
        }
        await create.mutateAsync(value.name.trim())
        toast.success(t.kept)
        formApi.reset()
      } catch (error) {
        toast.error(getErrorMessage(error, t.failed))
      }
    },
  })
  return (
    <form
      noValidate
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppForm>
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              label={t.name}
              placeholder={t.namePlaceholder}
              maxLength={MILESTONE_NAME_MAX_LENGTH}
              className="flex-1"
            />
          )}
        </form.AppField>
        <form.SubmitButton>{t.keep}</form.SubmitButton>
      </form.AppForm>
    </form>
  )
}

function MilestoneList({
  milestones,
  ...props
}: Props & {
  milestones: ReturnType<typeof useMilestones>
  onCompare: (milestone: Milestone) => void
  onRestored: () => void
}) {
  const t = useT().milestones
  // Takes the focus when the row that held it is deleted.
  const list = React.useRef<HTMLDivElement>(null)

  if (milestones.isPending) return <Skeleton className="h-24 w-full" />
  if (milestones.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.loadFailed}</AlertTitle>
      </Alert>
    )
  return (
    <div ref={list} tabIndex={-1} className="outline-none">
      {milestones.data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t.empty}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup>
          {milestones.data.map((milestone) => (
            <MilestoneRow
              key={milestone.id}
              {...props}
              milestone={milestone}
              onDeleted={() => list.current?.focus()}
            />
          ))}
        </ItemGroup>
      )}
    </div>
  )
}

function MilestoneRow({
  architecture,
  autosave,
  milestone,
  onCompare,
  onRestored,
  onDeleted,
}: Props & {
  milestone: Milestone
  onCompare: (milestone: Milestone) => void
  onRestored: () => void
  onDeleted: () => void
}) {
  const t = useT().milestones
  const restore = useRestoreMilestone(architecture.id)
  const remove = useDeleteMilestone(architecture.id)
  const guarded = async (run: () => Promise<unknown>, done: string) => {
    try {
      await run()
      toast.success(done)
    } catch (error) {
      toast.error(getErrorMessage(error, t.failed))
    }
  }
  // Saves wait, then every view reads the server's copy again: text typed since the last save is
  // dropped, never sent against what the restore wrote.
  const restoreIt = () =>
    autosave.exclusive(async () => {
      const { architecture: restored } = await restore.mutateAsync(milestone.id)
      for (const diagram of [...architecture.diagrams, ...restored.diagrams])
        autosave.reset(diagram.id)
      onRestored()
    })
  const deleteIt = async () => {
    await remove.mutateAsync(milestone.id)
    onDeleted()
  }
  return (
    <Item variant="outline" size="sm">
      <ItemContent>
        <ItemTitle>{milestone.name}</ItemTitle>
        <ItemDescription>
          <RelativeTime date={milestone.createdAt} /> · {t.views(milestone.diagramCount)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t.compareItem(milestone.name)}
          onClick={() => {
            onCompare(milestone)
          }}
        >
          {t.compare}
        </Button>
        <Popconfirm
          title={t.restoreItem(milestone.name)}
          description={t.restoreText}
          confirmLabel={t.restore}
          cancelLabel={t.cancel}
          destructive
          align="end"
          onConfirm={() => guarded(restoreIt, t.restored)}
        >
          <Button variant="ghost" size="sm">
            {t.restore}
          </Button>
        </Popconfirm>
        <Popconfirm
          title={t.deleteItem(milestone.name)}
          description={t.deleteText}
          confirmLabel={t.delete}
          cancelLabel={t.cancel}
          destructive
          align="end"
          onConfirm={() => guarded(deleteIt, t.deleted)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t.deleteItem(milestone.name)}
          >
            <Trash2Icon />
          </Button>
        </Popconfirm>
      </ItemActions>
    </Item>
  )
}

type Side = Pick<MilestoneDetail['diagrams'][number], 'title' | 'format' | 'content'> & {
  id: number
}

const STATUS_VARIANT = { added: 'success', removed: 'destructive', changed: 'warning' } as const
type Status = keyof typeof STATUS_VARIANT

const sidesOf = (detail: MilestoneDetail): Side[] =>
  detail.diagrams.map(({ diagramId, ...view }) => ({ id: diagramId, ...view }))

/** The views of two states, each with the text of both sides and what happened to it. */
function compare(before: Side[], after: Side[]) {
  return pairViews(before, after).map((pair) => {
    const older = pair.before ? diffText(pair.before.content, pair.before.format) : ''
    const newer = pair.after ? diffText(pair.after.content, pair.after.format) : ''
    let status: Status | null = null
    if (!pair.before) status = 'added'
    else if (!pair.after) status = 'removed'
    else if (older !== newer || pair.before.title !== pair.after.title) status = 'changed'
    const view = pair.after ?? pair.before
    return {
      id: view?.id,
      title: view?.title ?? '',
      // Only a view on both sides can have been renamed.
      was: pair.after && pair.before?.title !== pair.after.title ? pair.before?.title : undefined,
      older,
      newer,
      status,
    }
  })
}

/** One milestone against the current state or another milestone, the older of the two first. */
function Comparison({
  architecture,
  milestone,
  others,
  onBack,
}: {
  architecture: ArchitectureDetail
  milestone: Milestone
  others: Milestone[]
  onBack: () => void
}) {
  const t = useT().milestones
  const [againstId, setAgainstId] = React.useState<number | null>(null)
  const against = others.find((m) => m.id === againstId) ?? null
  const kept = useMilestone(architecture.id, milestone.id)
  const other = useMilestone(architecture.id, against?.id ?? null)

  let result: React.ReactNode = <Skeleton className="h-40 w-full" />
  if (kept.isError || other.isError)
    result = (
      <Alert variant="destructive">
        <AlertTitle>{t.loadFailed}</AlertTitle>
      </Alert>
    )
  else if (kept.data && against && other.data) {
    // ISO dates of one server compare as text.
    const pair = [
      { name: milestone.name, at: milestone.createdAt, views: sidesOf(kept.data) },
      { name: against.name, at: against.createdAt, views: sidesOf(other.data) },
    ].sort((a, b) => a.at.localeCompare(b.at))
    result = <ComparedViews before={pair[0]} after={pair[1]} />
  } else if (kept.data && !against)
    result = (
      <ComparedViews
        before={{ name: milestone.name, views: sidesOf(kept.data) }}
        after={{ name: t.current, views: architecture.diagrams }}
      />
    )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeftIcon />
          {t.back}
        </Button>
        <label className="ml-auto flex items-center gap-2 text-[13px] whitespace-nowrap text-muted-foreground">
          {t.compareWith}
          <NativeSelect
            value={against ? String(against.id) : ''}
            onChange={(e) => {
              setAgainstId(e.target.value ? Number(e.target.value) : null)
            }}
          >
            <NativeSelectOption value="">{t.current}</NativeSelectOption>
            {others.map((m) => (
              <NativeSelectOption key={m.id} value={String(m.id)}>
                {m.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>
      {result}
    </div>
  )
}

interface State {
  name: string
  views: Side[]
}

function ComparedViews({ before, after }: { before?: State; after?: State }) {
  const t = useT().milestones
  if (!before || !after) return null
  const rows = compare(before.views, after.views)
  const changed = rows.filter((row) => row.status !== null)
  const unchanged = rows.filter((row) => row.status === null).map((row) => row.title)
  if (changed.length === 0) return <p className="m-0 text-muted-foreground">{t.same}</p>
  return (
    <>
      {changed.map((row) => (
        <section key={row.id} className="flex flex-col gap-1.5">
          <h3 className="m-0 flex flex-wrap items-center gap-2 text-sm font-medium">
            {row.title}
            {row.status && (
              <Badge variant={STATUS_VARIANT[row.status]}>{t.statuses[row.status]}</Badge>
            )}
            {row.was !== undefined && (
              <span className="font-normal text-muted-foreground">{t.renamed(row.was)}</span>
            )}
          </h3>
          {row.older !== row.newer && (
            <DiffViewer
              before={row.older}
              after={row.newer}
              beforeLabel={before.name}
              afterLabel={after.name}
              wrap
              className="max-h-80 overflow-auto"
            />
          )}
        </section>
      ))}
      {unchanged.length > 0 && (
        <p className="m-0 text-[13px] text-muted-foreground">{t.unchanged(unchanged.join(', '))}</p>
      )}
    </>
  )
}
