// Settings, "Web search" (admin only): the instance's search service and its key, which the
// assistant and the web research search with. The key is checked with the service before the API
// keeps it, and is never shown back: only its last characters and the date it was checked.
import { InfoIcon, Trash2Icon } from 'lucide-react'
import { z } from 'zod'

import { SettingsSection } from '@/components/settings-section'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DescriptionList } from '@/components/ui/description-list'
import { useAppForm } from '@/components/ui/form'
import { Popconfirm } from '@/components/ui/popconfirm'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { getErrorMessage } from '@/lib/client'
import { useLocale, useT } from '@/lib/locale'
import {
  useDeleteWebSearch,
  useSaveWebSearch,
  useWebSearchSetting,
  webSearchRefusal,
  type WebSearchSetting,
} from '@/lib/web-search'

/** The API's bound on a key (`LLM_API_KEY_MAX_LENGTH`). */
const API_KEY_MAX_LENGTH = 1000

export function WebSearchSection() {
  const t = useT()
  const setting = useWebSearchSetting()
  return (
    <SettingsSection title={t.webSearch.title} description={t.webSearch.description}>
      <div className="flex flex-col gap-4">
        <Alert>
          <InfoIcon />
          <AlertDescription>{t.webSearch.notice}</AlertDescription>
        </Alert>
        <WebSearchBody setting={setting} />
      </div>
    </SettingsSection>
  )
}

function WebSearchBody({ setting }: { setting: ReturnType<typeof useWebSearchSetting> }) {
  const t = useT()
  if (setting.isPending) return <Skeleton className="h-24 w-full" />
  if (setting.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {getErrorMessage(setting.error, t.webSearch.loadFailed)}
        </AlertDescription>
      </Alert>
    )
  }
  const { service } = setting.data
  return (
    <>
      {service && <SavedService service={service} />}
      <SaveKey replacing={service !== null} />
    </>
  )
}

function SavedService({ service }: { service: NonNullable<WebSearchSetting['service']> }) {
  const t = useT()
  const { locale } = useLocale()
  const remove = useDeleteWebSearch()
  const verified = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(service.verifiedAt),
  )
  return (
    <div className="flex flex-col gap-2">
      <DescriptionList
        layout="inline"
        items={[
          { term: t.webSearch.service, value: t.webSearch.kinds[service.kind] },
          {
            term: t.webSearch.savedKey,
            value: <span className="font-mono">{t.webSearch.keyHint(service.keyHint)}</span>,
            hint: t.webSearch.verified(verified),
          },
        ]}
      />
      <Popconfirm
        title={t.webSearch.removeTitle}
        description={t.webSearch.removeText}
        confirmLabel={t.webSearch.remove}
        destructive
        onConfirm={() =>
          remove.mutateAsync(undefined).then(
            () => toast.success(t.webSearch.removed),
            (error: unknown) => toast.error(getErrorMessage(error, t.webSearch.removeFailed)),
          )
        }
      >
        <Button variant="ghost" size="sm" className="w-fit" disabled={remove.isPending}>
          <Trash2Icon /> {t.webSearch.remove}
        </Button>
      </Popconfirm>
    </div>
  )
}

function SaveKey({ replacing }: { replacing: boolean }) {
  const t = useT()
  const save = useSaveWebSearch()
  const form = useAppForm({
    defaultValues: { kind: 'linkup' as const, apiKey: '' },
    validators: {
      onSubmit: z.object({
        kind: z.literal('linkup'),
        apiKey: z
          .string()
          .trim()
          .min(1, t.webSearch.apiKeyRequired)
          .max(API_KEY_MAX_LENGTH, t.webSearch.apiKeyTooLong),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync({ kind: value.kind, apiKey: value.apiKey.trim() })
        form.reset()
        toast.success(t.webSearch.saved)
      } catch (error) {
        const reason = webSearchRefusal(error)
        toast.error(
          reason ? t.webSearch.refused[reason] : getErrorMessage(error, t.webSearch.saveFailed),
        )
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
        <form.AppField name="kind">
          {(field) => (
            <field.SelectField
              label={t.webSearch.service}
              options={[{ value: 'linkup', label: t.webSearch.kinds.linkup }]}
            />
          )}
        </form.AppField>
        <form.AppField name="apiKey">
          {(field) => (
            <field.PasswordField
              label={t.webSearch.apiKey}
              description={replacing ? t.webSearch.apiKeyReplace : t.webSearch.apiKeyHint}
              autoComplete="off"
              spellCheck={false}
              maxLength={API_KEY_MAX_LENGTH}
            />
          )}
        </form.AppField>
        <form.SubmitButton className="w-fit" pending={save.isPending}>
          {t.webSearch.save}
        </form.SubmitButton>
      </form.AppForm>
    </form>
  )
}
