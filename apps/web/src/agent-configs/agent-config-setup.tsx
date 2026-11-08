// A project without agent conventions: what they are, the questionnaire and the coding tools,
// then "Start", which creates the configuration and opens the questions.
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
  type QuestionnaireSummary,
  type Target,
  TARGETS,
  useQuestionnaires,
  useSaveAgentConfig,
} from '@/lib/agent-configs'
import { getErrorMessage } from '@/lib/client'
import { useT } from '@/lib/locale'

export function AgentConfigSetup({
  projectId,
  onCreated,
}: {
  projectId: number
  onCreated: () => void
}) {
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
        <SetupContent projectId={projectId} onCreated={onCreated} />
      </CardContent>
    </Card>
  )
}

function SetupContent({ projectId, onCreated }: { projectId: number; onCreated: () => void }) {
  const t = useT()
  const questionnaires = useQuestionnaires()
  if (questionnaires.data)
    return (
      <SetupForm projectId={projectId} questionnaires={questionnaires.data} onCreated={onCreated} />
    )
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
  questionnaires,
  onCreated,
}: {
  projectId: number
  questionnaires: QuestionnaireSummary[]
  onCreated: () => void
}) {
  const t = useT()
  const localized = useLocalized()
  const save = useSaveAgentConfig(projectId)
  const first = questionnaires[0]?.id ?? ''
  const targetOptions = useTargetOptions()

  const form = useAppForm({
    defaultValues: { questionnaire: first, targets: [] as Target[] },
    validators: {
      onSubmit: z.object({
        questionnaire: z.string().min(1, t.agents.questionnaireRequired),
        targets: z.array(z.enum(TARGETS)).min(1, t.agents.targetsRequired),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync({ questionnaires: [value.questionnaire], targets: value.targets })
        onCreated()
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
        <form.AppField name="questionnaire">
          {(field) => (
            <field.RadioCardField
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
