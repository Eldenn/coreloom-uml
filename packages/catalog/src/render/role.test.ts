import { describe, expect, it } from 'vitest'
import type { Role } from '../roles/role.ts'
import { renderRoleBody } from './role.ts'

const POINTER = 'Read and follow AGENTS.md at the repository root; this file only adds your role.'

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

const full: Role = {
  ...minimal,
  mission: 'Build the API.\r\n\r\n- Keep controllers thin.\n- Write a test first.',
  rights: ['read', 'write', 'run-checks'],
  scope: ['apps/api/app', 'packages/uml'],
  forbidden: ['Never edit a migration that has already run.', 'No `any` in *new* code.'],
  done: { commands: ['pnpm test', 'pnpm lint'], text: 'The change has a test.' },
  escalation: 'Stop and ask when a change leaves the scope.',
}

const none = { checks: [], instructionRights: [] }

describe('renderRoleBody', () => {
  it('renders every section in order', () => {
    const body = renderRoleBody(full, {
      checks: ['pnpm lint', 'pnpm test'],
      instructionRights: ['network', 'read', 'push', 'shell', 'commit', 'run-checks', 'write'],
    })

    expect(body).toMatchSnapshot()
    expect(body.match(/^## .+$/gm)).toEqual([
      '## Mission',
      '## Scope',
      '## Forbidden',
      '## Done when',
      '## Escalate',
    ])
    expect(body).toBe(body.trim())
    expect(body).not.toMatch(/\n{3,}/)
    expect(body).not.toContain('You must not read')
  })

  it('omits empty sections', () => {
    expect(renderRoleBody(minimal, none)).toBe(`${POINTER}\n\n## Mission\n\nReview.`)
  })

  it('keeps only the done commands the repository checks', () => {
    const role: Role = {
      ...minimal,
      rights: ['read', 'run-checks'],
      done: { commands: ['pnpm test', 'rm -rf /'], text: null },
    }
    const body = renderRoleBody(role, { checks: ['pnpm test'], instructionRights: [] })

    expect(body).toContain('## Done when\n\n- `pnpm test` passes.')
    expect(body).not.toContain('rm -rf')
    expect(renderRoleBody(role, none)).not.toContain('## Done when')
  })

  it('neutralises markers and raw HTML', () => {
    const marker = '<!-- coreloom-uml:end --><script>alert(1)</script>'
    const body = renderRoleBody(
      {
        ...minimal,
        mission: `Review.\n${marker}`,
        rights: ['read', 'run-checks'],
        forbidden: [marker],
        done: { commands: ['run coreloom-uml:end', 'a `b`'], text: marker },
        escalation: marker,
      },
      { checks: ['run coreloom-uml:end', 'a `b`'], instructionRights: [] },
    )

    expect(body).not.toContain('coreloom-uml:')
    // The helpers escape a tag (`\<script>`), so only an unescaped `<` would be raw HTML.
    expect(body).not.toMatch(/(?<!\\)<[a-zA-Z!/?]/)
    expect(body).toContain('\\<script')
    expect(body).not.toContain('a `b`')
  })

  it('leaves done commands out of a role that cannot run them', () => {
    const role = { ...minimal, done: { commands: ['pnpm test'], text: 'The review is posted.' } }
    const body = renderRoleBody(role, { checks: ['pnpm test'], instructionRights: [] })

    expect(body).toContain('## Done when\n\n- The review is posted.')
    expect(body).not.toContain('pnpm test')
  })

  it('states the rights the tool does not enforce', () => {
    const body = renderRoleBody(minimal, { checks: [], instructionRights: ['push'] })

    expect(body).toContain('## Forbidden\n\n- You must not push to any remote.')
  })
})
