import { describe, expect, it } from 'vitest'
import { hasUmlPart, type UmlSpec, umlParts } from './index.ts'

const labels = (diagram: UmlSpec, type: string) =>
  umlParts(diagram)
    .filter((part) => part.type === type)
    .map((part) => part.label)

describe('umlParts', () => {
  it('names a class diagram’s classes, members and relations', () => {
    const diagram: UmlSpec = {
      kind: 'class',
      classes: [
        {
          id: 'Order',
          generic: 'T',
          attributes: [{ text: 'id: string' }],
          methods: [{ text: 'pay(amount)' }],
        },
        { id: 'Payment', label: 'Payment\n record' },
      ],
      relations: [
        { from: 'Order', to: 'Payment', kind: 'association', label: 'pays' },
        { from: 'Payment', to: 'Order', kind: 'inheritance' },
      ],
      notes: [{ text: 'A note\nover two lines', for: 'Order' }],
    }
    expect(umlParts(diagram)).toEqual([
      { type: 'element', label: 'Order<T>' },
      { type: 'member', label: 'Order<T>.id: string' },
      { type: 'member', label: 'Order<T>.pay(amount)' },
      { type: 'element', label: 'Payment record' },
      { type: 'element', label: 'A note over two lines' },
      { type: 'relation', label: 'Order<T> → Payment record: pays' },
      { type: 'relation', label: 'Payment record → Order<T>' },
    ])
  })

  it('names a state diagram’s start and end by their role', () => {
    const diagram: UmlSpec = {
      kind: 'state',
      states: [{ id: 'Idle' }, { id: 'Busy', label: 'Working' }],
      transitions: [
        { from: '[*]', to: 'Idle' },
        { from: 'Idle', to: 'Busy', label: 'start' },
        { from: 'Busy', to: '[*]' },
      ],
    }
    expect(labels(diagram, 'element')).toEqual(['Start', 'End', 'Idle', 'Working'])
    expect(labels(diagram, 'relation')).toEqual([
      'Start → Idle',
      'Idle → Working: start',
      'Working → End',
    ])
  })

  it('names ER attributes with their type, and keyword relations', () => {
    expect(
      labels(
        {
          kind: 'er',
          entities: [{ id: 'User', attributes: [{ name: 'id', type: 'uuid', keys: ['PK'] }] }],
          relations: [],
        },
        'member',
      ),
    ).toEqual(['User.id: uuid'])
    expect(
      labels(
        {
          kind: 'usecase',
          elements: [
            { id: 'a', kind: 'usecase', label: 'Order' },
            { id: 'b', kind: 'usecase', label: 'Check stock' },
          ],
          relations: [{ from: 'a', to: 'b', kind: 'include', label: 'always' }],
        },
        'relation',
      ),
    ).toEqual(['Order → Check stock: «include» always'])
  })

  it('puts a guard in brackets and names unnamed activity nodes by their role', () => {
    const diagram: UmlSpec = {
      kind: 'activity',
      elements: [
        { id: 's', kind: 'start' },
        { id: 'd', kind: 'decision' },
        { id: 'pay', kind: 'action', label: 'Pay' },
      ],
      relations: [
        { from: 's', to: 'd' },
        { from: 'd', to: 'pay', label: 'paid' },
      ],
    }
    expect(umlParts(diagram)).toEqual([
      { type: 'element', label: 'Start' },
      { type: 'element', label: 'Decision' },
      { type: 'element', label: 'Pay' },
      { type: 'relation', label: 'Start → Decision' },
      { type: 'relation', label: 'Decision → Pay: [paid]' },
    ])
  })

  it('names a sequence’s participants and every step, inside blocks too', () => {
    const diagram: UmlSpec = {
      kind: 'sequence',
      participants: [{ id: 'C', label: 'Client' }, { id: 'A' }],
      steps: [
        { type: 'message', from: 'C', to: 'A', arrow: 'sync', text: 'login()' },
        {
          type: 'block',
          kind: 'loop',
          sections: [
            {
              label: 'every minute',
              steps: [{ type: 'message', from: 'A', to: 'C', arrow: 'reply', text: 'ok' }],
            },
          ],
        },
        { type: 'note', position: 'over', participants: ['C', 'A'], text: 'cached' },
        { type: 'activation', participant: 'A', active: true },
      ],
    }
    expect(umlParts(diagram)).toEqual([
      { type: 'element', label: 'Client' },
      { type: 'element', label: 'A' },
      { type: 'step', label: 'Client -> A: login()' },
      { type: 'step', label: 'loop every minute' },
      { type: 'step', label: 'A --> Client: ok' },
      { type: 'step', label: 'Note over Client, A: cached' },
      { type: 'step', label: 'activate A' },
    ])
  })

  it('lists a part once and tells whether a diagram still has one', () => {
    const diagram: UmlSpec = {
      kind: 'class',
      classes: [{ id: 'A' }, { id: 'B' }],
      relations: [
        { from: 'A', to: 'B', kind: 'association' },
        { from: 'A', to: 'B', kind: 'dependency' },
      ],
    }
    expect(labels(diagram, 'relation')).toEqual(['A → B'])
    expect(hasUmlPart(diagram, { type: 'element', label: 'A' })).toBe(true)
    expect(hasUmlPart(diagram, { type: 'element', label: 'C' })).toBe(false)
    expect(hasUmlPart(diagram, { type: 'relation', label: 'A' })).toBe(false)
  })
})
