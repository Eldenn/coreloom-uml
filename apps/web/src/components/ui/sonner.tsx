'use client'

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import * as React from 'react'
import { toast, Toaster as Sonner, type ToasterProps } from 'sonner'

/** Follows <html data-theme>: dark unless it says "light". */
function useCoreloomTheme(): 'light' | 'dark' {
  const read = () =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light'
      ? 'light'
      : 'dark'
  const [theme, setTheme] = React.useState<'light' | 'dark'>(read)
  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(read())
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => {
      observer.disconnect()
    }
  }, [])
  return theme
}

const Toaster = ({ toastOptions, ...props }: ToasterProps) => {
  const theme = useCoreloomTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      gap={10}
      icons={{
        success: <CircleCheckIcon className="size-[18px] text-success" />,
        info: <InfoIcon className="size-[18px] text-info" />,
        warning: <TriangleAlertIcon className="size-[18px] text-warning" />,
        error: <OctagonXIcon className="size-[18px] text-destructive" />,
        loading: <Loader2Icon className="size-[18px] animate-spin text-muted-foreground" />,
      }}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast: '!items-start !gap-3 !font-sans !shadow-lg',
          title: '!text-[14px] !font-semibold !text-foreground',
          description: '!text-[13px] !leading-normal !text-fg-secondary',
          icon: '!mt-px',
          actionButton:
            '!h-[27px] !rounded-sm !bg-primary !px-3 !text-[13px] !font-semibold !text-primary-foreground',
          cancelButton: '!h-[27px] !rounded-sm !bg-secondary !px-3 !text-[13px] !text-fg-secondary',
          ...toastOptions?.classNames,
        },
      }}
      style={
        {
          zIndex: 'var(--z-toast)',
          '--normal-bg': 'var(--surface-1)',
          '--normal-text': 'var(--fg-1)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius-md)',
          '--width': '380px',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { toast, Toaster }
