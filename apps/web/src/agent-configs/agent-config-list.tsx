// Agent conventions as rows, and the dialogs that create, rename and move one: used by the page of
// all configurations (in a project or not) and by a configuration's own page.
import { Link, useNavigate } from '@tanstack/react-router'
import { BotIcon, PlusIcon } from 'lucide-react'
import { z } from 'zod'

import { AgentConfigSetupContent } from '@/agent-configs/agent-config-setup'
import { ProjectLabel } from '@/architectures/architecture-list'
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { RelativeTime } from '@/components/ui/relative-time'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import {
  type AgentConfigSummary,
  NAME_MAX_LENGTH,
  type useAgentConfigs,
  useUpdateAgentConfig,
} from '@/lib/agent-configs'
import { getErrorMessage } from '@/lib/client'
import { useT } from '@/lib/locale'
import { NO_PROJECT, type Project, toProjectId, useProjectOptions } from '@/lib/projects'

export function AgentConfigList({
  query,
  searching,
  projects,
  onCreate,
}: {
  query: ReturnType<typeof useAgentConfigs>
  searching: boolean
  projects: readonly Project[]
  onCreate: () => void
}) {
  const t = useT()
  if (query.isPending)
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    )
  if (query.isError)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t.agents.loadFailed}</EmptyTitle>
        </EmptyHeader>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t.agents.retry}
        </Button>
      </Empty>
    )
  if (query.data.data.length === 0)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BotIcon />
          </EmptyMedia>
          <EmptyTitle>{t.agents.emptyTitle}</EmptyTitle>
          {!searching && <EmptyDescription>{t.agents.allEmptyDescription}</EmptyDescription>}
        </EmptyHeader>
        {!searching && (
          <Button onClick={onCreate}>
            <PlusIcon /> {t.agents.new}
          </Button>
        )}
      </Empty>
    )
  return (
    <ItemGroup className="gap-2">
      {query.data.data.map((config) => (
        <AgentConfigRow key={config.id} config={config} projects={projects} />
      ))}
    </ItemGroup>
  )
}

function AgentConfigRow({
  config,
  projects,
}: {
  config: AgentConfigSummary
  projects: readonly Project[]
}) {
  return (
    <Item variant="outline" className="relative">
      <ItemMedia variant="icon">
        <BotIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          {/* The whole row opens the configuration; the project link stays clickable on top. */}
          <Link
            to="/agent-configs/$id"
            params={{ id: config.id }}
            className="rounded-sm outline-none after:absolute after:inset-0 focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            {config.name}
          </Link>
        </ItemTitle>
        <ItemDescription className="relative">
          <ProjectLabel projects={projects} projectId={config.projectId} />
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <RelativeTime
          date={config.updatedAt}
          className="hidden text-[13px] text-muted-foreground sm:inline"
        />
      </ItemActions>
    </Item>
  )
}

/** Creates a configuration, in no project by default, then opens its questions. */
export function CreateAgentConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const navigate = useNavigate()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.agents.createTitle}</DialogTitle>
          <DialogDescription>{t.agents.intro}</DialogDescription>
        </DialogHeader>
        <AgentConfigSetupContent
          defaultName=""
          onCreated={(id) => {
            onOpenChange(false)
            void navigate({
              to: '/agent-configs/$id',
              params: { id },
              search: { step: 'questions' },
            })
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

export function RenameAgentConfigDialog({
  config,
  open,
  onOpenChange,
  onSaved,
}: {
  config: AgentConfigSummary
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const t = useT()
  const update = useUpdateAgentConfig(config.id)
  const form = useAppForm({
    defaultValues: { name: config.name },
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(1, t.agents.nameRequired).max(NAME_MAX_LENGTH),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await update.mutateAsync({ name: value.name.trim() })
        onOpenChange(false)
        onSaved()
        toast.success(t.agents.renamed)
      } catch (error) {
        toast.error(getErrorMessage(error, t.agents.failed))
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.agents.renameTitle}</DialogTitle>
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
            <form.AppField name="name">
              {(field) => <field.TextField label={t.agents.nameLabel} autoComplete="off" />}
            </form.AppField>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false)
                }}
              >
                {t.agents.cancel}
              </Button>
              <form.SubmitButton>{t.agents.save}</form.SubmitButton>
            </DialogFooter>
          </form.AppForm>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Moves a configuration to another project (409 if it already has one), or out of its project. */
export function MoveAgentConfigDialog({
  config,
  open,
  onOpenChange,
  onSaved,
}: {
  config: AgentConfigSummary
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const t = useT()
  const current = String(config.projectId ?? NO_PROJECT)
  const targets = useProjectOptions().filter((option) => option.value !== current)
  const update = useUpdateAgentConfig(config.id)
  const form = useAppForm({
    defaultValues: { projectId: '' },
    validators: {
      onSubmit: z.object({ projectId: z.string().min(1, t.architectures.moveTargetRequired) }),
    },
    onSubmit: async ({ value }) => {
      try {
        await update.mutateAsync({ projectId: toProjectId(value.projectId) })
        form.reset()
        onOpenChange(false)
        onSaved()
        toast.success(t.agents.moved)
      } catch (error) {
        toast.error(getErrorMessage(error, t.agents.failed))
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.architectures.moveTitle(config.name)}</DialogTitle>
          <DialogDescription>{t.agents.moveDescription}</DialogDescription>
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
                {t.agents.cancel}
              </Button>
              <form.SubmitButton>{t.architectures.moveSubmit}</form.SubmitButton>
            </DialogFooter>
          </form.AppForm>
        </form>
      </DialogContent>
    </Dialog>
  )
}
