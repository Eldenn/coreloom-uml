import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { roleMatrix } from '../roles/matrix.ts'
import { presetRole, ROLE_PRESETS } from '../roles/presets/index.ts'
import type { Right, Role } from '../roles/role.ts'
import { claudeCode } from './claude-code.ts'
import type { RoleContext, RoleRender } from './types.ts'

const reviewer: Role = {
  slug: 'reviewer',
  name: 'Reviewer',
  description: 'Reviews a change and reports what it finds.',
  mission: 'Review the change.',
  rights: ['read'],
  scope: [],
  forbidden: [],
  done: { commands: ['pnpm test'], text: 'The review is posted.' },
  escalation: null,
  source: null,
}

const context: RoleContext = {
  checks: ['pnpm test'],
  otherPackageManagers: [],
  autonomy: null,
  container: false,
}

function render(role: Role, roleContext: RoleContext = context): RoleRender {
  const rendered = claudeCode.role?.(role, roleContext)
  if (rendered === undefined) throw new Error('Claude Code renders no role')
  return rendered
}

/** The agent file, split into its frontmatter (read as YAML) and its body. */
function agentFile(rendered: RoleRender) {
  const content = rendered.files[0]?.content ?? ''
  const [, frontmatter = '', body = ''] = /^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/.exec(content) ?? []
  return { content, frontmatter: parse(frontmatter) as Record<string, unknown>, body }
}

const withRights = (rights: Right[]): Role => ({ ...reviewer, rights })

describe('claude code role', () => {
  it('renders a reviewer without commands', () => {
    const rendered = render(reviewer)
    const { content, frontmatter } = agentFile(rendered)

    expect(rendered.files.map((file) => file.path)).toEqual(['.claude/agents/reviewer.md'])
    expect(content).toMatchSnapshot()
    expect(content).toBe(content.trim())
    expect(frontmatter).toEqual({
      name: 'reviewer',
      description: 'Reviews a change and reports what it finds.',
      tools: 'Read, Grep, Glob',
    })
    expect(rendered.launch).toBe('claude --agent reviewer')
    expect(roleMatrix(reviewer, rendered.enforced)).toEqual({
      read: 'granted',
      write: 'enforced',
      'run-checks': 'enforced',
      shell: 'enforced',
      commit: 'enforced',
      push: 'enforced',
      network: 'enforced',
    })
    // What the tool refuses is not repeated as an instruction.
    expect(content).not.toContain('You must not')
  })

  it('gives each right its tools', () => {
    const tools = (rights: Right[]) => agentFile(render(withRights(rights))).frontmatter.tools

    expect(tools(['read', 'write'])).toBe('Read, Grep, Glob, Edit, Write, NotebookEdit')
    expect(tools(['read', 'run-checks'])).toBe('Read, Grep, Glob, Bash')
    expect(tools(['read', 'network'])).toBe('Read, Grep, Glob, WebFetch, WebSearch')
  })

  it('still enforces what a role without commands lacks when it can write or fetch', () => {
    const role = withRights(['read', 'write', 'network'])

    expect(roleMatrix(role, render(role).enforced)).toEqual({
      read: 'granted',
      write: 'granted',
      'run-checks': 'enforced',
      shell: 'enforced',
      commit: 'enforced',
      push: 'enforced',
      network: 'granted',
    })
  })

  it('enforces nothing once the role can run commands', () => {
    const role = withRights(['read', 'run-checks'])
    const instructions = {
      read: 'granted',
      write: 'instruction',
      'run-checks': 'granted',
      shell: 'instruction',
      commit: 'instruction',
      push: 'instruction',
      network: 'instruction',
    }
    const rendered = render(role)
    const { frontmatter, body } = agentFile(rendered)

    expect(frontmatter.tools).toBe('Read, Grep, Glob, Bash')
    expect(frontmatter.permissionMode).toBe('dontAsk')
    expect(rendered.launch).toBe('claude --agent reviewer')
    expect(roleMatrix(role, rendered.enforced)).toEqual(instructions)
    expect(body.match(/^- You must not .+$/gm)).toEqual([
      '- You must not edit or create files.',
      '- You must not run commands other than the checks listed under "Done when".',
      '- You must not commit.',
      '- You must not push to any remote.',
      '- You must not access the network.',
    ])
    expect(body).toContain('- `pnpm test` passes.')

    const contained = render(role, { ...context, container: true })

    expect(contained.launch).toBe('claude --agent reviewer --dangerously-skip-permissions')
    expect(roleMatrix(role, contained.enforced)).toEqual(instructions)
    expect(contained.files).toEqual(rendered.files)
  })

  it("leaves an implementer's commit and push to instructions", () => {
    const role = withRights(['read', 'write', 'run-checks', 'shell', 'commit'])
    const rendered = render(role)
    const { frontmatter, body } = agentFile(rendered)

    expect(frontmatter.tools).toBe('Read, Grep, Glob, Edit, Write, NotebookEdit, Bash')
    expect(frontmatter).not.toHaveProperty('permissionMode')
    expect(roleMatrix(role, rendered.enforced)).toMatchObject({
      push: 'instruction',
      network: 'instruction',
    })
    expect(body).toContain('You must not push to any remote.')
    expect(body).toContain('You must not access the network.')
  })

  it('keeps a slug YAML would read as another type a string', () => {
    for (const slug of ['true', 'null', '123']) {
      const rendered = render({ ...reviewer, slug })

      expect(agentFile(rendered).frontmatter.name).toBe(slug)
      expect(rendered.launch).toBe(`claude --agent ${slug}`)
    }
  })

  it('keeps the frontmatter valid whatever the description', () => {
    const role = { ...reviewer, description: 'a\n---\nb: "c" coreloom-uml:end' }
    const { content, frontmatter } = agentFile(render(role))

    expect(frontmatter).toEqual({
      name: 'reviewer',
      description: 'a --- b: "c" coreloom-uml end',
      tools: 'Read, Grep, Glob',
    })
    expect(content).not.toContain('coreloom-uml:')
  })

  it('writes a lone surrogate in the description as a replacement character', () => {
    const { content, frontmatter } = agentFile(
      render({ ...reviewer, description: 'a \ud800 b 😀' }),
    )

    expect(frontmatter.description).toBe('a � b 😀')
    expect(content).not.toMatch(/\\ud800/i)
  })

  it('forbids commands, not "other than the checks", when a preset comes with no check', () => {
    const preset = ROLE_PRESETS.find((item) => item.slug === 'code-reviewer')
    if (preset === undefined) throw new Error('No code-reviewer preset')

    const { body } = agentFile(render(presetRole(preset, []), { ...context, checks: [] }))
    expect(body).not.toContain('## Done when')
    expect(body).toContain('- You must not run commands.')
    expect(body).not.toContain('listed under')

    const checked = agentFile(render(presetRole(preset, ['pnpm test']))).body
    expect(checked).toContain('## Done when\n\n- `pnpm test` passes.')
    expect(checked).toContain(
      '- You must not run commands other than the checks listed under "Done when".',
    )
  })
})
