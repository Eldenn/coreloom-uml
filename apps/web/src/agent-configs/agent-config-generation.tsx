// One generation: its files (tree, read-only viewer, download), what changed since the previous
// generation, the recommendations, and how to install the files in a repository with the CLI.
import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon, DownloadIcon, FileIcon, FolderIcon, KeyRoundIcon } from 'lucide-react'
import * as React from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CodeViewer } from '@/components/ui/code-viewer'
import { DiffViewer } from '@/components/ui/diff-viewer'
import { Markdown } from '@/components/ui/markdown'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { RelativeTime } from '@/components/ui/relative-time'
import { Skeleton } from '@/components/ui/skeleton'
import { TreeView, type TreeViewNode } from '@/components/ui/tree-view'
import {
  type AgentFile,
  type AgentGeneration,
  useGeneration,
  useGenerations,
} from '@/lib/agent-configs'
import { apiBaseUrl } from '@/lib/client'
import { useT } from '@/lib/locale'

/** Files as a tree of folders, in the generation's order. */
function fileTree(files: AgentFile[], pointer: string): TreeViewNode[] {
  const root: TreeViewNode[] = []
  for (const file of files) {
    const parts = file.path.split('/')
    let level = root
    parts.slice(0, -1).forEach((part, index) => {
      const id = `dir:${parts.slice(0, index + 1).join('/')}`
      let folder = level.find((node) => node.id === id)
      if (!folder) {
        folder = { id, label: part, icon: <FolderIcon />, children: [] }
        level.push(folder)
      }
      level = folder.children ?? []
    })
    level.push({
      id: file.path,
      label: parts.at(-1) ?? file.path,
      icon: <FileIcon />,
      meta: file.kind === 'pointer' ? <Badge variant="outline">{pointer}</Badge> : undefined,
    })
  }
  return root
}

/** Saves the text as a file, without any request: the content is already here. */
function download(file: AgentFile) {
  const url = URL.createObjectURL(new Blob([file.content], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.path.split('/').at(-1) ?? 'AGENTS.md'
  link.click()
  URL.revokeObjectURL(url)
}

export function AgentConfigGeneration({
  projectId,
  generationId,
  onBack,
  onSelect,
}: {
  projectId: number
  generationId: number
  onBack: () => void
  onSelect: (id: number) => void
}) {
  const t = useT()
  const generation = useGeneration(projectId, generationId)
  const generations = useGenerations(projectId)
  const list = generations.data?.data ?? []
  // Newest first: the previous generation is the next one in the list.
  const index = list.findIndex((g) => g.id === generationId)
  const previousId = index < 0 ? null : (list.at(index + 1)?.id ?? null)
  const previous = useGeneration(projectId, previousId)

  const back = (
    <Button variant="ghost" className="w-fit" onClick={onBack}>
      <ArrowLeftIcon /> {t.agents.backToSummary}
    </Button>
  )

  if (generation.isPending)
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Skeleton className="h-96 w-full" />
      </div>
    )
  if (generation.isError)
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Alert variant="destructive">
          <AlertTitle>{t.agents.generationNotFound}</AlertTitle>
          <AlertDescription>
            <Button variant="outline" size="sm" onClick={() => void generation.refetch()}>
              {t.agents.retry}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )

  const current = generation.data
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        {list.length > 1 && (
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            {t.agents.history}
            <NativeSelect
              value={String(generationId)}
              onChange={(e) => {
                onSelect(Number(e.target.value))
              }}
            >
              {list.map((g) => (
                <NativeSelectOption key={g.id} value={String(g.id)}>
                  {t.agents.historyOption(g.id, g.revision)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        )}
      </div>
      <FilesCard generation={current} />
      <ChangesCard
        current={current}
        previous={previousId === null ? null : (previous.data ?? undefined)}
      />
      {current.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.agents.recommendationsTitle}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {current.recommendations.map((recommendation) => (
              <section
                key={`${recommendation.target}:${recommendation.title}`}
                className="flex flex-col gap-1"
              >
                <p className="m-0 flex flex-wrap items-center gap-2 text-[14px] font-medium text-foreground">
                  {recommendation.title}
                  <Badge variant="secondary">{t.agents.targetNames[recommendation.target]}</Badge>
                </p>
                <Markdown>{recommendation.body}</Markdown>
              </section>
            ))}
          </CardContent>
        </Card>
      )}
      <InstallCard projectId={projectId} />
    </div>
  )
}

function FilesCard({ generation }: { generation: AgentGeneration }) {
  const t = useT()
  const [selected, setSelected] = React.useState(generation.files.at(0)?.path ?? null)
  const file = generation.files.find((f) => f.path === selected) ?? generation.files.at(0)
  const nodes = React.useMemo(
    () => fileTree(generation.files, t.agents.pointer),
    [generation.files, t.agents.pointer],
  )
  const folders = nodes.filter((node) => node.children).map((node) => node.id)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.agents.generationTitle(generation.revision)}</CardTitle>
        <CardDescription>
          {t.agents.generatedAt} <RelativeTime date={generation.createdAt} />. {t.agents.filesHint}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[minmax(12rem,16rem)_1fr]">
        <TreeView
          aria-label={t.agents.filesTitle}
          nodes={nodes}
          defaultExpanded={folders}
          selectionMode="single"
          selected={file?.path ?? null}
          onSelectedChange={(id) => {
            if (!id.startsWith('dir:')) setSelected(id)
          }}
        />
        {file && (
          <div className="flex min-w-0 flex-col gap-2">
            <CodeViewer
              title={file.path}
              language="markdown"
              code={file.content}
              wrap
              maxHeight="32rem"
            />
            <Button
              variant="outline"
              className="w-fit"
              aria-label={t.agents.downloadFile(file.path)}
              onClick={() => {
                download(file)
              }}
            >
              <DownloadIcon /> {t.agents.download}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ChangesCard({
  current,
  previous,
}: {
  current: AgentGeneration
  /** `null` for the first generation, `undefined` while it loads. */
  previous: AgentGeneration | null | undefined
}) {
  const t = useT()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.agents.changesTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Changes current={current} previous={previous} />
      </CardContent>
    </Card>
  )
}

function Changes({
  current,
  previous,
}: {
  current: AgentGeneration
  previous: AgentGeneration | null | undefined
}) {
  const t = useT()
  if (previous === undefined) return <Skeleton className="h-24 w-full" />
  if (previous === null)
    return <p className="m-0 text-[13px] text-muted-foreground">{t.agents.noPrevious}</p>
  const contentOf = (generation: AgentGeneration, path: string) =>
    generation.files.find((f) => f.path === path)?.content
  const paths = [
    ...new Set([...previous.files.map((f) => f.path), ...current.files.map((f) => f.path)]),
  ]
  const changed = paths.filter((path) => contentOf(previous, path) !== contentOf(current, path))
  if (changed.length === 0)
    return <p className="m-0 text-[13px] text-muted-foreground">{t.agents.noChanges}</p>
  return changed.map((path) => (
    <DiffViewer
      key={path}
      title={path}
      before={contentOf(previous, path) ?? ''}
      after={contentOf(current, path) ?? ''}
      wrap
    />
  ))
}

function InstallCard({ projectId }: { projectId: number }) {
  const t = useT()
  const command = `npx @coreloom-uml/cli pull --api-url ${apiBaseUrl} --project ${projectId}`
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.agents.installTitle}</CardTitle>
        <CardDescription>{t.agents.installText}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <CodeViewer code={command} language="shell" wrap />
        <p className="m-0 text-[13px] text-muted-foreground">
          {t.agents.installKeyText}{' '}
          <code className="rounded-sm bg-secondary px-1 font-mono text-[0.9em]">
            export CORELOOM_UML_API_KEY=clu_…
          </code>
        </p>
        <Button variant="outline" className="w-fit" asChild>
          <Link to="/settings">
            <KeyRoundIcon /> {t.agents.installKey}
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
