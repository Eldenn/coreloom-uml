'use client'

// Coreloom UI — FileCard. A file attached to something: a message, a ticket, a form, a chat
// prompt. Its type icon (or a thumbnail for an image), its name with the extension always visible,
// its size, and its state: uploading with progress, failed with Retry, or done with a link to
// open it. `FileCardList` lays several out as a list or a grid.
//
//   <FileCard name="Q3 report.pdf" size={482113} href={url} onRemove={remove} />
//   <FileCard name="photo.jpg" type="image/jpeg" progress={42} />
import {
  FileArchiveIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
  PresentationIcon,
  RotateCwIcon,
  XIcon,
} from 'lucide-react'
import * as React from 'react'

import { formatValue } from '@/components/ui/format'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type FileKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'archive'
  | 'code'
  | 'other'

const extensions: Record<Exclude<FileKind, 'other'>, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'heic', 'bmp', 'ico'],
  video: ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'],
  audio: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'],
  pdf: ['pdf'],
  document: ['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages'],
  spreadsheet: ['xls', 'xlsx', 'ods', 'csv', 'tsv', 'numbers'],
  presentation: ['ppt', 'pptx', 'odp', 'key'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2'],
  code: [
    'js',
    'jsx',
    'ts',
    'tsx',
    'json',
    'html',
    'css',
    'py',
    'rb',
    'go',
    'rs',
    'java',
    'kt',
    'swift',
    'c',
    'cpp',
    'h',
    'cs',
    'php',
    'sh',
    'yml',
    'yaml',
    'toml',
    'xml',
    'sql',
  ],
}

/** What kind of file this is, from its MIME type or else its extension. */
function fileKind(name: string, type?: string): FileKind {
  if (type) {
    if (type.startsWith('image/')) return 'image'
    if (type.startsWith('video/')) return 'video'
    if (type.startsWith('audio/')) return 'audio'
    if (type === 'application/pdf') return 'pdf'
  }
  const ext = splitName(name)[1].slice(1).toLowerCase()
  for (const [kind, list] of Object.entries(extensions)) {
    if (list.includes(ext)) return kind as FileKind
  }
  return 'other'
}

/** "Q3 report.final.pdf" → ["Q3 report.final", ".pdf"]; no extension → [name, ""]. */
function splitName(name: string): [string, string] {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1 || name.length - dot > 8) return [name, '']
  return [name.slice(0, dot), name.slice(dot)]
}

const kindIcons: Record<FileKind, React.ReactNode> = {
  image: <FileImageIcon />,
  video: <FileVideoIcon />,
  audio: <FileAudioIcon />,
  pdf: <FileTextIcon />,
  document: <FileTextIcon />,
  spreadsheet: <FileSpreadsheetIcon />,
  presentation: <PresentationIcon />,
  archive: <FileArchiveIcon />,
  code: <FileCodeIcon />,
  other: <FileIcon />,
}

const kindTones: Record<FileKind, string> = {
  image: 'bg-info-subtle text-info',
  video: 'bg-primary-subtle text-primary-text',
  audio: 'bg-primary-subtle text-primary-text',
  pdf: 'bg-destructive-subtle text-destructive',
  document: 'bg-info-subtle text-info',
  spreadsheet: 'bg-success-subtle text-success',
  presentation: 'bg-warning-subtle text-warning',
  archive: 'bg-secondary text-fg-secondary',
  code: 'bg-secondary text-fg-secondary',
  other: 'bg-secondary text-fg-secondary',
}

function FileCard({
  name,
  size,
  type,
  preview,
  href,
  progress,
  error,
  onRemove,
  onRetry,
  action,
  className,
  ...props
}: {
  name: string
  /** In bytes. */
  size?: number
  /** The MIME type, when you have it; otherwise the extension decides the icon. */
  type?: string
  /** A thumbnail URL for an image (an object URL while uploading). */
  preview?: string
  /** Makes the name a link that opens or downloads the file. */
  href?: string
  /** 0 to 100 while uploading; leave it out when done. */
  progress?: number
  /** Why it failed. Turns the card red and shows Retry when `onRetry` is given. */
  error?: React.ReactNode
  /** Shows a remove button (or Cancel while uploading). */
  onRemove?: () => void
  onRetry?: () => void
  /** Something else at the end, such as a menu. */
  action?: React.ReactNode
} & Omit<React.ComponentProps<'div'>, 'children'>) {
  const { locale, messages } = useCoreloomI18n()
  const t = messages.utility.file
  const kind = fileKind(name, type)
  const [base, ext] = splitName(name)
  const uploading = progress !== undefined && !error
  const pct = Math.round(Math.min(100, Math.max(0, progress ?? 0)))
  const sizeText = size === undefined ? undefined : formatValue(size, locale, { format: 'bytes' })
  const nameEl = (
    <span className="flex min-w-0 font-medium text-foreground" title={name}>
      <span className="truncate">{base}</span>
      <span className="shrink-0">{ext}</span>
    </span>
  )

  return (
    <div
      data-slot="file-card"
      data-kind={kind}
      data-state={error ? 'error' : uploading ? 'uploading' : 'done'}
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-md border bg-surface p-2.5 pr-2 font-sans text-[13.5px]',
        error ? 'border-destructive/40' : 'border-border',
        className,
      )}
      {...props}
    >
      {preview && kind === 'image' ? (
        <img
          src={preview}
          alt=""
          className="size-10 shrink-0 rounded-sm border border-border-subtle object-cover"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-sm [&_svg]:size-5',
            kindTones[kind],
          )}
        >
          {kindIcons[kind]}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {href && !uploading && !error ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 rounded-xs outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            {nameEl}
          </a>
        ) : (
          nameEl
        )}
        {uploading ? (
          <div className="flex items-center gap-2">
            <div
              role="progressbar"
              aria-label={t.uploading(name)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="h-1 flex-1 overflow-hidden rounded-full bg-secondary"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-base motion-reduce:transition-none"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
              {pct}%
            </span>
          </div>
        ) : (
          <span
            className={cn(
              'truncate text-[12.5px]',
              error ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {error ??
              [sizeText, ext ? ext.slice(1).toUpperCase() : undefined].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
      {error && onRetry ? (
        <FileCardButton label={t.retry(name)} onClick={onRetry}>
          <RotateCwIcon />
        </FileCardButton>
      ) : null}
      {action}
      {onRemove ? (
        <FileCardButton label={uploading ? t.cancel(name) : t.remove(name)} onClick={onRemove}>
          <XIcon />
        </FileCardButton>
      ) : null}
    </div>
  )
}

function FileCardButton({
  label,
  children,
  onClick,
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-fg-secondary outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring [&_svg]:size-4"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** Several FileCards: one per row, or a grid of columns from the small breakpoint up. */
function FileCardList({
  layout = 'list',
  className,
  children,
  ...props
}: { layout?: 'list' | 'grid' } & React.ComponentProps<'ul'>) {
  const t = useCoreloomI18n().messages.utility.file
  return (
    <ul
      data-slot="file-card-list"
      aria-label={props['aria-label'] ?? t.label}
      className={cn(
        'm-0 grid list-none gap-2 p-0',
        layout === 'grid' && 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
      {...props}
    >
      {/* eslint-disable-next-line @eslint-react/no-children-map -- each card gets its list item, so callers pass FileCards only */}
      {React.Children.map(children, (child) =>
        child ? <li className="min-w-0">{child}</li> : null,
      )}
    </ul>
  )
}

export { FileCard, FileCardList, type FileKind, fileKind }
