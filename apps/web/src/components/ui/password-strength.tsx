import { CheckIcon, CircleIcon } from 'lucide-react'
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface PasswordRule {
  /** What the rule asks for ("At least one number"). */
  label: string
  test: (password: string) => boolean
}

const COMMON = [
  'password',
  'passw0rd',
  'motdepasse',
  'contraseña',
  'passwort',
  '123456',
  '12345678',
  '123456789',
  'qwerty',
  'azerty',
  'qwertz',
  'letmein',
  'welcome',
  'admin',
  'iloveyou',
  'abc123',
]

/** A 0–4 estimate: 0 empty, 1 weak, 2 fair, 3 good, 4 strong. */
function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0
  const lower = password.toLowerCase()
  if (password.length < 8 || COMMON.some((c) => lower.includes(c)) || /^(.)\1+$/.test(password))
    return 1
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z\d]/].filter((r) => r.test(password)).length
  const score = kinds + (password.length >= 12 ? 1 : 0) + (password.length >= 16 ? 1 : 0)
  return score <= 2 ? 1 : score === 3 ? 2 : score === 4 ? 3 : 4
}

const barColors = ['', 'bg-destructive', 'bg-warning', 'bg-info', 'bg-success'] as const
const textColors = ['', 'text-destructive', 'text-warning', 'text-info', 'text-success'] as const
const levelKeys = ['none', 'weak', 'fair', 'good', 'strong'] as const

function PasswordStrength({
  password,
  rules,
  minLength = 8,
  id,
  className,
}: {
  password: string
  /** What the password must meet, ticked as it does. Defaults to a minimum length. */
  rules?: PasswordRule[]
  /** The default rule's length (8). */
  minLength?: number
  /** Put it in the field's aria-describedby: it holds the level and the rules not met yet. */
  id?: string
  className?: string
}) {
  const t = useCoreloomI18n().messages.inputs.strength
  const score = passwordStrength(password)
  const list = rules ?? [{ label: t.minLength(minLength), test: (p) => p.length >= minLength }]
  const results = list.map((r) => ({ label: r.label, met: r.test(password) }))
  const level = t.levels[levelKeys[score]]

  // The live region speaks only when the level changes, not on every key.
  const [announced, setAnnounced] = React.useState('')
  const last = React.useRef(score)
  React.useEffect(() => {
    if (score === last.current) return
    last.current = score
    setAnnounced(score === 0 ? '' : t.level(t.levels[levelKeys[score]]))
  }, [score, t])

  return (
    <div
      data-slot="password-strength"
      data-score={score}
      className={cn('flex flex-col gap-2', className)}
    >
      <div className="flex items-center gap-3">
        <div aria-hidden className="grid flex-1 grid-cols-4 gap-1">
          {[1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className={cn(
                'h-1 rounded-pill transition-colors duration-base',
                n <= score ? barColors[score] : 'bg-accent',
              )}
            />
          ))}
        </div>
        <span
          aria-hidden
          className={cn('min-w-12 text-right text-[12px] font-medium', textColors[score])}
        >
          {level}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {results.map((r) => (
          <li
            key={r.label}
            data-met={r.met || undefined}
            className="flex items-center gap-1.5 text-[12px] text-muted-foreground data-[met]:text-foreground"
          >
            {r.met ? (
              <CheckIcon aria-hidden className="size-3.5 text-success" />
            ) : (
              <CircleIcon aria-hidden className="size-3 text-faint-foreground" />
            )}
            <span>
              {r.label}
              <span className="sr-only">, {r.met ? t.met : t.notMet}</span>
            </span>
          </li>
        ))}
      </ul>
      {/* Read with the field: the level and what is still missing. */}
      <span id={id} className="sr-only">
        {[score ? t.level(level) : '', ...results.filter((r) => !r.met).map((r) => r.label)]
          .filter(Boolean)
          .join('. ')}
      </span>
      <span role="status" className="sr-only">
        {announced}
      </span>
    </div>
  )
}

export { type PasswordRule, PasswordStrength, passwordStrength }
