'use client'

// Coreloom UI — keyboard shortcuts. `useHotkeys` runs a function on a key combination ("mod+k",
// "shift+?", "g i" for G then I); "mod" is ⌘ on a Mac and Ctrl elsewhere. Single keys don't fire
// while someone types in a field. `ShortcutsDialog` lists an app's shortcuts by group, with a
// filter, usually opened with "?". `Hotkey` draws one combination as keys, for menus and tooltips.
//
//   useHotkeys('mod+k', () => setPaletteOpen(true))
//   useHotkeys('shift+?', () => setHelpOpen(true))
//   <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} groups={shortcuts} />
import * as React from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface ParsedHotkey {
  key: string
  mod: boolean
  ctrl: boolean
  meta: boolean
  alt: boolean
  shift: boolean
}

const aliases: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  space: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  del: 'delete',
  plus: '+',
}

/** "mod+shift+k" → { key: "k", mod: true, shift: true, … }. A sequence ("g i") has one per step. */
function parseHotkey(combo: string): ParsedHotkey[] {
  return combo
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((step) => {
      const parts = step.split('+')
      // "mod++" means mod and the plus key.
      const rawKey = step.endsWith('++') ? '+' : (parts.pop() ?? '')
      const mods = new Set(parts.filter(Boolean))
      return {
        key: aliases[rawKey] ?? rawKey,
        mod: mods.has('mod'),
        ctrl: mods.has('ctrl') || mods.has('control'),
        meta: mods.has('meta') || mods.has('cmd') || mods.has('command'),
        alt: mods.has('alt') || mods.has('option'),
        shift: mods.has('shift'),
      }
    })
}

/** True on macOS and iOS, where "mod" means ⌘. */
function isApplePlatform() {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform ?? navigator.platform)
}

/** Whether a keyboard event is this one step of a hotkey. */
function matchesHotkey(event: KeyboardEvent, hotkey: ParsedHotkey, apple = isApplePlatform()) {
  const wantMeta = hotkey.meta || (hotkey.mod && apple)
  const wantCtrl = hotkey.ctrl || (hotkey.mod && !apple)
  if (event.metaKey !== wantMeta || event.ctrlKey !== wantCtrl || event.altKey !== hotkey.alt)
    return false
  const key = event.key.toLowerCase()
  const isLetterOrDigit = /^[a-z0-9]$/.test(hotkey.key)
  // Shift changes symbols ("/" becomes "?"), so for a symbol only the produced key counts.
  if (isLetterOrDigit || hotkey.key.length > 1) {
    if (event.shiftKey !== hotkey.shift) return false
  }
  if (key === hotkey.key) return true
  // Alt (Option) on a Mac changes the produced letter: fall back to the physical key.
  if (isLetterOrDigit) {
    return event.code === `Key${hotkey.key.toUpperCase()}` || event.code === `Digit${hotkey.key}`
  }
  return false
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(
      target.type,
    )
  }
  return false
}

interface HotkeyOptions {
  /** Turns the shortcut off, e.g. while a dialog is open. */
  enabled?: boolean
  /** Prevents the browser's own action (⌘K focusing the address bar…). true by default. */
  preventDefault?: boolean
  /**
   * Fires even while typing in a field. By default, combinations with Ctrl, ⌘ or Alt fire in
   * fields and single keys don't.
   */
  enableOnFormFields?: boolean
  /** keydown (default) or keyup. */
  event?: 'keydown' | 'keyup'
  /** Where to listen; the document by default. */
  target?: React.RefObject<HTMLElement | null>
}

/** Runs `handler` when one of `keys` is pressed. Sequences ("g i") allow 1 second between keys. */
function useHotkeys(
  keys: string | readonly string[],
  handler: (event: KeyboardEvent, combo: string) => void,
  {
    enabled = true,
    preventDefault = true,
    enableOnFormFields = false,
    event = 'keydown',
    target,
  }: HotkeyOptions = {},
) {
  const handlerRef = React.useRef(handler)
  React.useEffect(() => {
    handlerRef.current = handler
  })
  const list = typeof keys === 'string' ? [keys] : keys
  const signature = list.join('|')

  React.useEffect(() => {
    if (!enabled) return
    const combos = signature.split('|').map((combo) => ({ combo, steps: parseHotkey(combo) }))
    const progress = new Map<string, number>()
    let last = 0
    const el: HTMLElement | Document = target?.current ?? document
    const listener = (e: Event) => {
      const ke = e as KeyboardEvent
      if (ke.repeat && combos.every((c) => c.steps.length > 1)) return
      const now = ke.timeStamp || performance.now()
      if (now - last > 1000) progress.clear()
      last = now
      for (const { combo, steps } of combos) {
        const at = progress.get(combo) ?? 0
        const step = steps.at(at)
        if (!step) continue
        const withModifier = step.mod || step.ctrl || step.meta || step.alt
        if (!enableOnFormFields && !withModifier && isTypingTarget(ke.target)) continue
        if (matchesHotkey(ke, step)) {
          if (at + 1 === steps.length) {
            progress.delete(combo)
            if (preventDefault) ke.preventDefault()
            handlerRef.current(ke, combo)
          } else {
            progress.set(combo, at + 1)
          }
        } else if (at > 0) {
          // A wrong key restarts the sequence; this key may start it again.
          progress.set(combo, matchesHotkey(ke, steps[0] ?? step) ? 1 : 0)
        }
      }
    }
    el.addEventListener(event, listener)
    return () => {
      el.removeEventListener(event, listener)
    }
  }, [signature, enabled, preventDefault, enableOnFormFields, event, target])
}

const appleSymbols: Record<string, string> = {
  mod: '⌘',
  meta: '⌘',
  cmd: '⌘',
  ctrl: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
}
const keyNames: Record<string, string> = {
  escape: 'Esc',
  enter: '↵',
  ' ': 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: '⌫',
  delete: 'Del',
  tab: 'Tab',
}

/** "mod+shift+k" → ["⌘", "⇧", "K"] on a Mac, ["Ctrl", "Shift", "K"] elsewhere; one array per step. */
function formatHotkey(combo: string, apple = isApplePlatform()): string[][] {
  return combo
    .trim()
    .split(/\s+/)
    .map((step) => {
      const parts = step.endsWith('++')
        ? [...step.slice(0, -2).split('+').filter(Boolean), '+']
        : step.split('+')
      return parts.map((part, i) => {
        const p = part.toLowerCase()
        if (i < parts.length - 1) {
          if (apple) return appleSymbols[p] ?? part
          return p === 'mod' || p === 'ctrl'
            ? 'Ctrl'
            : p === 'meta' || p === 'cmd'
              ? 'Win'
              : p === 'alt' || p === 'option'
                ? 'Alt'
                : p === 'shift'
                  ? 'Shift'
                  : part
        }
        const k = aliases[p] ?? p
        return (
          keyNames[k] ?? (k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1))
        )
      })
    })
}

// The platform never changes while the page is open, so there is nothing to subscribe to.
const noSubscription = () => () => undefined

/** One combination drawn as keys: ⌘ K, or G then I for a sequence. */
function Hotkey({ keys, className }: { keys: string; className?: string }) {
  const t = useCoreloomI18n().messages.utility.shortcuts
  // The platform is only known in the browser; draw the non-Apple form until then.
  const apple = React.useSyncExternalStore(noSubscription, isApplePlatform, () => false)
  const steps = formatHotkey(keys, apple)
  return (
    <span data-slot="hotkey" className={cn('inline-flex items-center gap-1.5', className)}>
      {steps.map((step, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- steps have no id and never reorder
        <React.Fragment key={i}>
          {i ? <span className="text-[11.5px] text-muted-foreground">{t.then}</span> : null}
          <KbdGroup>
            {step.map((k, j) => (
              // eslint-disable-next-line @eslint-react/no-array-index-key -- keys of a step never reorder
              <Kbd key={j}>{k}</Kbd>
            ))}
          </KbdGroup>
        </React.Fragment>
      ))}
    </span>
  )
}

interface ShortcutGroup {
  title: React.ReactNode
  shortcuts: { keys: string; description: string }[]
}

function ShortcutsDialog({
  open,
  onOpenChange,
  groups,
  title,
  description,
  filter = true,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: ShortcutGroup[]
  /** "Keyboard shortcuts" by default. */
  title?: React.ReactNode
  description?: React.ReactNode
  /** Shows a box that filters the shortcuts by description. */
  filter?: boolean
}) {
  const t = useCoreloomI18n().messages.utility.shortcuts
  const [query, setQuery] = React.useState('')
  const q = query.trim().toLowerCase()
  const shown = groups
    .map((g) => ({
      ...g,
      shortcuts: g.shortcuts.filter((s) => s.description.toLowerCase().includes(q)),
    }))
    .filter((g) => g.shortcuts.length)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery('')
        onOpenChange(next)
      }}
    >
      <DialogContent
        data-slot="shortcuts-dialog"
        className="max-h-[min(640px,calc(100vh-4rem))] grid-rows-[auto_auto_1fr] sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{title ?? t.title}</DialogTitle>
          <DialogDescription className={description ? undefined : 'sr-only'}>
            {description ?? t.description}
          </DialogDescription>
        </DialogHeader>
        {filter ? (
          <input
            type="search"
            value={query}
            aria-label={t.filter}
            placeholder={t.filter}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 font-sans text-[14px] text-foreground outline-none placeholder:text-faint-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
            onChange={(e) => {
              setQuery(e.target.value)
            }}
          />
        ) : (
          <span />
        )}
        <div className="-mx-1 min-h-0 overflow-auto px-1">
          {shown.length ? (
            <div className="flex flex-col gap-5">
              {shown.map((group, gi) => (
                <section
                  // eslint-disable-next-line @eslint-react/no-array-index-key -- groups are given in a fixed order
                  key={gi}
                  aria-label={typeof group.title === 'string' ? group.title : undefined}
                >
                  <h3 className="m-0 mb-1.5 font-mono text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                    {group.title}
                  </h3>
                  <dl className="m-0 divide-y divide-border-subtle">
                    {group.shortcuts.map((s) => (
                      <div
                        key={s.keys + s.description}
                        className="flex items-center justify-between gap-4 py-2"
                      >
                        <dt className="text-[13.5px] text-foreground">{s.description}</dt>
                        <dd className="m-0 shrink-0">
                          <Hotkey keys={s.keys} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          ) : (
            <p className="m-0 py-6 text-center text-[13.5px] text-muted-foreground">{t.empty}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export {
  formatHotkey,
  Hotkey,
  type HotkeyOptions,
  isApplePlatform,
  matchesHotkey,
  type ParsedHotkey,
  parseHotkey,
  type ShortcutGroup,
  ShortcutsDialog,
  useHotkeys,
}
