// A configuration: where its files stand (impact), the rules, roles and skills it holds, the
// project notes and the coding tools, with "Generate" as the main action.
import { FileTextIcon, SparklesIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { AgentConfigRoles } from '@/agent-configs/agent-config-roles'
import { AgentConfigRules } from '@/agent-configs/agent-config-rules'
import { AgentConfigSkills } from '@/agent-configs/agent-config-skills'
import { useTargetOptions } from '@/agent-configs/catalog'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppForm } from '@/components/ui/form'
import { toast } from '@/components/ui/sonner'
import {
  type AgentConfig,
  type AgentImpact,
  NOTES_MAX_LENGTH,
  type RulePack,
  TARGETS,
  useDeleteAgentConfig,
  useGenerate,
  useUpdateAgentConfig,
} from '@/lib/agent-configs'
import { getErrorMessage } from '@/lib/client'
import { useFeature } from '@/lib/feature-flags'
import { useT } from '@/lib/locale'

export function AgentConfigSummary({
  configId,
  config,
  impact,
  packs,
  onBrowse,
  onShowGeneration,
  onDeleted,
}: {
  configId: number
  config: AgentConfig
  impact: AgentImpact
  packs: RulePack[]
  /** Opens the catalog of ready-made rules, on one group when its slot is given. */
  onBrowse: (slot?: string) => void
  onShowGeneration: (id: number) => void
  onDeleted: () => void
}) {
  const roles = useFeature('agent-roles')

  return (
    <div className="flex flex-col gap-6">
      <GenerateBar
        configId={configId}
        config={config}
        impact={impact}
        onShowGeneration={onShowGeneration}
      />
      <AgentConfigRules configId={configId} config={config} packs={packs} onBrowse={onBrowse} />
      {roles && <AgentConfigRoles configId={configId} config={config} />}
      <AgentConfigSkills configId={configId} config={config} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <NotesCard configId={configId} config={config} />
        <TargetsCard configId={configId} config={config} />
      </div>
      <DeleteConfig configId={configId} onDeleted={onDeleted} />
    </div>
  )
}

/** What the impact says, as one sentence: the changed groups of rules and the files they touch. */
function useImpactText() {
  const t = useT()
  return (impact: NonNullable<AgentImpact>) => {
    const files = impact.files
      .map((file) => {
        switch (file.change) {
          case 'added':
            return t.agents.fileChange.added(file.path)
          case 'removed':
            return t.agents.fileChange.removed(file.path)
          default:
            return t.agents.fileChange.modified(file.path, file.sections.join(', '))
        }
      })
      .join(' ; ')
    return files
      ? t.agents.staleText(impact.changedSlots.length, files)
      : t.agents.staleOnlyRevision
  }
}

function GenerateBar({
  configId,
  config,
  impact,
  onShowGeneration,
}: {
  configId: number
  config: AgentConfig
  impact: AgentImpact
  onShowGeneration: (id: number) => void
}) {
  const t = useT()
  const generate = useGenerate(configId)
  const impactText = useImpactText()
  const latest = config.latestGeneration
  const stale = impact?.stale ?? false

  const run = () => {
    generate.mutate(undefined, {
      onSuccess: (generation) => {
        toast.success(t.agents.generated)
        onShowGeneration(generation.id)
      },
      onError: (error) => toast.error(getErrorMessage(error, t.agents.failed)),
    })
  }

  const action = (
    <Button onClick={run} disabled={generate.isPending} aria-busy={generate.isPending || undefined}>
      <SparklesIcon /> {latest ? t.agents.regenerate : t.agents.generate}
    </Button>
  )
  const view = latest && (
    <Button
      variant="outline"
      onClick={() => {
        onShowGeneration(latest.id)
      }}
    >
      <FileTextIcon /> {t.agents.viewLatest}
    </Button>
  )

  if (latest && stale && impact)
    return (
      <Alert variant="warning">
        <AlertTitle>{t.agents.staleTitle}</AlertTitle>
        <AlertDescription>{impactText(impact)}</AlertDescription>
        <div className="col-start-2 mt-2 flex flex-wrap gap-2">
          {view}
          {action}
        </div>
      </Alert>
    )
  return (
    <Alert variant={latest ? 'success' : 'default'}>
      <AlertTitle>{latest ? t.agents.upToDate : t.agents.neverGenerated}</AlertTitle>
      <AlertDescription>{t.agents.intro}</AlertDescription>
      <div className="col-start-2 mt-2 flex flex-wrap gap-2">
        {view}
        {action}
      </div>
    </Alert>
  )
}

function NotesCard({ configId, config }: { configId: number; config: AgentConfig }) {
  const t = useT()
  const save = useUpdateAgentConfig(configId)
  const form = useAppForm({
    defaultValues: { notes: config.notes ?? '' },
    validators: {
      onSubmit: z.object({
        notes: z.string().max(NOTES_MAX_LENGTH, t.agents.textTooLong(NOTES_MAX_LENGTH)),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync({ notes: value.notes.trim() ? value.notes : null })
        toast.success(t.agents.notesSaved)
      } catch (error) {
        toast.error(getErrorMessage(error, t.agents.failed))
      }
    },
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.agents.notesTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.AppForm>
            <form.AppField name="notes">
              {(field) => (
                <field.TextareaField
                  label={t.agents.notesTitle}
                  hideLabel
                  description={t.agents.notesHint}
                  rows={6}
                  maxCount={NOTES_MAX_LENGTH}
                />
              )}
            </form.AppField>
            <div className="flex justify-end">
              <form.SubmitButton variant="outline">{t.agents.save}</form.SubmitButton>
            </div>
          </form.AppForm>
        </form>
      </CardContent>
    </Card>
  )
}

function TargetsCard({ configId, config }: { configId: number; config: AgentConfig }) {
  const t = useT()
  const save = useUpdateAgentConfig(configId)
  const options = useTargetOptions()
  const form = useAppForm({
    defaultValues: { targets: config.targets },
    validators: {
      onSubmit: z.object({ targets: z.array(z.enum(TARGETS)).min(1, t.agents.targetsRequired) }),
    },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync({ targets: value.targets })
        toast.success(t.agents.targetsSaved)
      } catch (error) {
        toast.error(getErrorMessage(error, t.agents.failed))
      }
    },
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.agents.targetsLabel}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.AppForm>
            <form.AppField name="targets">
              {(field) => (
                <field.CheckboxCardField
                  label={t.agents.targetsLabel}
                  hideLabel
                  description={t.agents.targetsHint}
                  options={options}
                />
              )}
            </form.AppField>
            <div className="flex justify-end">
              <form.SubmitButton variant="outline">{t.agents.save}</form.SubmitButton>
            </div>
          </form.AppForm>
        </form>
      </CardContent>
    </Card>
  )
}

function DeleteConfig({ configId, onDeleted }: { configId: number; onDeleted: () => void }) {
  const t = useT()
  const remove = useDeleteAgentConfig(configId)
  const [open, setOpen] = React.useState(false)
  return (
    <div className="flex justify-end">
      <Button
        variant="ghost"
        onClick={() => {
          setOpen(true)
        }}
      >
        <Trash2Icon /> {t.agents.deleteConfig}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.agents.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.agents.deleteText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.agents.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                try {
                  await remove.mutateAsync()
                  toast.success(t.agents.deleted)
                  onDeleted()
                } catch (error) {
                  toast.error(getErrorMessage(error, t.agents.failed))
                }
              }}
            >
              {t.agents.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
