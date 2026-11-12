// "Simulate" for a state diagram: runs the open draft as a state machine in a panel docked beside
// the workspace, where the user fires events and decides which way each guard goes. The active
// states are reported to the page, which points them out on the workspace's drawing. The draft is
// only read, never changed.
import { parseDiagramText } from '@coreloom-uml/uml'
import { PlayIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import type { DiagramFormat } from '@/components/diagram-editor'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/lib/locale'
import { simulateDiagram, type SimulationStep, type StateSimulation } from '@/lib/state-simulation'

/** How many of the last steps the history shows. */
const HISTORY_SHOWN = 8

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-[13px] font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

/** Distinct names: the active states. */
function Names({ names, none }: { names: readonly string[]; none: string }) {
  if (!names.length) return <p className="m-0 text-[13px] text-muted-foreground">{none}</p>
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {names.map((name) => (
        <li key={name}>
          <Badge variant="outline" className="font-mono">
            {name}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

function History({ steps }: { steps: readonly SimulationStep[] }) {
  const t = useT().editor.simulation
  const first = Math.max(0, steps.length - HISTORY_SHOWN)
  return (
    <ol start={first + 1} className="m-0 flex flex-col gap-1 pl-5 text-[13px]">
      {steps.slice(first).map((step, index) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- steps are only appended (a reset starts a new list), so a step's number is its identity
        <li key={first + index}>
          <span className="font-mono text-foreground">
            {step.event ?? (first + index === 0 ? t.started : t.guardChanged)}
          </span>
          {' → '}
          {step.active.join(', ') || t.noActive}
          {step.actions.length > 0 && (
            <span className="text-muted-foreground"> / {step.actions.join(', ')}</span>
          )}
        </li>
      ))}
    </ol>
  )
}

type ActiveChange = (ids: readonly string[]) => void

/** Between the ids of `useReportActive`'s key: no state id holds a line break. */
const ID_SEPARATOR = '\n'

/** Tells the page which states are active, and that none is once the simulation is gone. */
function useReportActive(active: readonly string[], onActiveChange: ActiveChange) {
  const key = active.join(ID_SEPARATOR)
  React.useEffect(() => {
    onActiveChange(key ? key.split(ID_SEPARATOR) : [])
    return () => {
      onActiveChange([])
    }
  }, [key, onActiveChange])
}

function Running({
  simulation,
  onActiveChange,
}: {
  simulation: StateSimulation
  onActiveChange: ActiveChange
}) {
  const t = useT().editor.simulation
  const [, rerender] = React.useReducer((n: number) => n + 1, 0)
  const events = React.useRef<HTMLDivElement>(null)
  const { active, done, history } = simulation
  const last = history.at(-1)
  const guards = Object.entries(simulation.guards)
  useReportActive(active, onActiveChange)
  const fire = (event: string) => {
    simulation.send(event)
    // The button pressed may be gone now: keep the focus in the events.
    if (!simulation.events.includes(event)) events.current?.focus()
    rerender()
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pb-3">
      <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-2">
        <Section title={t.active}>
          <Names names={active} none={t.noActive} />
        </Section>
        {done && <Badge variant="success">{t.finished}</Badge>}
        {last?.looped && <Badge variant="warning">{t.looped}</Badge>}
      </div>
      <div ref={events} tabIndex={-1} className="outline-none">
        <Section title={t.events}>
          {simulation.events.length ? (
            <div className="flex flex-wrap gap-2">
              {simulation.events.map((event) => (
                <Button
                  key={event}
                  size="sm"
                  variant="outline"
                  aria-label={t.fire(event)}
                  className="font-mono"
                  onClick={() => {
                    fire(event)
                  }}
                >
                  {event}
                </Button>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[13px] text-muted-foreground">{t.noEvents}</p>
          )}
        </Section>
      </div>
      {guards.length > 0 && (
        <Section title={t.guards}>
          <p className="m-0 text-[13px] text-muted-foreground">{t.guardsHint}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {guards.map(([name, pass]) => (
              <li key={name} className="flex items-center gap-2">
                <Switch
                  id={`guard-${name}`}
                  size="sm"
                  checked={pass}
                  onCheckedChange={(checked) => {
                    simulation.setGuard(name, checked)
                    rerender()
                  }}
                />
                <Label htmlFor={`guard-${name}`} className="font-mono">
                  {name}
                </Label>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title={t.actions}>
        {/* In the order they ran; one can run twice. */}
        <p className="m-0 font-mono text-[13px] text-foreground">
          {last?.actions.length ? last.actions.join(', ') : t.noActions}
        </p>
      </Section>
      <Section title={t.history}>
        <History steps={history} />
      </Section>
    </div>
  )
}

/**
 * The machine for the draft's text, made again when the text changes. Nothing to stop after: it
 * has no timers or children, so a dropped one is just collected.
 */
function useSimulation(value: string, format: DiagramFormat) {
  return React.useMemo(() => {
    const diagram = parseDiagramText(value, format).diagram
    if (diagram?.kind !== 'state') return null
    return simulateDiagram(diagram)
  }, [value, format])
}

function SimulationBody({
  value,
  format,
  onActiveChange,
}: {
  value: string
  format: DiagramFormat
  onActiveChange: ActiveChange
}) {
  const t = useT().editor
  const run = useSimulation(value, format)
  const [, rerender] = React.useReducer((n: number) => n + 1, 0)
  if (!run?.simulation) {
    const problems = run?.problems.filter((p) => p.severity === 'error') ?? []
    return (
      <div className="px-3 pb-3">
        <Alert variant="destructive">
          <AlertTitle>{run ? t.xstateRefused : t.xstateUnreadable}</AlertTitle>
          {problems.length > 0 && (
            <AlertDescription>
              <ul className="m-0 list-disc pl-4">
                {[
                  ...new Set(
                    problems.map((p) => t.xstateProblems[p.code](p.states?.join(', ') ?? '')),
                  ),
                ].map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </AlertDescription>
          )}
        </Alert>
      </div>
    )
  }
  const { simulation } = run
  return (
    <>
      <Running simulation={simulation} onActiveChange={onActiveChange} />
      <div className="flex justify-end border-t border-border p-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            simulation.reset()
            rerender()
          }}
        >
          <RotateCcwIcon />
          {t.simulation.reset}
        </Button>
      </div>
    </>
  )
}

/** The "Simulate" toggle of the workspace toolbar. */
export function StateSimulationButton({
  pressed,
  onPressedChange,
  ref,
}: {
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  ref?: React.Ref<HTMLButtonElement>
}) {
  const t = useT().editor
  return (
    <Button
      ref={ref}
      size="sm"
      variant="outline"
      aria-pressed={pressed}
      onClick={() => {
        onPressedChange(!pressed)
      }}
    >
      <PlayIcon />
      {t.simulate}
    </Button>
  )
}

/**
 * The simulation of the open state diagram's draft, docked so the drawing stays in sight and in
 * use: a column beside the workspace on wide screens, a strip that stays at the bottom of the
 * window on narrow ones. Not a dialog: nothing is covered and focus is free to leave.
 */
export function StateSimulationPanel({
  value,
  format,
  height,
  onActiveChange,
  onClose,
}: {
  value: string
  format: DiagramFormat
  /** CSS height of the column on wide screens: the workspace's. */
  height: string
  /** The ids of the active states, at each step; none once the panel is gone. */
  onActiveChange: ActiveChange
  /** The page closes the panel and puts the focus back on the toggle. */
  onClose: () => void
}) {
  const t = useT().editor.simulation
  const panel = React.useRef<HTMLElement>(null)
  React.useEffect(() => {
    panel.current?.focus()
  }, [])
  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label={t.title}
      className="sticky bottom-0 z-(--z-sticky) flex max-h-[45svh] min-w-0 flex-col rounded-md border border-border bg-card outline-none focus-visible:ring-[3px] focus-visible:ring-ring lg:static lg:z-auto lg:h-(--state-simulation-h) lg:max-h-none lg:w-80 lg:shrink-0"
      style={{ '--state-simulation-h': height } as React.CSSProperties}
    >
      <div className="flex items-center justify-between px-3 pt-2">
        <h2 className="m-0 text-[14px] font-semibold text-foreground">{t.title}</h2>
        <Button size="icon-sm" variant="ghost" aria-label={t.close} onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <p className="m-0 px-3 pb-3 text-[13px] text-muted-foreground">{t.description}</p>
      <SimulationBody value={value} format={format} onActiveChange={onActiveChange} />
    </section>
  )
}
