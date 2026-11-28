// Settings, "Convention tests" (admin only, behind `convention-evals`): the cap of a test for the
// whole instance, in US dollars, within the bounds the API answers.
import { z } from 'zod'

import { useEvalFormat } from '@/agent-configs/eval-format'
import { SettingsSection } from '@/components/settings-section'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAppForm } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { getErrorMessage } from '@/lib/client'
import { useEvalSettings, useSaveEvalSettings } from '@/lib/convention-evals'
import { useT } from '@/lib/locale'

type EvalSettings = NonNullable<ReturnType<typeof useEvalSettings>['data']>

export function EvalSettingsSection() {
  const t = useT().evalSettings
  return (
    <SettingsSection title={t.title} description={t.description}>
      <EvalSettingsBody />
    </SettingsSection>
  )
}

function EvalSettingsBody() {
  const t = useT().evalSettings
  const settings = useEvalSettings()
  if (settings.isPending) return <Skeleton className="h-24 w-full" />
  if (settings.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(settings.error, t.loadFailed)}</AlertDescription>
      </Alert>
    )
  }
  return <CapForm settings={settings.data} />
}

function CapForm({ settings }: { settings: EvalSettings }) {
  const t = useT().evalSettings
  const format = useEvalFormat()
  const save = useSaveEvalSettings()
  const { minCapUsd: min, maxCapUsd: max } = settings
  const bounds = t.capBounds(format.usd(min), format.usd(max))
  // The field is null while it is empty.
  const defaultValues: { capUsd: number | null } = { capUsd: settings.capUsd }
  const form = useAppForm({
    defaultValues,
    validators: {
      onSubmit: z.object({ capUsd: z.number({ error: bounds }).min(min, bounds).max(max, bounds) }),
    },
    onSubmit: async ({ value }) => {
      if (value.capUsd === null) return
      try {
        await save.mutateAsync(value.capUsd)
        toast.success(t.saved)
      } catch (error) {
        toast.error(getErrorMessage(error, t.saveFailed))
      }
    },
  })
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppForm>
        <form.AppField name="capUsd">
          {(field) => (
            <field.NumberField
              label={t.cap}
              description={t.capHint}
              min={min}
              max={max}
              step={1}
              formatOptions={{ maximumFractionDigits: 2 }}
            />
          )}
        </form.AppField>
        <form.SubmitButton className="w-fit" pending={save.isPending}>
          {t.save}
        </form.SubmitButton>
      </form.AppForm>
    </form>
  )
}
