import { LockKeyholeIcon } from 'lucide-react'
import * as React from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Countdown } from '@/components/ui/countdown'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Spinner } from '@/components/ui/spinner'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Upper-case letters and digits without the ones people mix up: 0 and O, 1, I and L. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

interface AccessCodeGateProps {
  /** The shared document's name. */
  title: string
  /** Characters in a code. 8 by default. */
  length?: number
  /** The characters a code can hold; anything else typed or pasted is ignored. */
  alphabet?: string
  /** Checks the code. Rejecting means a wrong code: the boxes empty and focus goes to the first. */
  onSubmit: (code: string) => Promise<void>
  /** The app is checking: the boxes and the button wait. */
  pending?: boolean
  /** What went wrong, from the app ("That code didn't work"). A new one empties the boxes. */
  error?: React.ReactNode
  /** Attempts left before the gate locks, shown under the boxes. */
  attemptsLeft?: number
  /** Locked until then (too many attempts): the boxes are off and a countdown runs. */
  lockedUntil?: Date
  className?: string
}

/** "ab-cd 12" → "ABCD2" (with the default alphabet): upper case, only allowed characters, cut. */
function normalizeCode(text: string, alphabet: string, length: number) {
  const allowed = new Set(Array.from(alphabet.toUpperCase()))
  return Array.from(text.toUpperCase())
    .filter((char) => allowed.has(char))
    .slice(0, length)
    .join('')
}

/** The pattern each change is checked against: the alphabet in either case, so typing "a" works. */
function codePattern(alphabet: string) {
  const chars = new Set(Array.from(alphabet.toUpperCase() + alphabet.toLowerCase()))
  const escaped = Array.from(chars, (char) => char.replace(/[\\\]^-]/g, '\\$&')).join('')
  return `^[${escaped}]*$`
}

/** Box indexes, in two halves for long codes (ABCD EFGH) so they read like the code is written. */
function slotGroups(length: number): number[][] {
  const all = Array.from({ length }, (_, i) => i)
  if (length <= 6 || length % 2 !== 0) return [all]
  return [all.slice(0, length / 2), all.slice(length / 2)]
}

/** Locked while `lockedUntil` is ahead; the countdown says when it's over. */
function useLock(lockedUntil: Date | undefined) {
  const until = lockedUntil?.getTime()
  const [over, setOver] = React.useState<number | null>(null)
  return {
    locked: until !== undefined && over !== until,
    end: () => {
      setOver(until ?? null)
    },
  }
}

/** Empties the boxes and asks for focus each time the app reports a new error. */
function useRetry(error: React.ReactNode, attemptsLeft: number | undefined, clear: () => void) {
  const failing = Boolean(error)
  const [seen, setSeen] = React.useState({ failing, attemptsLeft })
  const [retries, setRetries] = React.useState(0)
  if (seen.failing !== failing || seen.attemptsLeft !== attemptsLeft) {
    setSeen({ failing, attemptsLeft })
    if (failing) {
      clear()
      setRetries((n) => n + 1)
    }
  }
  return {
    retries,
    retry: () => {
      clear()
      setRetries((n) => n + 1)
    },
  }
}

/** Focuses the boxes once per retry, as soon as they can take focus again. */
function useFocusOnRetry(
  input: React.RefObject<HTMLInputElement | null>,
  retries: number,
  disabled: boolean,
) {
  const done = React.useRef(0)
  React.useEffect(() => {
    if (disabled || retries === done.current) return
    done.current = retries
    input.current?.focus()
  }, [input, retries, disabled])
}

function LockedNotice({ until, onEnd }: { until: Date; onEnd: () => void }) {
  const t = useCoreloomI18n().messages.accessCodeGate
  return (
    <Alert variant="warning" className="w-full">
      <AlertTitle>{t.lockedTitle}</AlertTitle>
      <AlertDescription>
        <span>
          {t.lockedIn} <Countdown to={until} variant="text" onComplete={onEnd} />
        </span>
      </AlertDescription>
    </Alert>
  )
}

function CodeBoxes({
  length,
  invalid,
  ...props
}: Omit<React.ComponentProps<typeof InputOTP>, 'maxLength' | 'render' | 'children'> & {
  length: number
  invalid: boolean
}) {
  return (
    <InputOTP
      maxLength={length}
      inputMode="text"
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck={false}
      aria-invalid={invalid || undefined}
      containerClassName="justify-center gap-2"
      {...props}
    >
      {slotGroups(length).map((group) => (
        <InputOTPGroup key={group[0]}>
          {group.map((index) => (
            <InputOTPSlot
              key={index}
              index={index}
              aria-invalid={invalid || undefined}
              className="w-9 sm:w-[42px]"
            />
          ))}
        </InputOTPGroup>
      ))}
    </InputOTP>
  )
}

function GateHeader({ title }: { title: string }) {
  const t = useCoreloomI18n().messages.accessCodeGate
  return (
    <CardHeader className="items-center text-center">
      <span
        aria-hidden
        className="mx-auto mb-1 flex size-10 items-center justify-center rounded-full bg-accent text-muted-foreground [&_svg]:size-5"
      >
        <LockKeyholeIcon />
      </span>
      <CardTitle asChild className="m-0 text-[22px]">
        <h1>{t.title}</h1>
      </CardTitle>
      <CardDescription className="text-[14px] break-words">{t.description(title)}</CardDescription>
    </CardHeader>
  )
}

/** The code being typed and its check: one at a time, a rejection empties the boxes. */
function useCodeEntry({
  input,
  length,
  disabled,
  error,
  attemptsLeft,
  onSubmit,
}: {
  input: React.RefObject<HTMLInputElement | null>
  length: number
  disabled: boolean
  error: React.ReactNode
  attemptsLeft: number | undefined
  onSubmit: (code: string) => Promise<void>
}) {
  const [code, setCode] = React.useState('')
  const [checking, setChecking] = React.useState(false)
  const [rejected, setRejected] = React.useState(false)
  const { retries, retry } = useRetry(error, attemptsLeft, () => {
    setCode('')
  })
  useFocusOnRetry(input, retries, disabled)
  const submit = async (value: string) => {
    if (disabled || checking) return
    if (value.length < length) {
      input.current?.focus()
      return
    }
    setChecking(true)
    setRejected(false)
    try {
      await onSubmit(value)
    } catch {
      setRejected(true)
      retry()
    } finally {
      setChecking(false)
    }
  }
  const change = (value: string) => {
    if (!checking) setCode(value)
  }
  return { code, change, checking, rejected, submit }
}

/** The lock with its countdown, or else the latest error. */
function GateNotice({
  lock,
  lockedUntil,
  error,
}: {
  lock: { locked: boolean; end: () => void }
  lockedUntil: Date | undefined
  error: React.ReactNode
}) {
  if (lockedUntil && lock.locked) return <LockedNotice until={lockedUntil} onEnd={lock.end} />
  if (!error) return null
  return (
    <Alert variant="destructive" className="w-full">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )
}

function SubmitButton({ busy, disabled }: { busy: boolean; disabled: boolean }) {
  const t = useCoreloomI18n().messages.accessCodeGate
  return (
    <Button type="submit" className="w-full" disabled={disabled} aria-busy={busy || undefined}>
      {busy ? <Spinner className="text-current" /> : null}
      {busy ? t.submitting : t.submit}
    </Button>
  )
}

function AccessCodeGate({
  title,
  length = 8,
  alphabet = CODE_ALPHABET,
  onSubmit,
  pending = false,
  error,
  attemptsLeft,
  lockedUntil,
  className,
}: AccessCodeGateProps) {
  const t = useCoreloomI18n().messages.accessCodeGate
  const hintId = React.useId()
  const lock = useLock(lockedUntil)
  // Checking keeps the boxes focusable (a disabled field would drop focus); changes wait instead.
  const disabled = pending || lock.locked
  const input = React.useRef<HTMLInputElement>(null)
  const entry = useCodeEntry({ input, length, disabled, error, attemptsLeft, onSubmit })
  const busy = pending || entry.checking
  const shownError = error ?? (entry.rejected ? t.failed : null)
  const hint = !lock.locked && attemptsLeft !== undefined
  const normalize = (text: string) => normalizeCode(text, alphabet, length)

  return (
    <Card data-slot="access-code-gate" className={cn('gap-5 px-6 py-6', className)}>
      <GateHeader title={title} />
      <CardContent>
        <form
          noValidate
          className="flex flex-col items-center gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void entry.submit(entry.code)
          }}
        >
          <GateNotice lock={lock} lockedUntil={lockedUntil} error={shownError} />
          <CodeBoxes
            ref={input}
            length={length}
            invalid={Boolean(shownError)}
            value={entry.code}
            pattern={codePattern(alphabet)}
            pasteTransformer={normalize}
            onChange={(value) => {
              entry.change(normalize(value))
            }}
            onComplete={(value: string) => {
              void entry.submit(normalize(value))
            }}
            disabled={disabled}
            autoFocus
            aria-label={t.code}
            aria-describedby={hint ? hintId : undefined}
          />
          {hint && (
            <p id={hintId} className="m-0 text-[13px] text-muted-foreground">
              {t.attemptsLeft(attemptsLeft)}
            </p>
          )}
          <SubmitButton busy={busy} disabled={disabled} />
        </form>
      </CardContent>
    </Card>
  )
}

export {
  AccessCodeGate,
  type AccessCodeGateProps,
  CODE_ALPHABET,
  codePattern,
  normalizeCode,
  slotGroups,
}
