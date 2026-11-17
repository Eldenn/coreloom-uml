import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  AGENCY_AGENTS_COMMIT,
  presetRole,
  READ_ONLY_PRESETS,
  ROLE_LIST_MAX,
  ROLE_PRESETS,
  roleSchema,
} from '../../index.ts'
import { AGENCY_AGENTS_FILE_COUNT } from './agency-agents.ts'

describe('role presets', () => {
  it('vendors every engineering agent', () => {
    expect(ROLE_PRESETS.length).toBeGreaterThan(0)
    expect(ROLE_PRESETS.length).toBe(AGENCY_AGENTS_FILE_COUNT)
    const slugs = ROLE_PRESETS.map((preset) => preset.slug)
    expect(slugs).toEqual([...new Set(slugs)].sort())
  })

  it('turns every preset into a valid role', () => {
    for (const preset of ROLE_PRESETS) {
      const role = presetRole(preset, ['pnpm test'])
      expect(roleSchema.parse(role), preset.slug).toEqual(role)
      expect(role.source).toEqual({ preset: preset.slug, commit: AGENCY_AGENTS_COMMIT })
      expect(role.done.commands).toEqual(['pnpm test'])
    }
  })

  it('lets a read-only preset read and run checks, and the others write and commit', () => {
    for (const preset of ROLE_PRESETS) {
      expect(presetRole(preset, []).rights, preset.slug).toEqual(
        READ_ONLY_PRESETS.has(preset.slug)
          ? ['read', 'run-checks']
          : ['read', 'write', 'run-checks', 'shell', 'commit'],
      )
    }
  })

  it('keeps at most the allowed number of checks', () => {
    const checks = Array.from({ length: ROLE_LIST_MAX + 5 }, (_, index) => `check ${index}`)
    const [preset] = ROLE_PRESETS
    if (!preset) throw new Error('No preset')
    const role = presetRole(preset, checks)
    expect(role.done.commands).toEqual(checks.slice(0, ROLE_LIST_MAX))
    expect(roleSchema.safeParse(role).success).toBe(true)
  })

  it('names only known presets as read-only', () => {
    const slugs = new Set(ROLE_PRESETS.map((preset) => preset.slug))
    for (const slug of READ_ONLY_PRESETS) expect(slugs.has(slug), slug).toBe(true)
    for (const slug of [
      'code-reviewer',
      'software-architect',
      'backend-architect',
      'codebase-onboarding-engineer',
      'multi-agent-systems-architect',
    ]) {
      expect(READ_ONLY_PRESETS.has(slug), slug).toBe(true)
    }
  })

  it('pins a full commit', () => {
    expect(AGENCY_AGENTS_COMMIT).toMatch(/^[0-9a-f]{40}$/)
  })

  it('keeps the licence', () => {
    const licence = readFileSync(new URL('./LICENSE-agency-agents', import.meta.url), 'utf8')
    expect(licence).toContain('MIT License')
    expect(licence).toContain('Copyright')
  })
})
