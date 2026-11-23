'use client'

// Coreloom UI — CopyButton (block part). Copies a string, confirms with a check and a toast.
import { CheckIcon, CopyIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function CopyButton({
  value,
  label,
  toastMessage,
  className,
}: {
  value: string
  label?: string
  /** Toast shown after copying; pass an empty string for none. */
  toastMessage?: string
  className?: string
}) {
  const t = useCoreloomI18n().messages
  label ??= t.copy.copy
  toastMessage ??= t.copy.copied
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => {
      setCopied(false)
    }, 1400)
    return () => {
      clearTimeout(t)
    }
  }, [copied])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className={cn('shrink-0', className)}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              if (toastMessage) toast.success(toastMessage)
            } catch {
              toast.error(t.copy.failed)
            }
          }}
        >
          {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export { CopyButton }
