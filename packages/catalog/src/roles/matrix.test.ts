import { describe, expect, it } from 'vitest'

import { deniedRights, type Role, roleMatrix } from '../index.ts'

const role: Role = {
  slug: 'builder',
  name: 'Builder',
  description: 'Builds',
  mission: 'Build.',
  rights: ['read', 'write', 'run-checks', 'shell', 'commit'],
  scope: [],
  forbidden: [],
  done: { commands: [], text: null },
  escalation: null,
  source: null,
}

describe('deniedRights', () => {
  it('lists the rights a role lacks, in the order of RIGHTS', () => {
    expect(deniedRights(role)).toEqual(['push', 'network'])
    expect(deniedRights({ ...role, rights: ['read'] })).toEqual([
      'write',
      'run-checks',
      'shell',
      'commit',
      'push',
      'network',
    ])
  })
})

describe('roleMatrix', () => {
  it('tells a refusal the tool enforces from one only the text states', () => {
    expect(roleMatrix(role, ['network'])).toEqual({
      read: 'granted',
      write: 'granted',
      'run-checks': 'granted',
      shell: 'granted',
      commit: 'granted',
      push: 'instruction',
      network: 'enforced',
    })
  })

  it('never marks a granted right as enforced', () => {
    expect(roleMatrix(role, ['write', 'network']).write).toBe('granted')
  })
})
