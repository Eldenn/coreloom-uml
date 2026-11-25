'use client'

// Coreloom UI — Code review, the file tree. The changed files in their folders, each with its
// status, its comment count and whether it was viewed; Enter or a click opens the file. Part of the
// CodeReview block.
import { CheckIcon, FolderIcon, FolderOpenIcon, MessageSquareIcon } from 'lucide-react'
import * as React from 'react'

import { StatusMark } from '@/components/code-review-file'
import {
  type ReviewFile,
  type ReviewThread,
  reviewTree,
  type ReviewTreeNode,
} from '@/components/code-review-model'
import { branchIds, TreeView, type TreeViewNode } from '@/components/ui/tree-view'
import { useCoreloomI18n } from '@/lib/i18n'

function FileMeta({
  comments,
  viewed,
  extra,
}: {
  comments: number
  viewed: boolean
  extra: React.ReactNode
}) {
  const t = useCoreloomI18n().messages.codeReview
  if (!comments && !viewed && extra == null) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      {extra}
      {comments ? (
        <span className="inline-flex items-center gap-0.5 tabular-nums">
          <MessageSquareIcon aria-hidden className="size-3" />
          <span aria-hidden>{comments}</span>
          <span className="sr-only">{t.comments(comments)}</span>
        </span>
      ) : null}
      {viewed ? (
        <span className="inline-flex text-success">
          <CheckIcon aria-hidden className="size-3.5" />
          <span className="sr-only">{t.viewed}</span>
        </span>
      ) : null}
    </span>
  )
}

function ReviewFileTree({
  files,
  threads,
  viewed,
  active,
  onSelectFile,
  onOpenFile,
  labelledBy,
  renderFileMeta,
}: {
  files: readonly ReviewFile[]
  threads: readonly ReviewThread[]
  viewed: ReadonlySet<string>
  active: string | null
  /** Space: the file becomes the current one; focus stays in the tree. */
  onSelectFile: (path: string) => void
  /** Enter or a click: go to the file, focus on its header. */
  onOpenFile: (path: string) => void
  labelledBy: string
  renderFileMeta?: (file: ReviewFile) => React.ReactNode
}) {
  const byPath = React.useMemo(() => new Map(files.map((f) => [f.path, f])), [files])
  const counts = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const thread of threads) map.set(thread.path, (map.get(thread.path) ?? 0) + 1)
    return map
  }, [threads])
  const tree = React.useMemo(() => reviewTree(files.map((f) => f.path)), [files])
  const toNode = (node: ReviewTreeNode): TreeViewNode => {
    const file = node.path ? byPath.get(node.path) : undefined
    if (!file)
      return {
        id: node.id,
        label: node.name,
        icon: (open: boolean) => (open ? <FolderOpenIcon /> : <FolderIcon />),
        children: node.children?.map(toNode),
      }
    return {
      id: node.id,
      label: node.name,
      icon: <StatusMark status={file.status} className="size-4 text-[9.5px]" />,
      meta: (
        <FileMeta
          comments={counts.get(file.path) ?? 0}
          viewed={viewed.has(file.path)}
          extra={renderFileMeta?.(file)}
        />
      ),
    }
  }
  const nodes = tree.map(toNode)
  return (
    <TreeView
      nodes={nodes}
      aria-labelledby={labelledBy}
      defaultExpanded={branchIds(nodes)}
      selectionMode="single"
      selected={active}
      onSelectedChange={(id) => {
        if (byPath.has(id)) onSelectFile(id)
      }}
      onAction={(node) => {
        if (byPath.has(node.id)) onOpenFile(node.id)
      }}
    />
  )
}

export { ReviewFileTree }
