// New agent conventions: a name, a project (fixed on a project's page, or picked, "No project" by
// default) and the coding tools, then "Create". The rules are picked afterwards, in the catalog.
import { BotIcon } from 'lucide-react'
import { z } from 'zod'

import { useTargetOptions } from '@/agent-configs/catalog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppForm } from '@/components/ui/form'
import { toast } from '@/components/ui/sonner'
import { NAME_MAX_LENGTH, type Target, TARGETS, useCreateAgentConfig } from '@/lib/agent-configs'
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

export function AgentConfigSetupContent({ projectId, defaultName, onCreated }: SetupProps) {
  const t = useT()
  const create = useCreateAgentConfig()
  const projectOptions = useProjectOptions()
  const targetOptions = useTargetOptions()

  const form = useAppForm({
    defaultValues: {
      name: defaultName,
      projectId: String(projectId ?? NO_PROJECT),
      targets: [] as Target[],
    },
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(1, t.agents.nameRequired).max(NAME_MAX_LENGTH),
        projectId: z.string(),
        targets: z.array(z.enum(TARGETS)).min(1, t.agents.targetsRequired),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        const { config } = await create.mutateAsync({
          name: value.name.trim(),
          projectId: toProjectId(value.projectId),
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
