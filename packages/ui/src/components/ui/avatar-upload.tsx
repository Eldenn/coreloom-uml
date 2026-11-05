'use client'

import type { ChangeEvent } from 'react'
import { useRef, useState } from 'react'

import { cn } from '../../lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from './avatar'
import { Button } from './button'

export interface AvatarUploadProps {
  value: string | null
  fallback?: string
  onFileSelected: (file: File) => void
  uploading?: boolean
  error?: string | null
  accept?: string[]
  maxSize?: number
  disabled?: boolean
  disabledReason?: string
  className?: string
}

export function AvatarUpload({
  value,
  fallback = '?',
  onFileSelected,
  uploading = false,
  error = null,
  accept = ['image/png', 'image/jpeg', 'image/webp'],
  maxSize = 5 * 1024 * 1024,
  disabled = false,
  disabledReason,
  className,
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setLocalError(null)
    const file = event.target.files?.[0]
    // Reset so selecting the same file again still fires onChange.
    event.target.value = ''
    if (!file) {
      return
    }
    if (accept.length > 0 && !accept.includes(file.type)) {
      setLocalError('Unsupported file type')
      return
    }
    if (file.size > maxSize) {
      setLocalError('File is too large')
      return
    }
    onFileSelected(file)
  }

  const shownError = localError ?? error

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <Avatar size="lg">
        {value ? <AvatarImage src={value} alt="Account avatar" /> : null}
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1">
        <input
          ref={inputRef}
          type="file"
          aria-label="Upload avatar"
          accept={accept.join(',')}
          className="sr-only"
          disabled={disabled || uploading}
          onChange={handleChange}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Uploading…' : 'Change avatar'}
        </Button>
        {disabled && disabledReason ? (
          <p className="text-sm text-muted-foreground">{disabledReason}</p>
        ) : null}
        {shownError ? (
          <p role="alert" className="text-sm text-destructive">
            {shownError}
          </p>
        ) : null}
      </div>
    </div>
  )
}
