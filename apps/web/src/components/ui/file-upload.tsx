import { FileIcon, UploadCloudIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import { Progress } from '@/components/ui/progress'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface FileRejection {
  file: File
  reason: 'type' | 'size' | 'count'
  message: string
}

/** "image/*,.pdf" → does this file match? */
function accepts(file: File, accept?: string) {
  if (!accept) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return accept
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
    .some((a) =>
      a.startsWith('.')
        ? name.endsWith(a)
        : a.endsWith('/*')
          ? type.startsWith(a.slice(0, -1))
          : type === a,
    )
}

/** 1536 → "1.5 kB" in the current locale. */
function formatBytes(bytes: number, locale: string) {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  // "narrow" gives B / kB / MB (o / ko / Mo in French) instead of "byte"; keep a space before the unit.
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: units[i],
    unitDisplay: 'narrow',
    maximumFractionDigits: n < 10 && i > 0 ? 1 : 0,
  })
    .formatToParts(n)
    .map((part, index, parts) =>
      part.type === 'unit' && parts[index - 1]?.type !== 'literal'
        ? `\u00a0${part.value}`
        : part.value,
    )
    .join('')
}

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

function Thumbnail({ file }: { file: File }) {
  const [url, setUrl] = React.useState<string>()
  React.useEffect(() => {
    if (!file.type.startsWith('image/') || typeof URL.createObjectURL !== 'function') return
    const u = URL.createObjectURL(file)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the object URL is created and revoked with the effect.
    setUrl(u)
    return () => {
      URL.revokeObjectURL(u)
    }
  }, [file])
  return (
    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-secondary text-muted-foreground [&_svg]:size-4">
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <FileIcon />}
    </span>
  )
}

function FileUpload({
  value,
  defaultValue = [],
  onValueChange,
  onReject,
  accept,
  multiple = true,
  maxSize,
  maxFiles,
  progress,
  disabled,
  className,
  id,
  onBlur,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}: {
  value?: File[]
  defaultValue?: File[]
  onValueChange?: (files: File[]) => void
  /** Files that were refused (wrong type, too large, too many), with a message. */
  onReject?: (rejections: FileRejection[]) => void
  /** Like the input's accept: "image/*,.pdf". */
  accept?: string
  multiple?: boolean
  /** Bytes. */
  maxSize?: number
  maxFiles?: number
  /** Upload progress per file, 0–100; undefined for none. */
  progress?: (file: File) => number | undefined
  disabled?: boolean
  className?: string
  /** Lands on the file input, so a FieldLabel's htmlFor points at it. */
  id?: string
  onBlur?: () => void
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-describedby'?: string
}) {
  const { messages, locale } = useCoreloomI18n()
  const t = messages.fileUpload
  const [inner, setInner] = React.useState<File[]>(defaultValue)
  const files = value ?? inner
  const [dragging, setDragging] = React.useState(false)
  const [errors, setErrors] = React.useState<string[]>([])
  const inputRef = React.useRef<HTMLInputElement>(null)
  const errorId = React.useId()
  const limit = multiple ? maxFiles : 1

  const commit = (next: File[]) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }

  const addFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list)
    const rejections: FileRejection[] = []
    const ok: File[] = []
    for (const file of incoming) {
      if (!accepts(file, accept))
        rejections.push({ file, reason: 'type', message: t.wrongType(file.name) })
      else if (maxSize !== undefined && file.size > maxSize)
        rejections.push({
          file,
          reason: 'size',
          message: t.tooLarge(file.name, formatBytes(maxSize, locale)),
        })
      else ok.push(file)
    }
    let next = multiple
      ? [...files.filter((f) => !ok.some((o) => fileKey(o) === fileKey(f))), ...ok]
      : ok.slice(-1)
    if (limit !== undefined && next.length > limit) {
      for (const file of next.slice(limit))
        rejections.push({ file, reason: 'count', message: t.tooMany(limit) })
      next = next.slice(0, limit)
    }
    setErrors([...new Set(rejections.map((r) => r.message))])
    if (rejections.length) onReject?.(rejections)
    if (ok.length) commit(next)
  }

  const invalid = !!(ariaInvalid && ariaInvalid !== 'false') || errors.length > 0

  return (
    <div data-slot="file-upload" className={cn('flex w-full flex-col gap-2.5', className)}>
      <label
        data-dragging={dragging || undefined}
        data-disabled={disabled ? true : undefined}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input bg-inset px-4 py-7 text-center font-sans text-[14px] text-muted-foreground transition-[border-color,background-color,box-shadow] duration-base ease-out hover:border-primary has-[input:focus-visible]:border-primary has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring data-disabled:pointer-events-none data-disabled:opacity-55 data-dragging:border-primary data-dragging:bg-primary-subtle',
          invalid && 'border-destructive',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => {
          setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled && e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
        }}
      >
        <UploadCloudIcon className="size-6 text-muted-foreground" aria-hidden />
        <span>
          {multiple ? t.drop : t.dropOne}{' '}
          <span className="font-medium text-primary-text underline underline-offset-4">
            {t.browse}
          </span>
        </span>
        <input
          ref={inputRef}
          id={id}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={
            [ariaDescribedby, errors.length ? errorId : null].filter(Boolean).join(' ') || undefined
          }
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files)
            e.target.value = ''
          }}
          onBlur={onBlur}
        />
      </label>
      {errors.length > 0 && (
        <div
          id={errorId}
          role="alert"
          className="flex flex-col gap-0.5 text-[11px] text-destructive"
        >
          {errors.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <ul data-slot="file-upload-list" className="flex flex-col gap-2">
          {files.map((file) => {
            const p = progress?.(file)
            return (
              <li
                key={fileKey(file)}
                className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5"
              >
                <Thumbnail file={file} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[14px] font-medium text-foreground">
                      {file.name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {formatBytes(file.size, locale)}
                    </span>
                  </div>
                  {p !== undefined && p < 100 && (
                    <Progress
                      value={p}
                      aria-label={t.uploading(
                        new Intl.NumberFormat(locale, { style: 'percent' }).format(p / 100),
                      )}
                      className="h-1"
                    />
                  )}
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={t.remove(file.name)}
                  onClick={() => {
                    commit(files.filter((f) => fileKey(f) !== fileKey(file)))
                    inputRef.current?.focus()
                  }}
                  className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none [&_svg]:size-4"
                >
                  <XIcon />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export { type FileRejection, FileUpload, formatBytes }
