'use client'

// Coreloom UI — LogoLoader. Your logo as the loading screen of the app (or of a panel) while it
// starts: the logo draws itself or breathes, an optional line says what is happening, and when
// `loading` turns false it fades away and hands the place to the content. Screen readers hear
// "Loading" once, through a busy status. For people who ask for reduced motion the logo stays
// still and the screen simply disappears.
//
//   <LogoLoader loading={!ready} logo={<AtlasLogo />} label="Atlas" fullscreen />
import * as React from 'react'

import { Logo, type LogoAnimation } from '@/components/ui/logo'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function LogoLoader({
  loading,
  logo,
  label,
  animation = 'pulse',
  message,
  fullscreen = false,
  className,
  children,
  ...props
}: {
  /** Shows the loader; false fades it out and shows the children. */
  loading: boolean
  /** The logo: an inline SVG (or anything Logo takes as children). */
  logo: React.ReactNode
  /** The brand's name, for screen readers. */
  label?: string
  /** pulse (default, loops), draw, or any Logo animation (they play once). */
  animation?: LogoAnimation
  /** A line under the logo ("Preparing your workspace…"). */
  message?: React.ReactNode
  /** Covers the whole screen, above everything. */
  fullscreen?: boolean
  /** What appears once loading ends. */
  children?: React.ReactNode
} & Omit<React.ComponentProps<'div'>, 'children'>) {
  const t = useCoreloomI18n().messages.common
  // Kept on screen for its fade after loading ends.
  const [shown, setShown] = React.useState(loading)
  const [wasLoading, setWasLoading] = React.useState(loading)
  if (wasLoading !== loading) {
    setWasLoading(loading)
    if (loading) setShown(true)
  }
  React.useEffect(() => {
    if (loading || !shown) return
    const timer = setTimeout(() => {
      setShown(false)
    }, 320)
    return () => {
      clearTimeout(timer)
    }
  }, [loading, shown])

  return (
    <>
      {!loading && children}
      {shown && (
        <div
          data-slot="logo-loader"
          data-state={loading ? 'loading' : 'done'}
          role="status"
          aria-busy={loading}
          className={cn(
            'flex flex-col items-center justify-center gap-4 bg-background text-foreground transition-opacity duration-slow ease-out',
            fullscreen ? 'fixed inset-0 z-(--z-modal)' : 'min-h-48 w-full',
            !loading && 'pointer-events-none opacity-0',
            className,
          )}
          {...props}
        >
          <Logo animation={animation} className="h-16">
            {logo}
          </Logo>
          {message != null && <p className="m-0 text-[13px] text-muted-foreground">{message}</p>}
          <span className="sr-only">{label ? `${label}, ${t.loading}` : t.loading}</span>
        </div>
      )}
    </>
  )
}

export { LogoLoader }
