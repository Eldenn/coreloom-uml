// The ways to give a project a code map: the CLI (a command to copy, and a CI workflow), a
// graph.json to upload, and GitHub (not yet). Shown alone when the project has no map, and in a
// dialog to add a newer one.
import { Link } from '@tanstack/react-router'
import { GitBranchIcon, KeyRoundIcon, TerminalIcon, UploadIcon } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CodeViewer } from '@/components/ui/code-viewer'
import { FileUpload } from '@/components/ui/file-upload'
import { CopyInput } from '@/components/ui/input-group'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import { getErrorMessage } from '@/lib/client'
import {
  CODE_MAP_MAX_BYTES,
  codeMapCommand,
  codeMapWorkflow,
  useUploadCodeMap,
} from '@/lib/code-maps'
import { useT } from '@/lib/locale'

export function CodeMapSources({
  projectId,
  onAdded,
}: {
  projectId: number
  /** After an upload: the new map is the one to show. */
  onAdded?: (id: number) => void
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <CliCard projectId={projectId} />
      <UploadCard projectId={projectId} {...(onAdded ? { onAdded } : {})} />
      <GithubCard />
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

function GithubCard() {
  const t = useT()
  return (
    <Card aria-disabled className="bg-inset">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <GitBranchIcon className="size-4 text-muted-foreground" aria-hidden />
          {t.code.githubTitle}
          <Badge variant="secondary">{t.code.soon}</Badge>
        </CardTitle>
        <CardDescription>{t.code.githubText}</CardDescription>
      </CardHeader>
    </Card>
  )
}
