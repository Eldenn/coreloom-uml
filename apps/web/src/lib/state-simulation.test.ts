import { parseDiagramText, type StateDiagram } from '@coreloom-uml/uml'
import { describe, expect, it } from 'vitest'

import { simulateDiagram, type StateSimulation } from './state-simulation'

function start(text: string): StateSimulation {
  const { diagram } = parseDiagramText(`stateDiagram-v2\n${text}`, 'mermaid')
  if (diagram?.kind !== 'state') throw new Error('not a state diagram')
  const { simulation } = simulateDiagram(diagram)
  if (!simulation) throw new Error('not exported')
  return simulation
}

describe('simulateDiagram', () => {
  it('starts at the initial state and lists the events that can fire', () => {
    const sim = start(`
      [*] --> Idle
      Idle --> Running : start
      Running --> Idle : stop / log
      Running --> [*] : quit`)
    expect(sim.active).toEqual(['Idle'])
    expect(sim.events).toEqual(['start'])
    expect(sim.done).toBe(false)
    sim.send('start')
    expect(sim.active).toEqual(['Running'])
    expect(sim.events).toEqual(['quit', 'stop'])
    sim.send('stop')
    expect(sim.history.at(-1)).toEqual({
      event: 'stop',
      actions: ['log'],
      active: ['Idle'],
      looped: false,
    })
  })

  it('finishes at the end of the diagram, and resets to the start', () => {
    const sim = start(`
      [*] --> Idle
      Idle --> [*] : quit`)
    sim.send('quit')
    expect(sim.done).toBe(true)
    expect(sim.active).toEqual([])
    expect(sim.events).toEqual([])
    sim.reset()
    expect(sim.done).toBe(false)
    expect(sim.active).toEqual(['Idle'])
    expect(sim.history).toHaveLength(1)
  })

  it('lets the guard switches pick the branch, and retries a choice when one changes', () => {
    const sim = start(`
      [*] --> Wait
      Wait --> Check : go
      state Check <<choice>>
      Check --> High : [isHigh] / shout
      Check --> Low : [isLow]`)
    expect(sim.guards).toEqual({ isHigh: true, isLow: true })
    sim.setGuard('isHigh', false)
    sim.setGuard('isLow', false)
    expect(sim.history).toHaveLength(1)
    sim.send('go')
    expect(sim.active).toEqual(['Check'])
    sim.setGuard('isHigh', true)
    expect(sim.active).toEqual(['High'])
    expect(sim.history.at(-1)).toMatchObject({ event: null, actions: ['shout'] })
  })

  it('records the actions taken while starting', () => {
    const sim = start(`
      [*] --> Check
      state Check <<choice>>
      Check --> A : [ok] / greet`)
    expect(sim.history).toEqual([{ event: null, actions: ['greet'], active: ['A'], looped: false }])
  })

  it('hides a guarded event while its guard is off', () => {
    const sim = start(`
      [*] --> A
      A --> B : go [ready]`)
    sim.setGuard('ready', false)
    expect(sim.events).toEqual([])
    sim.setGuard('ready', true)
    expect(sim.events).toEqual(['go'])
  })

  it('names composites, regions’ states and dotted ids as the diagram does, not the fork', () => {
    const sim = start(`
      [*] --> a.b
      a.b --> Split : begin
      state Split <<fork>>
      state Merge <<join>>
      Split --> Pay
      Split --> Box
      state Box {
        [*] --> In
      }
      Pay --> Merge : paid
      Box --> Merge
      Merge --> Ship`)
    expect(sim.active).toEqual(['a.b'])
    sim.send('begin')
    expect(sim.active).toEqual(['Pay', 'Box', 'In'])
  })

  it('cuts a loop of eventless transitions instead of hanging', () => {
    const diagram: StateDiagram = {
      kind: 'state',
      states: [{ id: 'A' }, { id: 'B' }],
      transitions: [
        { from: '[*]', to: 'A' },
        { from: 'A', to: 'B' },
        { from: 'B', to: 'A' },
      ],
    }
    const { simulation } = simulateDiagram(diagram)
    expect(simulation?.history.at(-1)?.looped).toBe(true)
  })

  it('gives the problems when the diagram cannot be exported', () => {
    const out = simulateDiagram({ kind: 'state', states: [], transitions: [] })
    expect(out.simulation).toBeNull()
    expect(out.problems.map((p) => p.code)).toEqual(['no-states'])
  })
})
