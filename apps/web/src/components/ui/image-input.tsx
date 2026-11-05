'use client'

// Coreloom UI — ImageInput. One image with its preview: a profile photo, a workspace logo, a cover.
// Click the preview (or drop an image on it) to choose; Replace and Remove sit beside it. The value
// is the chosen File, or a URL string for the image already saved, or null. It only collects the
// File: you upload it yourself.
import { ImageIcon, ImageUpIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { formatBytes } from '@/components/ui/file-upload'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type ImageValue = File | string | null

const shapes = {
  circle: 'size-20 rounded-full',
  square: 'size-20 rounded-lg',
  wide: 'aspect-video w-56 rounded-lg',
} as const

/** An object URL for a File (revoked when it changes), or the string itself. */
function usePreview(value: ImageValue) {
  const [url, setUrl] = React.useState<string>()
  React.useEffect(() => {
    if (!(value instanceof File) || typeof URL.createObjectURL !== 'function') return
    const u = URL.createObjectURL(value)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL lives as long as the File
    setUrl(u)
    return () => {
      URL.revokeObjectURL(u)
    }
  }, [value])
  if (typeof value === 'string') return value || undefined
  return value ? url : undefined
}

function ImageInput({
  value,
  defaultValue = null,
  onValueChange,
  shape = 'circle',
  accept = 'image/png,image/jpeg,image/webp,image/gif',
  maxSize,
  fallback,
  hint,
  disabled,
  id,
  className,
  onBlur,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  value?: ImageValue
  defaultValue?: ImageValue
  onValueChange?: (value: File | null) => void
  /** circle (avatar), square (logo) or wide (16:9 cover). */
  shape?: keyof typeof shapes
  accept?: string
  /** Largest file accepted, in bytes. */
  maxSize?: number
  /** Shown when there is no image: initials, an icon. */
  fallback?: React.ReactNode
  /** Text under the buttons; defaults to the accepted types and size. Pass null to hide it. */
  hint?: React.ReactNode
  disabled?: boolean
  /** Goes on the preview button, so a FieldLabel names it. */
  id?: string
  className?: string
  onBlur?: () => void
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const { messages, locale } = useCoreloomI18n()
  const t = messages.inputs.image
  const [inner, setInner] = React.useState<ImageValue>(defaultValue)
  const current = value !== undefined ? value : inner
  const src = usePreview(current)
  const [error, setError] = React.useState<string | null>(null)
  const [over, setOver] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const hintId = React.useId()
  const errorId = React.useId()

  const set = (next: File | null) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }
  const take = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError(t.wrongType)
      return
    }
    if (maxSize !== undefined && file.size > maxSize) {
      setError(t.tooLarge(formatBytes(maxSize, locale)))
      return
    }
    setError(null)
    set(file)
  }
  const types = accept
    .split(',')
    .map((a) => a.trim().replace('image/', '').toUpperCase())
    .filter((a) => a && a !== '*')
    .join(', ')
  const hintText =
    hint === undefined
      ? types
        ? t.hint(types, maxSize === undefined ? undefined : formatBytes(maxSize, locale))
        : null
      : hint
  const describedBy =
    [hintText ? hintId : undefined, error ? errorId : undefined, ariaDescribedBy]
      .filter(Boolean)
      .join(' ') || undefined
  const choose = () => fileRef.current?.click()

  return (
    <div
      data-slot="image-input"
      className={cn('flex flex-wrap items-center gap-4', className)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onBlur?.()
      }}
    >
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel}: ${src ? t.replace : t.choose}` : undefined}
        aria-describedby={describedBy}
        data-invalid={error !== null || ariaInvalid === true || ariaInvalid === 'true' || undefined}
        data-over={over || undefined}
        className={cn(
          'relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden border border-dashed border-border-strong bg-inset text-muted-foreground transition-[border-color,box-shadow] duration-fast outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 data-invalid:border-destructive data-over:border-primary data-over:bg-primary-subtle',
          src && 'border-solid border-border',
          shapes[shape],
        )}
        onClick={choose}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => {
          setOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (!disabled) take(e.dataTransfer.files[0])
        }}
      >
        {src ? (
          <img src={src} alt={t.preview} className="size-full object-cover" />
        ) : (
          (fallback ?? <ImageIcon aria-hidden className="size-6" />)
        )}
        {!ariaLabel && <span className="sr-only">{src ? t.replace : t.choose}</span>}
      </button>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={choose}>
            <ImageUpIcon />
            {src ? t.replace : t.choose}
          </Button>
          {src ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setError(null)
                set(null)
              }}
            >
              {t.remove}
            </Button>
          ) : null}
        </div>
        {hintText ? (
          <p id={hintId} className="m-0 text-[12px] text-muted-foreground">
            {hintText}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} role="alert" className="m-0 text-[12px] text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        hidden
        tabIndex={-1}
        onChange={(e) => {
          take(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

export { ImageInput, type ImageValue }
