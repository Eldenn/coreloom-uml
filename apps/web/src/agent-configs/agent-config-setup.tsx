// New agent conventions: a name, a project (fixed on a project's page, or picked, "No project" by
// default), the questionnaires and the coding tools, then "Start", which creates the configuration.
import { BotIcon } from 'lucide-react'
import { z } from 'zod'

import { useLocalized, useTargetOptions } from '@/agent-configs/catalog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppForm } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import {
  NAME_MAX_LENGTH,
  type QuestionnaireSummary,
  type Target,
  TARGETS,
  useCreateAgentConfig,
  useQuestionnaires,
} from '@/lib/agent-configs'
import { getErrorMessage } from '@/lib/client'
import { useT } from '@/lib/locale'
import { NO_PROJECT, toProjectId, useProjectOptions } from '@/lib/projects'

interface SetupProps {
  /** Fixed on a project's page; picked in the form otherwise. */
  projectId?: number
  defaultName: string
  onCreated: (id: number) => void
}

/** A project without agent conventions: what they are, then the form. */
export function AgentConfigSetup(props: SetupProps) {
  const t = useT()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BotIcon className="size-5 text-muted-foreground" aria-hidden />
          {t.agents.introTitle}
        </CardTitle>
        <CardDescription>{t.agents.intro}</CardDescription>
      </CardHeader>
      <CardContent>
        <AgentConfigSetupContent {...props} />
      </CardContent>
    </Card>
  )
}

/** The form once the questionnaires are loaded. */
export function AgentConfigSetupContent(props: SetupProps) {
  const t = useT()
  const questionnaires = useQuestionnaires()
  if (questionnaires.data) return <SetupForm {...props} questionnaires={questionnaires.data} />
  if (!questionnaires.isError) return <Skeleton className="h-48 w-full" />
  return (
    <Alert variant="destructive">
      <AlertTitle>{t.agents.loadFailed}</AlertTitle>
      <AlertDescription>
        <Button variant="outline" size="sm" onClick={() => void questionnaires.refetch()}>
          {t.agents.retry}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function SetupForm({
  projectId,
  defaultName,
  questionnaires,
  onCreated,
}: SetupProps & { questionnaires: QuestionnaireSummary[] }) {
  const t = useT()
  const localized = useLocalized()
  const create = useCreateAgentConfig()
  const projectOptions = useProjectOptions()
  const first = questionnaires[0]?.id
  const targetOptions = useTargetOptions()

  const form = useAppForm({
    defaultValues: {
      name: defaultName,
      projectId: String(projectId ?? NO_PROJECT),
      questionnaires: first ? [first] : [],
      targets: [] as Target[],
    },
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(1, t.agents.nameRequired).max(NAME_MAX_LENGTH),
        projectId: z.string(),
        questionnaires: z.array(z.string()).min(1, t.agents.questionnaireRequired),
        targets: z.array(z.enum(TARGETS)).min(1, t.agents.targetsRequired),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        const { config } = await create.mutateAsync({
          name: value.name.trim(),
          projectId: toProjectId(value.projectId),
          questionnaires: value.questionnaires,
          targets: value.targets,
        })
        onCreated(config.id)
      } catch (error) {
        toast.error(getErrorMessage(error, t.agents.failed))
      }
    },
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppForm>
        <form.AppField name="name">
          {(field) => <field.TextField label={t.agents.nameLabel} autoComplete="off" />}
        </form.AppField>
        {projectId === undefined && (
          <form.AppField name="projectId">
            {(field) => (
              <field.SelectField label={t.architectures.moveTarget} options={projectOptions} />
            )}
          </form.AppField>
        )}
        <form.AppField name="questionnaires">
          {(field) => (
            <field.CheckboxCardField
              label={t.agents.questionnaireLabel}
              description={t.agents.questionnaireHint}
              orientation="horizontal"
              options={questionnaires.map((q) => ({
                value: q.id,
                title: localized(q.title),
                description: `${localized(q.description)} ${t.agents.questionCount(q.questionCount)}.`,
              }))}
            />
          )}
        </form.AppField>
        <form.AppField name="targets">
          {(field) => (
            <field.CheckboxCardField
              label={t.agents.targetsLabel}
              description={t.agents.targetsHint}
              orientation="horizontal"
              options={targetOptions}
            />
          )}
        </form.AppField>
        <div className="flex justify-end">
          <form.SubmitButton>{t.agents.start}</form.SubmitButton>
        </div>
      </form.AppForm>
    </form>
  )
}
