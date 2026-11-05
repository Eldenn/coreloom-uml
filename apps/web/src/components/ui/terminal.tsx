import { CheckIcon, CopyIcon, EraserIcon, SquareIcon, SquareTerminalIcon } from 'lucide-react'
import * as React from 'react'

import {
  type AnsiLine,
  AnsiLineView,
  type AnsiScreen,
  createAnsiScreen,
  lineText,
  parseAnsi,
  writeAnsi,
} from '@/components/ui/ansi-output'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** What a command can give back: text to print, a promise of it, or chunks as they come. */
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- commands that only print through context.write return nothing, so they can be plain (async) functions
type TerminalCommandResult = void | string | Promise<void | string> | AsyncIterable<string>

interface TerminalCommandContext {
  /** Aborted when the person presses Ctrl+C (or Stop). Pass it to fetch. */
  signal: AbortSignal
  /** Prints text as it is (ANSI allowed). Ignored once the command was interrupted. */
  write: (text: string) => void
  writeln: (text?: string) => void
  clear: () => void
  /** Asks a question and waits for the answer: "Deploy to production? [y/N] ". */
  read: (options?: { prompt?: string; secret?: boolean }) => Promise<string>
  /** Columns that fit in the terminal now, to lay out tables. */
  columns: number
}

/**
 * A running process the terminal talks to (a PTY behind a WebSocket, a Tauri or VS Code process).
 * The same shape xterm.js uses: data out, keys in.
 */
interface TerminalSession {
  /** Output from the process (ANSI). Returns the unsubscribe function. */
  onData: (listener: (data: string) => void) => () => void
  /** Input for the process: a line and "\r", or "\x03" for Ctrl+C. */
  write: (data: string) => void
  resize?: (columns: number, rows: number) => void
  /** Called on Ctrl+C instead of writing "\x03". */
  interrupt?: () => void
  /** The process ended. Returns the unsubscribe function. */
  onExit?: (listener: (code: number) => void) => () => void
}

interface TerminalOptions {
  /** Runs a command. Throw to print an error (in red); the run counts as failed. */
  onCommand?: (command: string, context: TerminalCommandContext) => TerminalCommandResult
  /** Candidates for the last word of the input, for Tab. Prefix filtering is done for you. */
  onComplete?: (input: string) => readonly string[] | Promise<readonly string[]>
  /** Connects the terminal to a process instead of `onCommand`. */
  session?: TerminalSession
  /** Printed before each command (ANSI allowed). Not drawn with a session: the process prints its own. */
  prompt?: string
  /** Printed when the terminal is created (ANSI allowed). */
  welcome?: string
  /** Earlier commands, oldest first, for ↑. */
  history?: readonly string[]
  onHistoryChange?: (history: readonly string[]) => void
  /** Lines kept; older ones are dropped. */
  maxLines?: number
  /** Commands kept in the history. */
  maxHistory?: number
  /** With a session, also print what is typed (when the process doesn't echo). */
  localEcho?: boolean
}

interface TerminalState {
  screen: AnsiScreen
  prompt: string
  /** A command is running (commands mode). */
  running: boolean
  /** A command waits for an answer (`context.read`). */
  reading: { prompt: string; secret: boolean } | null
  history: readonly string[]
  /** Exit code of the last command: 0, 1 when it threw, 130 when interrupted. */
  exitCode?: number
  /** Connected to a session. */
  connected: boolean
}

interface TerminalController {
  getState: () => TerminalState
  subscribe: (listener: () => void) => () => void
  /** Prints text (ANSI allowed), outside of any command: a notice, a process's output. */
  write: (text: string) => void
  writeln: (text?: string) => void
  clear: () => void
  /** Runs a command as if it had been typed. Resolves when it finishes. */
  run: (command: string) => Promise<void>
  /** What Enter does: answers a pending question, or runs the line. */
  submit: (line: string) => Promise<void>
  /** Ctrl+C: stops the running command (or sends it to the session). */
  interrupt: () => void
  /** The input completed by `onComplete`, and the candidates when there are several. */
  complete: (input: string) => Promise<{ input: string; candidates: string[] }>
  setPrompt: (prompt: string) => void
  /** Tells the terminal (and the session) how many columns and rows fit. */
  resize: (columns: number, rows: number) => void
  /** Connects a session; returns the disconnect function. */
  connect: (session: TerminalSession) => () => void
  /** The output as plain text. */
  getText: () => string
  /** Latest options (callbacks); `useTerminal` calls it on every render. */
  setOptions: (options: TerminalOptions) => void
}

function isAsyncIterable(value: unknown): value is AsyncIterable<string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof (value as Record<symbol, unknown>)[Symbol.asyncIterator] === 'function'
  )
}

/** Control characters out of something typed, so an echo can't move the cursor or recolour. */
function sanitizeInput(text: string) {
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  return text.replace(/[\x00-\x1f\x7f]/g, '')
}

function commonPrefix(words: readonly string[]) {
  if (!words.length) return ''
  let prefix = words[0] ?? ''
  for (const word of words) while (!word.startsWith(prefix)) prefix = prefix.slice(0, -1)
  return prefix
}

/**
 * Tab completion of the input's last word. One match replaces the word (and adds a space unless
 * it ends with "/"); several fill in what they share and are returned to be listed.
 */
function completeInput(
  input: string,
  candidates: readonly string[],
): { input: string; candidates: string[] } {
  const start = input.search(/\S*$/)
  const word = input.slice(start)
  const matches = [...new Set(candidates.filter((c) => c.startsWith(word)))].sort()
  if (matches.length === 0) return { input, candidates: [] }
  if (matches.length === 1) {
    const only = matches[0] ?? ''
    return { input: input.slice(0, start) + only + (only.endsWith('/') ? '' : ' '), candidates: [] }
  }
  return { input: input.slice(0, start) + commonPrefix(matches), candidates: matches }
}

function createTerminal(options: TerminalOptions = {}): TerminalController {
  let opts = options
  const maxLines = () => opts.maxLines ?? 5000
  let state: TerminalState = {
    screen: options.welcome
      ? writeAnsi(createAnsiScreen(), options.welcome, { maxLines: maxLines() })
      : createAnsiScreen(),
    prompt: options.prompt ?? '$ ',
    running: false,
    reading: null,
    history: options.history ?? [],
    connected: false,
  }
  const listeners = new Set<() => void>()
  // Every command gets an id; output from a command that was interrupted is dropped.
  let runId = 0
  let abort: AbortController | null = null
  let pendingRead: { resolve: (value: string) => void; reject: (reason: unknown) => void } | null =
    null
  let session: TerminalSession | null = null
  let size = { columns: 80, rows: 24 }

  const set = (patch: Partial<TerminalState>) => {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }
  const write = (text: string) => {
    if (text) set({ screen: writeAnsi(state.screen, text, { maxLines: maxLines() }) })
  }
  const writeln = (text = '') => {
    write(text.endsWith('\n') ? text : `${text}\n`)
  }
  const clear = () => {
    set({ screen: createAnsiScreen() })
  }
  const newLine = () => {
    if (state.screen.col !== 0) write('\n')
  }
  const pushHistory = (command: string) => {
    if (!command.trim() || state.history.at(-1) === command) return
    const history = [...state.history, command].slice(-(opts.maxHistory ?? 500))
    set({ history })
    opts.onHistoryChange?.(history)
  }

  const run = async (command: string) => {
    if (session) {
      if (opts.localEcho) write(`${sanitizeInput(command)}\n`)
      pushHistory(command)
      session.write(`${command}\r`)
      return
    }
    if (state.running) return
    newLine()
    write(`${state.prompt}${sanitizeInput(command)}\n`)
    pushHistory(command)
    if (!command.trim() || !opts.onCommand) return
    const id = ++runId
    const controller = new AbortController()
    abort = controller
    set({ running: true })
    const live = () => id === runId
    const context: TerminalCommandContext = {
      signal: controller.signal,
      write: (text) => {
        if (live()) write(text)
      },
      writeln: (text) => {
        if (live()) writeln(text)
      },
      clear: () => {
        if (live()) clear()
      },
      read: ({ prompt = '', secret = false } = {}) =>
        new Promise<string>((resolve, reject) => {
          if (!live()) {
            reject(new DOMException('Interrupted', 'AbortError'))
            return
          }
          newLine()
          pendingRead = { resolve, reject }
          set({ reading: { prompt, secret } })
        }),
      columns: size.columns,
    }
    let exitCode = 0
    try {
      const result = opts.onCommand(command, context)
      if (isAsyncIterable(result)) {
        for await (const chunk of result) {
          if (!live()) break
          write(chunk)
        }
      } else {
        const value = await result
        if (typeof value === 'string' && live()) writeln(value)
      }
    } catch (error) {
      if (live() && !controller.signal.aborted) {
        newLine()
        const message = error instanceof Error ? error.message : String(error)
        write(`\x1b[31m${message}\x1b[0m\n`)
      }
      exitCode = 1
    } finally {
      if (live()) {
        abort = null
        pendingRead = null
        newLine()
        set({ running: false, reading: null, exitCode })
      }
    }
  }

  const controller: TerminalController = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    write,
    writeln,
    clear,
    run,
    submit: async (line) => {
      if (pendingRead && state.reading) {
        const { resolve } = pendingRead
        const reading = state.reading
        pendingRead = null
        write(`${reading.prompt}${reading.secret ? '' : sanitizeInput(line)}\n`)
        set({ reading: null })
        resolve(line)
        return
      }
      await run(line)
    },
    interrupt: () => {
      if (session) {
        if (session.interrupt) session.interrupt()
        else session.write('\x03')
        return
      }
      if (!state.running) return
      runId++
      abort?.abort()
      abort = null
      pendingRead?.reject(new DOMException('Interrupted', 'AbortError'))
      pendingRead = null
      write('^C\n')
      set({ running: false, reading: null, exitCode: 130 })
    },
    complete: async (input) => {
      if (!opts.onComplete) return { input, candidates: [] }
      return completeInput(input, await opts.onComplete(input))
    },
    setPrompt: (prompt) => {
      if (prompt !== state.prompt) set({ prompt })
    },
    resize: (columns, rows) => {
      if (columns === size.columns && rows === size.rows) return
      size = { columns, rows }
      session?.resize?.(columns, rows)
    },
    connect: (next) => {
      session = next
      set({ connected: true })
      next.resize?.(size.columns, size.rows)
      const offData = next.onData(write)
      const offExit = next.onExit?.((code) => {
        newLine()
        write(`\x1b[2m[${String(code)}]\x1b[0m\n`)
        set({ exitCode: code })
      })
      return () => {
        offData()
        offExit?.()
        if (session === next) {
          session = null
          set({ connected: false })
        }
      }
    },
    getText: () => state.screen.lines.map(lineText).join('\n').trimEnd(),
    setOptions: (next) => {
      opts = next
      if (next.prompt !== undefined) controller.setPrompt(next.prompt)
    },
  }
  return controller
}

/** A terminal that lives as long as the component that calls this: hand it to `<Terminal>`. */
function useTerminal(options: TerminalOptions = {}): TerminalController {
  const [terminal] = React.useState(() => createTerminal(options))
  // The latest callbacks, without recreating the terminal (and losing its output).
  React.useEffect(() => {
    terminal.setOptions(options)
  })
  const { session } = options
  React.useEffect(() => (session ? terminal.connect(session) : undefined), [terminal, session])
  return terminal
}

/** The terminal's state, re-rendering when it changes. */
function useTerminalState(terminal: TerminalController): TerminalState {
  return React.useSyncExternalStore(terminal.subscribe, terminal.getState, terminal.getState)
}

const TerminalOutputLine = React.memo(function TerminalOutputLine({ line }: { line: AnsiLine }) {
  return (
    <div className="min-h-[1.6em]">
      <AnsiLineView line={line} />
    </div>
  )
})

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function Terminal({
  terminal: terminalProp,
  onCommand,
  onComplete,
  session,
  prompt,
  welcome,
  title,
  actions,
  toolbar = true,
  autoFocus = false,
  className,
  'aria-label': ariaLabel,
}: Pick<TerminalOptions, 'onCommand' | 'onComplete' | 'session' | 'prompt' | 'welcome'> & {
  /** A terminal from `useTerminal` or `createTerminal`: its output outlives this component. */
  terminal?: TerminalController
  /** Shown in the toolbar. */
  title?: React.ReactNode
  /** More buttons in the toolbar, before Stop, Clear and Copy. */
  actions?: React.ReactNode
  /** The bar with the title, Stop, Clear and Copy. */
  toolbar?: boolean
  autoFocus?: boolean
  className?: string
  'aria-label'?: string
}) {
  const t = useCoreloomI18n().messages.terminal
  const own = useTerminal({ onCommand, onComplete, session, prompt, welcome })
  const terminal = terminalProp ?? own
  const state = useTerminalState(terminal)
  const [input, setInput] = React.useState('')
  // Where ↑ is in the history (null: editing a new line) and the line being typed before it.
  const [historyAt, setHistoryAt] = React.useState<number | null>(null)
  const [draft, setDraft] = React.useState('')
  const [copied, setCopied] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const measureRef = React.useRef<HTMLSpanElement>(null)
  const atEnd = React.useRef(true)
  // After Escape, Tab leaves the terminal instead of completing (as in the code editor).
  const escaped = React.useRef(false)

  const { screen, running, reading, connected } = state
  // While a command runs, the input stays (out of sight) so it keeps focus: Ctrl+C there stops the
  // command, and what is typed waits for the next prompt.
  const showInput = connected || !running || reading !== null
  // With a session, the last line is the process's prompt: the input goes right after it. In
  // commands mode, an empty last line is where the prompt goes.
  const lastLine = screen.lines.at(-1) ?? []
  const prefix: readonly AnsiLine[] = connected
    ? [lastLine]
    : parseAnsi(reading ? reading.prompt : state.prompt)
  const hideLast = showInput && (connected || lastLine.length === 0)
  const lines = hideLast ? screen.lines.slice(0, -1) : screen.lines

  React.useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && atEnd.current) el.scrollTop = el.scrollHeight
  }, [screen, showInput, reading])

  React.useEffect(() => {
    const el = scrollRef.current
    const measure = measureRef.current
    if (!el || !measure || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const char = measure.getBoundingClientRect()
      const width = char.width / 10
      if (!width || !char.height) return
      const style = getComputedStyle(el)
      const inner = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      terminal.resize(
        Math.max(10, Math.floor(inner / width)),
        Math.max(2, Math.floor(el.clientHeight / char.height)),
      )
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [terminal])

  React.useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => {
      setCopied(false)
    }, 1400)
    return () => {
      clearTimeout(id)
    }
  }, [copied])

  const resetLine = () => {
    setInput('')
    setHistoryAt(null)
    setDraft('')
  }

  const submit = () => {
    const line = input
    resetLine()
    atEnd.current = true
    void terminal.submit(line)
  }

  const browseHistory = (step: -1 | 1) => {
    const { history } = state
    if (!history.length) return
    const from = historyAt ?? history.length
    const next = Math.min(history.length, Math.max(0, from + step))
    if (next === from) return
    if (historyAt === null) setDraft(input)
    if (next === history.length) {
      setHistoryAt(null)
      setInput(draft)
    } else {
      setHistoryAt(next)
      setInput(history[next] ?? '')
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const key = event.key
    const ctrl = event.ctrlKey && !event.metaKey && !event.altKey
    if (key === 'Escape') {
      escaped.current = true
      return
    }
    const wasEscaped = escaped.current
    escaped.current = false
    if (key === 'Enter') {
      event.preventDefault()
      submit()
    } else if (key === 'ArrowUp' && !reading) {
      event.preventDefault()
      browseHistory(-1)
    } else if (key === 'ArrowDown' && !reading) {
      event.preventDefault()
      browseHistory(1)
    } else if (key === 'Tab' && !event.shiftKey && !wasEscaped && !reading) {
      event.preventDefault()
      void terminal.complete(input).then((result) => {
        setInput(result.input)
        if (result.candidates.length > 1) {
          const promptText = connected ? '' : state.prompt
          terminal.write(`${promptText}${sanitizeInput(input)}\n${result.candidates.join('  ')}\n`)
        }
      })
    } else if (ctrl && key.toLowerCase() === 'c') {
      const el = event.currentTarget
      // With text selected in the input, Ctrl+C copies it.
      if (el.selectionStart !== el.selectionEnd) return
      event.preventDefault()
      if (running || connected) terminal.interrupt()
      else {
        terminal.write(`${state.prompt}${sanitizeInput(input)}^C\n`)
      }
      resetLine()
    } else if (ctrl && key.toLowerCase() === 'l') {
      event.preventDefault()
      terminal.clear()
    } else if (ctrl && key.toLowerCase() === 'u') {
      event.preventDefault()
      setInput('')
    }
  }

  const label = ariaLabel ?? (typeof title === 'string' ? title : t.label)

  return (
    <div
      data-slot="terminal"
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-inset',
        className,
      )}
    >
      {toolbar ? (
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle pr-1.5 pl-3">
          <SquareTerminalIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-mono text-[12px] text-fg-secondary">
            {title ?? t.label}
          </span>
          {running ? <Spinner className="size-3.5 text-muted-foreground" /> : null}
          <span className="sr-only" role="status">
            {running ? t.running : ''}
          </span>
          <span className="ml-auto" />
          {actions}
          {running ? (
            <ToolbarButton label={t.stop} onClick={terminal.interrupt}>
              <SquareIcon />
            </ToolbarButton>
          ) : null}
          <ToolbarButton
            label={t.clear}
            onClick={() => {
              terminal.clear()
              inputRef.current?.focus()
            }}
          >
            <EraserIcon />
          </ToolbarButton>
          <ToolbarButton
            label={copied ? t.copied : t.copy}
            onClick={() => {
              void navigator.clipboard.writeText(terminal.getText()).then(() => {
                setCopied(true)
              })
            }}
          >
            {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
          </ToolbarButton>
        </div>
      ) : null}
      {/* Clicking anywhere types in the input, unless the click selected text (to copy it). The
          input is the keyboard path, so this handler needs no key equivalent. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- a convenience for the pointer; the keyboard reaches the input with Tab */}
      <div
        ref={scrollRef}
        role="region"
        aria-label={label}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must take focus (when a command runs, there is no input)
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget
          atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8
        }}
        onClick={() => {
          if (window.getSelection()?.toString()) return
          inputRef.current?.focus({ preventScroll: true })
        }}
        className="relative min-h-0 flex-1 cursor-text overflow-auto px-3.5 py-2.5 font-mono text-[12.5px] leading-[1.6] [overflow-wrap:anywhere] whitespace-pre-wrap text-foreground outline-none focus-within:ring-[3px] focus-within:ring-inset focus-within:ring-ring"
      >
        <span
          ref={measureRef}
          aria-hidden
          className="invisible absolute top-0 left-0 whitespace-pre"
        >
          0000000000
        </span>
        <div role="log" aria-busy={running || undefined}>
          {lines.map((line, i) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- lines and spans have no identity of their own: their position is it
            <TerminalOutputLine key={screen.dropped + i} line={line} />
          ))}
        </div>
        <div className={showInput ? 'flex min-h-[1.6em] flex-wrap' : 'sr-only'}>
          {showInput ? (
            <span>
              {prefix.map((line, i) => (
                // eslint-disable-next-line @eslint-react/no-array-index-key -- lines and spans have no identity of their own: their position is it
                <AnsiLineView key={i} line={line} />
              ))}
            </span>
          ) : null}
          <input
            ref={inputRef}
            data-slot="terminal-input"
            type={reading?.secret ? 'password' : 'text'}
            aria-label={
              reading ? lineText(parseAnsi(reading.prompt)[0] ?? []).trim() || t.answer : t.input
            }
            value={input}
            autoFocus={autoFocus}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="send"
            onChange={(e) => {
              setInput(e.target.value)
            }}
            onKeyDown={onKeyDown}
            className="min-w-[8ch] flex-1 border-0 bg-transparent p-0 font-mono text-[12.5px] leading-[1.6] text-foreground caret-primary outline-none"
          />
        </div>
      </div>
    </div>
  )
}

export {
  completeInput,
  createTerminal,
  Terminal,
  type TerminalCommandContext,
  type TerminalCommandResult,
  type TerminalController,
  type TerminalOptions,
  type TerminalSession,
  type TerminalState,
  useTerminal,
  useTerminalState,
}
