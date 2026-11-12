import { describe, expect, it } from 'vitest'

import {
  ROLE_DESCRIPTION_MAX_LENGTH,
  ROLE_LINE_MAX_LENGTH,
  ROLE_LIST_MAX,
  ROLE_NAME_MAX_LENGTH,
  type Role,
  roleSchema,
} from '../index.ts'

const minimal: Role = {
  slug: 'reviewer',
  name: 'Reviewer',
  description: 'Reviews',
  mission: 'Review.',
  rights: ['read'],
  scope: [],
  forbidden: [],
  done: { commands: [], text: null },
  escalation: null,
  source: null,
}

const accepts = (overrides: object) => roleSchema.safeParse({ ...minimal, ...overrides }).success

describe('roleSchema', () => {
  it('accepts a minimal read-only role', () => {
    expect(roleSchema.parse(minimal)).toEqual(minimal)
  })

  it('accepts a full role and sorts its rights in the order of RIGHTS', () => {
    const role = roleSchema.parse({
      ...minimal,
      rights: ['push', 'network', 'commit', 'shell', 'run-checks', 'write', 'read'],
      scope: ['apps/api/app'],
      forbidden: ['Never edit a migration that has already run.'],
      done: { commands: ['pnpm test'], text: 'The checks pass.' },
      escalation: 'Stop and ask when a change leaves the scope.',
      source: { preset: 'reviewer', commit: 'a'.repeat(40) },
    })
    expect(role.rights).toEqual([
      'read',
      'write',
      'run-checks',
      'shell',
      'commit',
      'push',
      'network',
    ])
  })

  it('requires read', () => {
    expect(accepts({ rights: ['write'] })).toBe(false)
    expect(accepts({ rights: [] })).toBe(false)
  })

  it('refuses shell without run-checks', () => {
    expect(accepts({ rights: ['read', 'shell'] })).toBe(false)
    expect(accepts({ rights: ['read', 'run-checks', 'shell'] })).toBe(true)
  })

  it('refuses push without commit', () => {
    expect(accepts({ rights: ['read', 'push'] })).toBe(false)
    expect(accepts({ rights: ['read', 'run-checks', 'commit', 'push'] })).toBe(true)
  })

  it('refuses commit without run-checks', () => {
    expect(accepts({ rights: ['read', 'write', 'commit'] })).toBe(false)
    expect(accepts({ rights: ['read', 'run-checks', 'commit'] })).toBe(true)
  })

  it('refuses a right listed twice or unknown', () => {
    expect(accepts({ rights: ['read', 'read'] })).toBe(false)
    expect(accepts({ rights: ['read', 'sudo'] })).toBe(false)
  })

  it('refuses a slug that is not kebab-case', () => {
    for (const slug of ['../x', 'Reviewer', 'a_b', 'a'.repeat(65), '']) {
      expect(accepts({ slug }), slug).toBe(false)
    }
    expect(accepts({ slug: 'a'.repeat(64) })).toBe(true)
  })

  it('refuses a scope that is not a plain folder', () => {
    for (const folder of ['../src', '/abs', 'src//x', 'src/../x', 'src/']) {
      expect(accepts({ scope: [folder] }), folder).toBe(false)
    }
    expect(accepts({ scope: ['apps/api/app'] })).toBe(true)
  })

  it('refuses a dot segment in a scope', () => {
    for (const folder of ['.', './src', 'src/.', 'src/./x']) {
      expect(accepts({ scope: [folder] }), folder).toBe(false)
    }
    expect(accepts({ scope: ['.github', 'src/.config'] })).toBe(true)
  })

  it('refuses text over its limit', () => {
    expect(accepts({ name: 'n'.repeat(ROLE_NAME_MAX_LENGTH) })).toBe(true)
    expect(accepts({ name: 'n'.repeat(ROLE_NAME_MAX_LENGTH + 1) })).toBe(false)
    expect(accepts({ description: 'd'.repeat(ROLE_DESCRIPTION_MAX_LENGTH) })).toBe(true)
    expect(accepts({ description: 'd'.repeat(ROLE_DESCRIPTION_MAX_LENGTH + 1) })).toBe(false)
    expect(accepts({ forbidden: ['f'.repeat(ROLE_LINE_MAX_LENGTH)] })).toBe(true)
    expect(accepts({ forbidden: ['f'.repeat(ROLE_LINE_MAX_LENGTH + 1)] })).toBe(false)
  })

  it('refuses a line that spans several lines and a list over its limit', () => {
    expect(accepts({ forbidden: ['one\ntwo'] })).toBe(false)
    expect(accepts({ escalation: 'one\ntwo' })).toBe(false)
    expect(accepts({ forbidden: Array.from({ length: ROLE_LIST_MAX + 1 }, () => 'No.') })).toBe(
      false,
    )
  })

  it('refuses a blank mission', () => {
    for (const mission of ['', ' ', '\n\t \r\n']) {
      expect(accepts({ mission }), JSON.stringify(mission)).toBe(false)
    }
    expect(accepts({ mission: ' Review.\n' })).toBe(true)
  })

  it('refuses a source whose commit is not a full sha', () => {
    expect(accepts({ source: { preset: 'reviewer', commit: 'abc123' } })).toBe(false)
  })

  it('refuses an unknown key', () => {
    expect(accepts({ model: 'opus' })).toBe(false)
  })
})
