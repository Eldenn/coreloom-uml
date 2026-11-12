// Runs a state diagram in xstate, from the machine `stateToXState` exports: which of the diagram's
// states are active, which events can fire, and what each step did. Guards are switches the user
// sets (on by default); actions do nothing but are recorded.
import {
  type StateDiagram,
  stateToXState,
  type XStateNode,
  type XStateProblem,
  type XStateTransition,
  type XStateTransitions,
} from '@coreloom-uml/uml'
import {
  type Actor,
  type AnyStateMachine,
  type AnyStateNode,
  createActor,
  createMachine,
  type StateValue,
} from 'xstate'

/** Eventless transitions (`always`, `onDone`) one step may take before it is cut as a loop. */
const EVENTLESS_BUDGET = 100
/** The guard every eventless transition goes through, to count them. Generated names hold `$`. */
const EVENTLESS_GUARD = '$eventless'
/** Sent after a guard changes, so eventless transitions waiting on it are tried again. */
const RECHECK_EVENT = '$recheck'

interface SimulationStep {
  /** The event sent; null for the start and for a guard switched on or off. */
  event: string | null
  /** The actions the step ran, in order. */
  actions: string[]
  /** The diagram's states active after it. */
  active: string[]
  /** It went around a loop of eventless transitions and was cut. */
  looped: boolean
}

type Counted = Omit<XStateTransition, 'guard'> & {
  guard: { type: string; params: { name?: string } }
}

/** The exported config, with `counted` eventless transitions. */
type CountedNode = Omit<XStateNode, 'states' | 'always' | 'onDone'> & {
  states?: Record<string, CountedNode>
  always?: Counted[]
  onDone?: Counted[]
}

/** Every eventless transition goes through `EVENTLESS_GUARD`, which still asks the diagram's guard. */
function counted(transitions: XStateTransitions): Counted[] {
  return (Array.isArray(transitions) ? transitions : [transitions]).map((t) => ({
    ...t,
    guard: { type: EVENTLESS_GUARD, params: t.guard ? { name: t.guard } : {} },
  }))
}

function withCountedEventless({ states, always, onDone, ...node }: XStateNode): CountedNode {
  return {
    ...node,
    ...(states
      ? {
          states: Object.fromEntries(
            Object.entries(states).map(([key, child]) => [key, withCountedEventless(child)]),
          ),
        }
      : {}),
    ...(always ? { always: counted(always) } : {}),
    ...(onDone ? { onDone: counted(onDone) } : {}),
  }
}

/** The state nodes a state value makes active, outermost first. */
function activeNodes(node: AnyStateNode, value: StateValue): AnyStateNode[] {
  if (typeof value === 'string') return [node.states[value]]
  return Object.entries(value).flatMap(([key, sub]) => {
    const child = node.states[key]
    return [child, ...(sub === undefined ? [] : activeNodes(child, sub))]
  })
}

class StateSimulation {
  /** The diagram's guards, each with the branch the user lets it take. */
  readonly guards: Record<string, boolean>
  readonly #events: string[]
  readonly #machine: AnyStateMachine
  readonly #hidden: Set<string>
  #actor: Actor<AnyStateMachine>
  #ran: string[] = []
  #budget = EVENTLESS_BUDGET
  #history: SimulationStep[] = []

  constructor(diagram: StateDiagram, exported: ReturnType<typeof stateToXState>) {
    if (!exported.config) throw new Error('The diagram was not exported.')
    this.guards = Object.fromEntries(exported.guards.map((g) => [g, true]))
    this.#events = exported.events
    // A fork only stands for the parallel state its branches make: its branches are what is active.
    this.#hidden = new Set(diagram.states.filter((s) => s.kind === 'fork').map((s) => s.id))
    const guard = (name: string) => this.guards[name] ?? true
    this.#machine = createMachine(withCountedEventless(exported.config) as never, {
      guards: {
        ...Object.fromEntries(exported.guards.map((g) => [g, () => guard(g)])),
        [EVENTLESS_GUARD]: (_: unknown, params: { name?: string }) =>
          this.#budget-- > 0 && (params.name === undefined || guard(params.name)),
      },
      actions: Object.fromEntries(exported.actions.map((a) => [a, () => void this.#ran.push(a)])),
    })
    this.#actor = this.#start()
  }

  #step(event: string | null, run: () => void) {
    this.#ran = []
    this.#budget = EVENTLESS_BUDGET
    run()
    this.#history.push({
      event,
      actions: this.#ran,
      active: this.active,
      looped: this.#budget < 0,
    })
  }

  /** The initial state is computed (eventless transitions taken) as the actor is created. */
  #start(): Actor<AnyStateMachine> {
    this.#step(null, () => {
      this.#actor = createActor(this.#machine).start()
    })
    return this.#actor
  }

  /** The diagram's states active now, outermost first. */
  get active(): string[] {
    const snapshot = this.#actor.getSnapshot()
    return activeNodes(this.#machine.root, snapshot.value as StateValue)
      .map((n) => (n.meta as { umlId?: string } | undefined)?.umlId ?? n.key)
      .filter((id) => !id.includes('$') && !this.#hidden.has(id))
  }

  /** The events that make a transition now, in name order. */
  get events(): string[] {
    if (this.done) return []
    const snapshot = this.#actor.getSnapshot()
    return this.#events.filter((type) => snapshot.can({ type }))
  }

  /** The machine reached the end of the diagram. */
  get done(): boolean {
    return this.#actor.getSnapshot().status === 'done'
  }

  /** Every step since the start, the start included; the last one is what just happened. */
  get history(): readonly SimulationStep[] {
    return this.#history
  }

  send(event: string) {
    if (this.done) return
    this.#step(event, () => this.#actor.send({ type: event }))
  }

  /** Lets a guard pass or not, then retries the eventless transitions that wait on guards. */
  setGuard(name: string, pass: boolean) {
    this.guards[name] = pass
    if (this.done) return
    const before = this.active.join('\n')
    const length = this.#history.length
    this.#step(null, () => this.#actor.send({ type: RECHECK_EVENT }))
    // Nothing moved: not a step worth listing.
    const last = this.#history.at(-1)
    if (last && !last.actions.length && last.active.join('\n') === before)
      this.#history.length = length
  }

  /** Back to the start, with the guards as they are. */
  reset() {
    this.#actor.stop()
    this.#history = []
    this.#start()
  }
}

/** A simulation of the diagram, or the problems that stop it from being exported. */
function simulateDiagram(
  diagram: StateDiagram,
):
  | { simulation: StateSimulation; problems: XStateProblem[] }
  | { simulation: null; problems: XStateProblem[] } {
  const exported = stateToXState(diagram)
  if (!exported.config) return { simulation: null, problems: exported.problems }
  return { simulation: new StateSimulation(diagram, exported), problems: exported.problems }
}

export { simulateDiagram, type SimulationStep, StateSimulation }
