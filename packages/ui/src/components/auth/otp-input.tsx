'use client'

import type { ChangeEvent, ClipboardEvent, FocusEvent, KeyboardEvent } from 'react'
import { useEffect, useRef } from 'react'

import { cn } from '../../lib/utils'

export interface OtpInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
  className?: string
}

function onlyDigits(input: string): string {
  return input.replace(/\D/g, '')
}

function replaceAt(source: string, index: number, char: string): string {
  const chars = source.split('')
  chars[index] = char
  return chars.join('')
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  id,
  'aria-label': ariaLabel,
  className,
}: OtpInputProps) {
  const boxRefs = useRef<Array<HTMLInputElement | null>>([])
  const completedRef = useRef(false)

  useEffect(() => {
    if (value.length >= length) {
      if (!completedRef.current) {
        completedRef.current = true
        onComplete?.(value.slice(0, length))
      }
    } else {
      completedRef.current = false
    }
  }, [value, length, onComplete])

  function focusBox(index: number) {
    boxRefs.current[Math.max(0, Math.min(index, length - 1))]?.focus()
  }

  function handleChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const digits = onlyDigits(event.target.value)
    const char = digits.slice(-1)
    // Imperatively resync the DOM value: React bails on re-rendering a
    // controlled input when the new state equals the old one (e.g. rejecting
    // a non-digit leaves the value unchanged), which would otherwise strand
    // the browser's native keystroke in the box.
    event.target.value = char
    if (char === '') {
      onChange(replaceAt(value, index, ''))
      return
    }
    onChange(replaceAt(value, index, char))
    focusBox(index + 1)
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !value[index]) {
      event.preventDefault()
      onChange(replaceAt(value, index - 1, ''))
      focusBox(index - 1)
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusBox(index - 1)
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusBox(index + 1)
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    const digits = onlyDigits(event.clipboardData.getData('text')).slice(0, length - index)
    if (digits.length === 0) return
    let next = value
    for (const [offset, char] of digits.split('').entries()) {
      next = replaceAt(next, index + offset, char)
    }
    onChange(next)
    focusBox(index + digits.length)
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    event.target.select()
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add default browser chrome that fights this component's compact box layout
    <div id={id} role="group" aria-label={ariaLabel} className={cn('flex gap-2', className)}>
      {Array.from({ length }, (_, index) => (
        <input
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length digit boxes, positions never reorder
          key={index}
          ref={(node) => {
            boxRefs.current[index] = node
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[index] ?? ''}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${length}`}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          onFocus={handleFocus}
          className={cn(
            'h-12 w-10 rounded-md border border-input bg-transparent text-center text-xl font-semibold shadow-xs outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 sm:h-14 sm:w-12 dark:bg-input/30',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          )}
        />
      ))}
    </div>
  )
}
