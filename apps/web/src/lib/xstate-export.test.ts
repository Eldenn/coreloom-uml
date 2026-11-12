// Runs `stateToXState` configs in the real xstate, to prove the export is a machine it accepts and
// that the machine moves the way the diagram says.
import { parseDiagramText, type StateDiagram, stateToXState } from '@coreloom-uml/uml'
import { describe, expect, it } from 'vitest'
import { createActor, createMachine } from 'xstate'

function read(text: string): StateDiagram {
  const { diagram } = parseDiagramText(`stateDiagram-v2\n${text}`, 'mermaid')
  if (diagram?.kind !== 'state') throw new Error('not a state diagram')
  return diagram
}

/** Starts the exported machine; guards answer from `guards` (default true), actions are logged. */
function run(diagram: StateDiagram, guards: Record<string, boolean> = {}) {
  const out = stateToXState(diagram)
  if (!out.config) throw new Error(JSON.stringify(out.problems))
  const ran: string[] = []
  const machine = createMachine(out.config as never, {
    guards: Object.fromEntries(out.guards.map((g) => [g, () => guards[g] ?? true])),
    actions: Object.fromEntries(out.actions.map((a) => [a, () => void ran.push(a)])),
  })
  const actor = createActor(machine).start()
  const send = (...events: string[]) => {
    for (const type of events) actor.send({ type })
  }
  return { actor, ran, send, machine }
}

/** The ids of the active leaf states. */
const leaves = (actor: ReturnType<typeof run>['actor']) =>
  actor
    .getSnapshot()
    ._nodes.filter((n) => n.type === 'atomic' || n.type === 'final')
    .map((n) => n.id)
    .sort()

describe('stateToXState in xstate: transitions', () => {
  it('runs a flat machine with an event, a guard and actions', () => {
    const diagram = read(`
      [*] --> Idle
      Idle --> Running : start
      Running --> Idle : stop [canStop] / log, reset
      Running --> Stopped : stop`)
    const guarded = run(diagram, { canStop: false })
    guarded.send('start', 'stop')
    expect(guarded.actor.getSnapshot().value).toBe('Stopped')
    expect(guarded.ran).toEqual([])

    const free = run(diagram)
    free.send('start', 'stop')
    expect(free.actor.getSnapshot().value).toBe('Idle')
    expect(free.ran).toEqual(['log', 'reset'])
  })

  it('completes a composite state with onDone', () => {
    const { actor, send } = run(
      read(`
        [*] --> Busy
        state Busy {
          [*] --> Load
          Load --> Save : loaded
          Save --> [*]
        }
        Busy --> Done`),
    )
    expect(actor.getSnapshot().value).toEqual({ Busy: 'Load' })
    send('loaded')
    expect(actor.getSnapshot().value).toBe('Done')
  })

  it('stays in a composite without an end instead of leaving it on entry', () => {
    const { actor, send } = run(
      read(`
        [*] --> Box
        state Box {
          [*] --> In1
          In1 --> In2 : next
        }
        Box --> Next`),
    )
    expect(actor.getSnapshot().value).toEqual({ Box: 'In1' })
    send('next')
    expect(actor.getSnapshot().value).toEqual({ Box: 'In2' })
  })

  it('runs a fork nested in a branch of another, one of its branches empty', () => {
    const { actor, send } = run(
      read(`
        [*] --> F1
        state F1 <<fork>>
        state J1 <<join>>
        state F2 <<fork>>
        state J2 <<join>>
        F1 --> A
        F1 --> F2
        F2 --> B
        F2 --> J2
        B --> J2 : done
        J2 --> C
        A --> J1
        C --> J1
        J1 --> [*]`),
    )
    expect(leaves(actor)).toEqual(['B', 'F1$region0$final', 'F2$region1$final'])
    send('done')
    expect(actor.getSnapshot().status).toBe('done')
  })

  it('takes the branch of a choice whose guard holds, else the unguarded one', () => {
    const diagram = read(`
      [*] --> Wait
      Wait --> Check : go
      state Check <<choice>>
      Check --> Low
      Check --> High : [isHigh]`)
    const high = run(diagram)
    high.send('go')
    expect(high.actor.getSnapshot().value).toBe('High')
    const low = run(diagram, { isHigh: false })
    low.send('go')
    expect(low.actor.getSnapshot().value).toBe('Low')
  })
})

describe('stateToXState in xstate: parallel states', () => {
  it('runs the branches of a fork together and leaves through the join', () => {
    const { actor, send, ran } = run(
      read(`
        [*] --> Start
        state Split <<fork>>
        state Merge <<join>>
        Start --> Split : begin
        Split --> Pay
        Split --> Pack
        Pay --> Paid : charge
        Paid --> Merge
        Pack --> Merge : packed / label
        Merge --> Ship`),
    )
    send('begin')
    expect(leaves(actor)).toEqual(['Pack', 'Pay'])
    send('packed')
    expect(ran).toEqual(['label'])
    expect(leaves(actor)).toEqual(['Pay', 'Split$region1$final'])
    send('charge')
    expect(actor.getSnapshot().value).toBe('Ship')
  })

  it('runs explicit regions and completes when every region reaches its end', () => {
    const { actor, send } = run({
      kind: 'state',
      states: [
        { id: 'Active' },
        { id: 'Play', parent: 'Active' },
        { id: 'Pause', parent: 'Active' },
        { id: 'Muted', parent: 'Active', region: 1 },
        { id: 'Loud', parent: 'Active', region: 1 },
        { id: 'Off' },
      ],
      transitions: [
        { from: '[*]', to: 'Active' },
        { from: '[*]', to: 'Play', parent: 'Active' },
        { from: 'Play', to: 'Pause', label: 'pause' },
        { from: 'Pause', to: '[*]', parent: 'Active', label: 'stop' },
        { from: '[*]', to: 'Loud', parent: 'Active' },
        { from: 'Loud', to: 'Muted', label: 'mute' },
        { from: 'Muted', to: '[*]', parent: 'Active' },
        { from: 'Active', to: 'Off' },
      ],
    })
    expect(leaves(actor)).toEqual(['Loud', 'Play'])
    send('pause', 'stop')
    expect(leaves(actor)).toEqual(['Active$region0$final', 'Loud'])
    send('mute')
    expect(actor.getSnapshot().value).toBe('Off')
  })
})

describe('stateToXState in xstate: names, descriptions and ends', () => {
  it('moves between states whose ids have dots, and keeps the diagram id in meta', () => {
    const { actor, send, machine } = run(
      read(`
        [*] --> a.b
        a.b --> a_b : go
        a_b --> a.b : back`),
    )
    expect(actor.getSnapshot().value).toBe('a_b_2')
    send('go')
    expect(actor.getSnapshot().value).toBe('a_b')
    send('back')
    expect(actor.getSnapshot().value).toBe('a_b_2')
    expect(machine.getStateNodeById('a_b_2').meta).toEqual({ umlId: 'a.b' })
  })

  it('keeps descriptions on the state nodes', () => {
    const { machine } = run(
      read(`
        [*] --> Idle
        Idle : Waiting for work`),
    )
    expect(machine.getStateNodeById('Idle').description).toBe('Waiting for work')
  })

  it('re-enters a state on a self-transition', () => {
    const { actor, send, ran } = run(
      read(`
        [*] --> Box
        state Box {
          [*] --> In1
          In1 --> In2 : next
        }
        Box --> Box : again / restart`),
    )
    send('next')
    expect(actor.getSnapshot().value).toEqual({ Box: 'In2' })
    send('again')
    expect(ran).toEqual(['restart'])
    expect(actor.getSnapshot().value).toEqual({ Box: 'In1' })
  })

  it('finishes when the diagram ends', () => {
    const { actor, send } = run(
      read(`
        [*] --> Idle
        Idle --> [*] : quit`),
    )
    expect(actor.getSnapshot().status).toBe('active')
    send('quit')
    expect(actor.getSnapshot().status).toBe('done')
  })
})
