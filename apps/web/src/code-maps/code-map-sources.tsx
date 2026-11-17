// The ways to give a project a code map: the CLI (a command to copy, and a CI workflow), a
// graph.json to upload, and a GitHub repository the server reads itself (a public one, or a
// private one through the GitHub App, which can also read it again on each push). Shown alone when
// the project has no map, and in a dialog to add a newer one.
import { useSelector } from '@tanstack/react-form'
import { Link } from '@tanstack/react-router'
import {
  ExternalLinkIcon,
  GitBranchIcon,
  GlobeIcon,
  KeyRoundIcon,
  LockIcon,
  RefreshCwIcon,
  TerminalIcon,
  UnplugIcon,
  UploadIcon,
} from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CodeViewer } from '@/components/ui/code-viewer'
import type { ComboboxOption } from '@/components/ui/combobox'
import { FileUpload } from '@/components/ui/file-upload'
import { useAppForm } from '@/components/ui/form'
import { CopyInput } from '@/components/ui/input-group'
import { Popconfirm } from '@/components/ui/popconfirm'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import { getErrorMessage } from '@/lib/client'
import {
  CODE_MAP_MAX_BYTES,
  codeMapCommand,
  codeMapWorkflow,
  GIT_BRANCH_PATTERN,
  GITHUB_REPOSITORY_PATTERN,
  useImportGithubCodeMap,
  useUploadCodeMap,
} from '@/lib/code-maps'
import {
  connectedRepository,
  type GithubConnectionTarget,
  useDisconnectGithub,
  useGithubConnection,
  useGithubFollow,
  useStartGithubConnection,
  useStopGithubFollow,
} from '@/lib/github'
import { useT } from '@/lib/locale'

export function CodeMapSources({
  projectId,
  onAdded,
}: {
  projectId: number
  /** After an upload or a GitHub import: the new map is the one to show. */
  onAdded?: (id: number) => void
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <CliCard projectId={projectId} />
      <UploadCard projectId={projectId} {...(onAdded ? { onAdded } : {})} />
      <GithubCard projectId={projectId} {...(onAdded ? { onAdded } : {})} />
    </div>
  )
}

function CliCard({ projectId }: { projectId: number }) {
  const t = useT()
  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TerminalIcon className="size-4 text-muted-foreground" aria-hidden />
          {t.code.cliTitle}
        </CardTitle>
        <CardDescription>{t.code.cliText}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <CopyInput value={codeMapCommand(projectId)} aria-label={t.code.cliTitle} />
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 text-[13px] text-muted-foreground">{t.code.cliKeyText}</p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings">
              <KeyRoundIcon /> {t.code.cliKey}
            </Link>
          </Button>
        </div>
        <p className="m-0 text-[13px] text-muted-foreground">{t.code.cliWorkflow}</p>
        <CodeViewer
          code={codeMapWorkflow(projectId)}
          title=".github/workflows/code-map.yml"
          language="yaml"
          maxHeight="20rem"
        />
      </CardContent>
    </Card>
  )
}

function UploadCard({ projectId, onAdded }: { projectId: number; onAdded?: (id: number) => void }) {
  const t = useT()
  const upload = useUploadCodeMap(projectId)
  const [files, setFiles] = React.useState<File[]>([])
  const file = files.at(0)
  const send = async () => {
    if (!file) return
    try {
      const codeMap = await upload.mutateAsync(file)
      setFiles([])
      toast.success(t.code.uploaded)
      onAdded?.(codeMap.id)
    } catch (error) {
      toast.error(getErrorMessage(error, t.code.uploadFailed))
    }
  }
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UploadIcon className="size-4 text-muted-foreground" aria-hidden />
          {t.code.uploadTitle}
        </CardTitle>
        <CardDescription>{t.code.uploadText}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <FileUpload
          value={files}
          onValueChange={setFiles}
          accept=".json,.gz"
          multiple={false}
          maxSize={CODE_MAP_MAX_BYTES}
          disabled={upload.isPending}
        />
        <Button className="w-fit" disabled={!file || upload.isPending} onClick={() => void send()}>
          {upload.isPending ? <Spinner /> : <UploadIcon />}
          {upload.isPending ? t.code.uploading : t.code.uploadSubmit}
        </Button>
      </CardContent>
    </Card>
  )
}

function GithubCard({ projectId, onAdded }: { projectId: number; onAdded?: (id: number) => void }) {
  const t = useT()
  const connection = useGithubConnection()
  const repositories = connection.data?.repositories ?? []
  const app = connection.data?.available === true
  const start = useImportGithubCodeMap(projectId)
  const form = useAppForm({
    defaultValues: { url: '', branch: '', follow: false },
    validators: {
      onSubmit: z.object({
        url: z.string().trim().regex(GITHUB_REPOSITORY_PATTERN, t.code.githubUrlInvalid),
        branch: z
          .string()
          .trim()
          .refine(
            (value) => value === '' || GIT_BRANCH_PATTERN.test(value),
            t.code.githubBranchInvalid,
          ),
        follow: z.boolean(),
      }),
    },
    onSubmit: async ({ value }) => {
      const branch = value.branch.trim()
      const follow = value.follow && connectedRepository(repositories, value.url) !== undefined
      try {
        const codeMap = await start.mutateAsync({
          url: value.url.trim(),
          ...(branch ? { branch } : {}),
          ...(follow ? { follow: true } : {}),
        })
        form.reset()
        toast.success(t.code.githubStarted)
        onAdded?.(codeMap.id)
      } catch (error) {
        toast.error(getErrorMessage(error, t.code.githubFailed))
      }
    },
  })
  const url = useSelector(form.store, (state) => state.values.url)
  const connected = connectedRepository(repositories, url)
  // A repository typed in the combobox (a public one) is offered with the connected ones.
  const [typed, setTyped] = React.useState<string[]>([])
  const options: ComboboxOption[] = [
    ...repositories.map((repository) => ({
      value: repository.url,
      label: `${repository.owner}/${repository.name}`,
      icon: repository.private ? (
        <LockIcon aria-label={t.code.githubPrivate} />
      ) : (
        <GlobeIcon aria-label={t.code.githubPublic} />
      ),
      keywords: [repository.url],
    })),
    ...typed.map((value) => ({ value, label: value })),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranchIcon className="size-4 text-muted-foreground" aria-hidden />
          {t.code.githubTitle}
        </CardTitle>
        <CardDescription>{app ? t.code.githubTextApp : t.code.githubText}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {app ? <GithubFollowStatus projectId={projectId} /> : null}
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.AppForm>
            <form.AppField name="url">
              {(field) =>
                repositories.length > 0 ? (
                  <field.ComboboxField
                    label={t.code.githubUrl}
                    description={t.code.githubUrlHint}
                    options={options}
                    placeholder={t.code.githubPick}
                    searchPlaceholder="https://github.com/owner/name"
                    emptyText={t.code.githubNoMatch}
                    onCreate={(label) => {
                      const value = label.trim()
                      setTyped((current) =>
                        current.includes(value) ? current : [...current, value],
                      )
                      return value
                    }}
                  />
                ) : (
                  <field.TextField
                    label={t.code.githubUrl}
                    placeholder="https://github.com/owner/name"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                  />
                )
              }
            </form.AppField>
            <form.AppField name="branch">
              {(field) => (
                <field.TextField
                  label={t.code.githubBranch}
                  description={t.code.githubBranchHint}
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </form.AppField>
            {repositories.length > 0 ? (
              <form.AppField name="follow">
                {(field) => (
                  <field.SwitchField
                    label={t.code.githubFollow}
                    description={connected ? t.code.githubFollowHint : t.code.githubFollowOnlyApp}
                    disabled={!connected}
                  />
                )}
              </form.AppField>
            ) : null}
            <form.SubmitButton className="w-fit">{t.code.githubSubmit}</form.SubmitButton>
          </form.AppForm>
        </form>
        {app ? <GithubConnectionPanel projectId={projectId} /> : null}
      </CardContent>
    </Card>
  )
}

/** The repository the project reads again on each push, and a way to stop. */
function GithubFollowStatus({ projectId }: { projectId: number }) {
  const t = useT()
  const follow = useGithubFollow(projectId)
  const stop = useStopGithubFollow(projectId)
  if (!follow.data) return null
  const { repositoryUrl, branch, active } = follow.data
  const name = repositoryUrl.replace(/^https:\/\/github\.com\//, '')
  return (
    <Alert variant={active ? 'default' : 'warning'}>
      <RefreshCwIcon />
      <AlertTitle>{t.code.githubFollowingTitle}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>
          <span className="font-medium break-all">
            {t.code.githubFollowing(name, branch ?? t.code.githubDefaultBranch)}
          </span>{' '}
          {active ? t.code.githubFollowingText : t.code.githubFollowingLost}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={stop.isPending}
          onClick={() =>
            stop.mutate(undefined, {
              onSuccess: () => toast.success(t.code.githubFollowStopped),
              onError: (error) => toast.error(getErrorMessage(error, t.code.githubFailed)),
            })
          }
        >
          {stop.isPending ? <Spinner /> : null}
          {t.code.githubFollowStop}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/**
 * The user's link to the GitHub App: install it on the repositories it may read, then connect
 * (GitHub's authorization lists what the user reaches); add repositories, refresh, disconnect.
 */
function GithubConnectionPanel({ projectId }: { projectId: number }) {
  const t = useT()
  const connection = useGithubConnection()
  const open = useStartGithubConnection()
  const disconnect = useDisconnectGithub()
  const returnTo = `/projects/${String(projectId)}?tab=code`
  const go = (target: GithubConnectionTarget) =>
    open.mutate(
      { target, returnTo },
      { onError: (error) => toast.error(getErrorMessage(error, t.code.githubConnectFailed)) },
    )
  const login = connection.data?.login ?? null
  const count = connection.data?.repositories.length ?? 0
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <p className="m-0 text-[13px] text-muted-foreground">
        {login ? t.code.githubConnectedAs(login, count) : t.code.githubAppText}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={open.isPending} onClick={() => go('install')}>
          <ExternalLinkIcon /> {login ? t.code.githubAddRepositories : t.code.githubInstall}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={open.isPending}
          onClick={() => go('authorize')}
        >
          <RefreshCwIcon /> {login ? t.code.githubRefresh : t.code.githubConnect}
        </Button>
        {login ? (
          <Popconfirm
            title={t.code.githubDisconnectTitle}
            description={t.code.githubDisconnectText}
            confirmLabel={t.code.githubDisconnect}
            destructive
            onConfirm={() =>
              disconnect.mutate(undefined, {
                onSuccess: () => toast.success(t.code.githubDisconnected),
                onError: (error) => toast.error(getErrorMessage(error, t.code.githubFailed)),
              })
            }
          >
            <Button variant="ghost" size="sm" disabled={disconnect.isPending}>
              <UnplugIcon /> {t.code.githubDisconnect}
            </Button>
          </Popconfirm>
        ) : null}
      </div>
    </div>
  )
}
