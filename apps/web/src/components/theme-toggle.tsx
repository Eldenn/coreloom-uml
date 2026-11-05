'use client'

// Coreloom UI — theme switching (block part). Dark is the default; light sets <html data-theme="light">.
// The choice — "light", "dark" or "system" (follow the OS) — is kept in localStorage("theme").
// Add the inline script from the Getting started guide to <head> so it applies before the first paint.
//   ThemeToggle: one icon button, light ↔ dark.
//   ThemeMenu:   a menu with Light, Dark and System.
// Accent presets (accents.css): <html data-accent="violet">, kept in localStorage("accent").
//   AccentPicker: a row of swatches, one per preset, with useAccent behind it.
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** The theme on screen. */
type Theme = 'dark' | 'light'
/** What the user chose. */
type ThemePreference = Theme | 'system'

const STORAGE_KEY = 'theme'
const LIGHT_QUERY = '(prefers-color-scheme: light)'

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch {
    /* storage unavailable */
  }
  return readTheme()
}

function systemTheme(): Theme {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- matchMedia is missing in jsdom and old embedded browsers
  return typeof window !== 'undefined' && window.matchMedia?.(LIGHT_QUERY).matches
    ? 'light'
    : 'dark'
}

function apply(theme: Theme) {
  const root = document.documentElement
  if (theme === 'light') root.dataset.theme = 'light'
  else delete root.dataset.theme
}

/**
 * The theme on screen (`theme`), the user's choice (`preference`) and a setter that applies and
 * persists it. With "system", the theme follows the OS and updates when it changes.
 */
function useTheme() {
  // eslint-disable-next-line @eslint-react/use-state -- setTheme/setPreference/setAccent are the public setters that also apply and persist
  const [theme, setThemeState] = React.useState<Theme>(readTheme)
  // eslint-disable-next-line @eslint-react/use-state -- setTheme/setPreference/setAccent are the public setters that also apply and persist
  const [preference, setPreferenceState] = React.useState<ThemePreference>('dark')

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage after mount so the server render matches
    setPreferenceState(readPreference())
    const observer = new MutationObserver(() => {
      setThemeState(readTheme())
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => {
      observer.disconnect()
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- matchMedia is missing in jsdom and old embedded browsers
    if (preference !== 'system' || !window.matchMedia) return
    const mq = window.matchMedia(LIGHT_QUERY)
    const onChange = () => {
      apply(mq.matches ? 'light' : 'dark')
    }
    onChange()
    mq.addEventListener('change', onChange)
    return () => {
      mq.removeEventListener('change', onChange)
    }
  }, [preference])

  const setTheme = React.useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    apply(next === 'system' ? systemTheme() : next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage unavailable: the choice lasts for this page */
    }
  }, [])

  return {
    theme,
    preference,
    setTheme,
    toggleTheme: () => {
      setTheme(theme === 'light' ? 'dark' : 'light')
    },
  }
}

/** One icon button that flips between light and dark. */
function ThemeToggle({ className }: { className?: string }) {
  const t = useCoreloomI18n().messages
  const { theme, toggleTheme } = useTheme()
  const label = theme === 'light' ? t.theme.toDark : t.theme.toLight
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={label}
          className={className}
        >
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{theme === 'light' ? t.theme.dark : t.theme.light}</TooltipContent>
    </Tooltip>
  )
}

/** A menu with Light, Dark and System (follows the OS). */
function ThemeMenu({
  className,
  align = 'end',
}: {
  className?: string
  align?: 'start' | 'center' | 'end'
}) {
  const t = useCoreloomI18n().messages.theme
  const { theme, preference, setTheme } = useTheme()
  const options = [
    { value: 'light', label: t.lightOption, icon: SunIcon },
    { value: 'dark', label: t.darkOption, icon: MoonIcon },
    { value: 'system', label: t.systemOption, icon: MonitorIcon },
  ] as const
  const current = options.find((o) => o.value === preference) ?? options[1]
  const Icon = preference === 'system' ? MonitorIcon : theme === 'light' ? SunIcon : MoonIcon
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${t.menu}: ${current.label}`}
              className={className}
            >
              <Icon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t.menu}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align={align} className="min-w-40">
        <DropdownMenuLabel>{t.menu}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(v) => {
            setTheme(v as ThemePreference)
          }}
        >
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              <o.icon />
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The presets in accents.css; "cyan" is the default (no attribute). */
const ACCENTS = ['cyan', 'blue', 'violet', 'amber', 'rose'] as const
type Accent = (typeof ACCENTS)[number]
const ACCENT_KEY = 'accent'

function readAccent(): Accent {
  if (typeof document === 'undefined') return 'cyan'
  const current = document.documentElement.dataset.accent
  return ACCENTS.includes(current as Accent) ? (current as Accent) : 'cyan'
}

/** The accent on <html> and a setter that applies and persists it. */
function useAccent() {
  // eslint-disable-next-line @eslint-react/use-state -- setTheme/setPreference/setAccent are the public setters that also apply and persist
  const [accent, setAccentState] = React.useState<Accent>('cyan')

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads <html> after mount so the server render matches
    setAccentState(readAccent())
    const observer = new MutationObserver(() => {
      setAccentState(readAccent())
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-accent'],
    })
    return () => {
      observer.disconnect()
    }
  }, [])

  const setAccent = React.useCallback((next: Accent) => {
    setAccentState(next)
    const root = document.documentElement
    if (next === 'cyan') delete root.dataset.accent
    else root.dataset.accent = next
    try {
      if (next === 'cyan') localStorage.removeItem(ACCENT_KEY)
      else localStorage.setItem(ACCENT_KEY, next)
    } catch {
      /* storage unavailable: the choice lasts for this page */
    }
  }, [])

  return { accent, setAccent }
}

/**
 * One swatch per accent preset, as a radio group (arrow keys move between them). Each swatch is
 * drawn with its own preset (data-accent), so it shows the colour as it looks in the current theme.
 * Needs accents.css. Label it: `aria-label`, or `aria-labelledby` pointing at a visible label.
 */
function AccentPicker({
  accents = ACCENTS,
  className,
  ...props
}: Omit<
  React.ComponentProps<typeof RadioGroupPrimitive.Root>,
  'value' | 'defaultValue' | 'onValueChange' | 'orientation'
> & {
  /** The presets to offer, in order. */
  accents?: readonly Accent[]
}) {
  const t = useCoreloomI18n().messages.theme
  const { accent, setAccent } = useAccent()
  return (
    <RadioGroupPrimitive.Root
      data-slot="accent-picker"
      aria-label={props['aria-labelledby'] ? undefined : t.accent}
      orientation="horizontal"
      value={accent}
      onValueChange={(v) => {
        setAccent(v as Accent)
      }}
      className={cn('flex flex-wrap gap-3', className)}
      {...props}
    >
      {accents.map((name) => (
        <label
          key={name}
          className="flex w-14 cursor-pointer flex-col items-center gap-1.5 text-[12px] text-muted-foreground has-[[data-state=checked]]:text-foreground"
        >
          <RadioGroupPrimitive.Item
            value={name}
            data-accent={name}
            aria-label={t.accents[name]}
            // Radix checks a radio on arrow-key focus only while the key is still down, and moves focus
            // a tick later: a quick tap could move focus without choosing. Choosing on focus is the
            // radio pattern anyway (Tab lands on the checked one, so it changes nothing).
            onFocus={() => {
              setAccent(name)
            }}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-[var(--accent)] text-[var(--fg-on-accent)] ring-offset-2 ring-offset-background transition-shadow duration-fast outline-none focus-visible:outline-[3px] focus-visible:outline-offset-[5px] focus-visible:outline-ring data-[state=checked]:ring-2 data-[state=checked]:ring-foreground"
          >
            <RadioGroupPrimitive.Indicator>
              <CheckIcon className="size-4" strokeWidth={3} />
            </RadioGroupPrimitive.Indicator>
          </RadioGroupPrimitive.Item>
          {t.accents[name]}
        </label>
      ))}
    </RadioGroupPrimitive.Root>
  )
}

export {
  type Accent,
  AccentPicker,
  ACCENTS,
  type Theme,
  ThemeMenu,
  type ThemePreference,
  ThemeToggle,
  useAccent,
  useTheme,
}
