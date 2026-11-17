// Settings, "GitHub App" (admin only, behind `code-maps`): the App that lets the server read
// private repositories and follow pushes. Without one, the admin creates it on GitHub in one click
// (GitHub's manifest flow: the browser posts the App's settings, GitHub asks to confirm the name,
// then comes back to `/github/app-created`). The secrets stay on the server, encrypted; this
// section shows the App, its GitHub pages, and removes it. An App set by the environment
// variables wins and is only shown.
import { ExternalLinkIcon, InfoIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { z } from 'zod'

import { SettingsSection } from '@/components/settings-section'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DescriptionList } from '@/components/ui/description-list'
import { useAppForm } from '@/components/ui/form'
import { Popconfirm } from '@/components/ui/popconfirm'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { getErrorMessage } from '@/lib/client'
import {
  type GithubAppStatus,
  useCreateGithubApp,
  useGithubApp,
  useRemoveGithubApp,
} from '@/lib/github-app'
import { useT } from '@/lib/locale'

/** A GitHub account or organization name, as GitHub accepts it. */
const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/

export function GithubAppSection() {
  const t = useT()
  const status = useGithubApp(true)
  return (
    <SettingsSection title={t.githubApp.title} description={t.githubApp.description}>
      <GithubAppBody status={status} />
    </SettingsSection>
  )
}

function GithubAppBody({ status }: { status: ReturnType<typeof useGithubApp> }) {
  const t = useT()
  if (status.isPending) return <Skeleton className="h-24 w-full" />
  if (status.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getErrorMessage(status.error, t.githubApp.loadFailed)}</AlertDescription>
      </Alert>
    )
  }
  return status.data.app ? (
    <GithubAppDetails status={status.data} />
  ) : (
    <CreateGithubApp status={status.data} />
  )
}

function CreateGithubApp({ status }: { status: GithubAppStatus }) {
  const t = useT()
  const create = useCreateGithubApp()
  const form = useAppForm({
    defaultValues: { organization: '', public: false },
    validators: {
      onSubmit: z.object({
        organization: z
          .string()
          .trim()
          .refine(
            (value) => value === '' || GITHUB_OWNER.test(value),
            t.githubApp.organizationInvalid,
          ),
        public: z.boolean(),
      }),
    },
    onSubmit: async ({ value }) => {
      const organization = value.organization.trim()
      try {
        await create.mutateAsync({
          ...(organization ? { organization } : {}),
          public: value.public,
        })
      } catch (error) {
        toast.error(getErrorMessage(error, t.githubApp.createFailed))
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
      <p className="m-0 text-[13px] text-muted-foreground">{t.githubApp.createText}</p>
      {!status.webhookReachable && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>{t.githubApp.webhookUnreachableTitle}</AlertTitle>
          <AlertDescription>{t.githubApp.webhookUnreachable(status.webhookUrl)}</AlertDescription>
        </Alert>
      )}
      <form.AppForm>
        <form.AppField name="organization">
          {(field) => (
            <field.TextField
              label={t.githubApp.organization}
              description={t.githubApp.organizationHint}
              autoComplete="off"
              spellCheck={false}
              maxLength={39}
            />
          )}
        </form.AppField>
        <form.AppField name="public">
          {(field) => (
            <field.SwitchField label={t.githubApp.public} description={t.githubApp.publicHint} />
          )}
        </form.AppField>
        <form.SubmitButton className="w-fit" pending={create.isPending}>
          <ExternalLinkIcon /> {t.githubApp.create}
        </form.SubmitButton>
      </form.AppForm>
    </form>
  )
}

function GithubAppDetails({ status }: { status: GithubAppStatus }) {
  const t = useT()
  const remove = useRemoveGithubApp()
  const app = status.app
  if (!app) return null
  const fromEnvironment = status.source === 'environment'
  return (
    <div className="flex flex-col gap-4">
      {fromEnvironment && (
        <Alert>
          <InfoIcon />
          <AlertDescription>{t.githubApp.fromEnvironment}</AlertDescription>
        </Alert>
      )}
      <DescriptionList
        layout="inline"
        items={[
          {
            term: t.githubApp.name,
            value: (
              <span className="flex flex-wrap items-center gap-2">
                {app.name}
                <Badge variant="success">{t.githubApp.active}</Badge>
              </span>
            ),
          },
          ...(app.owner
            ? [
                {
                  term: t.githubApp.owner,
                  value:
                    app.owner.type === 'Organization'
                      ? t.githubApp.ownerOrganization(app.owner.login)
                      : app.owner.login,
                },
              ]
            : []),
          { term: t.githubApp.appId, value: <code>{app.appId}</code>, copy: String(app.appId) },
          {
            term: t.githubApp.webhook,
            value: app.webhook ? t.githubApp.webhookOn : t.githubApp.webhookOff,
            hint: app.webhook ? status.webhookUrl : t.githubApp.webhookOffHint,
          },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={app.pageUrl} target="_blank" rel="noreferrer">
            <ExternalLinkIcon /> {t.githubApp.openPage}
          </a>
        </Button>
        {app.settingsUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={app.settingsUrl} target="_blank" rel="noreferrer">
              <ExternalLinkIcon /> {t.githubApp.openSettings}
            </a>
          </Button>
        )}
        {!fromEnvironment && (
          <Popconfirm
            title={t.githubApp.removeTitle}
            description={t.githubApp.removeText}
            confirmLabel={t.githubApp.remove}
            destructive
            onConfirm={() =>
              remove.mutateAsync(undefined).then(
                () => toast.success(t.githubApp.removed),
                (error: unknown) => toast.error(getErrorMessage(error, t.githubApp.removeFailed)),
              )
            }
          >
            <Button variant="ghost" size="sm" disabled={remove.isPending}>
              <Trash2Icon /> {t.githubApp.remove}
            </Button>
          </Popconfirm>
        )}
      </div>
    </div>
  )
}
